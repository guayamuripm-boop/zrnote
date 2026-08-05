import { createClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';
import { embedTexts } from '@/lib/embeddings';
import { buildMeetingEmailJobs, dispatchEmailJobs } from '@/lib/meeting-emails';
import { isEmailConfigured, EMAIL_NOT_CONFIGURED } from '@/lib/smtp';

const GROQ_BASE = 'https://api.groq.com/openai/v1';

export interface ProcessingResult {
  success: boolean;
  error?: string;
  data?: any;
}

export interface TranscribeResult {
  success: boolean;
  transcript?: string;
  error?: string;
  segmentsProcessed: number;
  segmentsTotal: number;
  more: boolean;
}

export interface AnalyzeResult {
  success: boolean;
  minuteId?: string;
  actionItemsCount?: number;
  error?: string;
}

export interface EmailResult {
  success: boolean;
  sent: number;
  failed: number;
  /** Omitidos por constar ya como enviados. Ver `email-outbox.ts`. */
  skipped?: number;
  error?: string;
}

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY!
  );
}

export interface MeetingContext {
  title?: string | null;
  coordination?: string | null;
  participantNames: string[];
}

/**
 * Load the human context we already hold about a meeting.
 *
 * Both steps need it and neither used to ask for it: Whisper was transcribing
 * without knowing a single proper noun, and the minute was being written
 * without knowing who was in the room.
 */
async function getMeetingContext(supabase: any, meetingId: string): Promise<MeetingContext> {
  const [{ data: meeting }, { data: participants }] = await Promise.all([
    supabase.from('meetings').select('title, coordination').eq('id', meetingId).maybeSingle(),
    supabase.from('meeting_participants').select('name, email_override').eq('meeting_id', meetingId),
  ]);

  const names = (participants || [])
    .map((p: any) => (p.name || p.email_override?.split('@')[0] || '').trim())
    .filter((n: string) => n.length > 1);

  return {
    title: meeting?.title ?? null,
    coordination: meeting?.coordination ?? null,
    participantNames: Array.from(new Set(names)) as string[],
  };
}

/**
 * Whisper's `prompt` is a STYLE AND VOCABULARY PRIOR, not an instruction.
 *
 * It was only ever sent when "speaker hints" existed — and nothing in the app
 * ever sets those, so it was never sent at all. The result is visible in every
 * stored transcript: no capitals and no punctuation, e.g.
 * "bueno este muchacho voy a grabar la reunión voy a utilizar bueno una
 * aplicación". A short, well-punctuated Spanish sample fixes that, and naming
 * the participants and the topic makes Whisper spell those proper nouns right
 * instead of guessing phonetically.
 *
 * Whisper only reads the LAST ~224 tokens of the prompt, so this stays short.
 */
function buildWhisperPrompt(ctx: MeetingContext): string {
  const parts: string[] = [];

  if (ctx.title) parts.push(`Reunión: ${ctx.title}.`);
  if (ctx.coordination) parts.push(`Área: ${ctx.coordination}.`);
  if (ctx.participantNames.length > 0) {
    parts.push(`Participantes: ${ctx.participantNames.slice(0, 12).join(', ')}.`);
  }

  // The sample sentence is what actually teaches the punctuation style.
  parts.push(
    'Transcripción de una reunión de trabajo en español, con puntuación y mayúsculas correctas.',
  );

  return parts.join(' ');
}

