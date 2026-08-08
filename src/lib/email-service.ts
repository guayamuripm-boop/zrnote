import { escapeHtml, escapeHtmlOrEmpty } from '@/lib/safe-html';
import { generateGoogleCalendarUrl } from '@/lib/google-calendar';

import { appUrl } from '@/lib/app-url';
import { toParagraphs } from '@/lib/readable-text';

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
      `${appUrl()}/dashboard/action-items`,
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
  // El resumen en párrafos cortos, uno por <p>. En un cliente de correo móvil
  // un bloque de 5 frases se lee como un muro y se salta entero.
  const summaryParagraphs = toParagraphs(minute.summary);
  const summaryHtml =
    summaryParagraphs.length > 0
      ? summaryParagraphs
          .map((p) => `<p style="color:#333;line-height:1.6;margin:0 0 12px">${escapeHtml(p)}</p>`)
          .join('')
      : `<p style="color:#333;line-height:1.6">No disponible</p>`;
  html += `<h2 style="color:#1a1a2e;font-size:18px;margin-bottom:8px">Resumen</h2>${summaryHtml}`;

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
 * Partículas que no identifican a nadie: aparecen en medio de los apellidos
 * ("Juan de la Cruz", "Ana del Río") y no deben contar como coincidencia.
 */
const NAME_STOPWORDS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'da', 'do', 'van', 'von', 'di']);

/**
 * Minúsculas y sin tildes. Sin esto, "Ana Pérez" y "Ana Perez" eran dos personas
 * distintas — y en español eso es la mitad de los nombres.
 */
export function normalizeName(value: string): string {
  // NFD separa "é" en "e" + acento combinante; luego descartamos los acentos.
  // Se hace recorriendo los puntos de código en vez de con una expresión
  // regular a propósito: el rango U+0300–U+036F escrito como caracteres
  // literales en el fuente es invisible y se corrompe al copiar o al pasar por
  // herramientas de texto.
  const decomposed = (value || '').normalize('NFD');
  let out = '';
  for (const ch of decomposed) {
    const code = ch.codePointAt(0) ?? 0;
    const isCombiningMark = code >= 0x0300 && code <= 0x036f;
    if (!isCombiningMark) out += ch;
  }
  return out.toLowerCase().trim();
}

/** Palabras significativas de un nombre, ya normalizadas. */
function nameTokens(value: string): string[] {
  return normalizeName(value)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !NAME_STOPWORDS.has(t));
}

/**
 * Palabras que se pueden deducir de la parte local del correo.
 * `ana.perez@x.com` → ["ana", "perez"]. `anaperez@x.com` → ["anaperez"].
 * Se descartan las de menos de 3 letras: un buzón `jp@` o `rh@` no identifica
 * a nadie y antes hacía que todo coincidiera con todo.
 */
function emailTokens(email: string): string[] {
  const local = (email || '').split('@')[0];
  return normalizeName(local)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !NAME_STOPWORDS.has(t));
}

/**
 * ¿Son la misma persona? Coinciden si **todas** las palabras significativas del
 * nombre más corto están, como palabras completas, en el más largo.
 *
 *   "Ana Pérez" ~ "Ana"          → sí  (el LLM suele dar sólo el nombre de pila)
 *   "Ana Pérez" ~ "Ana Perez"    → sí  (tildes)
 *   "Ana"       ~ "Mariana Gómez"→ NO
 *
 * El código anterior usaba `includes()` sobre la cadena entera, así que
 * "mariana gomez".includes("ana") daba `true` y Ana recibía los compromisos de
 * Mariana bajo el título «Tus compromisos». Era una fuga de datos entre
 * personas, no sólo un fallo cosmético.
 */
function sameName(aTokens: string[], bTokens: string[]): boolean {
  if (aTokens.length === 0 || bTokens.length === 0) return false;
  const [shorter, longer] = aTokens.length <= bTokens.length ? [aTokens, bTokens] : [bTokens, aTokens];
  // Al menos una palabra de 3+ letras: dos iniciales sueltas no identifican a nadie.
  if (!shorter.some((t) => t.length >= 3)) return false;
  const longerSet = new Set(longer);
  return shorter.every((t) => longerSet.has(t));
}

/**
 * Identifica los action items que pertenecen a un participante concreto.
 * Prioridad: correo exacto > nombre por palabras completas > nombre deducido
 * de la parte local del correo.
 */
export function matchItemsToParticipant(items: any[], participantName: string, participantEmail: string): any[] {
  if (!items) return [];

  const email = (participantEmail || '').toLowerCase().trim();
  const pNameTokens = nameTokens(participantName);
  const pEmailTokens = emailTokens(participantEmail);
  if (pNameTokens.length === 0 && pEmailTokens.length === 0 && !email) return [];

  return items.filter((item: any) => {
    // 1. El correo del responsable es la única señal inequívoca.
    if (email && item.assignee_email && item.assignee_email.toLowerCase().trim() === email) return true;
    if (!item.assignee_name) return false;

    const iTokens = nameTokens(item.assignee_name);
    // 2. Nombre contra nombre.
    if (sameName(pNameTokens, iTokens)) return true;
    // 3. Nombre contra lo que se deduce del correo (ana.perez@ → "ana perez").
    if (sameName(pEmailTokens, iTokens)) return true;
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

// `appUrl` se reexportaba desde aquí por costumbre. Ya no: vive en
// `@/lib/app-url` y nadie la importaba a través de este módulo.
