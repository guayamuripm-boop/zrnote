'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

/**
 * Aviso honesto de «sin conexión», no bloqueante: una franja fina que aparece
 * sólo cuando el dispositivo está offline y desaparece sola al volver la señal.
 *
 * Reemplaza el silencio de antes (donde sólo te enterabas al fallar algo) por
 * un aviso proactivo que, además, te lleva a lo que SÍ funciona sin señal:
 * leer tus minutas guardadas. Transcribir y generar minutas necesita internet,
 * y lo dice claro en vez de dejarte esperando un error.
 */
export default function OfflineIndicator() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(typeof navigator !== 'undefined' && navigator.onLine === false);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl border border-amber-300 dark:border-amber-700/50 bg-amber-50 dark:bg-amber-900/20 px-4 py-2.5 text-sm"
    >
      <span className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636a9 9 0 010 12.728m-12.728 0a9 9 0 010-12.728m9.9 2.829a5 5 0 010 7.07m-7.07 0a5 5 0 010-7.07M13 12a1 1 0 11-2 0 1 1 0 012 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4l16 16" />
        </svg>
        <span className="font-medium">Sin conexión.</span>
        <span className="text-amber-700 dark:text-amber-400">Transcribir y generar minutas se reanuda solo al volver la señal.</span>
      </span>
      <Link
        href="/notas-sin-conexion"
        className="ml-auto font-semibold text-amber-900 dark:text-amber-200 underline underline-offset-2 whitespace-nowrap"
      >
        Leer sin conexión
      </Link>
    </div>
  );
}
