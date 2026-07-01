import { createServerSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    return NextResponse.json({ error: 'RESEND_API_KEY not configured on server' }, { status: 500 });
  }

  const { data: meeting } = await supabase
    .from('meetings')
    .select('*')
    .eq('id', params.id)
    .single();

  if (!meeting) {
    return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
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

  // Group action items by assignee_email
  const grouped = new Map<string, typeof allItems>();
  for (const item of allItems) {
    if (item.assignee_email) {
      const existing = grouped.get(item.assignee_email) || [];
      existing.push(item);
      grouped.set(item.assignee_email, existing);
    }
  }

  const results: string[] = [];

  // Send personal email to each assignee
  for (const [email, items] of grouped) {
    const name = items[0]?.assignee_name || email.split('@')[0];

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'ZRNote <noreply@resend.dev>',
          to: email,
          subject: `[ZRNote] ${meeting.title} — Tus compromisos`,
          html: `<p>Hola ${name},</p><p>Tus action items en <b>${meeting.title}</b>:</p><ul>${
            items.map((i) => `<li><b>${i.description}</b> — Prioridad: ${i.priority}${i.due_date ? `, Fecha: ${i.due_date}` : ''}</li>`).join('')
          }</ul><p><a href="${appUrl}/dashboard/meetings/${params.id}">Ver minuta completa</a></p>`,
        }),
      });

      const resText = await res.text();
      results.push(`${email}: ${res.ok ? 'enviado' : `error ${res.status}: ${resText}`}`);
    } catch (err: any) {
      results.push(`${email}: exception: ${err.message}`);
    }
  }

  // Send coordinator email with ALL items
  const { data: coordinator } = await supabase
    .from('users')
    .select('email')
    .eq('id', meeting.created_by)
    .single();

  if (coordinator?.email) {
    const itemsHtml = allItems.length > 0
      ? `<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%"><thead><tr><th>Responsable</th><th>Tarea</th><th>Prioridad</th><th>Fecha</th></tr></thead><tbody>${
          allItems.map((i) => `<tr><td>${i.assignee_name || 'Sin asignar'}</td><td>${i.description}</td><td>${i.priority}</td><td>${i.due_date || '—'}</td></tr>`).join('')
        }</tbody></table>`
      : '<p>No se generaron action items.</p>';

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'ZRNote <noreply@resend.dev>',
          to: coordinator.email,
          subject: `[ZRNote] ${meeting.title} — Resumen completo`,
          html: `<p>Reunión <b>${meeting.title}</b> procesada.</p><p><b>Resumen:</b> ${minute?.summary || 'No disponible'}</p>${itemsHtml}<p><a href="${appUrl}/dashboard/meetings/${params.id}">Ver minuta completa</a></p>`,
        }),
      });

      const resText = await res.text();
      results.push(`coordinator (${coordinator.email}): ${res.ok ? 'enviado' : `error ${res.status}: ${resText}`}`);
    } catch (err: any) {
      results.push(`coordinator: exception: ${err.message}`);
    }
  }

  return NextResponse.json({ ok: true, results });
}
