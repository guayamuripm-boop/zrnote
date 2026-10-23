import { describe, it, expect } from 'vitest';
import { daysUntilDue, dueBucket, dueLabel } from './due-date';

// 22 oct 2026, a última hora de la noche: el caso en que un cálculo por horas
// o en UTC se equivoca de día.
const NOW = new Date(2026, 9, 22, 23, 40);

describe('due dates', () => {
  it('counts calendar days, not hours', () => {
    expect(daysUntilDue('2026-10-23', NOW)).toBe(1);
    expect(daysUntilDue('2026-10-22', NOW)).toBe(0);
    expect(daysUntilDue('2026-10-21', NOW)).toBe(-1);
  });

  it('buckets by how soon it is due', () => {
    expect(dueBucket('2026-10-20', NOW)).toBe('overdue');
    expect(dueBucket('2026-10-22', NOW)).toBe('today');
    expect(dueBucket('2026-10-27', NOW)).toBe('week');
    expect(dueBucket('2026-11-15', NOW)).toBe('later');
    expect(dueBucket(null, NOW)).toBe('none');
  });

  it('labels it the way people say it', () => {
    expect(dueLabel('2026-10-21', NOW)).toBe('Venció ayer');
    expect(dueLabel('2026-10-19', NOW)).toBe('Venció hace 3 días');
    expect(dueLabel('2026-10-22', NOW)).toBe('Vence hoy');
    expect(dueLabel('2026-10-23', NOW)).toBe('Vence mañana');
    expect(dueLabel('2026-10-26', NOW)).toBe('Vence en 4 días');
    expect(dueLabel('2026-11-15', NOW)).toMatch(/^Vence el 15/);
  });

  it('accepts a full timestamp and ignores the time part', () => {
    expect(daysUntilDue('2026-10-23T00:00:00Z', NOW)).toBe(1);
  });

  it('treats garbage as «no date» instead of crashing', () => {
    expect(dueBucket('mañana', NOW)).toBe('none');
    expect(dueLabel('', NOW)).toBe('');
  });
});
