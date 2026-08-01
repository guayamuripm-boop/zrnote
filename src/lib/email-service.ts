import { escapeHtml, escapeHtmlOrEmpty } from '@/lib/safe-html';
import { generateGoogleCalendarUrl } from '@/lib/google-calendar';

const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://zrnote.vercel.app';

/**
 * "Add to Google Calendar" link for a commitment. No OAuth: it opens Google
 * Calendar's own compose screen, prefilled, in whatever account the reader is
 * signed into.
 *
 * EVERY commitment gets a link, including the ones with no agreed deadline.
 * Those used to return an empty string, so the majority of tasks arrived with
 * no way to act on them — and now that the minute prompt refuses to invent
 * deadlines, that was most of them. When there is no date we propose tomorrow
 * 9:00 and label the link so it is obvious the reader is the one choosing:
 * Google's screen opens with the date editable before saving.
 */
function actionItemCalendarLink(item: any): string {
  const hasDate = typeof item?.due_date === 'string' && !Number.isNaN(new Date(`${item.due_date}T09:00:00`).getTime());

  const start = hasDate ? new Date(`${item.due_date}T09:00:00`) : nextMorning();
  const end = new Date(start.getTime() + 30 * 60 * 1000);

  const url = generateGoogleCalendarUrl({
    title: item?.description || 'Compromiso (ZRNote)',
    description:
      `Compromiso acordado en una reunión — ZRNote.\n` +
      `Prioridad: ${item?.priority || 'media'}\n` +
      (hasDate ? '' : 'Sin fecha acordada en la reunión: ajusta el día antes de guardar.\n') +
      `${appUrl}/dashboard/action-items`,
    startTime: start,
    endTime: end,
  });

  const label = hasDate ? '📅 Añadir a Calendar' : '📅 Ponerle fecha';
  return ` <a href="${url}" style="color:#2563eb;text-decoration:none;font-size:12px;white-space:nowrap">${label}</a>`;
}

/** Tomorrow at 09:00 local — a sane, clearly-provisional default. */
function nextMorning(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
}

/**
 * Construye el HTML de una minuta con TODOS los campos LLM-derived escapados.
 * Esto previene XSS cuando una transcripción contiene <script>, <img onerror>, etc.
 */
export function buildMinuteHtml(minute: any): string {
  if (!minute) return '<p>Minuta no disponible.</p>';
  let html = '';
  html += `<h2 style="color:#1a1a2e;font-size:18px;margin-bottom:8px">Resumen</h2><p style="color:#333;line-height:1.6">${escapeHtml(minute.summary) || 'No disponible'}</p>`;

  if (Array.isArray(minute.discussion) && minute.discussion.length > 0) {
    html += `<h2 style="color:#1a1a2e;font-size:18px;margin-top:24px;margin-bottom:8px">Temas Discutidos</h2>`;
    for (const d of minute.discussion) {
      html += `<div style="border-left:3px solid #3b82f6;padding-left:12px;margin-bottom:16px">`;
      html += `<h3 style="margin:0;font-weight:600">${escapeHtml(d.topic)}</h3>`;
      if (d.speaker) html += `<p style="margin:2px 0;font-size:12px;color:#999">Liderado por: ${escapeHtml(d.speaker)}</p>`;
      html += `<p style="margin:4px 0;color:#555;font-size:14px;line-height:1.5">${escapeHtml(d.details)}</p>`;
      html += `</div>`;
    }
  }

  if (Array.isArray(minute.decisions) && minute.decisions.length > 0) {
    html += `<h2 style="color:#1a1a2e;font-size:18px;margin-top:24px;margin-bottom:8px">Decisiones</h2><ul style="color:#333;line-height:1.6">`;
    for (const d of minute.decisions) {
      // d puede ser string o { decision, context }
      const text = typeof d === 'string' ? d : `${d.decision ?? ''}${d.context ? ` (${d.context})` : ''}`;
      html += `<li>${escapeHtml(text)}</li>`;
    }
    html += `</ul>`;
  }

  if (Array.isArray(minute.project_statuses) && minute.project_statuses.length > 0) {
    html += `<h2 style="color:#1a1a2e;font-size:18px;margin-top:24px;margin-bottom:8px">Estados de Proyectos</h2>`;
    for (const p of minute.project_statuses) {
      html += `<div style="background:#f3f4f6;border-radius:8px;padding:12px;margin-bottom:8px">`;
      html += `<strong>${escapeHtml(p.project)}</strong> <span style="background:#dbeafe;color:#1d4ed8;padding:2px 8px;border-radius:4px;font-size:12px">${escapeHtml(p.status)}</span>`;
      html += `<p style="margin:4px 0 0;color:#555;font-size:14px">${escapeHtml(p.details)}</p></div>`;
    }
  }

  if (Array.isArray(minute.blockers) && minute.blockers.length > 0) {
    html += `<h2 style="color:#1a1a2e;font-size:18px;margin-top:24px;margin-bottom:8px">Bloqueos / Problemas</h2>`;
    for (const b of minute.blockers) {
      html += `<div style="background:#fef2f2;border-radius:8px;padding:12px;margin-bottom:8px">`;
      html += `<strong style="color:#991b1b">${escapeHtml(b.issue)}</strong>`;
      html += `<p style="margin:4px 0;color:#dc2626;font-size:14px">Impacto: ${escapeHtml(b.impact)}</p>`;
      if (b.owner) html += `<p style="margin:0;font-size:12px;color:#999">Responsable: ${escapeHtml(b.owner)}</p>`;
      html += `</div>`;
    }
  }

  if (Array.isArray(minute.ideas) && minute.ideas.length > 0) {
    html += `<h2 style="color:#1a1a2e;font-size:18px;margin-top:24px;margin-bottom:8px">Ideas / Brainstorming</h2><ul style="color:#333;line-height:1.6">`;
    for (const idea of minute.ideas) html += `<li>${escapeHtml(idea)}</li>`;
    html += `</ul>`;
  }

  if (Array.isArray(minute.next_steps) && minute.next_steps.length > 0) {
    html += `<h2 style="color:#1a1a2e;font-size:18px;margin-top:24px;margin-bottom:8px">Próximos Pasos</h2><ul style="color:#333;line-height:1.6">`;
    for (const n of minute.next_steps) {
      const text = typeof n === 'string' ? n : `${n.step ?? ''}${n.owner ? ` — ${n.owner}` : ''}`;
      html += `<li>${escapeHtml(text)}</li>`;
    }
    html += `</ul>`;
  }

  return html;
}

