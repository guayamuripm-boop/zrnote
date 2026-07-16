import { escapeHtml, escapeHtmlOrEmpty } from '@/lib/safe-html';

const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://zrnote.vercel.app';

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
  if (!items || items.length === 0) return '<p>No se generaron action items.</p>';
  const rows = items.map((i) => {
    const assignee = escapeHtmlOrEmpty(i.assignee_name) || 'Sin asignar';
    const description = escapeHtmlOrEmpty(i.description);
    const priority = escapeHtmlOrEmpty(i.priority);
    const dueDate = i.due_date ? escapeHtml(i.due_date) : '—';
    return `<tr><td>${assignee}</td><td>${description}</td><td>${priority}</td><td>${dueDate}</td></tr>`;
  }).join('');
  return `<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:14px">
    <thead><tr style="background:#f3f4f6"><th>Responsable</th><th>Tarea</th><th>Prioridad</th><th>Fecha</th></tr></thead>
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
    const priority = escapeHtml(i.priority || '');
    const dueDateSuffix = i.due_date ? `, Fecha: ${escapeHtml(i.due_date)}` : '';
    return `<li style="margin-bottom:4px"><strong>${desc}</strong> — Prioridad: ${priority}${dueDateSuffix}</li>`;
  }).join('');
  return `<div style="background:#ecfdf5;border-left:3px solid #22c55e;padding:12px;margin:16px 0;border-radius:0 8px 8px 0">
    <h3 style="margin:0 0 8px;color:#166534;font-size:16px">Tus compromisos</h3>
    <ul style="margin:0;padding-left:20px;color:#333">${items}</ul></div>`;
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
