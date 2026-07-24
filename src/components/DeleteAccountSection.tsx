'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// The DELETE endpoint (src/app/api/user/delete/route.ts) already existed and
// permanently erases the account + all owned data (GDPR-style), but had no UI
// entry point. Gated behind a password re-check (server-side) + this in-app
// confirm modal — never a native confirm().
export default function DeleteAccountSection() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const close = () => {
    setOpen(false);
    setPassword('');
    setError(null);
  };

  const handleDelete = async () => {
    if (!password) {
      setError('Ingresa tu contraseña para confirmar.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/user/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: 'DELETE_MY_ACCOUNT', password }),
      });
      if (res.ok) {
        router.push('/login');
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'No se pudo eliminar la cuenta.');
    } catch {
      setError('Error de conexión.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
      <button
        onClick={() => setOpen(true)}
        className="text-sm text-slate-400 dark:text-slate-500 hover:text-rose-500 dark:hover:text-rose-400 transition"
      >
        Eliminar mi cuenta permanentemente
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" onClick={close}>
          <div className="glass-strong rounded-2xl p-6 shadow-float max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">Eliminar cuenta permanentemente</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              Se borrarán tus reuniones, minutas, tareas y audios. Esta acción NO se puede deshacer.
            </p>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Confirma tu contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Tu contraseña"
              autoFocus
              className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 bg-white/80 dark:bg-white/5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-500/30 mb-1.5"
            />
            {error && <p className="text-xs text-rose-500 mb-3">{error}</p>}
            <div className="flex gap-3 mt-4">
              <button
                onClick={close}
                disabled={loading}
                className="flex-1 glass border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 py-2.5 rounded-xl text-sm font-medium hover:bg-white/80 dark:hover:bg-white/5 transition-all disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={loading}
                className="flex-1 gradient-error text-white py-2.5 rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-rose-500/25 transition-all disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                {loading && (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
                Eliminar cuenta
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
