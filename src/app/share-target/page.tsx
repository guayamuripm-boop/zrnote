'use client';

// Aterrizaje del Web Share Target.
//
// A esta página llega el usuario después de que el service worker haya
// interceptado el POST del share sheet (ver public/sw.js → handleShareTarget)
// y haya guardado el audio en un IndexedDB dedicado (share-stash.ts).
//
// El único trabajo aquí es:
//   1. Sacar el fichero del depósito.
//   2. Crear una reunión con título automático (mismo estilo que
//      "Grabar ahora" y "Ya tengo el audio grabado" en NewMeetingForm).
//   3. Empujar al usuario a /dashboard/meetings/{id}/upload?shared=1 —
//      la página de subida sabe leer el mismo depósito y precarga el
//      fichero sola, sin que el usuario tenga que elegirlo otra vez.
//
// SIN CUENTA: si /api/meetings responde 401, se redirige a /login con
// returnTo=/share-target. Al volver, la página vuelve a ejecutarse y el
// fichero sigue en el depósito porque nunca se limpia aquí (sólo la
// página de subida lo limpia, una vez cargado).

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { readSharedAudio } from '@/lib/share-stash';
import ZRLogo from '@/components/ZRLogo';

type Stage = 'reading' | 'creating' | 'redirecting' | 'empty' | 'error';

const STAGE_TEXT: Record<Stage, string> = {
  reading: 'Recibiendo el audio compartido…',
  creating: 'Creando la reunión…',
  redirecting: 'Abriendo la subida…',
  empty: 'No encontramos el audio compartido. Prueba a compartirlo de nuevo desde tu grabadora.',
  error: 'No pudimos crear la reunión. Ve a Nueva Reunión → «Ya tengo el audio grabado» y sube el archivo desde ahí.',
};

export default function ShareTargetPage() {
  const [stage, setStage] = useState<Stage>('reading');
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const shared = await readSharedAudio();
      if (cancelled) return;

      if (!shared) {
        setStage('empty');
        return;
      }

      setStage('creating');
      const now = new Date();
      const autoTitle = `Grabación ${now.toLocaleDateString('es', { day: 'numeric', month: 'short' })} ${now.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`;

      try {
        const res = await fetch('/api/meetings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: autoTitle,
            coordination: '',
            type: 'presencial',
            participants: [],
            autoTitle: true,
          }),
        });

        if (res.status === 401) {
          // Sin sesión: se envía al login con retorno a esta misma página.
          // El fichero sigue en el depósito, así que al volver se reintenta.
          router.replace(`/login?returnTo=${encodeURIComponent('/share-target')}`);
          return;
        }

        if (!res.ok) {
          setStage('error');
          return;
        }

        const { id } = await res.json();
        if (cancelled) return;
        setStage('redirecting');
        router.replace(`/dashboard/meetings/${id}/upload?shared=1`);
      } catch {
        if (!cancelled) setStage('error');
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="min-h-screen gradient-mesh flex items-center justify-center p-4">
      <div className="glass-strong rounded-3xl p-8 sm:p-10 max-w-md w-full text-center shadow-float space-y-5">
        <div className="flex justify-center">
          <ZRLogo className="w-12 h-12 rounded-2xl shadow" />
        </div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          {stage === 'empty' || stage === 'error' ? 'Algo se salió del guion' : 'Preparando tu audio'}
        </h1>
        {(stage === 'reading' || stage === 'creating' || stage === 'redirecting') && (
          <div className="flex justify-center">
            <svg className="w-6 h-6 text-blue-500 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        )}
        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{STAGE_TEXT[stage]}</p>
        {(stage === 'empty' || stage === 'error') && (
          <a
            href="/dashboard/meetings/new"
            className="inline-block gradient-primary text-white px-4 py-2 rounded-xl text-sm font-medium hover:shadow-lg transition-all"
          >
            Ir a Nueva Reunión
          </a>
        )}
      </div>
    </main>
  );
}
