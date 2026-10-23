'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PriorityBadge } from '@/components/PriorityBadge';
import ActionItemStatus from '@/components/ActionItemStatus';
import { dueBucket, dueLabel, type DueBucket } from '@/lib/due-date';

export interface ActionItemViewData {
  id: string;
  description: string;
  priority: string | null;
  due_date: string | null;
  status: string;
  kind?: string | null;
  assignee_name: string | null;
  mine: boolean;
  meetings?: { id: string; title: string } | null;
}

type Filter = 'pending' | 'mine' | 'done' | 'all';

const GROUPS: { bucket: DueBucket; title: string; tone: string }[] = [
  { bucket: 'overdue', title: 'Vencidos', tone: 'text-rose-600 dark:text-rose-400' },
  { bucket: 'today', title: 'Hoy', tone: 'text-amber-600 dark:text-amber-400' },
  { bucket: 'week', title: 'Esta semana', tone: 'text-blue-600 dark:text-blue-400' },
  { bucket: 'later', title: 'Más adelante', tone: 'text-slate-600 dark:text-slate-300' },
  { bucket: 'none', title: 'Sin fecha', tone: 'text-slate-500 dark:text-slate-400' },
];

/** Franja de color a la izquierda según la prioridad. */
const RAIL: Record<string, string> = {
  alta: 'bg-rose-500',
  media: 'bg-amber-400',
  baja: 'bg-emerald-500',
};

const DUE_TONE: Record<DueBucket, string> = {
  overdue: 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  today: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  week: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  later: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  none: '',
};

/**
 * Compromisos. Antes: una lista plana donde lo hecho se mezclaba con lo
 * pendiente. Ahora: filtros arriba y lo pendiente agrupado por cuándo vence
 * («Vencidos» primero), que es la pregunta que se trae al abrir esta pantalla.
 *
 * Es de cliente a propósito: el «hoy» que decide qué está vencido debe ser el
 * del dispositivo, no el del servidor (Vercel está en UTC y por la noche, en
 * América, ya es «mañana»).
 */
