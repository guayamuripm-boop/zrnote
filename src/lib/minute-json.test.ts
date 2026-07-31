import { describe, it, expect } from 'vitest';
import { parseMinuteJson } from './processing';

/**
 * The old parser was `raw.match(/\{[\s\S]*\}/)` — first brace to LAST brace in
 * the whole response. Any trailing remark containing a brace made the slice
 * invalid JSON and failed the entire meeting after transcription had already
 * succeeded (and been paid for).
 */
describe('parseMinuteJson', () => {
  const minute = { summary: 'Se acordó lanzar en agosto.', action_items: [], decisions: [] };

  it('parses a clean JSON response', () => {
    expect(parseMinuteJson(JSON.stringify(minute))).toEqual(minute);
  });

  it('parses a response wrapped in markdown fences', () => {
    expect(parseMinuteJson('```json\n' + JSON.stringify(minute) + '\n```')).toEqual(minute);
  });

  it('parses when the model adds a sentence before the JSON', () => {
    expect(parseMinuteJson('Aquí tienes la minuta:\n' + JSON.stringify(minute))).toEqual(minute);
  });

  it('survives a trailing remark that contains a brace', () => {
    const raw = JSON.stringify(minute) + '\n\nNota: revisa el bloque { pendiente }.';
    expect(parseMinuteJson(raw)).toEqual(minute);
  });

  it('does not get confused by braces inside string values', () => {
    const tricky = { summary: 'Usar la plantilla {nombre} en el correo', action_items: [] };
    expect(parseMinuteJson(JSON.stringify(tricky))).toEqual(tricky);
  });

  it('handles escaped quotes inside values', () => {
    const quoted = { summary: 'Dijo "lo vemos el lunes" y cerró', action_items: [] };
    expect(parseMinuteJson(JSON.stringify(quoted))).toEqual(quoted);
  });

  it('returns null for a non-JSON answer instead of throwing', () => {
    expect(parseMinuteJson('No pude generar la minuta.')).toBeNull();
    expect(parseMinuteJson('')).toBeNull();
  });

  it('unwraps a minute the model wrapped in an array', () => {
    // Gemini does this occasionally. Recovering the object is far more useful
    // to the user than failing a meeting that was transcribed successfully.
    expect(parseMinuteJson('[{"summary":"x","action_items":[]}]')).toEqual({
      summary: 'x',
      action_items: [],
    });
  });

  it('returns null on truncated JSON rather than half a minute', () => {
    expect(parseMinuteJson('{"summary":"quedó cortado por el límite de tokens')).toBeNull();
  });
});
