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

  const addSpeaker = () => {
    if (name && label) {
      setSpeakers([...speakers, { name, label }]);
      setName('');
      setLabel('');
    }
  };

  const saveSpeakers = async () => {
    await fetch(`/api/meetings/${params.id}/speaker-map`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ speakers }),
    });
    setSaved(true);
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <Link href={`/dashboard/meetings/${params.id}`} className="inline-flex items-center gap-1 text-sm text-zr-blue-mid/50 hover:text-zr-blue transition mb-4">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Volver
        </Link>
        <h1 className="text-2xl sm:text-3xl font-bold text-zr-navy dark:text-zr-blue-pale">Identificar Participantes</h1>
        <p className="text-zr-blue-mid/50 text-sm mt-1">
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
            className="flex-1 border border-zr-blue-pale/50 rounded-xl px-4 py-2.5 bg-white/80 dark:bg-white/5 text-zr-navy dark:text-zr-blue-pale placeholder-zr-blue-mid/30 focus:outline-none focus:ring-2 focus:ring-zr-blue-mid/30 transition text-sm min-w-0"
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSpeaker())}
          />
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Etiqueta (ej: Director)"
            className="flex-1 border border-zr-blue-pale/50 rounded-xl px-4 py-2.5 bg-white/80 dark:bg-white/5 text-zr-navy dark:text-zr-blue-pale placeholder-zr-blue-mid/30 focus:outline-none focus:ring-2 focus:ring-zr-blue-mid/30 transition text-sm min-w-0"
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSpeaker())}
          />
          <button
            onClick={addSpeaker}
            className="gradient-primary text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-indigo-500/25 transition-all shrink-0"
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
                  <p className="font-medium text-sm text-zr-navy dark:text-zr-blue-pale">{s.name}</p>
                  <p className="text-xs text-zr-blue-mid/40">{s.label}</p>
                </div>
              </div>
              <button
                onClick={() => setSpeakers(speakers.filter((_, j) => j !== i))}
                className="text-zr-blue-mid/30 hover:text-indigo-500 transition"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
          <button
            onClick={saveSpeakers}
            className="w-full gradient-primary text-white py-3 rounded-xl font-medium hover:shadow-lg hover:shadow-indigo-500/25 transition-all"
          >
            {saved ? '✓ Guardado' : 'Guardar Participantes'}
          </button>
        </div>
      )}
    </div>
  );
}
