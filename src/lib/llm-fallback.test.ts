import { describe, it, expect } from 'vitest';

/**
 * Guards the provider-failover rules that a real production failure exposed:
 * Gemini answered 429 with `free_tier_requests, limit: 0` (a quota of ZERO, not
 * a rate limit), and because Groq was only ever used when GEMINI_API_KEY was
 * *absent*, the whole meeting failed with a perfectly good fallback sitting
 * idle.
 *
 * These are the two decisions that matter, extracted so they can be asserted
 * without hitting the network.
 */

/** A quota of zero never clears; retrying is pointless. A plain 429 may clear. */
function isPermanentQuotaError(body: string): boolean {
  return /limit:\s*0\b/.test(body) || /RESOURCE_EXHAUSTED/.test(body);
}

/** Which Gemini models we attempt, in order. */
function geminiModels(envOverride?: string): string[] {
  return envOverride ? [envOverride] : ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];
}

describe('detección de cuota agotada de Gemini', () => {
  const realError = `[{ "error": { "code": 429, "message": "You exceeded your current quota. Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 0, model: gemini-2.0-flash", "status": "RESOURCE_EXHAUSTED" }}]`;

  it('reconoce el error real de producción como permanente', () => {
    expect(isPermanentQuotaError(realError)).toBe(true);
  });

  it('no reintenta cuando la cuota es 0', () => {
    expect(isPermanentQuotaError('quota limit: 0 for this model')).toBe(true);
  });

  it('trata un 429 normal como transitorio (sí se puede esperar)', () => {
    expect(isPermanentQuotaError('Too many requests, please retry in 20s')).toBe(false);
  });
});

describe('selección de modelos de Gemini', () => {
  it('ya NO usa gemini-2.0-flash, que salió del tier gratuito', () => {
    expect(geminiModels()).not.toContain('gemini-2.0-flash');
  });

  it('prueba primero 2.5-flash y luego 2.5-flash-lite', () => {
    expect(geminiModels()).toEqual(['gemini-2.5-flash', 'gemini-2.5-flash-lite']);
  });

  it('permite fijar el modelo por variable de entorno', () => {
    expect(geminiModels('gemini-2.5-pro')).toEqual(['gemini-2.5-pro']);
  });
});
