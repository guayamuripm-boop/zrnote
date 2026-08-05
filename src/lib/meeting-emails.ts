// Single source of truth for the meeting e-mails.
//
// There used to be TWO independent implementations — the pipeline step in
// `processing.ts` and the on-demand route `/api/meetings/[id]/send-emails` —
// which had drifted apart: the route escaped user/LLM content and attached an
// .ics file, the pipeline one did neither (so a meeting titled
// `<img onerror=...>` shipped raw into every recipient's inbox). Both now call
// the builders here.

import { logger } from '@/lib/logger';
import { sendMail } from '@/lib/smtp';
import { generateICS, icsToBuffer, CalendarEvent } from '@/lib/ics';
import { escapeHtml } from '@/lib/safe-html';
import { claimEmailJobs, markEmailSent, markEmailFailed, EmailKind } from '@/lib/email-outbox';
import {
  buildMinuteHtml,
  buildActionItemsHtml,
  buildMyItemsHtml,
  buildOtherItemsHtml,
  matchItemsToParticipant,
  sendWithRetry,
} from '@/lib/email-service';

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface EmailJob {
  to: string;
  subject: string;
  html: string;
  label: string;
  kind: EmailKind;
  /** @deprecated usa `kind`. Se mantiene para no romper llamadas existentes. */
  isCoordinator: boolean;
  attachments?: EmailAttachment[];
}

export interface DispatchResult {
  success: boolean;
  sent: number;
  failed: number;
  /** Omitidos por constar ya como enviados (idempotencia). */
  skipped: number;
  error?: string;
  details: Array<{ email: string; ok: boolean; error?: string }>;
}

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL || 'https://zrnote.vercel.app';

