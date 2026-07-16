function escapeICS(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T09:00:00');
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}T090000`;
}

function formatEnd(dateStr: string): string {
  const d = new Date(dateStr + 'T10:00:00');
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}T100000`;
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
    const dtstart = event.dueDate ? formatDate(event.dueDate) : nowStamp();
    const dtend = event.dueDate ? formatEnd(event.dueDate) : nowStamp();

    lines.push(
      'BEGIN:VEVENT',
      `UID:${event.uid}`,
      `DTSTAMP:${nowStamp()}`,
      `DTSTART:${dtstart}`,
      `DTEND:${dtend}`,
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
