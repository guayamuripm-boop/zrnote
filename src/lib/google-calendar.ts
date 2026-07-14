import { google, calendar_v3 } from 'googleapis';
import { format, addMinutes, addHours } from 'date-fns';

export interface CalendarEventData {
  summary: string;
  description: string;
  startTime: Date;
  endTime: Date;
  attendees?: string[];
  meetingId: string;
  actionItemId?: string;
}

export interface GoogleCalendarConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  refreshToken?: string;
}

function getOAuth2Client(config: GoogleCalendarConfig) {
  const oauth2Client = new google.auth.OAuth2(
    config.clientId,
    config.clientSecret,
    config.redirectUri
  );

  if (config.refreshToken) {
    oauth2Client.setCredentials({ refresh_token: config.refreshToken });
  }

  return oauth2Client;
}

export async function createCalendarEvent(
  config: GoogleCalendarConfig,
  eventData: CalendarEventData
): Promise<{ success: boolean; eventId?: string; htmlLink?: string; error?: string }> {
  try {
    const oauth2Client = getOAuth2Client(config);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const event: calendar_v3.Schema$Event = {
      summary: eventData.summary,
      description: eventData.description,
      start: {
        dateTime: eventData.startTime.toISOString(),
        timeZone: 'America/Guayaquil',
      },
      end: {
        dateTime: eventData.endTime.toISOString(),
        timeZone: 'America/Guayaquil',
      },
      attendees: eventData.attendees?.filter((e): e is string => !!e).map(email => ({ email })) || [],
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 }, // 1 día antes
          { method: 'popup', minutes: 30 }, // 30 min antes
        ],
      },
      extendedProperties: {
        private: {
          zrnote_meeting_id: eventData.meetingId,
          zrnote_action_item_id: eventData.actionItemId || '',
        },
      },
    };

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
      sendUpdates: 'all',
    });

    return {
      success: true,
      eventId: response.data.id ?? undefined,
      htmlLink: response.data.htmlLink ?? undefined,
    };
  } catch (error: any) {
    console.error('Google Calendar create error:', error);
    return { success: false, error: error.message };
  }
}

export async function createMeetingCalendarEvent(
  config: GoogleCalendarConfig,
  meeting: {
    id: string;
    title: string;
    description?: string;
    startTime: Date;
    endTime: Date;
    attendees: string[];
  }
) {
  return createCalendarEvent(config, {
    summary: `Reunión: ${meeting.title}`,
    description: meeting.description || `Reunión ${meeting.title}`,
    startTime: meeting.startTime,
    endTime: meeting.endTime,
    attendees: meeting.attendees,
    meetingId: meeting.id,
  });
}

export async function createActionItemCalendarEvent(
  config: GoogleCalendarConfig,
  actionItem: {
    id: string;
    description: string;
    dueDate?: Date;
    priority: 'alta' | 'media' | 'baja';
    assigneeEmail?: string;
    assigneeName?: string;
    meetingTitle: string;
    meetingId: string;
  }
) {
  if (!actionItem.dueDate) {
    return { success: false, error: 'Action item has no due date' };
  }

  const startTime = new Date(actionItem.dueDate);
  startTime.setHours(9, 0, 0, 0); // 9 AM
  const endTime = new Date(startTime);
  endTime.setHours(10, 0, 0, 0); // 10 AM

  const priorityLabels = { alta: '🔴 ALTA', media: '🟡 MEDIA', baja: '🟢 BAJA' };

  return createCalendarEvent(config, {
    summary: `[${priorityLabels[actionItem.priority]}] ${actionItem.description}`,
    description: `Tarea de la reunión: ${actionItem.meetingTitle}\nResponsable: ${actionItem.assigneeName || 'Sin asignar'}\nPrioridad: ${actionItem.priority}`,
    startTime,
    endTime,
    attendees: actionItem.assigneeEmail ? [actionItem.assigneeEmail] : undefined,
    meetingId: actionItem.meetingId,
    actionItemId: actionItem.id,
  });
}

export function generateGoogleCalendarUrl(event: {
  title: string;
  description: string;
  startTime: Date;
  endTime: Date;
  location?: string;
}): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    details: event.description,
    dates: `${format(event.startTime, 'yyyyMMddTHHmmssZ')}/${format(event.endTime, 'yyyyMMddTHHmmssZ')}`,
    location: event.location || '',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function generateICSContent(event: {
  uid: string;
  title: string;
  description: string;
  startTime: Date;
  endTime: Date;
  location?: string;
  organizer?: { name: string; email: string };
  attendees?: string[];
}): string {
  const formatICS = (date: Date) => format(date, "yyyyMMdd'T'HHmmss'Z'");

  let ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ZRNote//Minutas Inteligentes//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'X-WR-CALNAME:ZRNote — Reuniones',
  ];

  const attendees = event.attendees?.map(email => `ATTENDEE;CN=${email}:mailto:${email}`).join('\n') || '';

  ics.push(
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${format(new Date(), "yyyyMMdd'T'HHmmss'Z'")}`,
    `DTSTART:${formatICS(event.startTime)}`,
    `DTEND:${formatICS(event.endTime)}`,
    `SUMMARY:${event.title}`,
    `DESCRIPTION:${event.description.replace(/\n/g, '\\n')}`,
    event.location ? `LOCATION:${event.location}` : '',
    event.organizer ? `ORGANIZER;CN=${event.organizer.name}:mailto:${event.organizer.email}` : '',
    attendees,
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
    'TRANSP:OPAQUE',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Recordatorio',
    'TRIGGER:-PT30M',
    'END:VALARM',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Recordatorio',
    'TRIGGER:-P1D',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  );

  return ics.filter(Boolean).join('\r\n');
}

function formatICS(date: Date): string {
  return format(date, "yyyyMMdd'T'HHmmss'Z'");
}