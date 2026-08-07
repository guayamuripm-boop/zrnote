'use client';

import { useState } from 'react';

/**
 * Botón de baja para quien abre el enlace en el navegador.
 *
 * Va por POST al mismo endpoint que usan los clientes de correo para la baja de
 * un clic. Deliberadamente NO se da de baja al cargar la página: un prefetch
 * del navegador, un antivirus corporativo o el escáner de enlaces del propio
 * correo abren las URLs sin que nadie las pulse, y darían de baja a gente que
 * no quería.
 */
export default function UnsubscribeForm({ token, email }: { token: string; email: string }) {
  const [estado, setEstado] = useState<'inicial' | 'enviando' | 'hecho' | 'error'>('inicial');
  const [error, setError] = useState('');

  const darDeBaja = async () => {
    setEstado('enviando');
    try {
      const res = await fetch(`/api/baja/${token}`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.reason || `Error ${res.status}`);
      setEstado('hecho');
    } catch (e: any) {
      setError(e?.message || 'No se pudo completar la baja.');
      setEstado('error');
    }
  };

  if (estado === 'hecho') {
    return (
      <div className="text-center">
        <div className="w-12 h-12 rounded-2xl gradient-success flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">Listo</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
          No volveremos a escribir a <strong className="text-slate-700 dark:text-slate-200">{email}</strong>.
        </p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-4 leading-relaxed">
          Si cambias de idea, pídele a quien organiza las reuniones que te vuelva a dar de alta.
        </p>
      </div>
    );
  }

  return (
    <div className="text-center">
      <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">
        ¿Dejar de recibir minutas?
      </h1>
      <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-6">
        Dejaremos de escribir a <strong className="text-slate-700 dark:text-slate-200">{email}</strong>.
        Esto incluye las minutas de reuniones y los recordatorios de tus compromisos.
      </p>

      <button
        onClick={darDeBaja}
        disabled={estado === 'enviando'}
        className="w-full bg-rose-600 hover:bg-rose-700 text-white px-6 py-3 rounded-xl font-medium transition disabled:opacity-50"
      >
        {estado === 'enviando' ? 'Dándote de baja…' : 'Sí, darme de baja'}
      </button>

      {estado === 'error' && (
        <p className="text-xs text-rose-600 dark:text-rose-400 mt-3">{error}</p>
      )}

      <p className="text-xs text-slate-400 dark:text-slate-500 mt-4">
        Si sólo era una reunión concreta, quizá te interese más avisar a quien la convocó.
      </p>
    </div>
  );
}
