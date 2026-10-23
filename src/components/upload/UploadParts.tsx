'use client';

import { useRef, useState } from 'react';

export const AUDIO_ACCEPT = 'audio/*,.aac,.m4a,.mp3,.wav,.ogg,.oga,.webm,.3gp,.amr,.mp4,.flac,.opus';

/**
 * Zona para elegir o soltar el audio. Ahora también se activa con el teclado
 * (Enter / espacio): antes era un <div> clicable al que no se llegaba sin ratón.
 */
export function UploadDropzone({ onFiles }: { onFiles?: (files: FileList | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Elegir un archivo de audio"
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
      onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
      onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
      onDrop={(e) => {
        e.preventDefault();
        setDragActive(false);
        onFiles?.(e.dataTransfer.files);
      }}
      className={`group relative overflow-hidden rounded-[1.75rem] border-2 border-dashed p-8 sm:p-14 text-center cursor-pointer transition-all duration-300 outline-none focus-visible:ring-4 focus-visible:ring-blue-500/30 ${
        dragActive
          ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-900/20 scale-[1.01]'
          : 'border-slate-300/80 dark:border-slate-600 bg-[var(--bg-card)] hover:border-blue-400 dark:hover:border-blue-500'
      }`}
    >
      <div aria-hidden className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[28rem] h-[28rem] rounded-full bg-gradient-to-b from-blue-500/10 via-violet-500/10 to-transparent blur-3xl" />

      <div className="relative">
        <span
          className={`inline-flex w-16 h-16 sm:w-20 sm:h-20 rounded-[1.4rem] aurora items-center justify-center shadow-xl shadow-indigo-500/25 transition-transform duration-300 ${
            dragActive ? 'scale-110 -rotate-3' : 'group-hover:scale-105 group-hover:-rotate-3'
          }`}
        >
          <svg className="w-8 h-8 sm:w-9 sm:h-9 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
        </span>

        {dragActive ? (
          <>
            <p className="mt-5 text-lg font-semibold text-blue-600 dark:text-blue-400">Suelta el audio aquí</p>
            <p className="text-sm text-blue-500 dark:text-blue-400 mt-1">La minuta se genera sola</p>
          </>
        ) : (
          <>
            <p className="mt-5 text-lg font-semibold text-slate-900 dark:text-slate-100">Toca para elegir el audio</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">o arrástralo aquí · incluso grabaciones de varias horas</p>
          </>
        )}

        <div className="mt-5 flex flex-wrap justify-center gap-1.5">
          {['MP3', 'M4A', 'WAV', 'OGG', 'WebM', 'AAC', 'MP4'].map((f) => (
            <span key={f} className="text-[10px] font-semibold tracking-wide text-slate-500 dark:text-slate-400 bg-slate-900/5 dark:bg-white/10 px-2 py-0.5 rounded-full">
              {f}
            </span>
          ))}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={AUDIO_ACCEPT}
        multiple
        onChange={(e) => {
          onFiles?.(e.target.files);
          if (inputRef.current) inputRef.current.value = '';
        }}
        className="hidden"
      />
    </div>
  );
}

export type FlowPhase = 'preparing' | 'uploading' | 'processing' | 'retry';

/**
 * El progreso de «subir y generar la minuta» en una sola tarjeta: un anillo con
 * el porcentaje y, debajo, los tres pasos unidos por una línea que se va
 * llenando. Sin «parte 1/4» ni listas de fragmentos.
 */
export function UploadProgressCard({
  phase,
  percent,
  headline,
  sub,
  steps,
  children,
}: {
  phase: FlowPhase;
  percent: number;
  headline: string;
  sub: string;
  steps: { label: string; at: number }[];
  children?: React.ReactNode;
}) {
  const R = 26;
  const C = 2 * Math.PI * R;
  const retry = phase === 'retry';

  return (
    <div className="surface p-5 sm:p-7 space-y-6" aria-live="polite">
      <div className="flex items-center gap-4 sm:gap-5">
        <div className="relative w-[4.5rem] h-[4.5rem] shrink-0">
          {retry ? (
            <span className="absolute inset-0 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-2xl">⚠️</span>
          ) : (
            <>
              <svg className="w-full h-full -rotate-90" viewBox="0 0 64 64" aria-hidden>
                <defs>
                  <linearGradient id="zr-ring" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" />
                    <stop offset="60%" stopColor="#8b5cf6" />
                    <stop offset="100%" stopColor="#22d3ee" />
                  </linearGradient>
                </defs>
                <circle cx="32" cy="32" r={R} fill="none" strokeWidth="6" className="stroke-slate-200 dark:stroke-slate-700" />
                <circle
                  cx="32"
                  cy="32"
                  r={R}
                  fill="none"
                  strokeWidth="6"
                  strokeLinecap="round"
                  stroke="url(#zr-ring)"
                  strokeDasharray={C}
                  strokeDashoffset={C * (1 - percent / 100)}
                  className="transition-[stroke-dashoffset] duration-700 ease-out"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                {percent}%
              </span>
            </>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-lg text-slate-900 dark:text-slate-100 leading-tight">{headline}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{sub}</p>
        </div>
      </div>

      {!retry && (
        <ol className="relative flex justify-between" aria-label="Pasos">
          {/* Línea de fondo y línea de avance entre el primer y el último paso. */}
          <span aria-hidden className="absolute left-3 right-3 top-3 h-0.5 bg-slate-200 dark:bg-slate-700 rounded-full" />
          <span
            aria-hidden
            className="absolute left-3 top-3 h-0.5 rounded-full aurora transition-all duration-700"
            style={{
              width: `calc((100% - 1.5rem) * ${Math.min(1, Math.max(0, (percent - steps[0].at) / (steps[steps.length - 1].at - steps[0].at)))})`,
            }}
          />
          {steps.map((s, i) => {
            const reached = percent >= s.at;
            // Terminado cuando ya se llegó al siguiente; el último nunca se da
            // por terminado aquí (al terminar, la pantalla cambia a la minuta).
            const done = i < steps.length - 1 && percent >= steps[i + 1].at;
            return (
              <li key={s.label} className="relative flex flex-col items-center gap-1.5 w-20">
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${
                    reached
                      ? 'aurora text-white shadow-md shadow-indigo-500/30'
                      : 'bg-[var(--bg-card)] border-2 border-slate-200 dark:border-slate-700 text-slate-400'
                  }`}
                >
                  {done ? '✓' : reached ? <span className="w-2 h-2 rounded-full bg-white animate-pulse" /> : ''}
                </span>
                <span className={`text-[11px] font-medium text-center ${reached ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400 dark:text-slate-500'}`}>
                  {s.label}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {children}
    </div>
  );
}
