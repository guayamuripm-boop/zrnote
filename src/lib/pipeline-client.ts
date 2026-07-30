'use client';

// One shared driver for the "transcribe → minute → e-mails" pipeline.
//
// There used to be three copies of this loop (RecordButton, the upload page and
// RetryButton) that had each drifted: one treated a rate-limit as a hard
// failure, another aborted the whole run on a transient network blip, and all
// three ran the optional `vectorize` step as if it were mandatory — so a
// missing pgvector migration meant the user never got their minute.

export type PipelineStep = 'transcribe' | 'analyze' | 'emails';

export interface PipelineProgress {
  step: PipelineStep;
  label: string;
  segmentsProcessed?: number;
  segmentsTotal?: number;
}

export interface PipelineResult {
  ok: boolean;
  /** Fatal problem: there is no minute. */
  error?: string;
  /** Non-fatal problem (e-mails): the minute exists and is usable. */
  warning?: string;
}

export const STEP_LABELS: Record<PipelineStep, string> = {
  transcribe: 'Transcribiendo el audio…',
  analyze: 'Redactando la minuta…',
  emails: 'Enviando los correos…',
};

const STEPS: PipelineStep[] = ['transcribe', 'analyze', 'emails'];

/** Server function limit is 60s; give each individual call room plus margin. */
const CALL_TIMEOUT_MS = 90_000;
const MAX_NETWORK_RETRIES = 3;
/** Hard stop so a pathological loop can never spin forever. */
const MAX_CALLS_PER_STEP = 120;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function postStep(meetingId: string, step: PipelineStep): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);
  try {
    return await fetch(`/api/meetings/${meetingId}/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Run the whole pipeline, reporting progress as it goes.
 * Resolves with `ok:false` only when the user genuinely has no minute.
 */
export async function runMeetingPipeline(
  meetingId: string,
  onProgress?: (p: PipelineProgress) => void,
): Promise<PipelineResult> {
  let warning: string | undefined;

  for (const step of STEPS) {
    onProgress?.({ step, label: STEP_LABELS[step] });

    let networkRetries = 0;
    let calls = 0;
    let more = true;

    while (more) {
      if (++calls > MAX_CALLS_PER_STEP) {
        return { ok: false, error: `El paso "${STEP_LABELS[step]}" tardó demasiado. Vuelve a la reunión y pulsa "Reintentar".` };
      }

      let res: Response;
      try {
        res = await postStep(meetingId, step);
      } catch {
        // Dropped Wi-Fi, tab throttled, request aborted — retry a few times
        // before giving up. The previous code failed the entire run here.
        if (++networkRetries > MAX_NETWORK_RETRIES) {
          return { ok: false, error: 'Se perdió la conexión durante el procesamiento. Vuelve a la reunión y pulsa "Reintentar".' };
        }
        await sleep(3000 * networkRetries);
        continue;
      }
      networkRetries = 0;

      // Rate limited: this is expected on long meetings (many /process calls).
      // Waiting is the correct response, not an error.
      if (res.status === 429) {
        const data = await res.json().catch(() => ({}));
        await sleep(Math.min(60, Number(data.retryAfterSec) || 20) * 1000);
        continue;
      }

      const data = await res.json().catch(() => ({} as any));

      if (!res.ok || data.ok === false) {
        const message: string = data.error || `HTTP ${res.status}`;

        // The step simply isn't applicable yet/anymore — move on instead of
        // reporting a failure the user can do nothing about.
        if (/Invalid status|ya está completada|Ejecuta primero/i.test(message)) break;

        // E-mails are a courtesy: a good minute must not be thrown away
        // because Gmail rejected a message. But `fatal` means there was no
        // minute to send in the first place — that IS a failure.
        if (step === 'emails' && !data.fatal) {
          warning = `La minuta se generó, pero los correos no salieron: ${message}`;
          break;
        }

        return { ok: false, error: message };
      }

      if (step === 'transcribe' && data.more) {
        onProgress?.({
          step,
          label: STEP_LABELS.transcribe,
          segmentsProcessed: data.segmentsProcessed,
          segmentsTotal: data.segmentsTotal,
        });
        await sleep(1200);
        continue;
      }

      if (step === 'emails' && data.emailWarning) {
        warning = `La minuta se generó, pero algunos correos no salieron: ${data.emailWarning}`;
      }

      more = false;
    }
  }

  return { ok: true, warning };
}