async function transcribeSegment(
  supabase: any,
  segment: any,
  groqKey: string,
  meetingId: string,
  whisperPrompt: string = '',
): Promise<{ text: string | null; error?: string }> {
  const { data: audioData, error: downloadError } = await supabase.storage
    .from('meeting-audio')
    .download(segment.r2_key);

  if (downloadError) {
    logger.error('Error downloading segment', { meetingId, segmentIndex: segment.segment_index, error: downloadError.message });
    return { text: null, error: `descarga fallida: ${downloadError.message}` };
  }

  if (audioData.size < 10000) {
    logger.warn('Skipping segment: too small', { meetingId, segmentIndex: segment.segment_index, size: audioData.size });
    return { text: null, error: 'segmento demasiado pequeño (posible audio vacío)' };
  }

  const rawExt = (segment.r2_key.split('.').pop() || 'webm').toLowerCase();

  // Groq Whisper accepts only these container types. Raw `.aac` is NOT among
  // them, so its bytes are presented under an accepted extension instead —
  // Groq's ffmpeg backend probes the real content and decodes the ADTS stream.
  const GROQ_EXTS = new Set(['flac', 'mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'ogg', 'opus', 'wav', 'webm']);

  // Renaming the FILE is not enough: Groq also validates the multipart part's
  // Content-Type, and the blob coming back from Supabase Storage carries the
  // type it was uploaded with (`audio/aac`). That mismatch is what produced
  // `400 file must be one of the following types` on every single attempt,
  // even though the filename said `.m4a`. So the MIME is set explicitly to one
  // that matches the extension being claimed.
  const MIME_BY_EXT: Record<string, string> = {
    flac: 'audio/flac',
    mp3: 'audio/mpeg',
    mpeg: 'audio/mpeg',
    mpga: 'audio/mpeg',
    mp4: 'audio/mp4',
    m4a: 'audio/mp4',
    ogg: 'audio/ogg',
    opus: 'audio/ogg',
    wav: 'audio/wav',
    webm: 'audio/webm',
  };

  const candidateExts = GROQ_EXTS.has(rawExt) ? [rawExt] : ['m4a', 'mp4', 'mpga', 'wav', 'ogg'];

  // Raw ADTS AAC starts with the 12-bit sync word 0xFFF. Groq rejects that
  // stream whatever we call it, so detect it up front and say something the
  // user can act on instead of forwarding a cryptic 400 they cannot fix by
  // pressing "Reintentar" over and over.
  let isRawAdts = false;
  try {
    const head = new Uint8Array(await audioData.slice(0, 2).arrayBuffer());
    isRawAdts = head.length >= 2 && head[0] === 0xff && (head[1] & 0xf0) === 0xf0;
  } catch {
    /* best effort */
  }

  if (isRawAdts && !GROQ_EXTS.has(rawExt)) {
    return {
      text: null,
      error:
        'AUDIO_FORMATO_NO_SOPORTADO: este audio se guardó como AAC sin contenedor y el transcriptor no lo acepta. Vuelve a subir el archivo — la app ahora lo convierte automáticamente antes de subirlo.',
    };
  }

  let lastError = 'error desconocido';
  logger.debug('Segment ready to transcribe', {
    meetingId,
    segmentIndex: segment.segment_index,
    rawExt,
    storedType: (audioData as Blob).type || 'sin tipo',
    bytes: audioData.size,
  });

  for (const tryExt of candidateExts) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const formData = new FormData();
      // Re-wrap so BOTH the filename and the Content-Type say the same thing.
      const payload = new Blob([audioData], { type: MIME_BY_EXT[tryExt] || 'audio/mpeg' });
      formData.append('file', payload, `audio.${tryExt}`);
      formData.append('model', 'whisper-large-v3');
      formData.append('language', 'es');
      formData.append('response_format', 'verbose_json');
      // Always sent now — this is what restores punctuation and proper nouns.
      if (whisperPrompt) {
        formData.append('prompt', whisperPrompt);
      }

      logger.debug('Transcribing segment', { meetingId, segmentIndex: segment.segment_index, tryExt, attempt });
      const response = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${groqKey}` },
        body: formData,
      });

      if (response.ok) {
        const result = await response.json();
        if (result.text && result.text.trim().length > 0) {
          logger.info('Segment transcribed', { meetingId, segmentIndex: segment.segment_index, tryExt, chars: result.text.length });
          return { text: result.text };
        }
        logger.warn('Segment produced empty transcription', { meetingId, segmentIndex: segment.segment_index });
        return { text: null, error: 'transcripción vacía (¿el audio no tiene voz audible?)' };
      }

      const errText = await response.text();
      lastError = `Groq HTTP ${response.status}: ${errText.slice(0, 180)}`;
      logger.error('Segment transcription failed', { meetingId, segmentIndex: segment.segment_index, tryExt, attempt, status: response.status, error: errText });

      // 400 = this extension/format was rejected → try the next candidate.
      if (response.status === 400) break;
      // 429 = rate limited → back off; other 5xx → short retry.
      await new Promise((r) => setTimeout(r, (response.status === 429 ? 2000 : 1000) * attempt));
    }
  }

  return { text: null, error: lastError };
}

async function heartbeat(supabase: any, meetingId: string) {
  await supabase
    .from('meetings')
    .update({ status: 'processing' })
    .eq('id', meetingId);
}

export async function transcribeMeeting(meetingId: string, maxSegments: number = 9): Promise<TranscribeResult> {
  const supabase = getSupabaseAdmin();
  const groqKey = process.env.GROQ_API_KEY;

  if (!groqKey) {
    return { success: false, error: 'GROQ_API_KEY no configurada en el servidor', segmentsProcessed: 0, segmentsTotal: 0, more: false };
  }

  logger.info('Starting transcription batch', { meetingId, operation: 'transcribe', maxSegments });

  const { data: meeting, error: meetingError } = await supabase
    .from('meetings')
    .select('audio_segments, transcript_raw, segments_transcribed_offset')
    .eq('id', meetingId)
    .single();

  if (meetingError || !meeting) {
    return { success: false, error: `Meeting not found: ${meetingError?.message || 'null'}`, segmentsProcessed: 0, segmentsTotal: 0, more: false };
  }

  const segments = meeting.audio_segments || [];
  if (segments.length === 0) {
    return { success: false, error: 'No audio segments found in meeting', segmentsProcessed: 0, segmentsTotal: 0, more: false };
  }

  const offset = meeting.segments_transcribed_offset || 0;
  const pendingSegments = segments.slice(offset);
  const batch = pendingSegments.slice(0, maxSegments);

  if (batch.length === 0) {
    const transcript = meeting.transcript_raw || '';
    if (!transcript.trim()) {
      return { success: false, error: 'No segments to process and no existing transcript', segmentsProcessed: 0, segmentsTotal: segments.length, more: false };
    }
    return { success: true, transcript, segmentsProcessed: segments.length, segmentsTotal: segments.length, more: false };
  }

  logger.info('Processing batch', { meetingId, batchStart: offset, batchSize: batch.length, totalSegments: segments.length });

  // Style + vocabulary prior for Whisper, built from what we know about the
  // meeting (title, area, participant names). See buildWhisperPrompt.
  const meetingContext = await getMeetingContext(supabase, meetingId);
  const whisperPrompt = buildWhisperPrompt(meetingContext);

  const BATCH_SIZE = 3;
  const newTranscriptions: string[] = [];
  const segErrors: string[] = [];
  let processed = 0;
  let attempted = 0;

  const startedAt = Date.now();
  const TIME_BUDGET_MS = 40_000;

  for (let i = 0; i < batch.length; i += BATCH_SIZE) {
    if (i > 0 && Date.now() - startedAt > TIME_BUDGET_MS) {
      logger.warn('Transcription batch stopping early: time budget reached', { meetingId, processedSoFar: processed, remaining: batch.length - i });
      break;
    }

    const miniBatch = batch.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(
      miniBatch.map((seg: any) => transcribeSegment(supabase, seg, groqKey, meetingId, whisperPrompt))
    );

    attempted += miniBatch.length;

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.text) {
        newTranscriptions.push(r.value.text);
        processed++;
      } else if (r.status === 'fulfilled' && r.value.error) {
        segErrors.push(r.value.error);
      } else if (r.status === 'rejected') {
        segErrors.push(String(r.reason));
      }
    }

    if (i + BATCH_SIZE < batch.length) {
      await heartbeat(supabase, meetingId);
    }
  }

  // Advance offset by ALL attempted segments (not just successes). Failed
  // segments are logged but skipping them prevents infinite retry loops on
  // permanently undecodable audio.
  const finalOffset = offset + attempted;
  const existingTranscript = meeting.transcript_raw || '';
  const fullTranscript = existingTranscript
    ? existingTranscript + '\n\n' + newTranscriptions.join('\n\n')
    : newTranscriptions.join('\n\n');
  const more = finalOffset < segments.length;

  // If this batch transcribed NOTHING and there is still no transcript at all,
  // fail loudly with the real Groq error instead of silently "succeeding" with
  // an empty transcript (which used to surface later as a confusing 400 on analyze).
  if (processed === 0 && !existingTranscript.trim()) {
    const reason = segErrors[0] || 'ningún segmento pudo transcribirse';
    // A format the transcriber cannot read is not a transient failure: retrying
    // will never fix it, so say what will.
    if (reason.startsWith('AUDIO_FORMATO_NO_SOPORTADO')) {
      return {
        success: false,
        error: reason.replace('AUDIO_FORMATO_NO_SOPORTADO: ', ''),
        segmentsProcessed: 0,
        segmentsTotal: segments.length,
        more: false,
      };
    }
    return { success: false, error: `No se pudo transcribir el audio: ${reason}`, segmentsProcessed: 0, segmentsTotal: segments.length, more: false };
  }

  const { error: updateError } = await supabase
    .from('meetings')
    .update({
      transcript_raw: fullTranscript,
      segments_transcribed_offset: finalOffset,
    })
    .eq('id', meetingId);

  if (updateError) {
    return { success: false, error: `Failed to save transcript: ${updateError.message}`, segmentsProcessed: processed, segmentsTotal: segments.length, more: false };
  }

  logger.info('Transcription batch completed', { meetingId, processed, newOffset: finalOffset, total: segments.length, more, errors: segErrors.length });
  return { success: true, transcript: fullTranscript, segmentsProcessed: finalOffset, segmentsTotal: segments.length, more };
}


/**
 * The minute prompt.
 *
 * Written around three things that a transcript-summariser gets wrong by
 * default, and that showed up in real ZRNote meetings:
 *
 *  1. It attributes work to whoever it feels like. The transcript has NO
 *     speaker labels, so any confident-sounding "María se encargará" is an
 *     invention. The prompt states the input's limitations outright and makes
 *     `null` the correct answer under doubt.
 *  2. It flattens everything into equal-weight bullet points. A commitment
 *     someone owns is worth ten times a topic that was mentioned, so the model
 *     is told what the reader actually does with this document.
 *  3. On long meetings it summarises the beginning and runs out of steam.
 *     Hence the explicit sweep instruction and the "later overrides earlier"
 *     rule — in real meetings the end is where things get decided.
 */
const MINUTE_PROMPT = (
  transcript: string,
  opts: { meetingDate?: string; context?: MeetingContext } = {},
) => {
  const { meetingDate, context } = opts;
  const people = context?.participantNames ?? [];

  const contextBlock = [
    context?.title ? `Título: ${context.title}` : null,
    context?.coordination ? `Área o coordinación: ${context.coordination}` : null,
    meetingDate ? `Fecha: ${meetingDate}` : null,
    people.length > 0
      ? `Convocados: ${people.join(', ')}`
      : 'Convocados: no se registró la lista.',
  ]
    .filter(Boolean)
    .join('\n');

  const attributionRules =
    people.length > 0
      ? `- El responsable SOLO puede ser alguien de la lista de convocados, o un nombre que se pronuncie con claridad en la transcripción.
- Si no puedes determinarlo con seguridad, pon null. Es la respuesta correcta, no una derrota.
- Ojo con el reconocimiento de voz: si oyes algo parecido a un nombre de la lista, es casi seguro esa persona (por ejemplo "Mari" o "María Pérez" → María Pérez). Pero no fuerces parecidos remotos.`
      : `- No se registró quién asistió. Asigna responsable SOLO si en la transcripción alguien dice su propio nombre o lo nombran con claridad.
- En cualquier otro caso, null.`;

  return `Eres un jefe de gabinete con veinte años levantando actas. Tu trabajo no es resumir lo que se habló: es dejar por escrito lo que hay que hacer y lo que quedó decidido, para que alguien que NO estuvo en la reunión pueda actuar mañana sin preguntar nada.

CONTEXTO DE ESTA REUNIÓN
${contextBlock}

PRIMERO, ENTIENDE QUÉ REUNIÓN ES
Antes de extraer nada, decide en silencio de qué tipo es, porque cambia lo que importa:
- Seguimiento o comité → mandan los compromisos y los bloqueos. Los estados de proyecto importan.
- Toma de decisión → manda lo que se decidió y bajo qué condiciones.
- Lluvia de ideas o exploratoria → manda lo que se propuso; es normal que haya 0 decisiones y muchas ideas.
- Informativa o presentación → manda el resumen; es normal que haya 0 compromisos.
No fuerces la reunión a una plantilla. Si no hubo decisiones, el array va vacío y ya.

CÓMO ES EL TEXTO QUE VAS A LEER
- Lo produjo un sistema automático de voz a texto. Trae palabras mal reconocidas, nombres deformados y frases cortadas.
- NO indica quién habla. No hay etiquetas de hablante, ni turnos, ni "Speaker 1". Es un texto corrido.
- Trae muletillas ("bueno", "este", "o sea", "¿verdad?") y frases que se abandonan a medias. Ignóralas.
- Si algo es ininteligible o ambiguo, omítelo. No lo reconstruyas a tu gusto.

LA REGLA QUE MANDA SOBRE TODAS
No inventes. Una minuta corta y cierta vale más que una completa y falsa. Si algo no se dijo: null, o array vacío. Nunca rellenes un campo para que el documento "se vea completo".

CÓMO LEER UNA REUNIÓN LARGA
- Recorre la transcripción ENTERA antes de escribir. Los acuerdos suelen cerrarse al final, cuando ya se discutió todo.
- Si algo se dijo y más tarde se corrigió o se cambió, vale lo ÚLTIMO. Reflejar la versión abandonada es un error grave.
- Si el mismo asunto vuelve varias veces, únelo en un solo punto; no lo repitas por cada vez que se mencionó.
- Cuando haya mucho material, sacrifica primero discussion e ideas. Nunca sacrifiques compromisos, decisiones ni bloqueos.

LOS COMPROMISOS SON LO MÁS IMPORTANTE DEL DOCUMENTO
Es lo único que hace que alguien vuelva a abrir esta minuta. Trátalos con cuidado:
- Un compromiso es alguien asumiendo algo concreto. Señales: "yo me encargo", "quedamos en que…", "necesito que…", "para el viernes tengo…", "lo hago yo".
- NO es un compromiso: "habría que…", "estaría bueno…", "en algún momento…", "hay que ver si…" sin que nadie lo tome. Eso es una idea.
- Ante la duda entre compromiso e idea → es idea. Un compromiso falso hace perder la confianza en toda la minuta.
- Redacta cada tarea empezando por un verbo, y que se entienda sola: "Enviar la cotización de tuberías al cliente", no "lo de la cotización".
- Si una tarea la asumen dos personas, escribe un compromiso por cada una.
- Si alguien asumió varias cosas distintas, sepáralas. Una tarea = una acción.

${attributionRules}

FECHAS
${meetingDate ? `- Resuelve los plazos relativos tomando como referencia el ${meetingDate}: "el viernes", "la semana que viene", "a fin de mes" → fecha concreta YYYY-MM-DD.` : '- Usa una fecha solo si se dijo explícitamente.'}
- Si no se acordó plazo, due_date: null. NO inventes plazos "razonables": el responsable pondrá la fecha él mismo.

PRIORIDAD (úsala, no la pongas toda en media)
- alta: hay una fecha próxima, alguien está bloqueado esperándolo, o se dijo "urgente" o "esto es lo primero".
- baja: es un "cuando se pueda", una mejora, algo sin impacto inmediato.
- media: todo lo demás.

RESPONDE ÚNICAMENTE CON ESTE JSON (sin markdown, sin texto antes ni después):
{
  "summary": "3 a 5 frases. Para qué se reunieron, qué se resolvió y qué queda pendiente. Cuenta resultados, no narres la conversación ni digas 'se habló de'. Si la reunión no llegó a nada concreto, dilo con esas palabras.",
  "action_items": [
    {
      "assignee_name": "Nombre del responsable, o null",
      "description": "Acción concreta que empieza por verbo y se entiende sin contexto",
      "due_date": "YYYY-MM-DD o null",
      "priority": "alta | media | baja"
    }
  ],
  "decisions": [ { "decision": "Qué se acordó, en concreto", "context": "Por qué, o bajo qué condición" } ],
  "blockers": [ { "issue": "Qué está frenando el trabajo", "impact": "A qué afecta o qué retrasa", "owner": "Quién debe resolverlo, o null" } ],
  "project_statuses": [ { "project": "Nombre tal como lo llamaron ellos", "status": "en progreso | retrasado | completado | pendiente", "details": "Qué se avanzó y qué falta" } ],
  "discussion": [ { "topic": "Tema tratado", "details": "Lo esencial en 2-3 frases. Solo temas que aporten algo que no esté ya arriba." } ],
  "next_steps": [ { "step": "Siguiente paso que NO sea ya un compromiso de arriba", "owner": "Quién, o null" } ],
  "ideas": ["Propuestas que nadie asumió y sobre las que no se decidió nada"]
}

ANTES DE RESPONDER, REVISA
- ¿Algún compromiso es en realidad una idea que nadie asumió? Muévelo.
- ¿Algún responsable te lo inventaste porque "encajaba"? Ponlo en null.
- ¿Repetiste en next_steps algo que ya está en action_items? Bórralo de next_steps.
- ¿El resumen cuenta resultados, o narra la conversación? Reescríbelo si narra.
- ¿Alguna tarea se entiende solo si estuviste en la reunión? Reescríbela.
- Todo en español.

TRANSCRIPCIÓN:
${transcript}
`;
};

/**
 * Pull the minute object out of whatever the model actually returned.
 *
 * Even with `response_format: json_object` the output arrives wrapped in
 * ```json fences, or with a sentence in front of it, often enough to matter.
 * The old version went straight for `/\{[\s\S]*\}/`, which grabs from the FIRST
 * brace to the LAST one in the whole response — so a single trailing remark
 * containing a brace produced invalid JSON and the entire meeting failed.
 */
export function parseMinuteJson(raw: string): Record<string, any> | null {
  if (!raw) return null;

  // Strip markdown fences if present.
  const unfenced = raw.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();

  const attempt = (text: string) => {
    try {
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  };

  const direct = attempt(unfenced);
  if (direct) return direct;

  // Walk the braces to find the first balanced object, ignoring braces that
  // appear inside strings.
  const start = unfenced.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < unfenced.length; i++) {
    const char = unfenced[i];

    if (escaped) { escaped = false; continue; }
    if (char === '\\') { escaped = true; continue; }
    if (char === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (char === '{') depth++;
    else if (char === '}') {
      depth--;
      if (depth === 0) return attempt(unfenced.slice(start, i + 1));
    }
  }

  return null;
}

/** Map anything the LLM writes onto the `priority` CHECK constraint. */
export function normalizePriority(value: unknown): 'alta' | 'media' | 'baja' {
  const v = String(value ?? '').toLowerCase().trim();
  if (['alta', 'high', 'urgente', 'crítica', 'critica', 'critical', 'p0', 'p1'].includes(v)) return 'alta';
  if (['baja', 'low', 'menor', 'p3'].includes(v)) return 'baja';
  return 'media';
}

/** Accept only a real ISO date; anything else becomes null instead of failing the insert. */
export function normalizeDueDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const iso = `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  // Guard against hallucinated years (the model sometimes writes 0202 or 2202).
  const year = Number(match[1]);
  if (year < 2000 || year > 2100) return null;
  return iso;
}

/**
 * Ask Google which models this key can actually use, instead of hardcoding one.
 *
 * Hardcoding has now failed twice in production for two different reasons:
 * `gemini-2.0-flash` began answering `429 … free_tier_requests, limit: 0` (a
 * quota of zero, not a rate limit), and `gemini-2.5-flash-lite` answered
 * `404 … no longer available to new users`. Google rotates these without
 * notice, so the model list is discovered at runtime and ranked by preference.
 *
 * `GEMINI_MODEL` still wins if it is set, for pinning a specific model.
 */
let geminiModelCache: { at: number; models: string[] } | null = null;
const GEMINI_CACHE_MS = 10 * 60 * 1000;

export async function discoverGeminiModels(apiKey: string): Promise<string[]> {
  if (process.env.GEMINI_MODEL) return [process.env.GEMINI_MODEL];

  if (geminiModelCache && Date.now() - geminiModelCache.at < GEMINI_CACHE_MS) {
    return geminiModelCache.models;
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=100`,
      { signal: AbortSignal.timeout(10000) },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    const usable: string[] = (data.models || [])
      .filter((m: any) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m: any) => String(m.name || '').replace(/^models\//, ''))
      .filter((name: string) => name && !/embedding|aqa|vision|image|tts|audio|live/i.test(name));

    const ranked = rankGeminiModels(usable);
    if (ranked.length > 0) {
      geminiModelCache = { at: Date.now(), models: ranked };
      logger.info('Gemini models discovered', { count: ranked.length, top: ranked.slice(0, 3) });
      return ranked;
    }
  } catch (err: any) {
    logger.warn('Could not list Gemini models, using defaults', { error: err?.message });
  }

  // Last resort if the listing call itself fails.
  return ['gemini-flash-latest', 'gemini-2.5-flash'];
}

/**
 * Prefer cheap, fast, generally-available models, and avoid preview/experimental
 * ones that tend to disappear or carry zero free quota.
 */
export function rankGeminiModels(names: string[]): string[] {
  const score = (name: string): number => {
    let s = 0;
    if (/flash/.test(name)) s += 100;          // fast + the widest free quota
    if (/latest/.test(name)) s += 40;          // an alias Google keeps pointing at a live model
    if (/lite/.test(name)) s -= 10;            // weaker; acceptable but not first
    if (/pro/.test(name)) s += 20;             // capable, tighter quota
    if (/preview|exp|experimental/.test(name)) s -= 80;
    if (/\b1\.0|1\.5|2\.0/.test(name)) s -= 50; // older generations get retired first
    return s;
  };

  return [...new Set(names)].sort((a, b) => score(b) - score(a) || a.localeCompare(b)).slice(0, 4);
}

export async function analyzeMeeting(meetingId: string, transcript?: string): Promise<AnalyzeResult> {
  const supabase = getSupabaseAdmin();
  const groqKey = process.env.GROQ_API_KEY!;

  logger.info('Starting analysis', { meetingId, operation: 'analyze' });

  const { data: meetingRow, error: meetingError } = await supabase
    .from('meetings')
    .select('transcript_raw, started_at, created_at')
    .eq('id', meetingId)
    .single();

  if (meetingError || !meetingRow) {
    return { success: false, error: `Meeting not found: ${meetingError?.message || 'null'}` };
  }

  let meetingTranscript = transcript || meetingRow.transcript_raw;

  if (!meetingTranscript || meetingTranscript.trim().length === 0) {
    return { success: false, error: 'No transcript available for analysis' };
  }

  // Giving the model the real meeting date is what turns "para el viernes" into
  // an actual due_date instead of null.
  const meetingDate = new Date(meetingRow.started_at || meetingRow.created_at || Date.now())
    .toISOString()
    .slice(0, 10);

  // Who was in the room, what the meeting was called. The model was writing
  // minutes blind to all of this — which is why it used to attribute tasks to
  // invented names or to a "Speaker 1" that appears nowhere in the transcript.
  const context = await getMeetingContext(supabase, meetingId);
  logger.info('Analyzing with context', {
    meetingId,
    participants: context.participantNames.length,
    transcriptChars: meetingTranscript.length,
  });

  const buildPrompt = (t: string) => MINUTE_PROMPT(t, { meetingDate, context });

  // Spanish with accents tokenises denser than the usual chars/4 rule of thumb,
  // and underestimating is what produced `413 Request too large ... Limit
  // 12000` from Groq even though the transcript had supposedly been trimmed to
  // fit. Overestimating only costs a slightly smaller request.
  const estTokens = (s: string) => Math.ceil(s.length / 3);
  const geminiKey = process.env.GEMINI_API_KEY;

  // Gemini is preferred: a 1M-token context means long meetings are never
  // truncated. But it is NOT allowed to be a single point of failure — see
  // the fallback below.
  const geminiModels = geminiKey ? await discoverGeminiModels(geminiKey) : [];

  async function callGemini(): Promise<{ text: string } | { error: string }> {
    let lastError = 'sin respuesta';

    for (const model of geminiModels) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        let res: Response;
        try {
          res = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${geminiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model,
              messages: [{ role: 'user', content: buildPrompt(meetingTranscript!) }],
              temperature: 0.3,
              max_tokens: 8192,
              response_format: { type: 'json_object' },
            }),
          });
        } catch (err: any) {
          lastError = `${model}: ${err?.message || 'error de red'}`;
          break;
        }

        if (res.ok) {
          const json = await res.json();
          const text = json.choices?.[0]?.message?.content || '';
          if (text.trim()) {
            logger.info('Minute drafted with Gemini', { meetingId, model });
            return { text };
          }
          lastError = `${model}: respuesta vacía`;
          break;
        }

        const body = await res.text();
        lastError = `${model} (${res.status}): ${body.slice(0, 200)}`;

        // A real rate limit is worth waiting out once. A quota of zero (the
        // model is simply not on this plan) never resolves — move on.
        const isZeroQuota = /limit:\s*0\b/.test(body) || /RESOURCE_EXHAUSTED/.test(body);
        if (res.status === 429 && attempt === 1 && !isZeroQuota) {
          await new Promise((r) => setTimeout(r, 12000));
          continue;
        }
        break;
      }
    }

    return { error: lastError };
  }

  async function callGroq(): Promise<{ text: string } | { error: string }> {
    if (!groqKey) return { error: 'GROQ_API_KEY no configurada' };

    // Groq's free tier caps llama-3.3-70b at 12,000 tokens/MINUTE, counting
    // input (prompt+transcript) + max_tokens together. Size the request to fit,
    // trimming the transcript only if it alone blows the budget.
    const TPM_BUDGET = 10500;
    const MIN_OUTPUT = 1800;
    const MAX_OUTPUT = 5000;
    const overheadTokens = estTokens(buildPrompt(''));

    // Chars of transcript that fit alongside the prompt and the reply.
    const charsThatFit = (budget: number) =>
      Math.max(500, (budget - MIN_OUTPUT - overheadTokens) * 3);

    let working = meetingTranscript!;
    if (estTokens(buildPrompt(working)) + MIN_OUTPUT > TPM_BUDGET) {
      working = working.slice(0, charsThatFit(TPM_BUDGET));
      logger.warn('Transcript trimmed to fit Groq TPM budget', { meetingId, keptChars: working.length });
    }

    let lastError = 'sin respuesta';

    for (let attempt = 1; attempt <= 4; attempt++) {
      const inputTokens = estTokens(buildPrompt(working));
      const maxOut = Math.max(MIN_OUTPUT, Math.min(MAX_OUTPUT, TPM_BUDGET - inputTokens));

      let res: Response;
      try {
        res = await fetch(`${GROQ_BASE}/chat/completions`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: buildPrompt(working) }],
            temperature: 0.3,
            max_tokens: maxOut,
          }),
        });
      } catch (err: any) {
        lastError = err?.message || 'error de red';
        break;
      }

      if (res.ok) {
        const json = await res.json();
        const text = json.choices?.[0]?.message?.content || '';
        if (text.trim()) {
          logger.info('Minute drafted with Groq', {
            meetingId,
            inputTokens,
            maxOut,
            trimmed: working.length < meetingTranscript!.length,
          });
          // Keep the trimmed text so the caller knows what was actually read.
          meetingTranscript = working;
          return { text };
        }
        lastError = 'respuesta vacía';
        break;
      }

      const body = await res.text();
      lastError = `${res.status}: ${body.slice(0, 200)}`;

      // 413 = the request still did not fit. Our token estimate is only an
      // approximation of Groq's tokenizer, so rather than give up, cut the
      // transcript hard and try again.
      if (res.status === 413 && attempt < 4) {
        working = working.slice(0, Math.floor(working.length * 0.55));
        logger.warn('Groq 413, shrinking transcript', { meetingId, keptChars: working.length, attempt });
        continue;
      }

      if (res.status === 429 && attempt < 4) {
        await new Promise((r) => setTimeout(r, 15000));
        continue;
      }
      break;
    }

    return { error: lastError };
  }

  // Try Gemini, then Groq. Previously Groq was only used when GEMINI_API_KEY was
  // ABSENT, so the moment Gemini answered 429 the whole meeting failed even
  // though a perfectly good fallback was configured and idle.
  let result: { text: string } | { error: string };
  const errors: string[] = [];

  if (geminiKey) {
    result = await callGemini();
    if ('error' in result) {
      logger.warn('Gemini failed, falling back to Groq', { meetingId, error: result.error });
      errors.push(`Gemini → ${result.error}`);
      result = await callGroq();
    }
  } else {
    result = await callGroq();
  }

  if ('error' in result) {
    errors.push(`Groq → ${result.error}`);
    return {
      success: false,
      error: `No se pudo generar la minuta. ${errors.join(' | ')}`,
    };
  }

  const minuteJSON = parseMinuteJson(result.text);
  if (!minuteJSON) {
    return {
      success: false,
      error: 'El modelo no devolvió una minuta en el formato esperado. Vuelve a intentarlo.',
    };
  }

  logger.info('Minute generated', { meetingId, actionItems: (minuteJSON.action_items || []).length });

  // `minutes.meeting_id` is UNIQUE, so a second analyze (any retry) used to fail
  // with a duplicate-key error and mark the whole meeting `failed` — even when
  // the transcript was fine. Analyze must be IDEMPOTENT: wipe the previous
  // minute + its action items first, then write a fresh one.
  const { data: priorMinutes } = await supabase
    .from('minutes')
    .select('id')
    .eq('meeting_id', meetingId);

  if (priorMinutes && priorMinutes.length > 0) {
    logger.info('Replacing previous minute (retry)', { meetingId, previous: priorMinutes.length });
    // action_items cascade from minute_id, but items inserted without a
    // minute_id (older rows) would survive — delete by meeting_id to be sure.
    await supabase.from('action_items').delete().eq('meeting_id', meetingId);
    await supabase.from('minutes').delete().eq('meeting_id', meetingId);
  }

  const { data: minute, error: minuteError } = await supabase
    .from('minutes')
    .insert({
      meeting_id: meetingId,
      summary: minuteJSON.summary,
      topics: (minuteJSON.discussion || []).map((d: any) => d.topic || d),
      decisions: (minuteJSON.decisions || []).map((d: any) => typeof d === 'string' ? d : `${d.decision}${d.context ? ` (${d.context})` : ''}`),
      changes: [],
      next_steps: (minuteJSON.next_steps || []).map((n: any) => typeof n === 'string' ? n : `${n.step}${n.owner ? ` — ${n.owner}` : ''}`),
      discussion: minuteJSON.discussion || [],
      project_statuses: minuteJSON.project_statuses || [],
      blockers: minuteJSON.blockers || [],
      ideas: minuteJSON.ideas || [],
      raw_llm_output: JSON.stringify(minuteJSON),
    })
    .select()
    .single();

  if (minuteError) {
    return { success: false, error: `Minute save error: ${minuteError.message}` };
  }

  // The LLM is free-form: `priority` and `due_date` go into columns with a CHECK
  // constraint / date type, so anything off-shape (e.g. "urgente", "el viernes")
  // would reject the whole batch and silently lose every commitment. Normalize.
  const actionItemsToInsert = (minuteJSON.action_items || [])
    .filter((item: any) => item && typeof item.description === 'string' && item.description.trim())
    .map((item: any) => ({
      meeting_id: meetingId,
      minute_id: minute.id,
      assignee_name: typeof item.assignee_name === 'string' ? item.assignee_name.slice(0, 200) : null,
      description: item.description.trim(),
      due_date: normalizeDueDate(item.due_date),
      priority: normalizePriority(item.priority),
    }));

  if (actionItemsToInsert.length > 0) {
    const { error: insertError } = await supabase.from('action_items').insert(actionItemsToInsert);
    if (insertError) {
      logger.error('Action items insert error', { meetingId, error: insertError.message });
    } else {
      logger.info('Action items inserted', { meetingId, count: actionItemsToInsert.length });
    }
  }

  return { success: true, minuteId: minute.id, actionItemsCount: actionItemsToInsert.length };
}

