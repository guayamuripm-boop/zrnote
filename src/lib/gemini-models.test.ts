import { describe, it, expect } from 'vitest';
import { rankGeminiModels } from './processing';

/**
 * Hardcoding a Gemini model has now broken production twice, for two different
 * reasons:
 *   · gemini-2.0-flash      → 429 "free_tier_requests, limit: 0" (quota of ZERO)
 *   · gemini-2.5-flash-lite → 404 "no longer available to new users"
 *
 * So the model list is discovered at runtime and ranked. These lock in the
 * ranking rules.
 */
describe('rankGeminiModels', () => {
  it('prefiere flash sobre pro (más cuota gratuita y más rápido)', () => {
    const ranked = rankGeminiModels(['gemini-2.5-pro', 'gemini-2.5-flash']);
    expect(ranked[0]).toBe('gemini-2.5-flash');
  });

  it('prefiere los alias "latest", que Google mantiene apuntando a un modelo vivo', () => {
    const ranked = rankGeminiModels(['gemini-2.5-flash', 'gemini-flash-latest']);
    expect(ranked[0]).toBe('gemini-flash-latest');
  });

  it('hunde los preview/experimental, que desaparecen o traen cuota 0', () => {
    const ranked = rankGeminiModels(['gemini-2.5-flash-preview-09', 'gemini-2.5-flash']);
    expect(ranked[0]).toBe('gemini-2.5-flash');
  });

  it('hunde las generaciones viejas, que son las primeras en retirarse', () => {
    const ranked = rankGeminiModels(['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-2.5-flash']);
    expect(ranked[0]).toBe('gemini-2.5-flash');
    expect(ranked.indexOf('gemini-1.5-flash')).toBeGreaterThan(0);
  });

  it('pone lite por detrás de flash normal, pero lo conserva como respaldo', () => {
    const ranked = rankGeminiModels(['gemini-2.5-flash-lite', 'gemini-2.5-flash']);
    expect(ranked[0]).toBe('gemini-2.5-flash');
    expect(ranked).toContain('gemini-2.5-flash-lite');
  });

  it('quita duplicados y devuelve como mucho 4 candidatos', () => {
    const ranked = rankGeminiModels([
      'gemini-2.5-flash', 'gemini-2.5-flash', 'gemini-2.5-pro',
      'gemini-flash-latest', 'gemini-2.0-flash', 'gemini-1.5-pro',
    ]);
    expect(ranked.length).toBeLessThanOrEqual(4);
    expect(new Set(ranked).size).toBe(ranked.length);
  });

  it('no se cae con una lista vacía', () => {
    expect(rankGeminiModels([])).toEqual([]);
  });
});
