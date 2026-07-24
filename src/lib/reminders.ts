import { createClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';
import { escapeHtml } from '@/lib/safe-html';

// Sends one reminder email per assignee for action items due TOMORROW that are
// not yet completed. Firing exactly one day before the due date means a single,
// non-spammy reminder without needing a "reminded_at" column. Runs daily,
// piggybacked on the retention cron (Vercel Hobby allows only 2 cron jobs).
export async function sendDueReminders(): Promise<{ sent: number; failed: number; skipped?: string }> {
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !gmailPass) {
    return { sent: 0, failed: 0, skipped: 'GMAIL no configurado' };
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
  const nodemailer = await import('nodemailer');
  const transporter = nodemailer.default.createTransport({
    service: 'gmail',
    auth: { user: gmailUser, pass: gmailPass },
  });

  let sent = 0;
  let failed = 0;

  for (const [email, tasks] of byEmail) {
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
      `<p>Hola ${escapeHtml(name)},</p>` +
      `<p>Te recordamos que ${tasks.length === 1 ? 'tienes 1 tarea que vence' : `tienes ${tasks.length} tareas que vencen`} <strong>mañana</strong>:</p>` +
      `<ul style="color:#333;line-height:1.6">${rows}</ul>` +
      `<p style="color:#888;font-size:12px">Recordatorio automático de ZRNote.</p>`;

    try {
      await transporter.sendMail({
        from: `"ZRNote" <${gmailUser}>`,
        to: email,
        subject: `[ZRNote] Recordatorio: ${tasks.length === 1 ? 'una tarea vence' : `${tasks.length} tareas vencen`} mañana`,
        html,
      });
      sent++;
    } catch (err: any) {
      logger.error('reminders: send failed', { email, error: err?.message });
      failed++;
    }
  }

  logger.info('reminders sent', { sent, failed, recipients: byEmail.size });
  return { sent, failed };
}
