import { describe, it, expect } from 'vitest';
import { sortActionItems } from './action-items';

describe('sortActionItems', () => {
  it('puts high priority above medium and low', () => {
    const sorted = sortActionItems([
      { status: 'pendiente', priority: 'baja', due_date: null },
      { status: 'pendiente', priority: 'alta', due_date: null },
      { status: 'pendiente', priority: 'media', due_date: null },
    ]);
    expect(sorted.map((i) => i.priority)).toEqual(['alta', 'media', 'baja']);
  });

  it('does NOT fall back to alphabetical order (baja before media was the bug)', () => {
    const sorted = sortActionItems([
      { status: 'pendiente', priority: 'media', due_date: null },
      { status: 'pendiente', priority: 'baja', due_date: null },
    ]);
    expect(sorted[0].priority).toBe('media');
  });

  it('pushes completed items to the bottom regardless of priority', () => {
    const sorted = sortActionItems([
      { status: 'completado', priority: 'alta', due_date: null },
      { status: 'pendiente', priority: 'baja', due_date: null },
    ]);
    expect(sorted[0].status).toBe('pendiente');
  });

  it('orders in_progress after pendiente but before completado', () => {
    const sorted = sortActionItems([
      { status: 'completado', priority: 'media', due_date: null },
      { status: 'en_progreso', priority: 'media', due_date: null },
      { status: 'pendiente', priority: 'media', due_date: null },
    ]);
    expect(sorted.map((i) => i.status)).toEqual(['pendiente', 'en_progreso', 'completado']);
  });

  it('breaks ties by the nearest due date, undated last', () => {
    const sorted = sortActionItems([
      { status: 'pendiente', priority: 'alta', due_date: null },
      { status: 'pendiente', priority: 'alta', due_date: '2026-09-01' },
      { status: 'pendiente', priority: 'alta', due_date: '2026-08-01' },
    ]);
    expect(sorted.map((i) => i.due_date)).toEqual(['2026-08-01', '2026-09-01', null]);
  });

  it('treats a missing priority as media instead of dropping the item', () => {
    const sorted = sortActionItems([
      { status: 'pendiente', priority: 'baja', due_date: null },
      { status: 'pendiente', priority: null, due_date: null },
    ]);
    expect(sorted[0].priority).toBeNull();
  });

  it('does not mutate the input array', () => {
    const input = [
      { status: 'pendiente', priority: 'baja', due_date: null },
      { status: 'pendiente', priority: 'alta', due_date: null },
    ];
    const copy = [...input];
    sortActionItems(input);
    expect(input).toEqual(copy);
  });
});