export async function sendMeetingEmails(meetingId: string): Promise<EmailResult> {
  try {
    return await _sendMeetingEmails(meetingId);
  } catch (err: any) {
    logger.error('sendMeetingEmails crashed', { meetingId, error: err?.message, stack: err?.stack });
    return { success: false, sent: 0, failed: 0, error: err?.message || 'Unknown error' };
  }
}

async function _sendMeetingEmails(meetingId: string): Promise<EmailResult> {
  const supabase = getSupabaseAdmin();

  logger.info('Starting email send', { meetingId });

  if (!isEmailConfigured()) {
    return { success: false, sent: 0, failed: 0, error: EMAIL_NOT_CONFIGURED };
  }

  const { data: meeting } = await supabase
    .from('meetings')
    .select('id, title, created_by')
    .eq('id', meetingId)
    .single();

  if (!meeting) {
    return { success: false, sent: 0, failed: 0, error: 'Meeting not found' };
  }

  const jobs = await buildMeetingEmailJobs(supabase, meetingId, meeting.title, meeting.created_by);
  // force: false — este paso lo reintenta el pipeline solo. Reenviar a quien ya
  // recibió la minuta sería el duplicado que estamos evitando.
  return await dispatchEmailJobs(supabase, meetingId, jobs, { force: false });
}

