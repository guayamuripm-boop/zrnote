/**
 * Build an "Add to Google Calendar" link (no OAuth — it just opens Calendar
 * prefilled in whatever account the recipient is signed into).
 *
 * The dates must be UTC basic-format: `YYYYMMDDTHHMMSSZ`.
 *
 * This used to call date-fns with the pattern `yyyyMMddTHHmmssZ`. In date-fns,
 * `T` and `Z` are FORMAT TOKENS, not literals, so that call threw
 * `RangeError: Format string contains an unescaped latin alphabet character 'Z'`
 * every single time — which meant every meeting containing a commitment with a
 * due date crashed while building its e-mails. (Escaping them as 'T'/'Z' would
 * have been wrong too: date-fns formats in local time, so the result would have
 * been labelled UTC while carrying the server's offset.) Formatting straight
 * from the UTC components removes both problems and the dependency.
 */
function toGoogleUtc(date: Date): string {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  // 2026-08-01T09:00:00.000Z → 20260801T090000Z
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** `YYYYMMDD`, sin hora — lo que Google exige para un evento de "todo el día". */
function toGoogleUtcDate(date: Date): string {
  return toGoogleUtc(date).slice(0, 8);
}

export function generateGoogleCalendarUrl(event: {
  title: string;
  description: string;
  startTime: Date;
  endTime: Date;
  location?: string;
  /**
   * Para las TAREAS con fecha, no para los eventos: Google marca el día
   * entero en vez de reservar un bloque de 30 minutos que no representa nada
   * real ("enviar la cotización" no ocurre "de 9:00 a 9:30").
   */
  allDay?: boolean;
}): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    details: event.description,
    location: event.location || '',
  });

  if (event.allDay) {
    // Un evento de todo el día de un solo día lleva start=ese día,
    // end=día siguiente — el final es EXCLUSIVO en la API de Google.
    const startDay = toGoogleUtcDate(event.startTime);
    const endExclusive = new Date(event.startTime);
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
    const endDay = toGoogleUtcDate(endExclusive);
    if (startDay) params.set('dates', `${startDay}/${endDay}`);
  } else {
    const start = toGoogleUtc(event.startTime);
    const end = toGoogleUtc(event.endTime);
    if (start && end) params.set('dates', `${start}/${end}`);
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
