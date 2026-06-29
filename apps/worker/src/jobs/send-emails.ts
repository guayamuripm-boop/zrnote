import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '../lib/resend';
import { personalEmailTemplate, coordinatorEmailTemplate } from '../lib/email-templates';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function sendEmailsJob(meetingId: string): Promise<void> {
  const { data: meeting } = await supabase
    .from('meetings')
    .select('*, minutes(*), meeting_participants(*, users(*))')
    .eq('id', meetingId)
    .single();

  if (!meeting) throw new Error('Meeting not found');

  const minute = meeting.minutes?.[0];
  if (!minute) throw new Error('Minute not found');

  const { data: actionItems } = await supabase
    .from('action_items')
    .select('*')
    .eq('meeting_id', meetingId);

  for (const participant of meeting.meeting_participants || []) {
    const user = participant.users;
    if (!user?.email) continue;

    const participantItems = (actionItems || []).filter(
      (item) =>
        item.assignee_user_id === user.id ||
        item.assignee_email === user.email
    );

    if (participantItems.length === 0) continue;

    const html = personalEmailTemplate({
      meetingTitle: meeting.title,
      meetingDate: meeting.created_at,
      summary: minute.summary,
      actionItems: participantItems,
      meetingId: meeting.id,
    });

    const resendId = await sendEmail({
      to: user.email,
      subject: `[ZRNote] ${meeting.title} — Tus compromisos`,
      html,
    });

    await supabase.from('email_logs').insert({
      meeting_id: meetingId,
      recipient_email: user.email,
      type: 'personal',
      resend_id: resendId,
      status: 'sent',
    });
  }

  const { data: coordinator } = await supabase
    .from('users')
    .select('*')
    .eq('id', meeting.created_by)
    .single();

  if (coordinator?.email) {
    const coordinatorHtml = coordinatorEmailTemplate({
      meetingTitle: meeting.title,
      meetingDate: meeting.created_at,
      actionItems: actionItems || [],
      meetingId: meeting.id,
    });

    const resendId = await sendEmail({
      to: coordinator.email,
      subject: `[ZRNote] ${meeting.title} — Resumen completo`,
      html: coordinatorHtml,
    });

    await supabase.from('email_logs').insert({
      meeting_id: meetingId,
      recipient_email: coordinator.email,
      type: 'coordinator_summary',
      resend_id: resendId,
      status: 'sent',
    });
  }
}
