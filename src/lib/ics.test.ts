import { describe, it, expect } from 'vitest';
import { generateICS, type CalendarEvent } from './ics';

const base: CalendarEvent = {
  uid: 'a1@zrnote',
  summary: 'Enviar cotización',
  description: 'Prioridad: alta',
  dueDate: '2026-08-15',
  priority: 'alta',
  assigneeName: 'Ana',
};

describe('generateICS', () => {
  it('devuelve vacío sin eventos', () => {
    expect(generateICS([])).toBe('');
  });

  it('una tarea (sin kind, o kind: "tarea") marca el DÍA ENTERO, sin hora', () => {
    // Antes SIEMPRE reservaba 09:00-09:30, tenga sentido o no para algo como
    // "enviar la cotización", que no ocurre en un bloque de tiempo.
    const ics = generateICS([base]);
    expect(ics).toContain('DTSTART;VALUE=DATE:20260815');
    // El final de un VEVENT de todo el día es EXCLUSIVO: un día después.
    expect(ics).toContain('DTEND;VALUE=DATE:20260816');
    expect(ics).not.toContain('T090000');
  });

  it('un evento SÍ reserva un bloque de tiempo concreto', () => {
    const ics = generateICS([{ ...base, kind: 'evento' }]);
    expect(ics).toContain('DTSTART:20260815T090000');
    expect(ics).toContain('DTEND:20260815T093000');
    expect(ics).not.toContain('VALUE=DATE');
  });

  it('sin fecha, cae al instante actual en vez de reventar', () => {
    const ics = generateICS([{ ...base, dueDate: '' }]);
    expect(ics).toMatch(/DTSTART:\d{8}T\d{6}/);
    expect(ics).not.toContain('VALUE=DATE');
  });

  it('el cambio de año en el fin de día no se rompe', () => {
    // 31 de diciembre + 1 día cruza de año — el caso que más fácil se rompe
    // con aritmética de fechas hecha a mano.
    const ics = generateICS([{ ...base, dueDate: '2026-12-31' }]);
    expect(ics).toContain('DTSTART;VALUE=DATE:20261231');
    expect(ics).toContain('DTEND;VALUE=DATE:20270101');
  });

  it('incluye el resumen y la prioridad', () => {
    const ics = generateICS([base]);
    expect(ics).toContain('[ZRNote] Enviar cotización');
    expect(ics).toContain('PRIORITY:1');
  });
});
