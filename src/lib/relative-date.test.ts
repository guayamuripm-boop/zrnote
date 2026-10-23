import { describe, it, expect } from 'vitest';
import { relativeDate } from './relative-date';

const NOW = new Date(2026, 9, 22, 10, 0); // 22 oct 2026, 10:00

describe('relativeDate', () => {
  it('says «hoy» for the same calendar day', () => {
    expect(relativeDate(new Date(2026, 9, 22, 0, 5), NOW)).toBe('hoy');
  });

  it('says «ayer» for last night even if only hours have passed', () => {
    expect(relativeDate(new Date(2026, 9, 21, 23, 30), NOW)).toBe('ayer');
  });

  it('counts days within the week', () => {
    expect(relativeDate(new Date(2026, 9, 19, 12, 0), NOW)).toBe('hace 3 días');
  });

  it('falls back to a short date after a week, without the year when it is this year', () => {
    const out = relativeDate(new Date(2026, 8, 30, 12, 0), NOW);
    expect(out).toMatch(/30/);
    expect(out).not.toMatch(/2026/);
  });

  it('includes the year for dates from another year', () => {
    expect(relativeDate(new Date(2025, 11, 1, 12, 0), NOW)).toMatch(/2025/);
  });

  it('returns an empty string for an invalid date instead of «Invalid Date»', () => {
    expect(relativeDate('no-es-fecha', NOW)).toBe('');
  });
});
