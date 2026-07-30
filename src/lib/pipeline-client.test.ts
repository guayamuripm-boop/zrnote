import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runMeetingPipeline } from './pipeline-client';

/**
 * The pipeline driver is where "no funciona" used to become a dead end: a
 * dropped Wi-Fi packet, a rate-limit, or an optional step failing all aborted
 * the run and left the user with nothing.
 */

const OK = (body: any = { ok: true }) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

function mockFetch(handler: (step: string, call: number) => Response | Promise<Response>) {
  const calls: string[] = [];
  const fn = vi.fn(async (_url: any, init: any) => {
    const step = JSON.parse(init.body).step;
    calls.push(step);
    return handler(step, calls.filter((s) => s === step).length);
  });
  vi.stubGlobal('fetch', fn);
  return calls;
}

beforeEach(() => {
  // The driver sleeps between retries; keep the tests instant.
  vi.spyOn(global, 'setTimeout').mockImplementation(((cb: any) => { cb(); return 0 as any; }) as any);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('runMeetingPipeline', () => {
  it('runs transcribe → analyze → emails and never touches the optional vectorize step', async () => {
    const calls = mockFetch(() => OK());
    const result = await runMeetingPipeline('m1');

    expect(result.ok).toBe(true);
    expect(calls).toEqual(['transcribe', 'analyze', 'emails']);
    expect(calls).not.toContain('vectorize');
  });

  it('keeps polling transcribe while the server reports more segments', async () => {
    const calls = mockFetch((step, n) => {
      if (step === 'transcribe') {
        return OK({ ok: true, more: n < 3, segmentsProcessed: n * 9, segmentsTotal: 27 });
      }
      return OK();
    });

    const seen: number[] = [];
    const result = await runMeetingPipeline('m1', (p) => {
      if (p.segmentsProcessed) seen.push(p.segmentsProcessed);
    });

    expect(result.ok).toBe(true);
    expect(calls.filter((c) => c === 'transcribe')).toHaveLength(3);
    expect(seen.length).toBeGreaterThan(0);
  });

  it('waits and retries on 429 instead of failing', async () => {
    const calls = mockFetch((step, n) => {
      if (step === 'transcribe' && n === 1) {
        return new Response(JSON.stringify({ retryAfterSec: 1 }), { status: 429 });
      }
      return OK();
    });

    const result = await runMeetingPipeline('m1');
    expect(result.ok).toBe(true);
    expect(calls.filter((c) => c === 'transcribe')).toHaveLength(2);
  });

  it('retries a dropped connection before giving up', async () => {
    let attempts = 0;
    vi.stubGlobal('fetch', vi.fn(async (_url: any, init: any) => {
      const step = JSON.parse(init.body).step;
      if (step === 'transcribe' && ++attempts === 1) throw new TypeError('Failed to fetch');
      return OK();
    }));

    const result = await runMeetingPipeline('m1');
    expect(result.ok).toBe(true);
    expect(attempts).toBe(2);
  });

  it('treats an e-mail failure as a warning, not a lost minute', async () => {
    mockFetch((step) =>
      step === 'emails'
        ? OK({ ok: false, error: 'SMTP rechazó las credenciales' })
        : OK(),
    );

    const result = await runMeetingPipeline('m1');
    expect(result.ok).toBe(true);
    expect(result.warning).toContain('SMTP');
  });

  it('does NOT claim success when the e-mail step reports there is no minute', async () => {
    mockFetch((step) =>
      step === 'emails'
        ? OK({ ok: false, fatal: true, error: 'No se generó ninguna minuta' })
        : OK(),
    );

    const result = await runMeetingPipeline('m1');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('minuta');
  });

  it('surfaces a transcription failure as a real error', async () => {
    mockFetch((step) =>
      step === 'transcribe'
        ? OK({ ok: false, error: 'No se pudo transcribir el audio' })
        : OK(),
    );

    const result = await runMeetingPipeline('m1');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('transcribir');
  });

  it('skips a step that is not applicable instead of reporting a failure', async () => {
    const calls = mockFetch((step) =>
      step === 'analyze'
        ? OK({ ok: false, error: "Invalid status for step 'analyze': completed" })
        : OK(),
    );

    const result = await runMeetingPipeline('m1');
    expect(result.ok).toBe(true);
    expect(calls).toContain('emails');
  });
});