function shell(bodyHtml: string, meetingId: string): string {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2937;max-width:640px;margin:0 auto">
${bodyHtml}
<hr style="margin:24px 0;border:none;border-top:1px solid #eee"/>
<p style="text-align:center;margin:16px 0"><a href="${appUrl()}/dashboard/meetings/${meetingId}" style="display:inline-block;background:#2563eb;color:#fff;padding:11px 22px;border-radius:8px;text-decoration:none;font-weight:500">Ver en ZRNote</a></p>
<p style="text-align:center;color:#9ca3af;font-size:11px;line-height:1.6;margin-top:24px">
Minuta generada automáticamente con inteligencia artificial a partir del audio de la reunión.<br/>
<strong>Puede contener errores u omisiones</strong>: revísala antes de tomar decisiones o compartirla.<br/>
Si recibiste este correo por error, avísale a quien convocó la reunión y bórralo.
</p>
</div>`;
}

function itemsToCalendarEvents(items: any[], contextTitle: string): CalendarEvent[] {
  return items
    .filter((i) => i.due_date)
    .map((i) => ({
      uid: `${i.id}@zrnote`,
      summary: i.description || 'Compromiso',
      description: `Prioridad: ${i.priority || '—'}\nReunión: ${contextTitle}\nResponsable: ${i.assignee_name || 'Sin asignar'}`,
      dueDate: i.due_date,
      priority: i.priority || 'media',
      assigneeName: i.assignee_name || '',
    }));
}

function icsAttachment(events: CalendarEvent[], filename: string): EmailAttachment[] | undefined {
  const content = generateICS(events);
  if (!content) return undefined;
  return [{ filename, content: icsToBuffer(content), contentType: 'text/calendar; charset=utf-8' }];
}

function calendarNote(count: number): string {
  if (count === 0) return '';
  return `<p style="background:#eff6ff;border-left:3px solid #3b82f6;padding:10px 14px;margin:12px 0;border-radius:0 8px 8px 0;font-size:13px;color:#1e40af">📅 Se adjuntó un archivo de calendario con ${count} compromiso(s). Ábrelo para agregarlo a tu calendario.</p>`;
}

/**
 * Build the personalised e-mail for every participant plus the full summary for
 * the meeting creator. Returns an empty list when there is nobody to write to.
 */
export async function buildMeetingEmailJobs(
  supabase: any,
  meetingId: string,
  meetingTitle: string,
  createdBy: string,
): Promise<EmailJob[]> {
  const [actionItemsResult, minuteResult, participantsResult, creatorParticipantResult, creatorUserResult] =
    await Promise.all([
      supabase.from('action_items').select('*').eq('meeting_id', meetingId),
      supabase.from('minutes').select('*').eq('meeting_id', meetingId).maybeSingle(),
      supabase.from('meeting_participants').select('*').eq('meeting_id', meetingId),
      supabase
        .from('meeting_participants')
        .select('email_override')
        .eq('meeting_id', meetingId)
        .eq('user_id', createdBy)
        .maybeSingle(),
      supabase.from('users').select('email').eq('id', createdBy).maybeSingle(),
    ]);

  const allItems = actionItemsResult.data || [];
  const minute = minuteResult.data;
  const creatorEmail: string | undefined =
    creatorParticipantResult.data?.email_override || creatorUserResult.data?.email;

  const participants = (participantsResult.data || [])
    .map((p: any) => ({
      name: p.name || p.email_override?.split('@')[0] || 'Participante',
      email: (p.email_override || '').trim(),
    }))
    .filter((p: any) => p.email);

  const safeTitle = escapeHtml(meetingTitle);
  const minuteHtml = buildMinuteHtml(minute);
  const allItemsHtml = buildActionItemsHtml(allItems);
  const jobs: EmailJob[] = [];

  for (const p of participants) {
    if (creatorEmail && p.email.toLowerCase() === creatorEmail.toLowerCase()) continue;

    const myItems = matchItemsToParticipant(allItems, p.name, p.email);
    const otherItems = allItems.filter((i: any) => !myItems.includes(i));
    const events = itemsToCalendarEvents(myItems, meetingTitle);

    jobs.push({
      to: p.email,
      subject: `[ZRNote] ${meetingTitle} — Minuta y compromisos`,
      html: shell(
        `<p>Hola ${escapeHtml(p.name)},</p>
<p>La reunión <b>${safeTitle}</b> ya fue procesada. Aquí tienes tus compromisos y la minuta completa.</p>
${calendarNote(events.length)}${buildMyItemsHtml(myItems)}${buildOtherItemsHtml(otherItems)}
<hr style="margin:24px 0;border:none;border-top:1px solid #eee"/>
<h2 style="color:#1a1a2e;font-size:20px;margin-bottom:12px">Minuta completa</h2>${minuteHtml}`,
        meetingId,
      ),
      label: p.email,
      kind: 'personal',
      isCoordinator: false,
      attachments: icsAttachment(events, 'compromisos.ics'),
    });
  }

  if (creatorEmail) {
    const events = itemsToCalendarEvents(allItems, meetingTitle);
    jobs.push({
      to: creatorEmail,
      subject: `[ZRNote] ${meetingTitle} — Minuta completa + todas las tareas`,
      html: shell(
        `<p>La reunión <b>${safeTitle}</b> ya fue procesada. Aquí tienes la minuta completa con todos los compromisos.</p>
${calendarNote(events.length)}${allItemsHtml}
<hr style="margin:24px 0;border:none;border-top:1px solid #eee"/>
<h2 style="color:#1a1a2e;font-size:20px;margin-bottom:12px">Minuta completa</h2>${minuteHtml}`,
        meetingId,
      ),
      label: `coordinator (${creatorEmail})`,
      kind: 'coordinator_summary',
      isCoordinator: true,
      attachments: icsAttachment(events, 'compromisos_todos.ics'),
    });
  }

  return jobs;
}

/**
 * Presupuesto de tiempo. La función de Vercel tiene un límite duro; si lo
 * superamos nos matan a mitad del bucle. Paramos antes por decisión propia y
 * dejamos las filas restantes en 'pending', que es un estado del que se puede
 * continuar. Antes esto era una muerte súbita sin registro de nada.
 */
const DISPATCH_BUDGET_MS = 45_000;
/** Gmail estrangula las ráfagas. Un segundo entre mensajes deja margen de sobra. */
const THROTTLE_MS = 1000;

/**
 * Envía los correos con reintentos, sin duplicar y registrando cada uno por
 * separado.
 *
 * Tres cosas cambiaron respecto a la versión anterior:
 *  1. La fila de email_logs se escribe ANTES de enviar (ver email-outbox.ts),
 *     así que morir a mitad ya no borra la memoria de lo que sí salió.
 *  2. Se salta a quien ya lo recibió, salvo que sea un reenvío explícito.
 *  3. Se para sola antes del límite de la función en vez de que la maten.
 */
export async function dispatchEmailJobs(
  supabase: any,
  meetingId: string,
  jobs: EmailJob[],
  opts: { force?: boolean } = {},
): Promise<DispatchResult> {
  if (jobs.length === 0) {
    return {
      success: false,
      sent: 0,
      failed: 0,
      skipped: 0,
      error: 'No hay destinatarios: agrega participantes con correo a la reunión.',
      details: [],
    };
  }

  const claimed = await claimEmailJobs(supabase, meetingId, jobs, opts);
  const skipped = jobs.length - claimed.length;

  if (claimed.length === 0) {
    // Todo estaba ya enviado. Es éxito, no fallo: el usuario quería que sus
    // participantes tuvieran la minuta, y la tienen.
    logger.info('Todos los correos constaban ya como enviados', { meetingId, skipped });
    return { success: true, sent: 0, failed: 0, skipped, details: [] };
  }

  const details: DispatchResult['details'] = [];
  const startedAt = Date.now();
  let sent = 0;
  let failed = 0;
  let ranOutOfTime = false;

  for (let i = 0; i < claimed.length; i++) {
    if (Date.now() - startedAt > DISPATCH_BUDGET_MS) {
      // Las filas restantes se quedan en 'pending': un reintento las recoge.
      ranOutOfTime = true;
      logger.warn('Presupuesto de tiempo agotado al enviar correos', {
        meetingId,
        enviados: sent,
        pendientes: claimed.length - i,
      });
      break;
    }

    const { job, logId } = claimed[i];
    const result = await sendWithRetry(() =>
      sendMail({ to: job.to, subject: job.subject, html: job.html, attachments: job.attachments }),
    );

    if (result.ok) {
      sent++;
      await markEmailSent(supabase, logId);
    } else {
      failed++;
      await markEmailFailed(supabase, logId, result.error);
    }
    details.push({ email: job.to, ok: result.ok, error: result.error });

    if (i < claimed.length - 1) await new Promise((r) => setTimeout(r, THROTTLE_MS));
  }

  const errors = details.filter((d) => !d.ok).map((d) => `${d.email}: ${d.error}`);
  if (ranOutOfTime) {
    errors.push(`Quedaron ${claimed.length - details.length} correo(s) por enviar: vuelve a pulsar «Enviar correos».`);
  }

  return {
    success: failed === 0 && !ranOutOfTime,
    sent,
    failed,
    skipped,
    error: errors.length > 0 ? errors.join('; ') : undefined,
    details,
  };
}