export default function ActionItemsView({ items, now }: { items: ActionItemViewData[]; now?: Date }) {
  const [statusById, setStatusById] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<Filter>('pending');
  // «Hoy» sólo se conoce en el navegador. Calcularlo durante el pre-render del
  // servidor (UTC) daría otro día cerca de medianoche y React se quejaría de
  // que el HTML no coincide; hasta montar se muestra un esqueleto.
  const [clientNow, setClientNow] = useState<Date | null>(now ?? null);
  useEffect(() => {
    if (!now) setClientNow(new Date());
  }, [now]);

  const all = useMemo(
    () => items.map((i) => ({ ...i, status: statusById[i.id] ?? i.status })),
    [items, statusById],
  );
  const isDone = (i: { status: string }) => i.status === 'completado';

  if (!clientNow) {
    return (
      <div className="max-w-4xl mx-auto space-y-6" aria-busy="true">
        <div className="h-9 w-48 rounded-xl bg-slate-200/70 dark:bg-slate-700/50 animate-pulse" />
        <div className="h-11 w-full max-w-md rounded-2xl bg-slate-200/70 dark:bg-slate-700/50 animate-pulse" />
        <div className="space-y-2.5">
          {Array.from({ length: Math.min(Math.max(items.length, 1), 4) }).map((_, i) => (
            <div key={i} className="h-20 surface animate-pulse" />
          ))}
        </div>
      </div>
    );
  }
  const ref = clientNow;

  const counts = {
    pending: all.filter((i) => !isDone(i)).length,
    mine: all.filter((i) => !isDone(i) && i.mine).length,
    done: all.filter(isDone).length,
    all: all.length,
    overdue: all.filter((i) => !isDone(i) && dueBucket(i.due_date, ref) === 'overdue').length,
  };

  const visible = all.filter((i) =>
    filter === 'pending' ? !isDone(i) : filter === 'mine' ? !isDone(i) && i.mine : filter === 'done' ? isDone(i) : true,
  );

  const tabs: { id: Filter; label: string; n: number }[] = [
    { id: 'pending', label: 'Pendientes', n: counts.pending },
    { id: 'mine', label: 'A tu nombre', n: counts.mine },
    { id: 'done', label: 'Hechos', n: counts.done },
    { id: 'all', label: 'Todos', n: counts.all },
  ];

  const renderItem = (item: (typeof all)[number]) => {
    const done = isDone(item);
    const bucket = dueBucket(item.due_date, ref);
    return (
      <li
        key={item.id}
        className={`relative surface p-4 pl-5 overflow-hidden transition ${done ? 'opacity-60' : ''} ${
          item.mine && !done ? 'ring-1 ring-blue-300/60 dark:ring-blue-700/50' : ''
        }`}
      >
        <span aria-hidden className={`absolute left-0 top-3 bottom-3 w-1 rounded-r-full ${RAIL[item.priority || 'media'] || 'bg-slate-300'}`} />
        <div className="flex flex-col sm:flex-row sm:items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className={`font-medium text-slate-900 dark:text-slate-100 leading-snug ${done ? 'line-through' : ''}`}>
              {item.kind === 'evento' && <span title="Evento: ocurre en un momento concreto" aria-hidden>📅 </span>}
              {item.description}
            </p>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 mt-2 text-xs">
              {item.mine ? (
                <span className="bg-blue-600 text-white px-2 py-0.5 rounded-full font-medium">A tu nombre</span>
              ) : (
                <span className="text-slate-500 dark:text-slate-400">
                  {item.assignee_name ? `Responsable: ${item.assignee_name}` : 'Sin responsable'}
                </span>
              )}
              {item.due_date && !done && (
                <span className={`px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${DUE_TONE[bucket]}`}>
                  {dueLabel(item.due_date, ref)}
                </span>
              )}
              {item.meetings && (
                <Link
                  href={`/dashboard/meetings/${item.meetings.id}`}
                  className="inline-flex items-center gap-1 max-w-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full font-medium hover:bg-blue-50 dark:hover:bg-blue-900/30 transition"
                >
                  <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                  <span className="truncate max-w-[14rem]">{item.meetings.title}</span>
                </Link>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <PriorityBadge priority={item.priority} />
            <ActionItemStatus
              itemId={item.id}
              initialStatus={item.status}
              onChange={(s) => setStatusById((prev) => ({ ...prev, [item.id]: s }))}
            />
          </div>
        </div>
      </li>
    );
  };

  // Hechos y Todos: en Todos lo hecho va al final, separado.
  const grouped = filter !== 'done';
  const pendingVisible = visible.filter((i) => !isDone(i));
  const doneVisible = visible.filter(isDone);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">Compromisos</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">
            {counts.pending} pendiente{counts.pending !== 1 ? 's' : ''}
            {counts.overdue > 0 && (
              <span className="text-rose-600 dark:text-rose-400 font-medium"> · {counts.overdue} vencido{counts.overdue !== 1 ? 's' : ''}</span>
            )}
            {' · '}
            {counts.all} en total
          </p>
        </div>
      </div>

      {items.length > 0 && (
        // Desplazable en horizontal si no cabe, en vez de partir las pestañas.
        <div className="-mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto no-scrollbar">
          <div role="tablist" aria-label="Filtrar compromisos" className="inline-flex gap-1 p-1 rounded-2xl bg-slate-900/[0.05] dark:bg-white/[0.06]">
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={filter === t.id}
                onClick={() => setFilter(t.id)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition ${
                  filter === t.id
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                {t.label}
                <span
                  className={`text-[11px] tabular-nums px-1.5 rounded-full ${
                    filter === t.id ? 'bg-blue-500/15 text-blue-600 dark:text-blue-300' : 'bg-slate-900/5 dark:bg-white/10'
                  }`}
                >
                  {t.n}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <div className="surface p-10 sm:p-12 text-center">
          <div className="w-16 h-16 aurora rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-500/20">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-slate-700 dark:text-slate-200 text-lg font-semibold">Todavía no hay compromisos</p>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Aparecen aquí solos en cuanto se procesa una reunión.</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="surface p-10 text-center">
          <p className="text-3xl" aria-hidden>{filter === 'done' ? '📭' : '🎉'}</p>
          <p className="text-slate-600 dark:text-slate-300 font-medium mt-2">
            {filter === 'done' ? 'Aún no has completado ninguno' : 'Nada pendiente aquí'}
          </p>
        </div>
      ) : grouped ? (
        <div className="space-y-6">
          {GROUPS.map((g) => {
            const list = pendingVisible.filter((i) => dueBucket(i.due_date, ref) === g.bucket);
            if (list.length === 0) return null;
            return (
              <section key={g.bucket}>
                <h2 className={`text-xs font-semibold uppercase tracking-wider mb-2 px-1 ${g.tone}`}>
                  {g.title} <span className="text-slate-400 dark:text-slate-500 font-normal">· {list.length}</span>
                </h2>
                <ul className="space-y-2.5">{list.map(renderItem)}</ul>
              </section>
            );
          })}
          {doneVisible.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wider mb-2 px-1 text-emerald-600 dark:text-emerald-400">
                Hechos <span className="text-slate-400 dark:text-slate-500 font-normal">· {doneVisible.length}</span>
              </h2>
              <ul className="space-y-2.5">{doneVisible.map(renderItem)}</ul>
            </section>
          )}
        </div>
      ) : (
        <ul className="space-y-2.5">{visible.map(renderItem)}</ul>
      )}
    </div>
  );
}
