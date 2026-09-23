import { logger } from '@/lib/logger';
import { escapeHtml } from '@/lib/escape-html';
import { sendMail, isEmailConfigured, EMAIL_NOT_CONFIGURED, unsubscribeHeaders } from '@/lib/smtp';
import { claimEmailJobs, markEmailSent, markEmailFailed, getUnsubscribedEmails } from '@/lib/email-outbox';
import { unsubscribeUrl, signMinuteToken, canSignLinks } from '@/lib/minute-links';
import { appUrl } from '@/lib/app-url';

// A meeting nobody marks "kept" is deleted 30 days after it was created —
// title, transcript, minute, action items, everything. See migration 029 for
// why: without a cleanup, the meeting count could only ever grow, and Supabase
// free-tier storage was already over its 1 GB limit on 12 Sep 2026.
//
// The two halves below run from the daily retention cron. WARN comes first
// (~3 days ahead) so "guardar" is a real choice and not a surprise; DELETE is
// the one place in this codebase that permanently removes a meeting's content
// outside of the user asking for it directly, so it is deliberately narrow:
// only meetings the owner never touched, only after the warning had time to
// be read, and `kept` is re-checked at delete time in case the user acted on
// the warning in between.

export const MEETING_RETENTION_DAYS = 30;
/** Warn this many days before the delete, so there is time to react. */
const WARNING_LEAD_DAYS = 3;

interface UnkeptMeeting {
  id: string;
  title: string | null;
  created_at: string;
  created_by: string | null;
}

/**
 * Send the "se eliminará en unos días" notice to meetings crossing the warning
 * threshold for the first time. `deletion_warned_at` is the idempotency gate —
 * set once, checked here, so a daily cron never re-sends it.
 */
export async function sendDeletionWarnings(
  supabase: any,
): Promise<{ sent: number; failed: number; skipped?: string }> {
  if (!isEmailConfigured()) {
    return { sent: 0, failed: 0, skipped: EMAIL_NOT_CONFIGURED };
  }

  const warnCutoff = new Date();
  warnCutoff.setDate(warnCutoff.getDate() - (MEETING_RETENTION_DAYS - WARNING_LEAD_DAYS));

  const { data: candidates, error } = await supabase
    .from('meetings')
    .select('id, title, created_at, created_by')
    .eq('kept', false)
    .is('deletion_warned_at', null)
    .lt('created_at', warnCutoff.toISOString());

  if (error) {
    logger.error('meeting-lifecycle: could not query warning candidates', { error: error.message });
    return { sent: 0, failed: 0, skipped: error.message };
  }
  if (!candidates || candidates.length === 0) return { sent: 0, failed: 0 };

  const creatorIds = Array.from(
    new Set((candidates as UnkeptMeeting[]).map((m) => m.created_by).filter(Boolean)),
  ) as string[];
  const { data: creators } = await supabase
    .from('users')
    .select('id, email, full_name')
    .in('id', creatorIds);
  const byId = new Map<string, { id: string; email: string; full_name: string | null }>(
    (creators || []).map((u: any) => [u.id, u]),
  );

  const emails = Array.from(
    new Set((creators || []).map((u: any) => u.email?.toLowerCase()).filter(Boolean)),
  ) as string[];
  const bajas = await getUnsubscribedEmails(supabase, emails);

  const base = appUrl();
  let sent = 0;
  let failed = 0;

  for (const meeting of candidates as UnkeptMeeting[]) {
    const creator = meeting.created_by ? byId.get(meeting.created_by) : null;
    // Mark it warned regardless of whether an e-mail could be sent: without a
    // creator on record there is nobody to notify again tomorrow either, and
    // leaving the gate open would just re-run this same dead end daily.
    const closeOut = () =>
      supabase.from('meetings').update({ deletion_warned_at: new Date().toISOString() }).eq('id', meeting.id);

    if (!creator?.email) {
      await closeOut();
      continue;
    }
    if (bajas.has(creator.email.toLowerCase())) {
      await closeOut();
      continue;
    }

    const meetingUrl = `${base}/dashboard/meetings/${meeting.id}`;
    const title = meeting.title || 'Reunión sin título';
    const bajaToken = canSignLinks() ? signMinuteToken(meeting.id, creator.email) : null;

    const html =
      `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2937;max-width:640px;margin:0 auto">` +
      `<p>Hola ${escapeHtml(creator.full_name || creator.email.split('@')[0])},</p>` +
      `<p>Tu reunión <strong>${escapeHtml(title)}</strong> se eliminará en ${WARNING_LEAD_DAYS} días junto con su ` +
      `transcripción, minuta y compromisos — nadie la marcó como guardada, y así se libera espacio de las reuniones ` +
      `que ya nadie necesita.</p>` +
      `<p><a href="${meetingUrl}" style="color:#2563eb;font-weight:600">Ábrela y pulsa «Guardar»</a> si quieres conservarla. ` +
      `Es un solo clic y la reunión no se vuelve a tocar.</p>` +
      `<hr style="margin:24px 0;border:none;border-top:1px solid #eee"/>` +
      `<p style="text-align:center;color:#9ca3af;font-size:11px;line-height:1.6">` +
      `Aviso automático de ZRNote sobre la política de retención de reuniones sin guardar.` +
      (bajaToken
        ? `<br/>¿No quieres recibir más correos? <a href="${base}/baja/${bajaToken}" style="color:#9ca3af;text-decoration:underline">Date de baja</a>.`
        : '') +
      `</p></div>`;

    const [claimed] = await claimEmailJobs(
      supabase,
      meeting.id,
      [{ to: creator.email, subject: `[ZRNote] "${title}" se eliminará en ${WARNING_LEAD_DAYS} días`, html, kind: 'deletion_warning' as const }],
      { force: false },
    );

    if (!claimed) {
      await closeOut();
      continue;
    }

    const result = await sendMail({
      to: claimed.job.to,
      subject: claimed.job.subject,
      html: claimed.job.html,
      headers: unsubscribeHeaders(undefined, bajaToken ? unsubscribeUrl(meeting.id, creator.email) : undefined),
    });

    if (result.ok) {
      sent++;
      if (claimed.logId) await markEmailSent(supabase, claimed.logId);
    } else {
      failed++;
      if (claimed.logId) await markEmailFailed(supabase, claimed.logId, result.error);
      logger.error('meeting-lifecycle: warning send failed', { meetingId: meeting.id, error: result.error });
    }

    // Warned either way: a failed e-mail must not turn into a daily retry that
    // never converges, and the meeting page itself shows the countdown too.
    await closeOut();
  }

  logger.info('meeting-lifecycle: deletion warnings sent', { sent, failed, candidates: candidates.length });
  return { sent, failed };
}