export function buildActionItemsHtml(items: any[]): string {
  if (!items || items.length === 0) {
    return '<p style="color:#666">No se identificaron compromisos concretos en esta reunión.</p>';
  }

  const rows = items.map((i) => {
    const assignee = escapeHtmlOrEmpty(i.assignee_name) || '<span style="color:#b45309">Sin asignar</span>';
    const description = escapeHtmlOrEmpty(i.description);
    const priority = escapeHtmlOrEmpty(i.priority) || 'media';
    // "Por definir" instead of an em dash: a missing deadline is an open
    // decision someone has to make, not a blank cell.
    const dueDate = i.due_date
      ? escapeHtml(i.due_date)
      : '<span style="color:#b45309">Por definir</span>';
    return `<tr>
      <td>${assignee}</td>
      <td>${description}</td>
      <td>${priority}</td>
      <td>${dueDate}</td>
      <td style="white-space:nowrap">${actionItemCalendarLink(i)}</td>
    </tr>`;
  }).join('');

  return `<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:14px">
    <thead><tr style="background:#f3f4f6"><th>Responsable</th><th>Tarea</th><th>Prioridad</th><th>Fecha</th><th></th></tr></thead>
    <tbody>${rows}</tbody></table>`;
}

/**
 * Identifica los action items que pertenecen a un participante concreto.
 * Usa match exacto por email > match por nombre > match parcial.
 */
export function matchItemsToParticipant(items: any[], participantName: string, participantEmail: string): any[] {
  if (!items || !participantName) return [];
  const nameLower = participantName.toLowerCase().trim();
  const emailLocal = (participantEmail || '').split('@')[0].toLowerCase().trim();
  return items.filter((item: any) => {
    if (item.assignee_email && item.assignee_email.toLowerCase() === (participantEmail || '').toLowerCase()) return true;
    if (!item.assignee_name) return false;
    const itemName = item.assignee_name.toLowerCase().trim();
    if (itemName === nameLower) return true;
    if (itemName.includes(nameLower) || nameLower.includes(itemName)) return true;
    if (emailLocal && (itemName.includes(emailLocal) || emailLocal.includes(itemName))) return true;
    return false;
  });
}

/**
 * Helper de retry con backoff exponencial simple.
 * Devuelve el primer resultado exitoso o el último error tras `maxAttempts`.
 */
export async function sendWithRetry(
  emailFn: () => Promise<{ ok: boolean; error?: string }>,
  maxAttempts = 3,
): Promise<{ ok: boolean; error?: string }> {
  let lastResult: { ok: boolean; error?: string } = { ok: false, error: 'No attempts' };
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    lastResult = await emailFn();
    if (lastResult.ok) return lastResult;
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  return lastResult;
}

export function buildMyItemsHtml(myItems: any[]): string {
  if (!Array.isArray(myItems) || myItems.length === 0) return '';

  const items = myItems.map((i: any) => {
    const desc = escapeHtml(i.description || '');
    const priority = escapeHtml(i.priority || 'media');
    const date = i.due_date
      ? `Fecha: ${escapeHtml(i.due_date)}`
      : '<span style="color:#b45309;font-weight:600">Fecha por definir</span>';
    return `<li style="margin-bottom:10px">
      <strong>${desc}</strong><br/>
      <span style="font-size:12px;color:#555">Prioridad: ${priority} · ${date}</span>
      ${actionItemCalendarLink(i)}
    </li>`;
  }).join('');

  const sinFecha = myItems.filter((i: any) => !i.due_date).length;
  const nota = sinFecha > 0
    ? `<p style="margin:8px 0 0;font-size:12px;color:#166534">
        ${sinFecha === 1 ? 'Un compromiso no tiene' : `${sinFecha} compromisos no tienen`} fecha acordada.
        Pulsa «Ponerle fecha» y elige el día en tu calendario.
      </p>`
    : '';

  return `<div style="background:#ecfdf5;border-left:3px solid #22c55e;padding:14px;margin:16px 0;border-radius:0 8px 8px 0">
    <h3 style="margin:0 0 10px;color:#166534;font-size:16px">Tus compromisos</h3>
    <ul style="margin:0;padding-left:20px;color:#333">${items}</ul>${nota}</div>`;
}

export function buildOtherItemsHtml(otherItems: any[]): string {
  if (!Array.isArray(otherItems) || otherItems.length === 0) return '';
  const items = otherItems.map((i: any) => {
    const assignee = escapeHtml(i.assignee_name || 'Sin asignar');
    const desc = escapeHtml(i.description || '');
    return `<li>${assignee}: ${desc}</li>`;
  }).join('');
  return `<div style="margin-top:16px">
    <h4 style="color:#666;font-size:13px;margin-bottom:4px">Otros compromisos de la reunión:</h4>
    <ul style="padding-left:20px;color:#666;font-size:13px">${items}</ul></div>`;
}

export { appUrl };
