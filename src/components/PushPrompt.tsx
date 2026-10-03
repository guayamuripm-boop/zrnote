'use client';

import { useEffect, useState } from 'react';
import { isPushSupported, getPushPermission, enablePush } from '@/lib/push-notifications';

/**
 * «Avísame cuando esté lista»: se muestra mientras se genera la minuta, que es
 * el único momento en que el usuario entiende para qué sirve una notificación.
 * Escondida en Perfil nadie la activaba. No aparece si ya está activa, si el
 * navegador no lo soporta o si el permiso está bloqueado.
 */
export default function PushPrompt() {
  const [show, setShow] = useState(false);
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');

  useEffect(() => {
    (async () => {
      if (!(await isPushSupported())) return;
      if ((await getPushPermission()) === 'default') setShow(true);
    })();
  }, []);

  if (!show) return null;
  if (state === 'done') {
    return <p className="text-xs text-emerald-600 dark:text-emerald-400 text-center mt-3">✅ Te avisaremos cuando esté lista.</p>;
  }

  return (
    <div className="mt-4 text-center">
      <button
        onClick={async () => {
          setState('busy');
          const r = await enablePush();
          setState(r === 'granted' ? 'done' : 'error');
        }}
        disabled={state === 'busy'}
        className="text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 px-3 py-1.5 rounded-lg transition disabled:opacity-60"
      >
        🔔 Avísame cuando esté lista
      </button>
      {state === 'error' && (
        <p className="text-[11px] text-rose-500 mt-1">No se pudo activar. Puedes hacerlo luego desde Perfil.</p>
      )}
    </div>
  );
}
