'use client';

import { useEffect, useRef, useState } from 'react';
import { PriorityBadge } from '@/components/PriorityBadge';

const TRANSCRIPT_SAMPLE =
  'bueno entonces quedamos que ana envía la cotización de materiales antes del viernes... este, y luis dijo que él se encarga de contactar al proveedor la próxima semana, ah y el presupuesto final lo vemos en la próxima reunión';

const COMMITMENTS = [
  { name: 'Ana Torres', task: 'Enviar la cotización de materiales al proveedor', priority: 'alta', due: 'vie 8 ago' },
  { name: 'Luis Ramírez', task: 'Contactar al proveedor para coordinar la entrega', priority: 'media', due: 'por definir' },
];

/**
 * Demo interactiva de "audio hablado → acta estructurada".
 *
 * Es un ejemplo fijo, no una llamada real al modelo: hacerlo con la IA de
 * verdad en la landing pública costaría dinero por cada visita y sería lento.
 * Se etiqueta como "Ejemplo" en la UI para que quede claro que no es un
 * fragmento de una reunión real de un cliente.
 */
export default function LiveDemo() {
  const [tab, setTab] = useState<'audio' | 'acta'>('audio');
  const [typed, setTyped] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let i = 0;
    const id = setInterval(() => {
      i += 2;
      setTyped(TRANSCRIPT_SAMPLE.slice(0, i));
      if (i >= TRANSCRIPT_SAMPLE.length) clearInterval(id);
    }, 28);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="glass-strong rounded-3xl shadow-float overflow-hidden">
      <div className="flex items-center justify-between px-5 sm:px-6 pt-5 sm:pt-6">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Ejemplo
        </span>
        <div className="inline-flex glass rounded-xl p-1">
          <button
            type="button"
            onClick={() => setTab('audio')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              tab === 'audio' ? 'gradient-primary text-white shadow' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            🎙️ Lo que se dijo
          </button>
          <button
            type="button"
            onClick={() => setTab('acta')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              tab === 'acta' ? 'gradient-primary text-white shadow' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            ✨ Acta generada
          </button>
        </div>
      </div>

      <div className="p-5 sm:p-6 min-h-[280px]">
        {tab === 'audio' ? (
          <div className="glass rounded-2xl p-5 sm:p-6 h-full">
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">Transcripción automática del audio</p>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed font-mono text-sm">
              {typed}
              <span className="inline-block w-1.5 h-4 bg-blue-500 ml-0.5 align-middle animate-pulse" />
            </p>
            <button
              type="button"
              onClick={() => setTab('acta')}
              className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              Ver el acta que redacta la IA
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-1.5">
                Resumen
              </p>
              <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                Se revisó el avance de compras del proyecto. Ana enviará la cotización de materiales y
                Luis contactará al proveedor; el presupuesto final queda para la próxima reunión.
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-2">
                Compromisos
              </p>
              <div className="space-y-2">
                {COMMITMENTS.map((c) => (
                  <div key={c.name} className="glass rounded-xl p-3.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{c.task}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {c.name} · vence {c.due}
                      </p>
                    </div>
                    <PriorityBadge priority={c.priority} />
                  </div>
                ))}
              </div>
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500 pt-1">
              Ana y Luis reciben, cada uno, un correo solo con lo suyo. Sin crear cuenta.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
