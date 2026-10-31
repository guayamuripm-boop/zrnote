import { describe, it, expect } from 'vitest';
import { summarizeAccountability } from './action-items';

// "Hoy" fijo para que los vencidos no dependan de cuándo corre el test.
const NOW = new Date('2026-10-30T12:00:00');
const ayer = '2026-10-29';
const mañana = '2026-10-31';

describe('summarizeAccountability', () => {
  it('agrupa por responsable y cuenta hechos/pendientes/vencidos', () => {
    const { people, totals } = summarizeAccountability(
      [
        { status: 'completado', assignee_name: 'María', due_date: ayer },
        { status: 'pendiente', assignee_name: 'María', due_date: ayer }, // vencido
        { status: 'pendiente', assignee_name: 'María', due_date: mañana }, // no vencido
        { status: 'pendiente', assignee_name: 'Pedro', due_date: null },
      ],
      NOW,
    );

    const maria = people.find((p) => p.name === 'María')!;
    expect(maria.total).toBe(3);
    expect(maria.done).toBe(1);
    expect(maria.pending).toBe(2);
    expect(maria.overdue).toBe(1);
    expect(maria.completionPct).toBe(33);

    expect(totals.total).toBe(4);
    expect(totals.done).toBe(1);
    expect(totals.pending).toBe(3);
    expect(totals.overdue).toBe(1);
    expect(totals.people).toBe(2);
    expect(totals.completionPct).toBe(25);
  });

  it('un completado nunca cuenta como vencido aunque la fecha ya pasó', () => {
    const { totals } = summarizeAccountability(
      [{ status: 'completado', assignee_name: 'Ana', due_date: ayer }],
      NOW,
    );
    expect(totals.overdue).toBe(0);
    expect(totals.completionPct).toBe(100);
  });

  it('agrupa lo que no tiene responsable en "Sin responsable", y va al final', () => {
    const { people } = summarizeAccountability(
      [
        { status: 'pendiente', assignee_name: null, due_date: ayer },
        { status: 'pendiente', assignee_name: '  ', due_date: null },
        { status: 'pendiente', assignee_name: 'Luis', due_date: null },
      ],
      NOW,
    );
    expect(people[people.length - 1].name).toBe('Sin responsable');
    expect(people.find((p) => p.name === 'Sin responsable')!.total).toBe(2);
  });

  it('ordena por más vencidos primero, luego más pendientes', () => {
    const { people } = summarizeAccountability(
      [
        { status: 'pendiente', assignee_name: 'Poco', due_date: mañana },
        { status: 'pendiente', assignee_name: 'Mucho', due_date: ayer },
        { status: 'pendiente', assignee_name: 'Mucho', due_date: ayer },
      ],
      NOW,
    );
    expect(people[0].name).toBe('Mucho');
  });

  it('sin items, totales en cero', () => {
    const { people, totals } = summarizeAccountability([], NOW);
    expect(people).toHaveLength(0);
    expect(totals).toMatchObject({ total: 0, done: 0, pending: 0, overdue: 0, completionPct: 0, people: 0 });
  });
});
