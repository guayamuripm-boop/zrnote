import { createServerSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { sendMail } from '@/lib/smtp';

function buildMinuteHtml(minute: any): string {
  if (!minute) return '<p>Minuta no disponible.</p>';

  let html = '';

  html += `<h2 style="color:#1a1a2e;font-size:18px;margin-bottom:8px">Resumen</h2><p style="color:#333;line-height:1.6">${minute.summary || 'No disponible'}</p>`;

  if (minute.discussion && minute.discussion.length > 0) {
    html += `<h2 style="color:#1a1a2e;font-size:18px;margin-top:24px;margin-bottom:8px">Temas Discutidos</h2>`;
    for (const d of minute.discussion) {
      html += `<div style="border-left:3px solid #3b82f6;padding-left:12px;margin-bottom:16px">`;
      html += `<h3 style="margin:0;font-weight:600">${d.topic}</h3>`;
      if (d.speaker) html += `<p style="margin:2px 0;font-size:12px;color:#999">Liderado por: ${d.speaker}</p>`;
      html += `<p style="margin:4px 0;color:#555;font-size:14px;line-height:1.5">${d.details}</p>`;
      html += `</div>`;
    }
  }

  if (minute.decisions && minute.decisions.length > 0) {
    html += `<h2 style="color:#1a1a2e;font-size:18px;margin-top:24px;margin-bottom:8px">Decisiones</h2><ul style="color:#333;line-height:1.6">`;
    for (const d of minute.decisions) {
      html += `<li>${d}</li>`;
    }
    html += `</ul>`;
  }

  if (minute.project_statuses && minute.project_statuses.length > 0) {
    html += `<h2 style="color:#1a1a2e;font-size:18px;margin-top:24px;margin-bottom:8px">Estados de Proyectos</h2>`;
    for (const p of minute.project_statuses) {
      html += `<div style="background:#f3f4f6;border-radius:8px;padding:12px;margin-bottom:8px">`;
      html += `<strong>${p.project}</strong> <span style="background:#dbeafe;color:#1d4ed8;padding:2px 8px;border-radius:4px;font-size:12px">${p.status}</span>`;
      html += `<p style="margin:4px 0 0;color:#555;font-size:14px">${p.details}</p></div>`;
    }
  }

  if (minute.blockers && minute.blockers.length > 0) {
    html += `<h2 style="color:#1a1a2e;font-size:18px;margin-top:24px;margin-bottom:8px">Bloqueos / Problemas</h2>`;
    for (const b of minute.blockers) {
      html += `<div style="background:#fef2f2;border-radius:8px;padding:12px;margin-bottom:8px">`;
      html += `<strong style="color:#991b1b">${b.issue}</strong>`;
      html += `<p style="margin:4px 0;color:#dc2626;font-size:14px">Impacto: ${b.impact}</p>`;
      if (b.owner) html += `<p style="margin:0;font-size:12px;color:#999">Responsable: ${b.owner}</p>`;
      html += `</div>`;
    }
  }

  if (minute.ideas && minute.ideas.length > 0) {
    html += `<h2 style="color:#1a1a2e;font-size:18px;margin-top:24px;margin-bottom:8px">Ideas / Brainstorming</h2><ul style="color:#333;line-height:1.6">`;
    for (const idea of minute.ideas) {
      html += `<li>${idea}</li>`;
    }
    html += `</ul>`;
  }

  if (minute.next_steps && minute.next_steps.length > 0) {
    html += `<h2 style="color:#1a1a2e;font-size:18px;margin-top:24px;margin-bottom:8px">Próximos Pasos</h2><ul style="color:#333;line-height:1.6">`;
    for (const n of minute.next_steps) {
      html += `<li>${n}</li>`;
    }
    html += `</ul>`;
  }

  return html;
}

function buildActionItemsHtml(items: any[]): string {
  if (!items || items.length === 0) return '<p>No se generaron action items.</p>';

  return `<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:14px">
    <thead><tr style="background:#f3f4f6"><th>Responsable</th><th>Tarea</th><th>Prioridad</th><th>Fecha</th></tr></thead>
    <tbody>${
      items.map((i) => `<tr><td>${i.assignee_name || 'Sin asignar'}</td><td>${i.description}</td><td>${i.priority}</td><td>${i.due_date || '—'}</td></tr>`).join('')
    }</tbody></table>`;
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const authHeader = request.headers.get('authorization') || '';
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
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

  const [actionItemsResult, minuteResult, participantsResult, creatorResult] = await Promise.all([
    supabase.from('action_items').select('*').eq('meeting_id', params.id),
    supabase.from('minutes').select('*').eq('meeting_id', params.id).single(),
    supabase.from('meeting_participants').select('*').eq('meeting_id', params.id),
    supabase.from('meeting_participants').select('email_override').eq('meeting_id', params.id).eq('user_id', meeting.created_by).single(),
  ]);

  const allItems = actionItemsResult.data || [];
  const minute = minuteResult.data;
  const participantsRaw = participantsResult.data;
  const creatorEmail = creatorResult.data?.email_override;

  const participants = (participantsRaw || []).map((p: any) => ({
    name: p.name || p.email_override?.split('@')[0] || 'Participante',
    email: p.email_override || '',
  })).filter((p) => p.email);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://zrnote.vercel.app';
  const minuteHtml = buildMinuteHtml(minute);
  const allItemsHtml = buildActionItemsHtml(allItems);

  const emailPromises = participants
    .filter((p) => p.email && (!creatorEmail || p.email.toLowerCase() !== creatorEmail.toLowerCase()))
    .map((p) => {
      const myItems = allItems.filter((i) => i.assignee_email && i.assignee_email.toLowerCase() === p.email.toLowerCase());
      const otherItems = allItems.filter((i) => !i.assignee_email || i.assignee_email.toLowerCase() !== p.email.toLowerCase());

      let myItemsHtml = '';
      if (myItems.length > 0) {
        myItemsHtml = `<div style="background:#ecfdf5;border-left:3px solid #22c55e;padding:12px;margin:16px 0;border-radius:0 8px 8px 0">
          <h3 style="margin:0 0 8px;color:#166534;font-size:16px">Tus compromisos</h3>
          <ul style="margin:0;padding-left:20px;color:#333">${
            myItems.map((i) => `<li style="margin-bottom:4px"><strong>${i.description}</strong> — Prioridad: ${i.priority}${i.due_date ? `, Fecha: ${i.due_date}` : ''}</li>`).join('')
          }</ul></div>`;
      }

      let otherItemsHtml = '';
      if (otherItems.length > 0) {
        otherItemsHtml = `<div style="margin-top:16px">
          <h4 style="color:#666;font-size:13px;margin-bottom:4px">Otros compromisos de la reunión:</h4>
          <ul style="padding-left:20px;color:#666;font-size:13px">${
            otherItems.map((i) => `<li>${i.assignee_name || 'Sin asignar'}: ${i.description}</li>`).join('')
          }</ul></div>`;
      }

      return sendMail({
        to: p.email,
        subject: `[ZRNote] ${meeting.title} — Minuta y compromisos`,
        html: `<p>Hola ${p.name},</p><p>Reunión <b>${meeting.title}</b> procesada. Aquí tienes la minuta completa y tus compromisos.</p>${myItemsHtml}${otherItemsHtml}<hr style="margin:24px 0;border:none;border-top:1px solid #eee"/><h2 style="color:#1a1a2e;font-size:20px;margin-bottom:12px">Minuta Completa</h2>${minuteHtml}<hr style="margin:24px 0;border:none;border-top:1px solid #eee"/><p style="text-align:center"><a href="${appUrl}/dashboard/meetings/${params.id}" style="background:#2563eb;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:500">Ver en ZRNote</a></p>`,
      }).then((result) => ({
        email: p.email,
        ...result,
      }));
    });

  const creatorEmailPromise = creatorEmail
    ? sendMail({
        to: creatorEmail,
        subject: `[ZRNote] ${meeting.title} — Minuta completa + todas las tareas`,
        html: `<p>Reunión <b>${meeting.title}</b> procesada. Aquí tienes la minuta completa con todas las tareas asignadas.</p>${allItemsHtml}<hr style="margin:24px 0;border:none;border-top:1px solid #eee"/><h2 style="color:#1a1a2e;font-size:20px;margin-bottom:12px">Minuta Completa</h2>${minuteHtml}<hr style="margin:24px 0;border:none;border-top:1px solid #eee"/><p style="text-align:center"><a href="${appUrl}/dashboard/meetings/${params.id}" style="background:#2563eb;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:500">Ver en ZRNote</a></p>`,
      }).then((result) => ({
        email: `coordinator (${creatorEmail})`,
        ...result,
      }))
    : null;

  const allPromises = creatorEmailPromise
    ? [...emailPromises, creatorEmailPromise]
    : emailPromises;

  const results = await Promise.allSettled(allPromises);
  const resultMessages = results.map((r) => {
    if (r.status === 'fulfilled') {
      return `${r.value.email}: ${r.value.ok ? 'enviado' : `error: ${r.value.error}`}`;
    }
    return `error: ${r.reason}`;
  });

  return NextResponse.json({ ok: true, results: resultMessages });
}