export async function markMeetingCompleted(meetingId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('meetings')
    .update({ status: 'completed', error_message: null })
    .eq('id', meetingId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function markMeetingFailed(meetingId: string, errorMsg: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  // NEVER write the error into transcript_raw: that destroys the transcript and
  // makes the retry impossible. Failures have their own column (migration 020).
  await supabase
    .from('meetings')
    .update({ status: 'failed', error_message: errorMsg.slice(0, 1000) })
    .eq('id', meetingId);
}

export interface VectorizeResult {
  success: boolean;
  chunksCreated?: number;
  error?: string;
}

function createChunks(minute: any, transcript: string): Array<{ index: number; section: string; text: string; speaker?: string }> {
  const chunks: Array<{ index: number; section: string; text: string; speaker?: string }> = [];
  let index = 0;

  if (minute.summary) {
    chunks.push({ index: index++, section: 'summary', text: minute.summary, speaker: 'system' });
  }

  for (const topic of minute.discussion || []) {
    chunks.push({ index: index++, section: 'discussion', text: `${topic.topic}: ${topic.details}`, speaker: topic.speaker });
  }

  for (const decision of minute.decisions || []) {
    chunks.push({ index: index++, section: 'decisions', text: decision, speaker: 'system' });
  }

  for (const ps of minute.project_statuses || []) {
    chunks.push({ index: index++, section: 'project_statuses', text: `${ps.project} (${ps.status}): ${ps.details}`, speaker: 'system' });
  }

  for (const blocker of minute.blockers || []) {
    chunks.push({ index: index++, section: 'blockers', text: `${blocker.issue}: ${blocker.impact}${blocker.owner ? ` — ${blocker.owner}` : ''}`, speaker: 'system' });
  }

  for (const idea of minute.ideas || []) {
    chunks.push({ index: index++, section: 'ideas', text: idea, speaker: 'system' });
  }

  for (const item of minute.action_items || []) {
    chunks.push({ index: index++, section: 'action_items', text: `${item.assignee_name}: ${item.description} (${item.priority})${item.due_date ? `, vence ${item.due_date}` : ''}`, speaker: item.assignee_name });
  }

  for (const step of minute.next_steps || []) {
    chunks.push({ index: index++, section: 'next_steps', text: step, speaker: 'system' });
  }

  // Transcript in ~500 char chunks
  const transcriptChunks = transcript.match(/.{1,500}/g) || [];
  for (const tc of transcriptChunks) {
    chunks.push({ index: index++, section: 'transcript', text: tc, speaker: 'unknown' });
  }

  return chunks;
}

export async function vectorizeMeeting(meetingId: string): Promise<VectorizeResult> {
  const supabase = getSupabaseAdmin();

  logger.info('Starting vectorization', { meetingId, operation: 'vectorize' });

  // Get meeting with org_id
  const { data: meeting, error: meetingError } = await supabase
    .from('meetings')
    .select('org_id, transcript_raw')
    .eq('id', meetingId)
    .single();

  if (meetingError || !meeting) {
    return { success: false, error: `Meeting not found: ${meetingError?.message || 'null'}` };
  }

  if (!meeting.transcript_raw) {
    return { success: false, error: 'No transcript available for vectorization' };
  }

  // Get minute
  const { data: minute, error: minuteError } = await supabase
    .from('minutes')
    .select('*')
    .eq('meeting_id', meetingId)
    .single();

  if (minuteError || !minute) {
    return { success: false, error: 'Minute not found. Run analyze step first.' };
  }

  // Action items live in their own table, not on the minute row — read them so
  // they actually get indexed (createChunks used to look for minute.action_items,
  // which is always undefined).
  const { data: items } = await supabase
    .from('action_items')
    .select('assignee_name, description, priority, due_date')
    .eq('meeting_id', meetingId);

  // Re-running vectorize (any retry) must not stack duplicate embeddings.
  await supabase.from('meeting_chunks').delete().eq('meeting_id', meetingId);

  // Create semantic chunks
  const chunks = createChunks({ ...minute, action_items: items || [] }, meeting.transcript_raw);
  logger.info('Created chunks', { meetingId, count: chunks.length });

  // Generate embeddings in batches
  const BATCH_SIZE = 20;
  let created = 0;

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const texts = batch.map(c => c.text);

    try {
      const embeddings = await embedTexts(texts);

      const records = batch.map((chunk, j) => ({
        org_id: meeting.org_id,
        meeting_id: meetingId,
        chunk_index: chunk.index,
        content: chunk.text,
        embedding: embeddings[j],
        metadata: {
          section: chunk.section,
          speaker: chunk.speaker,
        },
      }));

      const { error: insertError } = await supabase
        .from('meeting_chunks')
        .insert(records);

      if (insertError) {
        logger.error('Vector insert error', { meetingId, error: insertError.message });
      } else {
        created += batch.length;
      }
    } catch (err) {
      logger.error('Embedding error', { meetingId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  logger.info('Vectorization completed', { meetingId, chunksCreated: created });
  return { success: true, chunksCreated: created };
}
