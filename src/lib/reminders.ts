import { createClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';
import { escapeHtml } from '@/lib/safe-html';
import { sendMail, isEmailConfigured, EMAIL_NOT_CONFIGURED } from '@/lib/smtp';
import { claimEmailJobs, markEmailSent, markEmailFailed } from '@/lib/email-outbox';

// Sends one reminder email per assignee for action items due TOMORROW that are
// not yet completed. Firing exactly one day before the due date means a single,
// non-spammy reminder without needing a "reminded_at" column. Runs daily,
// piggybacked on the retention cron (Vercel Hobby allows only 2 cron jobs).
//
// v1.11: este módulo tenía su propio `nodemailer.createTransport` y su propio
// HTML, ignorando `sendMail()` y el pie legal común. Resultado: los
// recordatorios salían sin el aviso de «generado por IA», sin versión en texto
// plano, y NO se registraban en email_logs — eran invisibles para el export
// RGPD y para el diagnóstico. Ahora pasa por el mismo camino que el resto.
export async function sendDueReminders(): Promise<{ sent: number; failed: number; skipped?: string }> {
  if (!isEmailConfigured()) {
    return { sent: 0, failed: 0, skipped: EMAIL_NOT_CONFIGURED };
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY!
  );

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10); // YYYY-MM-DD

  const { data: items, error } = await supabase
    .from('action_items')
    .select('id, description, priority, due_date, assignee_name, assignee_email, meeting_id')
    .eq('due_date', tomorrowStr)
    .neq('status', 'completado')
    .not('assignee_email', 'is', null);

  if (error) {
    logger.error('reminders: query failed', { error: error.message });
    return { sent: 0, failed: 0, skipped: error.message };
  }
  if (!items || items.length === 0) return { sent: 0, failed: 0 };

  // Group tasks by recipient.
  const byEmail = new Map<string, any[]>();
  for (const it of items) {
    if (!it.assignee_email) continue;
    const key = it.assignee_email.toLowerCase();
    (byEmail.get(key) || byEmail.set(key, []).get(key))!.push(it);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://zrnote.vercel.app';

  // Un recordatorio por destinatario, con el mismo pie legal que las minutas.
  const jobs = Array.from(byEmail.entries()).map(([email, tasks]) => {
    const name = tasks[0].assignee_name || email.split('@')[0];
    const rows = tasks
      .map(
        (t) =>
          `<li style="margin-bottom:6px"><strong>${escapeHtml(t.description)}</strong>` +
          ` — Prioridad: ${escapeHtml(t.priority || '—')}` +
          ` · <a href="${appUrl}/dashboard/meetings/${t.meeting_id}" style="color:#2563eb">ver reunión</a></li>`
      )
      .join('');

    const html =
      `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2937;max-width:640px;margin:0 auto">` +
      `<p>Hola ${escapeHtml(name)},</p>` +
      `<p>Te recordamos que ${tasks.length === 1 ? 'tienes 1 tarea que vence' : `tienes ${tasks.length} tareas que vencen`} <strong>mañana</strong>:</p>` +
      `<ul style="color:#333;line-height:1.6">${rows}</ul>` +
      `<hr style="margin:24px 0;border:none;border-top:1px solid #eee"/>` +
      `<p style="text-align:center;color:#9ca3af;font-size:11px;line-height:1.6">` +
      `Recordatorio automático de ZRNote, a partir de los compromisos detectados por IA en una reunión.<br/>` +
      `<strong>Puede contener errores</strong>: si esta tarea no es tuya, avisa a quien convocó la reunión.` +
      `</p></div>`;

    return {
      to: email,
      subject: `[ZRNote] Recordatorio: ${tasks.length === 1 ? 'una tarea vence' : `${tasks.length} tareas vencen`} mañana`,
      html,
      kind: 'reminder' as const,
      meetingId: tasks[0].meeting_id as string,
    };
  });

  let sent = 0;
  let failed = 0;

  for (const job of jobs) {
    // Se reserva por separado (una reunión distinta por recordatorio) para que
    // la clave de idempotencia quede ligada a la reunión correcta. Si el cron
    // se ejecuta dos veces el mismo día, el segundo pase no reenvía nada.
    const [claimedJob] = await claimEmailJobs(supabase, job.meetingId, [job], { force: false });
    if (!claimedJob) continue;

    const result = await sendMail({ to: job.to, subject: job.subject, html: job.html });
    if (result.ok) {
      sent++;
      await markEmailSent(supabase, claimedJob.logId);
    } else {
      failed++;
      logger.error('reminders: send failed', { email: job.to, error: result.error });
      await markEmailFailed(supabase, claimedJob.logId, result.error);
    }
  }

  logger.info('reminders sent', { sent, failed, recipients: byEmail.size });
  return { sent, failed };
}
