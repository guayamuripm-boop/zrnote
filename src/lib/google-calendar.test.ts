import { describe, it, expect } from 'vitest';
import { generateGoogleCalendarUrl } from './google-calendar';

// Regression guard. The previous implementation formatted the dates with
// date-fns using the pattern `yyyyMMddTHHmmssZ`, where `T` and `Z` are format
// TOKENS rather than literals — so it threw `RangeError: Format string contains
// an unescaped latin alphabet character 'Z'` on every call. Since this runs
// while composing the e-mails, ANY meeting with a dated commitment failed to
// send anything at all.

describe('generateGoogleCalendarUrl', () => {
  const start = new Date('2026-08-01T09:00:00.000Z');
  const end = new Date('2026-08-01T09:30:00.000Z');

  it('does not throw for a normal event', () => {
    expect(() => generateGoogleCalendarUrl({
      title: 'Revisar propuesta',
      description: 'Prioridad: alta',
      startTime: start,
      endTime: end,
    })).not.toThrow();
  });

  it('emits UTC basic-format dates', () => {
    const url = generateGoogleCalendarUrl({
      title: 'Revisar propuesta',
      description: '',
      startTime: start,
      endTime: end,
    });
    expect(decodeURIComponent(url)).toContain('dates=20260801T090000Z/20260801T093000Z');
  });

  it('url-encodes the title and description', () => {
    const url = generateGoogleCalendarUrl({
      title: 'Enviar & revisar (v2)',
      description: 'Línea 1\nLínea 2',
      startTime: start,
      endTime: end,
    });
    expect(url).not.toContain('\n');
    expect(url).toContain('text=Enviar+%26+revisar');
  });

  it('omits the dates parameter instead of throwing on an invalid date', () => {
    const url = generateGoogleCalendarUrl({
      title: 'Sin fecha',
      description: '',
      startTime: new Date('no es una fecha'),
      endTime: new Date('no es una fecha'),
    });
    expect(url).not.toContain('dates=');
    expect(url).toContain('action=TEMPLATE');
  });

  describe('allDay (tareas con fecha, sin hora concreta)', () => {
    it('marca el día entero, sin hora', () => {
      const url = generateGoogleCalendarUrl({
        title: 'Enviar la cotización',
        description: '',
        startTime: new Date('2026-08-15T09:00:00.000Z'),
        endTime: new Date('2026-08-15T09:30:00.000Z'), // se ignora en modo allDay
        allDay: true,
      });
      // El final es EXCLUSIVO en la API de Google: un evento de un solo día
      // lleva start=ese día, end=día siguiente.
      expect(decodeURIComponent(url)).toContain('dates=20260815/20260816');
      expect(url).not.toContain('T090000Z');
    });

    it('no revienta con una fecha inválida', () => {
      const url = generateGoogleCalendarUrl({
        title: 'Sin fecha',
        description: '',
        startTime: new Date('no es una fecha'),
        endTime: new Date('no es una fecha'),
        allDay: true,
      });
      expect(url).not.toContain('dates=');
    });
  });
});
