import { createServerSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { sendMail } from '@/lib/smtp';
import { generateICS, icsToBuffer, CalendarEvent } from '@/lib/ics';
import { buildMinuteHtml, buildActionItemsHtml, buildMyItemsHtml, buildOtherItemsHtml, matchItemsToParticipant, sendWithRetry } from '@/lib/email-service';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const authHeader = request.headers.get('authorization') || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
  const isInternal = authHeader === `Bearer ${serviceKey}`;

  const supabase = createServerSupabase();
  let userId: string | null = null;

  if (isInternal) {
    userId = null;
  } else {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    userId = user.id;
  }

  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return NextResponse.json({ error: 'Gmail SMTP not configured on server' }, { status: 500 });
  }

  const meetingQuery = supabase
    .from('meetings')
    .select('id, title, created_by')
    .eq('id', params.id);

  if (!isInternal) {
    meetingQuery.eq('created_by', userId);
  }

  const { data: meeting } = await meetingQuery.single();

  if (!meeting) {
    return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
  }

  if (!isInternal && meeting.created_by !== userId) {
    return NextResponse.json({ error: 'Solo el creador puede enviar correos' }, { status: 403 });
  }

  const [actionItemsResult, minuteResult, participantsResult, creatorResult, creatorUserResult] = await Promise.all([
    supabase.from('action_items').select('*').eq('meeting_id', params.id),
    supabase.from('minutes').select('*').eq('meeting_id', params.id).single(),
    supabase.from('meeting_participants').select('*').eq('meeting_id', params.id),
    supabase.from('meeting_participants').select('email_override').eq('meeting_id', params.id).eq('user_id', meeting.created_by).single(),
    supabase.from('users').select('email').eq('id', meeting.created_by).single(),
  ]);

  const allItems = actionItemsResult.data || [];
  const minute = minuteResult.data;
  const participantsRaw = participantsResult.data;
  const creatorEmail = creatorResult.data?.email_override || creatorUserResult.data?.email;

  const participants = (participantsRaw || []).map((p: any) => ({
    name: p.name || p.email_override?.split('@')[0] || 'Participante',
    email: p.email_override || '',
  })).filter((p) => p.email);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://zrnote.vercel.app';
  const minuteHtml = buildMinuteHtml(minute);
  const allItemsHtml = buildActionItemsHtml(allItems);

  const emailQueue: Array<{ to: string; subject: string; html: string; label: string; attachments?: Array<{ filename: string; content: Buffer; contentType: string }> }> = [];

  for (const p of participants) {
    if (creatorEmail && p.email.toLowerCase() === creatorEmail.toLowerCase()) continue;

    const myItems = matchItemsToParticipant(allItems, p.name, p.email);
    const otherItems = allItems.filter((i) => !myItems.includes(i));

    const myItemsHtml = buildMyItemsHtml(myItems);
    const otherItemsHtml = buildOtherItemsHtml(otherItems);

    const calendarEvents: CalendarEvent[] = myItems
      .filter((i) => i.due_date)
      .map((i) => ({
        uid: `${i.id}@zrnote`,
        summary: i.description,
        description: `Prioridad: ${i.priority}\\nReunión: ${meeting.title}\\nResponsable: ${p.name}`,
        dueDate: i.due_date,
        priority: i.priority,
        assigneeName: p.name,
      }));

    const icsContent = generateICS(calendarEvents);
    const attachments = icsContent
      ? [{ filename: 'compromisos.ics', content: icsToBuffer(icsContent), contentType: 'text/calendar; charset=utf-8' }]
      : undefined;

    const calendarNote = calendarEvents.length > 0
      ? `<p style="background:#eff6ff;border-left:3px solid #3b82f6;padding:10px 14px;margin:12px 0;border-radius:0 8px 8px 0;font-size:13px;color:#1e40af">📅 Se adjuntó un archivo de calendario con ${calendarEvents.length} compromiso(s). Ábrelo para agregarlo a tu calendario.</p>`
      : '';

    emailQueue.push({
      to: p.email,
      subject: `[ZRNote] ${meeting.title} — Minuta y compromisos`,
      html: `<p>Hola ${p.name},</p><p>Reunión <b>${meeting.title}</b> procesada. Aquí tienes la minuta completa y tus compromisos.</p>${calendarNote}${myItemsHtml}${otherItemsHtml}<hr style="margin:24px 0;border:none;border-top:1px solid #eee"/><h2 style="color:#1a1a2e;font-size:20px;margin-bottom:12px">Minuta Completa</h2>${minuteHtml}<hr style="margin:24px 0;border:none;border-top:1px solid #eee"/><p style="text-align:center"><a href="${appUrl}/dashboard/meetings/${params.id}" style="background:#2563eb;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:500">Ver en ZRNote</a></p>`,
      label: p.email,
      attachments,
    });
  }

  const creatorItems = matchItemsToParticipant(allItems, '', creatorEmail || '');
  const creatorCalendarEvents: CalendarEvent[] = allItems
    .filter((i) => i.due_date)
    .map((i) => ({
      uid: `${i.id}@zrnote`,
      summary: i.description,
      description: `Prioridad: ${i.priority}\\nReunión: ${meeting.title}\\nResponsable: ${i.assignee_name || 'Sin asignar'}`,
      dueDate: i.due_date,
      priority: i.priority,
      assigneeName: i.assignee_name || '',
    }));

  const creatorIcs = generateICS(creatorCalendarEvents);
  const creatorAttachments = creatorIcs
    ? [{ filename: 'compromisos_todos.ics', content: icsToBuffer(creatorIcs), contentType: 'text/calendar; charset=utf-8' }]
    : undefined;

  if (creatorEmail) {
    emailQueue.push({
      to: creatorEmail,
      subject: `[ZRNote] ${meeting.title} — Minuta completa + todas las tareas`,
      html: `<p>Reunión <b>${meeting.title}</b> procesada. Aquí tienes la minuta completa con todas las tareas asignadas.</p>${creatorCalendarEvents.length > 0 ? `<p style="background:#eff6ff;border-left:3px solid #3b82f6;padding:10px 14px;margin:12px 0;border-radius:0 8px 8px 0;font-size:13px;color:#1e40af">📅 Se adjuntó un archivo de calendario con ${creatorCalendarEvents.length} compromiso(s).</p>` : ''}${allItemsHtml}<hr style="margin:24px 0;border:none;border-top:1px solid #eee"/><h2 style="color:#1a1a2e;font-size:20px;margin-bottom:12px">Minuta Completa</h2>${minuteHtml}<hr style="margin:24px 0;border:none;border-top:1px solid #eee"/><p style="text-align:center"><a href="${appUrl}/dashboard/meetings/${params.id}" style="background:#2563eb;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:500">Ver en ZRNote</a></p>`,
      label: `coordinator (${creatorEmail})`,
      attachments: creatorAttachments,
    });
  }

  const results: Array<{ email: string; ok: boolean; error?: string }> = [];

  for (const job of emailQueue) {
    const result = await sendWithRetry(() =>
      sendMail({ to: job.to, subject: job.subject, html: job.html, attachments: job.attachments })
    );
    results.push({ email: job.label, ...result });
    if (emailQueue.indexOf(job) < emailQueue.length - 1) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  await supabase.from('email_logs').insert(
    results.map((r) => ({
      meeting_id: params.id,
      recipient_email: r.email,
      type: r.email.includes('coordinator') ? 'coordinator_summary' : 'personal',
      status: r.ok ? 'sent' : 'failed',
    }))
  );

  return NextResponse.json({ ok: true, results: results.map((r) => `${r.email}: ${r.ok ? 'enviado' : `error: ${r.error}`}`) });
}
