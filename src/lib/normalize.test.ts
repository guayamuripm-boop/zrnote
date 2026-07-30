import { describe, it, expect } from 'vitest';
import { normalizePriority, normalizeDueDate } from './processing';

// These two guard the action_items insert. `priority` has a CHECK constraint and
// `due_date` is a DATE column, so a single off-shape value from the LLM used to
// reject the WHOLE batch — losing every commitment of the meeting at once.

describe('normalizePriority', () => {
  it('keeps the three valid values', () => {
    expect(normalizePriority('alta')).toBe('alta');
    expect(normalizePriority('media')).toBe('media');
    expect(normalizePriority('baja')).toBe('baja');
  });

  it('maps common LLM synonyms', () => {
    expect(normalizePriority('urgente')).toBe('alta');
    expect(normalizePriority('HIGH')).toBe('alta');
    expect(normalizePriority('crítica')).toBe('alta');
    expect(normalizePriority('low')).toBe('baja');
  });

  it('falls back to media for anything unrecognised', () => {
    expect(normalizePriority('muy importante')).toBe('media');
    expect(normalizePriority(null)).toBe('media');
    expect(normalizePriority(undefined)).toBe('media');
    expect(normalizePriority(7)).toBe('media');
  });
});

describe('normalizeDueDate', () => {
  it('accepts an ISO date', () => {
    expect(normalizeDueDate('2026-08-15')).toBe('2026-08-15');
  });

  it('trims a full timestamp down to the date', () => {
    expect(normalizeDueDate('2026-08-15T10:00:00Z')).toBe('2026-08-15');
  });

  it('rejects relative phrases the model sometimes emits', () => {
    expect(normalizeDueDate('el viernes')).toBeNull();
    expect(normalizeDueDate('próxima semana')).toBeNull();
    expect(normalizeDueDate('15/08/2026')).toBeNull();
  });

  it('rejects hallucinated years', () => {
    expect(normalizeDueDate('0202-08-15')).toBeNull();
    expect(normalizeDueDate('2202-08-15')).toBeNull();
  });

  it('rejects impossible calendar dates', () => {
    expect(normalizeDueDate('2026-13-45')).toBeNull();
  });

  it('returns null for non-strings', () => {
    expect(normalizeDueDate(null)).toBeNull();
    expect(normalizeDueDate(undefined)).toBeNull();
    expect(normalizeDueDate(20260815)).toBeNull();
  });
});
