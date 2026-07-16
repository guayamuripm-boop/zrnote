'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Participant {
  name: string;
  email: string;
}

export default function NewMeetingPage() {
  const [title, setTitle] = useState('');
  const [coordination, setCoordination] = useState('');
  const [type, setType] = useState<'presencial' | 'virtual' | 'llamada'>('presencial');
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [nameInput, setNameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const addParticipant = () => {
    const name = nameInput.trim();
    const email = emailInput.trim();
    if (!name || !email || !email.includes('@')) return;
    if (participants.some((p) => p.email.toLowerCase() === email.toLowerCase())) return;
    setParticipants([...participants, { name, email }]);
    setNameInput('');
    setEmailInput('');
  };

  const removeParticipant = (email: string) => {
    setParticipants(participants.filter((p) => p.email !== email));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const response = await fetch('/api/meetings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, coordination, type, participants }),
    });

    if (response.ok) {
      const { id } = await response.json();
      router.push(`/dashboard/meetings/${id}`);
    } else {
      const err = await response.json();
      setLoading(false);
      alert('Error al crear reunión: ' + (err.error || 'desconocido'));
    }
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <Link href="/dashboard/meetings" className="inline-flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition mb-4">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Reuniones
        </Link>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">Nueva Reunión</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="glass-strong rounded-2xl p-5 sm:p-6 shadow-elevated space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-900 dark:text-slate-100 mb-1.5">Título *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="Ej: Reunión semanal de equipo"
              className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 bg-white/80 dark:bg-white/5 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition text-base min-w-0"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-900 dark:text-slate-100 mb-1.5">Coordinación</label>
              <input
                type="text"
                value={coordination}
                onChange={(e) => setCoordination(e.target.value)}
                placeholder="Dirección Académica"
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 bg-white/80 dark:bg-white/5 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition text-base min-w-0"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-900 dark:text-slate-100 mb-1.5">Tipo</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as typeof type)}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 bg-white/80 dark:bg-white/5 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition text-base min-w-0"
              >
                <option value="presencial">Presencial</option>
                <option value="virtual">Virtual</option>
                <option value="llamada">Llamada</option>
              </select>
            </div>
          </div>
        </div>

        <div className="glass-strong rounded-2xl p-5 sm:p-6 shadow-elevated space-y-4">
          <label className="block text-sm font-semibold text-slate-900 dark:text-slate-100">Participantes</label>

          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="Nombre"
              className="flex-1 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 bg-white/80 dark:bg-white/5 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition text-base min-w-0"
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addParticipant())}
            />
            <input
              type="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="correo@ejemplo.com"
              className="flex-1 sm:flex-[2] border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 bg-white/80 dark:bg-white/5 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition text-base min-w-0"
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addParticipant())}
            />
            <button
              type="button"
              onClick={addParticipant}
              className="gradient-primary text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-blue-500/25 transition-all shrink-0"
            >
              + Agregar
            </button>
          </div>

          {participants.length > 0 ? (
            <div className="space-y-2">
              {participants.map((p) => (
                <div key={p.email} className="glass rounded-xl px-3 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 gradient-primary rounded-full flex items-center justify-center shrink-0">
                      <span className="text-white text-xs font-bold">{p.name.charAt(0).toUpperCase()}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-slate-900 dark:text-slate-100 truncate">{p.name}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{p.email}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeParticipant(p.email)}
                    className="text-slate-400 dark:text-slate-500 hover:text-rose-500 dark:hover:text-rose-400 transition shrink-0 ml-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-3">
              Agrega participantes para que reciban sus action items por correo
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full gradient-primary text-white py-3.5 rounded-xl font-medium hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
        >
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Creando...
            </span>
          ) : 'Crear Reunión'}
        </button>
      </form>
    </div>
  );
}