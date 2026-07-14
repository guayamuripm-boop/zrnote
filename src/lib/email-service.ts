const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://zrnote.vercel.app';

export function buildMinuteHtml(minute: any): string {
  if (!minute) return '<p>Minuta no disponible.</p>';
  let html = '';
  html += `<h2 style="color:#1a1a2e;font-size:18px;margin-bottom:8px">Resumen</h2><p style="color:#333;line-height:1.6">${minute.summary || 'No disponible'}</p>`;
  if (minute.discussion?.length > 0) {
    html += `<h2 style="color:#1a1a2e;font-size:18px;margin-top:24px;margin-bottom:8px">Temas Discutidos</h2>`;
    for (const d of minute.discussion) {
      html += `<div style="border-left:3px solid #3b82f6;padding-left:12px;margin-bottom:16px">`;
      html += `<h3 style="margin:0;font-weight:600">${d.topic}</h3>`;
      if (d.speaker) html += `<p style="margin:2px 0;font-size:12px;color:#999">Liderado por: ${d.speaker}</p>`;
      html += `<p style="margin:4px 0;color:#555;font-size:14px;line-height:1.5">${d.details}</p>`;
      html += `</div>`;
    }
  }
  if (minute.decisions?.length > 0) {
    html += `<h2 style="color:#1a1a2e;font-size:18px;margin-top:24px;margin-bottom:8px">Decisiones</h2><ul style="color:#333;line-height:1.6">`;
    for (const d of minute.decisions) html += `<li>${d}</li>`;
    html += `</ul>`;
  }
  if (minute.project_statuses?.length > 0) {
    html += `<h2 style="color:#1a1a2e;font-size:18px;margin-top:24px;margin-bottom:8px">Estados de Proyectos</h2>`;
    for (const p of minute.project_statuses) {
      html += `<div style="background:#f3f4f6;border-radius:8px;padding:12px;margin-bottom:8px">`;
      html += `<strong>${p.project}</strong> <span style="background:#dbeafe;color:#1d4ed8;padding:2px 8px;border-radius:4px;font-size:12px">${p.status}</span>`;
      html += `<p style="margin:4px 0 0;color:#555;font-size:14px">${p.details}</p></div>`;
    }
  }
  if (minute.blockers?.length > 0) {
    html += `<h2 style="color:#1a1a2e;font-size:18px;margin-top:24px;margin-bottom:8px">Bloqueos / Problemas</h2>`;
    for (const b of minute.blockers) {
      html += `<div style="background:#fef2f2;border-radius:8px;padding:12px;margin-bottom:8px">`;
      html += `<strong style="color:#991b1b">${b.issue}</strong>`;
      html += `<p style="margin:4px 0;color:#dc2626;font-size:14px">Impacto: ${b.impact}</p>`;
      if (b.owner) html += `<p style="margin:0;font-size:12px;color:#999">Responsable: ${b.owner}</p>`;
      html += `</div>`;
    }
  }
  if (minute.ideas?.length > 0) {
    html += `<h2 style="color:#1a1a2e;font-size:18px;margin-top:24px;margin-bottom:8px">Ideas / Brainstorming</h2><ul style="color:#333;line-height:1.6">`;
    for (const idea of minute.ideas) html += `<li>${idea}</li>`;
    html += `</ul>`;
  }
  if (minute.next_steps?.length > 0) {
    html += `<h2 style="color:#1a1a2e;font-size:18px;margin-top:24px;margin-bottom:8px">Próximos Pasos</h2><ul style="color:#333;line-height:1.6">`;
    for (const n of minute.next_steps) html += `<li>${n}</li>`;
    html += `</ul>`;
  }
  return html;
}

export function buildActionItemsHtml(items: any[]): string {
  if (!items || items.length === 0) return '<p>No se generaron action items.</p>';
  return `<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:14px">
    <thead><tr style="background:#f3f4f6"><th>Responsable</th><th>Tarea</th><th>Prioridad</th><th>Fecha</th></tr></thead>
    <tbody>${items.map((i) => `<tr><td>${i.assignee_name || 'Sin asignar'}</td><td>${i.description}</td><td>${i.priority}</td><td>${i.due_date || '—'}</td></tr>`).join('')}</tbody></table>`;
}

export function matchItemsToParticipant(items: any[], participantName: string, participantEmail: string): any[] {
  if (!items || !participantName) return [];
  const nameLower = participantName.toLowerCase().trim();
  const emailLocal = participantEmail.split('@')[0].toLowerCase().trim();
  return items.filter((item: any) => {
    if (item.assignee_email && item.assignee_email.toLowerCase() === participantEmail.toLowerCase()) return true;
    if (!item.assignee_name) return false;
    const itemName = item.assignee_name.toLowerCase().trim();
    if (itemName === nameLower) return true;
    if (itemName.includes(nameLower) || nameLower.includes(itemName)) return true;
    if (itemName.includes(emailLocal) || emailLocal.includes(itemName)) return true;
    return false;
  });
}

export async function sendWithRetry(
  emailFn: () => Promise<{ ok: boolean; error?: string }>,
  maxAttempts = 3,
): Promise<{ ok: boolean; error?: string }> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await emailFn();
    if (result.ok) return result;
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  return { ok: false, error: 'Max retries exceeded' };
}

export function buildMyItemsHtml(myItems: any[]): string {
  if (!myItems?.length) return '';
  return `<div style="background:#ecfdf5;border-left:3px solid #22c55e;padding:12px;margin:16px 0;border-radius:0 8px 8px 0">
    <h3 style="margin:0 0 8px;color:#166534;font-size:16px">Tus compromisos</h3>
    <ul style="margin:0;padding-left:20px;color:#333">${myItems.map((i: any) => `<li style="margin-bottom:4px"><strong>${i.description}</strong> — Prioridad: ${i.priority}${i.due_date ? `, Fecha: ${i.due_date}` : ''}</li>`).join('')}</ul></div>`;
}

export function buildOtherItemsHtml(otherItems: any[]): string {
  if (!otherItems?.length) return '';
  return `<div style="margin-top:16px">
    <h4 style="color:#666;font-size:13px;margin-bottom:4px">Otros compromisos de la reunión:</h4>
    <ul style="padding-left:20px;color:#666;font-size:13px">${otherItems.map((i: any) => `<li>${i.assignee_name || 'Sin asignar'}: ${i.description}</li>`).join('')}</ul></div>`;
}

export { appUrl };
