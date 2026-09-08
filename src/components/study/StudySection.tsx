'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { StudyAids } from '@/lib/study-aids';
import {
  pendingIndexes,
  clampPosition,
  stepPosition,
  positionAfterKnown,
  shuffleOrder,
  sanitizeKnown,
} from '@/lib/flashcard-deck';

// La sección de estudio de un acta de clase.
//
// POR QUÉ ES UN COMPONENTE DE CLIENTE Y NO HTML ESTÁTICO
// Las dos partes que de verdad hacen que alguien aprenda —taparse la respuesta
// antes de mirarla, y pasar tarjetas marcando lo que ya sabe— son inútiles si
// todo está desplegado a la vez. Un temario y un glosario sí valen impresos;
// un cuestionario con las respuestas visibles, no.
//
// POR QUÉ TRES PESTAÑAS Y NO UNA COLUMNA LARGA
// Son tres actividades distintas y no se hacen a la vez: leer los apuntes
// (antes), responder preguntas (después), pasar tarjetas (en el autobús). Todo
// junto son nueve secciones en vertical que nadie recorre entera en el móvil.

type Tab = 'apuntes' | 'repaso' | 'tarjetas';

/** Qué pestañas tienen contenido. Una vacía no se muestra. */
function availableTabs(aids: StudyAids): Tab[] {
  const tabs: Tab[] = [];
  if (
    aids.outline.length ||
    aids.key_concepts.length ||
    aids.worked_examples.length ||
    aids.common_mistakes.length ||
    aids.exam_notes.length ||
    aids.resources.length ||
    aids.open_questions.length
  ) {
    tabs.push('apuntes');
  }
  if (aids.study_questions.length) tabs.push('repaso');
  if (aids.flashcards.length) tabs.push('tarjetas');
  return tabs;
}

const TAB_LABEL: Record<Tab, string> = {
  apuntes: 'Apuntes',
  repaso: 'Repaso',
  tarjetas: 'Tarjetas',
};

/**
 * Lo que el estudiante ya se sabe, por acta.
 *
 * Vive en localStorage y no en la base de datos a propósito: es una ayuda
 * personal y efímera, no un dato del acta. Guardarlo en el servidor obligaría
 * a decidir de quién es el progreso cuando la clase se comparte con veinte
 * personas — y el enlace público no tiene sesión con la que responder a eso.
 * Cualquier fallo al leerlo o escribirlo se ignora: un navegador en modo
 * privado, o con el almacenamiento bloqueado, tiene que seguir funcionando.
 */
function useKnownCards(storageKey: string, total: number) {
  const [known, setKnown] = useState<Set<number>>(new Set());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) setKnown(sanitizeKnown(JSON.parse(raw), total));
    } catch {
      /* almacenamiento no disponible: se empieza de cero */
    }
    setLoaded(true);
  }, [storageKey, total]);

  const persist = useCallback(
    (next: Set<number>) => {
      setKnown(next);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify([...next]));
      } catch {
        /* el progreso se pierde al recargar, pero la sesión sigue */
      }
    },
    [storageKey],
  );

  return { known, persist, loaded };
}

function SectionHeading({ emoji, children }: { emoji: string; children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2.5 flex items-center gap-1.5">
      <span className="text-base" aria-hidden="true">{emoji}</span> {children}
    </h3>
  );
}

/* ─────────────────────────── Apuntes ─────────────────────────── */

