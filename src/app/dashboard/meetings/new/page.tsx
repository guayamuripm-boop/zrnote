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
  const [quickLoading, setQuickLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Quick record: create a meeting instantly with an auto title and jump straight
  // to recording — no form. The scheduled flow (below) stays for planned meetings.
  const handleQuickRecord = async () => {
    setQuickLoading(true);
    setError(null);
    const now = new Date();
    const autoTitle = `Grabación ${now.toLocaleDateString('es', { day: 'numeric', month: 'short' })} ${now.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`;
    const response = await fetch('/api/meetings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // autoTitle: true marca este título de fecha/hora como provisional. En
      // cuanto haya transcripción, analyzeMeeting lo sustituye por uno que la
      // IA redacta a partir de lo que realmente se habló.
      body: JSON.stringify({ title: autoTitle, coordination: '', type: 'presencial', participants: [], autoTitle: true }),
    });
    if (response.ok) {
      const { id } = await response.json();
      router.push(`/dashboard/meetings/${id}/record`);
    } else {
      const err = await response.json().catch(() => ({}));
      setQuickLoading(false);
      setError('Error al iniciar grabación: ' + (err.error || 'desconocido'));
    }
  };

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
    setError(null);

    const response = await fetch('/api/meetings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, coordination, type, participants }),
    });

    if (response.ok) {
      const { id } = await response.json();
      router.push(`/dashboard/meetings/${id}`);
    } else {
      const err = await response.json().catch(() => ({}));
      setLoading(false);
      setError('Error al crear reunión: ' + (err.error || 'desconocido'));
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

      {error && (
        <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-2xl p-4">
          <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
        </div>
      )}

      {/* Quick record — one tap, start recording now */}
      <button
        type="button"
        onClick={handleQuickRecord}
        disabled={quickLoading}
        className="w-full glass-strong rounded-2xl p-5 flex items-center gap-4 text-left hover:shadow-elevated transition-all duration-300 border border-transparent hover:border-blue-400/40 disabled:opacity-60"
      >
        <div className="w-12 h-12 rounded-full gradient-primary flex items-center justify-center shrink-0">
          {quickLoading ? (
            <svg className="w-5 h-5 text-white animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>
          )}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-slate-900 dark:text-slate-100">
            {quickLoading ? 'Preparando…' : 'Grabar ahora'}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Empieza a grabar al instante. Podrás añadir participantes después.
          </p>
        </div>
      </button>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
        <span className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wider">o programa una reunión</span>
        <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
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