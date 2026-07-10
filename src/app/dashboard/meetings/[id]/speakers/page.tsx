'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';

export default function SpeakersPage() {
  const params = useParams();
  const [speakers, setSpeakers] = useState<{ name: string; label: string }[]>([]);
  const [name, setName] = useState('');
  const [label, setLabel] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addSpeaker = () => {
    if (name && label) {
      setSpeakers([...speakers, { name, label }]);
      setName('');
      setLabel('');
    }
  };

  const saveSpeakers = async () => {
    setError(null);
    const speaker_map = Object.fromEntries(speakers.map((s) => [s.label, s.name]));
    const res = await fetch(`/api/meetings/${params.id}/speaker-map`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ speaker_map }),
    });
    if (res.ok) {
      setSaved(true);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'No se pudo guardar');
    }
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <Link href={`/dashboard/meetings/${params.id}`} className="inline-flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition mb-4">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Volver
        </Link>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">Identificar Participantes</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
          Asocia nombres con etiquetas para la transcripción
        </p>
      </div>

      <div className="glass-strong rounded-2xl p-5 sm:p-6 shadow-elevated space-y-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre"
            className="flex-1 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 bg-white/80 dark:bg-white/5 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition text-base min-w-0"
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSpeaker())}
          />
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Etiqueta (ej: Director)"
            className="flex-1 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 bg-white/80 dark:bg-white/5 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition text-base min-w-0"
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSpeaker())}
          />
          <button
            onClick={addSpeaker}
            className="gradient-primary text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-blue-500/25 transition-all shrink-0"
          >
            +
          </button>
        </div>
      </div>

      {speakers.length > 0 && (
        <div className="glass-strong rounded-2xl p-5 sm:p-6 shadow-elevated space-y-3">
          {speakers.map((s, i) => (
            <div key={i} className="glass rounded-xl p-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 gradient-primary rounded-full flex items-center justify-center">
                  <span className="text-white text-xs font-bold">{s.name.charAt(0)}</span>
                </div>
                <div>
                  <p className="font-medium text-sm text-slate-900 dark:text-slate-100">{s.name}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">{s.label}</p>
                </div>
              </div>
              <button
                onClick={() => setSpeakers(speakers.filter((_, j) => j !== i))}
                className="text-slate-400 dark:text-slate-500 hover:text-rose-500 dark:hover:text-rose-400 transition"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
          <button
            onClick={saveSpeakers}
            className="w-full gradient-primary text-white py-3 rounded-xl font-medium hover:shadow-lg hover:shadow-blue-500/25 transition-all"
          >
            {saved ? '✓ Guardado' : 'Guardar Participantes'}
          </button>
          {error && <p className="text-sm text-rose-600 dark:text-rose-400 text-center">{error}</p>}
        </div>
      )}
    </div>
  );
}