function Apuntes({ aids }: { aids: StudyAids }) {
  return (
    <div className="space-y-6">
      {aids.exam_notes.length > 0 && (
        <div className="bg-amber-50/80 dark:bg-amber-900/20 border border-amber-200/70 dark:border-amber-800/40 rounded-xl p-4">
          <SectionHeading emoji="⚠️">Sobre la evaluación</SectionHeading>
          <ul className="space-y-1.5">
            {aids.exam_notes.map((note, i) => (
              <li key={i} className="text-sm text-amber-900 dark:text-amber-200 pl-4 relative before:content-['·'] before:absolute before:left-0">
                {note}
              </li>
            ))}
          </ul>
        </div>
      )}

      {aids.outline.length > 0 && (
        <div>
          <SectionHeading emoji="📋">Temario de la clase</SectionHeading>
          <ol className="space-y-3">
            {aids.outline.map((section, i) => (
              <li key={i} className="border-l-2 border-blue-300 dark:border-blue-700 pl-3">
                <p className="font-medium text-sm text-slate-800 dark:text-slate-100">
                  <span className="text-slate-400 dark:text-slate-500 tabular-nums">{i + 1}.</span> {section.section}
                </p>
                {section.points.length > 0 && (
                  <ul className="mt-1 space-y-1">
                    {section.points.map((point, j) => (
                      <li key={j} className="text-sm text-slate-600 dark:text-slate-300 pl-4 relative before:content-['·'] before:absolute before:left-0 before:text-slate-300 dark:before:text-slate-600">
                        {point}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      {aids.key_concepts.length > 0 && (
        <div>
          <SectionHeading emoji="📖">
            Glosario <span className="font-normal text-slate-400 dark:text-slate-500">({aids.key_concepts.length})</span>
          </SectionHeading>
          <dl className="space-y-2.5">
            {aids.key_concepts.map((c, i) => (
              <div key={i} className="glass rounded-xl p-3">
                <dt className="font-semibold text-sm text-slate-900 dark:text-slate-100">{c.term}</dt>
                <dd className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">{c.definition}</dd>
                {c.why && (
                  <dd className="text-xs text-slate-500 dark:text-slate-400 mt-1 italic">{c.why}</dd>
                )}
              </div>
            ))}
          </dl>
        </div>
      )}

      {aids.worked_examples.length > 0 && (
        <div>
          <SectionHeading emoji="✏️">Ejemplos resueltos en clase</SectionHeading>
          <div className="space-y-3">
            {aids.worked_examples.map((e, i) => (
              <div key={i} className="glass rounded-xl p-3.5">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{e.problem}</p>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-1.5 whitespace-pre-wrap">{e.approach}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {aids.common_mistakes.length > 0 && (
        <div>
          <SectionHeading emoji="🚧">Errores frecuentes</SectionHeading>
          <div className="space-y-2">
            {aids.common_mistakes.map((m, i) => (
              <div key={i} className="rounded-xl p-3 bg-rose-50/70 dark:bg-rose-900/15 border border-rose-100 dark:border-rose-800/30">
                <p className="text-sm text-rose-800 dark:text-rose-300">
                  <span className="font-semibold">Error:</span> {m.mistake}
                </p>
                <p className="text-sm text-emerald-700 dark:text-emerald-400 mt-1">
                  <span className="font-semibold">Correcto:</span> {m.correction}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {aids.open_questions.length > 0 && (
        <div>
          <SectionHeading emoji="❓">Quedó sin resolver</SectionHeading>
          <ul className="space-y-1.5">
            {aids.open_questions.map((q, i) => (
              <li key={i} className="text-sm text-slate-600 dark:text-slate-300 pl-4 relative before:content-['·'] before:absolute before:left-0 before:text-slate-300 dark:before:text-slate-600">
                {q}
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
            Son las preguntas que conviene llevar a la próxima clase.
          </p>
        </div>
      )}

      {aids.resources.length > 0 && (
        <div>
          <SectionHeading emoji="📚">Material mencionado</SectionHeading>
          <ul className="space-y-1.5">
            {aids.resources.map((r, i) => (
              <li key={i} className="text-sm text-slate-600 dark:text-slate-300 pl-4 relative before:content-['·'] before:absolute before:left-0 before:text-slate-300 dark:before:text-slate-600">
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── Repaso ─────────────────────────── */

function Repaso({ aids }: { aids: StudyAids }) {
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const allOpen = revealed.size === aids.study_questions.length;

  const toggle = (i: number) => {
    const next = new Set(revealed);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setRevealed(next);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Intenta responder antes de mirar. Es lo que hace que se te quede.
        </p>
        <button
          type="button"
          onClick={() => setRevealed(allOpen ? new Set() : new Set(aids.study_questions.map((_, i) => i)))}
          className="text-xs text-blue-600 dark:text-blue-400 hover:underline shrink-0"
        >
          {allOpen ? 'Ocultar todas' : 'Ver todas'}
        </button>
      </div>

      {aids.study_questions.map((q, i) => {
        const open = revealed.has(i);
        return (
          <div key={i} className="glass rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => toggle(i)}
              aria-expanded={open}
              className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-white/50 dark:hover:bg-white/5 transition"
            >
              <span className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5 tabular-nums">
                {i + 1}
              </span>
              <span className="flex-1 text-sm font-medium text-slate-800 dark:text-slate-100">{q.question}</span>
              <svg
                className={`w-4 h-4 text-slate-400 shrink-0 mt-1 transition-transform ${open ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {open && (
              <div className="px-4 pb-3.5 ml-9">
                <p className="text-sm text-slate-600 dark:text-slate-300 border-l-2 border-emerald-300 dark:border-emerald-700 pl-3">
                  {q.answer}
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────────── Tarjetas ─────────────────────────── */

function Tarjetas({ aids, storageKey }: { aids: StudyAids; storageKey: string }) {
  const total = aids.flashcards.length;
  const { known, persist, loaded } = useKnownCards(storageKey, total);
  const [order, setOrder] = useState<number[]>(() => aids.flashcards.map((_, i) => i));
  const [position, setPosition] = useState(0);
  const [flipped, setFlipped] = useState(false);

  // La baraja que queda por repasar. Recalcularla en vez de mutar `order` es lo
  // que permite que "Me la sé" no descoloque la tarjeta que se está viendo.
  const pending = useMemo(() => pendingIndexes(order, known), [order, known]);

  // Al terminar la baraja el índice se sale del array; volver al principio es
  // lo correcto (queda al menos una sin saber, o `pending` está vacío y se
  // muestra la pantalla de "completado").
  const safePosition = clampPosition(position, pending.length);
  const cardIndex = pending[safePosition];
  const card = cardIndex === undefined ? null : aids.flashcards[cardIndex];

  // Siempre desde `safePosition`, nunca desde el `position` crudo: tras marcar
  // tarjetas como sabidas el crudo puede haberse quedado fuera del mazo, y
  // sumarle 1 saltaria a un sitio arbitrario en vez de a la siguiente.
  const advance = (delta: number) => {
    setFlipped(false);
    setPosition(stepPosition(position, delta, pending.length));
  };

  const markKnown = () => {
    if (cardIndex === undefined) return;
    const next = new Set(known);
    next.add(cardIndex);
    persist(next);
    setFlipped(false);
    // No se avanza: al quitar esta tarjeta de `pending`, la siguiente ocupa
    // esta misma posición. Sumar 1 además saltaría una. El módulo sólo
    // recoloca el caso de haber marcado la última del mazo.
    setPosition(positionAfterKnown(position, pending.length));
  };

  const reset = () => {
    persist(new Set());
    setPosition(0);
    setFlipped(false);
  };

  const shuffle = () => {
    setOrder(shuffleOrder(order));
    setPosition(0);
    setFlipped(false);
  };

  // Sin esto la primera pintada mostraría "0 de 20 dominadas" durante un
  // instante aunque el estudiante ya llevara medio mazo hecho.
  if (!loaded) {
    return <div className="h-56 rounded-2xl bg-slate-100/60 dark:bg-slate-800/40 animate-pulse" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
            <span>{known.size} de {total} dominadas</span>
            {pending.length > 0 && <span className="tabular-nums">{safePosition + 1}/{pending.length}</span>}
          </div>
          <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
            <div
              className="h-full gradient-primary transition-all duration-500"
              style={{ width: `${total > 0 ? (known.size / total) * 100 : 0}%` }}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={shuffle}
          title="Barajar"
          className="text-xs text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 shrink-0 px-2 py-1"
        >
          🔀 Barajar
        </button>
      </div>

      {card === null ? (
        <div className="glass rounded-2xl p-8 text-center space-y-3">
          <p className="text-3xl" aria-hidden="true">🎉</p>
          <p className="font-medium text-slate-800 dark:text-slate-100">Te sabes las {total}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Vuelve dentro de un par de días: repasar espaciado es lo que fija la memoria.
          </p>
          <button
            type="button"
            onClick={reset}
            className="gradient-primary text-white px-4 py-2 rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-blue-500/25 transition-all"
          >
            Repasar otra vez
          </button>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setFlipped((f) => !f)}
            aria-live="polite"
            className="w-full min-h-[11rem] glass rounded-2xl p-6 flex flex-col items-center justify-center text-center gap-3 hover:shadow-elevated transition-all"
          >
            <span className="text-[10px] uppercase tracking-widest text-slate-400 dark:text-slate-500">
              {flipped ? 'Respuesta' : 'Pregunta'}
            </span>
            <span className={`${flipped ? 'text-sm text-slate-600 dark:text-slate-300' : 'text-lg font-semibold text-slate-900 dark:text-slate-100'} leading-relaxed`}>
              {flipped ? card.back : card.front}
            </span>
            {!flipped && (
              <span className="text-xs text-slate-400 dark:text-slate-500">Toca para ver la respuesta</span>
            )}
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => advance(-1)}
              className="glass border border-slate-200 dark:border-slate-700 px-3 py-2.5 rounded-xl text-sm text-slate-600 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-white/5 transition"
              aria-label="Tarjeta anterior"
            >
              ←
            </button>
            <button
              type="button"
              onClick={() => advance(1)}
              className="flex-1 glass border border-slate-200 dark:border-slate-700 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-white/70 dark:hover:bg-white/5 transition"
            >
              Repasarla luego
            </button>
            <button
              type="button"
              onClick={markKnown}
              className="flex-1 gradient-success text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:shadow-lg transition-all"
            >
              Me la sé
            </button>
          </div>
        </>
      )}

      {known.size > 0 && card !== null && (
        <button
          type="button"
          onClick={reset}
          className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 mx-auto block"
        >
          Reiniciar progreso
        </button>
      )}
    </div>
  );
}

/* ─────────────────────────── Sección ─────────────────────────── */

export default function StudySection({
  aids,
  minuteId,
}: {
  aids: StudyAids;
  /** Identifica el progreso de tarjetas de ESTA acta en localStorage. */
  minuteId: string;
}) {
  const tabs = useMemo(() => availableTabs(aids), [aids]);
  const [tab, setTab] = useState<Tab>(tabs[0] ?? 'apuntes');

  if (tabs.length === 0) return null;

  return (
    <section className="glass-strong rounded-2xl p-5 sm:p-6 shadow-elevated ring-1 ring-violet-200/50 dark:ring-violet-800/30">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-violet-500 flex items-center justify-center shrink-0">
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Estudiar esta clase</h2>
      </div>

      {tabs.length > 1 && (
        <div className="flex gap-1 p-1 rounded-xl bg-slate-100/80 dark:bg-slate-800/60 mb-5" role="tablist">
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === t
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              {TAB_LABEL[t]}
              {t === 'repaso' && ` (${aids.study_questions.length})`}
              {t === 'tarjetas' && ` (${aids.flashcards.length})`}
            </button>
          ))}
        </div>
      )}

      {tab === 'apuntes' && <Apuntes aids={aids} />}
      {tab === 'repaso' && <Repaso aids={aids} />}
      {tab === 'tarjetas' && <Tarjetas aids={aids} storageKey={`zrnote:flashcards:${minuteId}`} />}

      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-5 pt-4 border-t border-slate-200/60 dark:border-slate-700/50 leading-relaxed">
        Apuntes generados automáticamente a partir del audio de la clase, usando <strong>únicamente</strong> lo que
        se dijo en ella. Pueden contener errores u omisiones: contrástalos con el material del docente antes de un examen.
      </p>
    </section>
  );
}
