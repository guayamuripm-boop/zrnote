'use client';

import { useState } from 'react';

export interface Audience {
  label: string;
  emoji: string;
  title: string;
  description: string;
  points: string[];
}

export default function AudienceTabs({ audiences }: { audiences: Audience[] }) {
  const [active, setActive] = useState(0);
  const current = audiences[active];

  return (
    <div>
      <div className="flex flex-wrap justify-center gap-2 mb-8">
        {audiences.map((a, i) => (
          <button
            key={a.label}
            type="button"
            onClick={() => setActive(i)}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 ${
              i === active
                ? 'gradient-primary text-white shadow-lg shadow-blue-500/25'
                : 'glass text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            <span aria-hidden="true">{a.emoji}</span>
            {a.label}
          </button>
        ))}
      </div>

      {/* key=active fuerza a React a remontar el bloque, así el fade-in del
          CSS se repite cada vez que se cambia de pestaña. */}
      <div key={active} className="glass-strong rounded-3xl p-6 sm:p-10 shadow-elevated reveal in-view">
        <div className="grid sm:grid-cols-[1fr_auto] gap-8 items-start">
          <div>
            <h3 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">
              {current.title}
            </h3>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">{current.description}</p>
          </div>
          <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center text-3xl shrink-0">
            <span aria-hidden="true">{current.emoji}</span>
          </div>
        </div>
        <ul className="grid sm:grid-cols-2 gap-3 mt-6">
          {current.points.map((point) => (
            <li key={point} className="flex items-start gap-2.5 text-sm text-slate-700 dark:text-slate-200">
              <span className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0 mt-0.5">
                <svg className="w-3 h-3 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </span>
              {point}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
