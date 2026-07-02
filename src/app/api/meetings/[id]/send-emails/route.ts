import { createServerSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { sendMail } from '@/lib/smtp';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return NextResponse.json({ error: 'Gmail SMTP not configured on server' }, { status: 500 });
  }

  const { data: meeting } = await supabase
    .from('meetings')
    .select('*')
    .eq('id', params.id)
    .single();

  if (!meeting) {
    return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
  }

  if (meeting.created_by !== user.id) {
    return NextResponse.json({ error: 'Solo el creador puede enviar correos' }, { status: 403 });
  }

  const { data: actionItems } = await supabase
    .from('action_items')
    .select('*')
    .eq('meeting_id', params.id);

  const { data: minute } = await supabase
    .from('minutes')
    .select('summary')
    .eq('meeting_id', params.id)
    .single();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://project-bcydk.vercel.app';
  const allItems = actionItems || [];

  const grouped = new Map<string, typeof allItems>();
  for (const item of allItems) {
    if (item.assignee_email) {
      const existing = grouped.get(item.assignee_email) || [];
      existing.push(item);
      grouped.set(item.assignee_email, existing);
    }
  }

  const results: string[] = [];

  for (const [email, items] of grouped) {
    const name = items[0]?.assignee_name || email.split('@')[0];

    const { ok, error } = await sendMail({
      to: email,
      subject: `[ZRNote] ${meeting.title} — Tus compromisos`,
      html: `<p>Hola ${name},</p><p>Tus action items en <b>${meeting.title}</b>:</p><ul>${
        items.map((i) => `<li><b>${i.description}</b> — Prioridad: ${i.priority}${i.due_date ? `, Fecha: ${i.due_date}` : ''}</li>`).join('')
      }</ul><p><a href="${appUrl}/dashboard/meetings/${params.id}">Ver minuta completa</a></p>`,
    });

    results.push(`${email}: ${ok ? 'enviado' : `error: ${error}`}`);
  }

  const { data: creatorParticipant } = await supabase
    .from('meeting_participants')
    .select('email_override')
    .eq('meeting_id', params.id)
    .eq('user_id', meeting.created_by)
    .single();

  if (creatorParticipant?.email_override) {
    const itemsHtml = allItems.length > 0
      ? `<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%"><thead><tr><th>Responsable</th><th>Tarea</th><th>Prioridad</th><th>Fecha</th></tr></thead><tbody>${
          allItems.map((i) => `<tr><td>${i.assignee_name || 'Sin asignar'}</td><td>${i.description}</td><td>${i.priority}</td><td>${i.due_date || '—'}</td></tr>`).join('')
        }</tbody></table>`
      : '<p>No se generaron action items.</p>';

    const { ok, error } = await sendMail({
      to: creatorParticipant.email_override,
      subject: `[ZRNote] ${meeting.title} — Resumen completo`,
      html: `<p>Reunión <b>${meeting.title}</b> procesada.</p><p><b>Resumen:</b> ${minute?.summary || 'No disponible'}</p>${itemsHtml}<p><a href="${appUrl}/dashboard/meetings/${params.id}">Ver minuta completa</a></p>`,
    });

    results.push(`coordinator (${creatorParticipant.email_override}): ${ok ? 'enviado' : `error: ${error}`}`);
  }

  return NextResponse.json({ ok: true, results });
}
