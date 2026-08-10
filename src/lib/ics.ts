function escapeICS(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/**
 * `2026-08-05` → `20260805`.
 *
 * Antes esto construía un `new Date(dateStr + 'T09:00:00')` para acto seguido
 * volver a extraerle el año, el mes y el día — un viaje de ida y vuelta inútil
 * que además puede desplazar la fecha un día al cruzar husos o cambios de hora.
 * La fecha ya viene en el formato correcto: basta con quitarle los guiones.
 */
function compactDate(dateStr: string): string {
  return dateStr.slice(0, 10).replace(/-/g, '');
}

/**
 * Los EVENTOS se agendan a las 09:00 y duran media hora.
 *
 * El .ics reservaba de 09:00 a 10:00 mientras que el enlace de Google Calendar
 * del mismo compromiso proponía 09:00–09:30: la misma tarea ocupaba distinto
 * hueco según por dónde la añadieras. Ahora las dos rutas dicen lo mismo.
 * Ver `actionItemCalendarLink` en `email-service.ts`.
 */
function formatDate(dateStr: string): string {
  return `${compactDate(dateStr)}T090000`;
}

function formatEnd(dateStr: string): string {
  return `${compactDate(dateStr)}T093000`;
}

/** Un día después, en `YYYYMMDD` — el fin de un VEVENT de todo el día es EXCLUSIVO. */
function nextDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

function nowStamp(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${y}${m}${day}T${h}${min}${s}`;
}

function priorityNumber(p: string): string {
  if (p === 'alta') return '1';
  if (p === 'media') return '5';
  return '9';
}

export interface CalendarEvent {
  uid: string;
  summary: string;
  description: string;
  dueDate: string;
  priority: string;
  assigneeName: string;
  /** 'evento' reserva un bloque de tiempo; 'tarea' (por defecto) marca el día entero. */
  kind?: 'evento' | 'tarea';
}

export function generateICS(events: CalendarEvent[]): string {
  if (events.length === 0) return '';

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ZRNote//Minutas Inteligentes//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:ZRNote — Compromisos',
    'X-WR-TIMEZONE:America/Guayaquil',
  ];

  for (const event of events) {
    // Una tarea con fecha marca el día entero (VALUE=DATE, sin hora); un
    // evento reserva su bloque de 09:00 a 09:30. Sin fecha, no hay diferencia
    // posible: se usa el instante actual como antes.
    const isAllDay = event.kind !== 'evento' && !!event.dueDate;

    const dtstartLine = !event.dueDate
      ? `DTSTART:${nowStamp()}`
      : isAllDay
        ? `DTSTART;VALUE=DATE:${compactDate(event.dueDate)}`
        : `DTSTART:${formatDate(event.dueDate)}`;
    const dtendLine = !event.dueDate
      ? `DTEND:${nowStamp()}`
      : isAllDay
        ? `DTEND;VALUE=DATE:${nextDay(event.dueDate)}`
        : `DTEND:${formatEnd(event.dueDate)}`;

    lines.push(
      'BEGIN:VEVENT',
      `UID:${event.uid}`,
      `DTSTAMP:${nowStamp()}`,
      dtstartLine,
      dtendLine,
      `SUMMARY:${escapeICS(`[ZRNote] ${event.summary}`)}`,
      `DESCRIPTION:${escapeICS(event.description)}`,
      `PRIORITY:${priorityNumber(event.priority)}`,
      'STATUS:NEEDS-ACTION',
      'BEGIN:VALARM',
      'TRIGGER:-P1D',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeICS(`Mañana vence: ${event.summary}`)}`,
      'END:VALARM',
      'BEGIN:VALARM',
      'TRIGGER:-PT2H',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeICS(`En 2 horas vence: ${event.summary}`)}`,
      'END:VALARM',
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function icsToBuffer(icsContent: string): Buffer {
  return Buffer.from(icsContent, 'utf-8');
}
