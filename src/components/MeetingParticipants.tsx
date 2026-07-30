'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Participant {
  name: string;
  email: string;
}

/**
 * Add / remove the people who receive the minute, AFTER the meeting exists.
 *
 * "Grabar ahora" creates a meeting with no participants and promises you can
 * add them later — but there was no UI for it anywhere, so those recordings
 * could never e-mail anyone.
 */
export default function MeetingParticipants({
  meetingId,
  initialParticipants,
  creatorEmail,
}: {
  meetingId: string;
  initialParticipants: Participant[];
  creatorEmail?: string;
}) {
  const router = useRouter();
  const [participants, setParticipants] = useState<Participant[]>(initialParticipants);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [open, setOpen] = useState(initialParticipants.length === 0);

  const guests = participants.filter(
    (p) => !creatorEmail || p.email.toLowerCase() !== creatorEmail.toLowerCase(),
  );

  const add = () => {
    const n = name.trim();
    const e = email.trim();
    if (!n || !e.includes('@')) {
      setMessage({ kind: 'error', text: 'Escribe un nombre y un correo válido.' });
      return;
    }
    if (participants.some((p) => p.email.toLowerCase() === e.toLowerCase())) {
      setMessage({ kind: 'error', text: 'Esa persona ya está en la lista.' });
      return;
    }
    setParticipants([...participants, { name: n, email: e }]);
    setName('');
    setEmail('');
    setMessage(null);
  };

  const remove = (target: string) =>
    setParticipants(participants.filter((p) => p.email !== target));

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/meetings/${meetingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participants: guests }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'No se pudo guardar');
      }
      setMessage({ kind: 'ok', text: 'Participantes guardados.' });
      router.refresh();
    } catch (e: any) {
      setMessage({ kind: 'error', text: e?.message || 'No se pudo guardar.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="glass-strong rounded-2xl p-5 sm:p-6 shadow-elevated space-y-4">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-3 text-left"
      >
        <div>
          <h2 className="text-sm font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">
            Participantes
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
            {guests.length === 0
              ? 'Nadie más recibirá la minuta por correo'
              : `${guests.length} persona${guests.length !== 1 ? 's' : ''} recibirá la minuta`}
          </p>
        </div>
        <svg
          className={`w-5 h-5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="space-y-4">
          {guests.length > 0 && (
            <div className="space-y-2">
              {guests.map((p) => (
                <div key={p.email} className="glass rounded-xl px-3 py-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-slate-900 dark:text-slate-100 truncate">{p.name}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{p.email}</p>
                  </div>
                  <button
                    onClick={() => remove(p.email)}
                    className="text-slate-400 hover:text-rose-500 transition shrink-0"
                    aria-label={`Quitar a ${p.name}`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre"
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
              className="flex-1 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 bg-white/80 dark:bg-white/5 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition text-base min-w-0"
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="correo@ejemplo.com"
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
              className="flex-1 sm:flex-[2] border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 bg-white/80 dark:bg-white/5 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition text-base min-w-0"
            />
            <button
              onClick={add}
              className="gradient-primary text-white px-4 py-2.5 rounded-xl text-sm font-medium shrink-0"
            >
              + Agregar
            </button>
          </div>

          {message && (
            <p className={`text-sm ${message.kind === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
              {message.text}
            </p>
          )}

          <button
            onClick={save}
            disabled={saving}
            className="w-full sm:w-auto glass border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-white/80 dark:hover:bg-white/5 transition disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Guardar participantes'}
          </button>
        </div>
      )}
    </section>
  );
}
