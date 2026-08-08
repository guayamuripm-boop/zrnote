'use client';

import { toParagraphs } from '@/lib/readable-text';

// Compartir por WhatsApp, gratis: se arma el mensaje como texto plano con el
// marcado propio de WhatsApp (*negrita*) y emojis como separadores de sección,
// y se abre WhatsApp con todo prellenado. El usuario revisa y envía. Sin API
// de pago.
//
// QUÉ SE MANDA Y QUÉ NO
// Antes se volcaba el acta ENTERA: resumen, decisiones, bloqueos, hasta 12
// compromisos y próximos pasos, con un tope de 3.500 caracteres. En un chat
// eso es un muro que nadie lee.
//
// Ahora el mensaje es lo accionable —resumen en párrafos cortos y los
// compromisos— y el resto queda detrás del enlace público de la minuta, que
// desde la v1.12 cualquier participante abre sin necesidad de cuenta. Las
// decisiones se incluyen sólo si son pocas; si son muchas, están en el enlace.

interface MinuteLike {
  summary?: string | null;
  decisions?: string[] | null;
  blockers?: { issue: string; impact?: string; owner?: string | null }[] | null;
  next_steps?: (string | { step: string; owner?: string | null })[] | null;
}

interface ActionItemLike {
  description: string;
  assignee_name?: string | null;
  priority?: string | null;
  due_date?: string | null;
  status?: string | null;
}

const PRIORITY_EMOJI: Record<string, string> = { alta: '🔴', media: '🟡', baja: '🟢' };

function formatDate(d?: string | null): string {
  if (!d) return '';
  const date = new Date(`${d}T00:00:00`);
  if (isNaN(date.getTime())) return '';
  return ` · vence ${date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`;
}

// WhatsApp y los navegadores llevan mal las URLs `wa.me` muy largas, pero el
// límite real aquí es la paciencia de quien lo recibe: un mensaje de chat que
// hay que desplazar tres pantallas no se lee. El acta completa está a un toque
// de distancia en el enlace.
const MAX_LEN = 1400;

/** Por encima de esto, las decisiones se dejan para el enlace. */
const MAX_DECISIONS_INLINE = 3;
/** Compromisos que caben en un chat sin volverlo un listado. */
const MAX_ITEMS_INLINE = 6;

export default function ShareWhatsApp({
  title,
  date,
  minute,
  actionItems,
}: {
  title: string;
  date?: string | null;
  minute?: MinuteLike | null;
  actionItems?: ActionItemLike[];
}) {
  const share = () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const parts: string[] = [];

    parts.push(`📋 *${title}*`);
    if (date) {
      const d = new Date(date);
      if (!isNaN(d.getTime())) {
        parts.push(`🗓️ ${d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}`);
      }
    }

    // El resumen va en párrafos cortos separados por línea en blanco: en el
    // móvil un bloque de 5 frases se ve como un muro y se salta entero.
    const paragraphs = toParagraphs(minute?.summary);
    if (paragraphs.length > 0) {
      parts.push(`\n📝 *Resumen*\n${paragraphs.join('\n\n')}`);
    }

    const items = actionItems || [];
    if (items.length > 0) {
      // Lo pendiente primero: es lo único que el lector tiene que hacer.
      const notDone = items.filter((i) => i.status !== 'completado');
      const relevant = notDone.length > 0 ? notDone : items;
      const list = relevant.slice(0, MAX_ITEMS_INLINE);
      const rest = relevant.length - list.length;

      parts.push(
        `\n📌 *Compromisos (${items.length})*\n` +
          list
            .map((t) => {
              const emoji = PRIORITY_EMOJI[t.priority || ''] || '⚪';
              const who = t.assignee_name ? ` — _${t.assignee_name}_` : '';
              return `${emoji} ${t.description}${who}${formatDate(t.due_date)}`;
            })
            .join('\n') +
          (rest > 0 ? `\n_…y ${rest} más en la minuta completa_` : '')
      );
    }

    // Las decisiones caben sólo si son pocas. Muchas decisiones convierten el
    // mensaje en el documento que precisamente queremos dejar en el enlace.
    const decisions = minute?.decisions || [];
    if (decisions.length > 0 && decisions.length <= MAX_DECISIONS_INLINE) {
      parts.push(`\n✅ *Decisiones*\n` + decisions.map((d) => `• ${d}`).join('\n'));
    }

    // Bloqueos y próximos pasos ya NO van en el chat: son contexto de lectura,
    // no acciones para quien recibe el mensaje. Están en la minuta completa.

    if (url) parts.push(`\n📄 *Acta completa:* ${url}`);

    let text = parts.join('\n');
    if (text.length > MAX_LEN) {
      // Se recorta por el último salto de línea para no cortar a media palabra.
      const cut = text.slice(0, MAX_LEN - 60);
      text = cut.slice(0, cut.lastIndexOf('\n')) + `\n\n📄 *Acta completa:* ${url}`;
    }

    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };

  return (
    <button
      onClick={share}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:text-white bg-emerald-100 dark:bg-emerald-900/20 hover:bg-emerald-500 dark:hover:bg-emerald-600 px-3 py-1.5 rounded-lg transition-colors"
      title="Compartir minuta completa por WhatsApp"
    >
      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.489-.907zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.017-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
      </svg>
      WhatsApp
    </button>
  );
}
