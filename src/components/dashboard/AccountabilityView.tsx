'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { summarizeAccountability } from '@/lib/action-items';

export interface AccountabilityItem {
  status: string;
  due_date: string | null;
  assignee_name: string | null;
}

/**
 * "¿Quién tiene qué y quién va al día?" — la vista de accountability para un
 * ejecutivo. Agrupa todos los compromisos por responsable y muestra, por
 * persona, cuánto cumplió y qué tiene vencido.
 *
 * Es de cliente a propósito: igual que en Compromisos, el "hoy" que decide qué
 * está vencido debe ser el del dispositivo, no el del servidor (UTC).
 */
export default function AccountabilityView({ items }: { items: AccountabilityItem[] }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);

  if (!now) {
    return (
      <div className="max-w-4xl mx-auto space-y-6" aria-busy="true">
        <div className="h-9 w-56 rounded-xl bg-slate-200/70 dark:bg-slate-700/50 animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 surface animate-pulse" />
          ))}
        </div>
        <div className="space-y-2.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 surface animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const { people, totals } = summarizeAccountability(items, now);

  const header = (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">Responsables</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">
          Quién tiene qué y quién va al día, con todos los compromisos de tus reuniones.
        </p>
      </div>
      <Link
        href="/dashboard/action-items"
        className="text-sm text-blue-600 dark:text-blue-400 hover:underline underline-offset-4 shrink-0"
      >
        Ver lista de compromisos →
      </Link>
    </div>
  );

  if (items.length === 0) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        {header}
        <div className="surface p-10 sm:p-12 text-center">
          <div className="w-16 h-16 aurora rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-500/20">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4z" />
            </svg>
          </div>
          <p className="text-slate-700 dark:text-slate-200 text-lg font-semibold">Todavía no hay compromisos</p>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Aparecen aquí solos en cuanto se procesa una reunión.
          </p>
        </div>
      </div>
    );
  }

  const stats: { label: string; value: string; tone: string }[] = [
    { label: 'Compromisos', value: String(totals.total), tone: 'text-slate-900 dark:text-slate-100' },
    { label: 'Cumplido', value: `${totals.completionPct}%`, tone: 'text-emerald-600 dark:text-emerald-400' },
    { label: 'Pendientes', value: String(totals.pending), tone: 'text-blue-600 dark:text-blue-400' },
    { label: 'Vencidos', value: String(totals.overdue), tone: totals.overdue > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400 dark:text-slate-500' },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {header}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="surface p-4">
            <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 tabular-nums ${s.tone}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <ul className="space-y-2.5">
        {people.map((p) => (
          <li key={p.name} className="surface p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-9 h-9 rounded-full gradient-primary flex items-center justify-center shrink-0">
                  <span className="text-white text-sm font-bold">
                    {p.name === 'Sin responsable' ? '—' : p.name.charAt(0).toUpperCase()}
                  </span>
                </span>
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 dark:text-slate-100 truncate">{p.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {p.pending} pendiente{p.pending !== 1 ? 's' : ''}
                    {p.overdue > 0 && (
                      <span className="text-rose-600 dark:text-rose-400 font-medium"> · {p.overdue} vencido{p.overdue !== 1 ? 's' : ''}</span>
                    )}
                    {' · '}{p.done}/{p.total} hecho{p.done !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <span className="text-sm font-semibold tabular-nums text-slate-700 dark:text-slate-200 shrink-0">
                {p.completionPct}%
              </span>
            </div>
            {/* Barra de progreso: cuánto de lo suyo ya está hecho. */}
            <div className="mt-3 h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className={`h-full rounded-full ${p.overdue > 0 ? 'bg-rose-400' : 'bg-emerald-500'}`}
                style={{ width: `${p.completionPct}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
