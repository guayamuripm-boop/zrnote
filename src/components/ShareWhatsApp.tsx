'use client';

import { useState } from 'react';
import { formatMinuteForCopy, type CopyMinute, type CopyActionItem } from '@/lib/minute-copy-format';
import { toParagraphs } from '@/lib/readable-text';
import type { StudyAids } from '@/lib/study-aids';
import type { Chapter } from '@/lib/chapters';

// Compartir por WhatsApp, en dos formas claras:
//
//  • mode="full" — el acta COMPLETA como texto (decisiones, bloqueos, apuntes…).
//    Es autosuficiente: no necesita abrir nada más. Lo arma el mismo formateador
//    que «Copiar», con el marcado de WhatsApp (*negrita*).
//
//  • mode="summary" — un mensaje CORTO (título + resumen) y, al final, el enlace
//    público para leer el acta completa en la app. Es lo que pidió el producto:
//    "una para compartir un resumen y el resto verlo completo en la aplicación".
//    El enlace se pide a /api/meetings/[id]/share-link en el momento de pulsar.
//
// Cómo se entrega (igual en ambos modos):
//  - Móvil (Web Share API): `navigator.share({ text })` abre el selector del
//    sistema, donde está WhatsApp, sin el límite de longitud de una URL.
//  - Escritorio: `wa.me/?text=` si el mensaje cabe en una URL razonable.
//  - Si no cabe: se copia el texto al portapapeles y se abre WhatsApp para
//    pegarlo, en vez de cortarlo en silencio.

/** Por encima de esto una URL `wa.me` deja de ser fiable entre navegadores. */
const MAX_WA_URL_CHARS = 6000;

export default function ShareWhatsApp({
  meetingId,
  title,
  createdAt,
  coordination,
  minute,
  actionItems,
  studyAids,
  chapters,
  mode = 'full',
}: {
  meetingId: string;
  title: string;
  createdAt?: string | null;
  coordination?: string | null;
  minute: CopyMinute;
  actionItems?: CopyActionItem[];
  studyAids?: StudyAids | null;
  chapters?: Chapter[] | null;
  /** `full`: el acta entera. `summary`: resumen + enlace a la versión completa. */
  mode?: 'full' | 'summary';
}) {
  const [loading, setLoading] = useState(false);

  /** Entrega el texto por el mejor canal disponible (ver cabecera del archivo). */
  const deliver = async (text: string) => {
    const isTouch = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
    if (isTouch && typeof navigator.share === 'function') {
      try {
        await navigator.share({ text });
        return;
      } catch (err: any) {
        // El usuario cerró el selector: no es un fallo ni hay que abrir nada más.
        if (err?.name === 'AbortError') return;
      }
    }

    const waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
    if (waUrl.length <= MAX_WA_URL_CHARS) {
      window.open(waUrl, '_blank', 'noopener');
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      window.alert('El mensaje es largo: lo copié completo al portapapeles. Pégalo en el chat de WhatsApp que se abre.');
    } catch {
      // Sin portapapeles no se puede entregar entero: al menos, el título.
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(`📋 ${title}`)}`, '_blank', 'noopener');
  };

  const shareFull = async () => {
    const text = formatMinuteForCopy({
      title,
      createdAt,
      coordination,
      minute,
      actionItems,
      studyAids,
      chapters,
      // Sin enlace: el texto ya va completo.
      style: 'whatsapp',
    });
    await deliver(text);
  };

  const shareSummary = async () => {
    setLoading(true);
    // El enlace público (mismo que «Compartir»): un token firmado, sin fila
    // nueva en la base. Si fallara, mandamos igual el resumen sin enlace.
    let url = '';
    try {
      const res = await fetch(`/api/meetings/${meetingId}/share-link`);
      const data = await res.json().catch(() => ({}));
      if (res.ok) url = data.url || '';
    } catch {
      /* sin enlace: el resumen solo sigue siendo útil */
    }
    setLoading(false);

    const lines: string[] = [`📋 *${title}*`];
    const meta: string[] = [];
    if (coordination) meta.push(coordination);
    if (createdAt) {
      const d = new Date(createdAt);
      if (!isNaN(d.getTime())) {
        meta.push(d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }));
      }
    }
    if (meta.length > 0) lines.push(`🗓️ ${meta.join(' · ')}`);

    const paras = toParagraphs(minute.summary);
    if (paras.length > 0) {
      lines.push('', '📝 *Resumen*', paras.join('\n\n'));
    } else {
      lines.push('', 'Te comparto la minuta de esta reunión.');
    }

    if (url) lines.push('', `📄 Lee el acta completa en ZR Note:\n${url}`);
    lines.push('', '🤖 Generado con ZR Note a partir de la grabación.');

    await deliver(lines.join('\n'));
  };

  const isSummary = mode === 'summary';
  const label = isSummary ? 'Resumen + enlace' : 'Completa';

  return (
    <button
      onClick={isSummary ? shareSummary : shareFull}
      disabled={loading}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:text-white bg-emerald-100 dark:bg-emerald-900/20 hover:bg-emerald-500 dark:hover:bg-emerald-600 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60"
      title={
        isSummary
          ? 'WhatsApp: comparte un resumen corto con el enlace al acta completa'
          : 'WhatsApp: comparte la minuta completa como texto'
      }
    >
      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.489-.907zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.017-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
      </svg>
      {loading ? 'Generando…' : label}
    </button>
  );
}