/**
 * Permanently delete meetings nobody kept, 30 days after creation.
 *
 * Deleting the `meetings` row cascades to minutes, action_items,
 * meeting_participants, meeting_chunks and email_logs (all `ON DELETE
 * CASCADE`, see migration 001/012/021) — Storage is the one thing a SQL
 * cascade cannot reach, so it is removed explicitly first.
 */
export async function deleteUnkeptMeetings(
  supabase: any,
): Promise<{ deleted: number; audioFilesRemoved: number }> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - MEETING_RETENTION_DAYS);

  const { data: candidates, error } = await supabase
    .from('meetings')
    .select('id, audio_segments, kept')
    .eq('kept', false)
    .lt('created_at', cutoff.toISOString());

  if (error) {
    logger.error('meeting-lifecycle: could not query deletion candidates', { error: error.message });
    return { deleted: 0, audioFilesRemoved: 0 };
  }
  if (!candidates || candidates.length === 0) return { deleted: 0, audioFilesRemoved: 0 };

  let deleted = 0;
  let audioFilesRemoved = 0;

  for (const meeting of candidates) {
    // Re-checked here, not just in the query: the user may have pressed
    // "Guardar" in the seconds between the SELECT above and this loop, and a
    // stale read must never be the reason a saved meeting gets deleted.
    const { data: fresh } = await supabase.from('meetings').select('kept').eq('id', meeting.id).maybeSingle();
    if (!fresh || fresh.kept) continue;

    const storageKeys = (meeting.audio_segments || []).map((s: any) => s.r2_key).filter(Boolean);
    if (storageKeys.length > 0) {
      const { data: removed, error: removeError } = await supabase.storage
        .from('meeting-audio')
        .remove(storageKeys);
      if (removeError) {
        logger.error('meeting-lifecycle: audio removal failed, skipping this meeting for now', {
          meetingId: meeting.id,
          error: removeError.message,
        });
        // Do not delete the row while its audio might still be sitting in
        // Storage unaccounted for — the orphan sweep (migration 028) is the
        // net under this, but better not to need it.
        continue;
      }
      audioFilesRemoved += (removed || []).length;
    }

    const { error: deleteError } = await supabase.from('meetings').delete().eq('id', meeting.id);
    if (deleteError) {
      logger.error('meeting-lifecycle: meeting delete failed', { meetingId: meeting.id, error: deleteError.message });
      continue;
    }
    deleted++;
  }

  logger.info('meeting-lifecycle: unkept meetings deleted', { deleted, audioFilesRemoved, candidates: candidates.length });
  return { deleted, audioFilesRemoved };
}
