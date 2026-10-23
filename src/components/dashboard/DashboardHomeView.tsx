import Link from 'next/link';
import { PriorityBadge } from '@/components/PriorityBadge';
import MeetingSearch from '@/components/MeetingSearch';
import MeetingRow, { type MeetingRowData } from '@/components/dashboard/MeetingRow';

export interface HomeTask {
  id: string;
  description: string;
  priority?: string | null;
  due_date?: string | null;
  mine?: boolean;
  assignee_name?: string | null;
}

export interface DashboardHomeData {
  name: string;
  totalMeetings: number;
  pendingCount: number;
  completedCount: number;
  processingCount: number;
  meetings: MeetingRowData[];
  tasks: HomeTask[];
  /** Fecha de referencia para «hoy/ayer» (la vista previa de desarrollo la fija). */
  now?: Date;
}

/**
 * Inicio. Separado de la página (que sólo carga los datos) para poder verlo con
 * datos de ejemplo en /dev/preview y comprobarlo en cualquier tamaño de pantalla.
 *
 * Arriba, un bloque de bienvenida con las DOS acciones que importan —grabar y
 * subir— a un toque, que antes vivían una pantalla más allá. Debajo, las cifras
 * en una cinta compacta y, en escritorio, un mosaico: reuniones a la izquierda,
 * compromisos a la derecha, en vez de dos listas apiladas a todo el ancho.
 */
export default function DashboardHomeView(d: DashboardHomeData) {
  const isNew = d.totalMeetings === 0;

  const summary = isNew
    ? 'Graba o sube tu primera reunión y te devolvemos el acta con los compromisos de cada persona.'
    : d.processingCount > 0
      ? `${d.processingCount} minuta${d.processingCount !== 1 ? 's' : ''} en camino · ${d.pendingCount} compromiso${d.pendingCount !== 1 ? 's' : ''} pendiente${d.pendingCount !== 1 ? 's' : ''}`
      : d.pendingCount > 0
        ? `Tienes ${d.pendingCount} compromiso${d.pendingCount !== 1 ? 's' : ''} pendiente${d.pendingCount !== 1 ? 's' : ''}. ¿Grabamos la siguiente?`
        : 'Todo al día. ¿Grabamos la siguiente reunión?';

  const stats = [
    { n: d.totalMeetings, label: 'Reuniones', tone: 'from-blue-500 to-indigo-500', icon: 'M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z', href: '/dashboard/meetings' },
    { n: d.pendingCount, label: 'Pendientes', tone: 'from-amber-500 to-orange-500', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2', href: '/dashboard/action-items' },
    { n: d.completedCount, label: 'Listas', tone: 'from-emerald-500 to-teal-500', icon: 'M5 13l4 4L19 7', href: '/dashboard/meetings' },
    { n: d.processingCount, label: 'En proceso', tone: 'from-violet-500 to-fuchsia-500', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', href: '/dashboard/meetings' },
  ];

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* ── Bienvenida ─────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-[2rem] aurora text-white p-5 sm:p-8 lg:p-10 shadow-xl shadow-indigo-900/20">
        <div aria-hidden className="pointer-events-none absolute -top-20 -right-16 w-72 h-72 rounded-full bg-white/10 blur-2xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-24 left-1/4 w-80 h-80 rounded-full bg-cyan-300/20 blur-3xl" />
        {/* Onda de sonido decorativa: la identidad de la app es la voz. */}
        <svg aria-hidden className="pointer-events-none absolute right-4 top-4 sm:right-8 sm:top-8 w-28 sm:w-40 opacity-25" viewBox="0 0 160 48" fill="none">
          {[6, 18, 30, 12, 40, 24, 44, 16, 34, 10, 26, 38, 14, 30, 8].map((h, i) => (
            <rect key={i} x={i * 11} y={24 - h / 2} width="5" height={h} rx="2.5" fill="white" />
          ))}
        </svg>

        <div className="relative grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] gap-6 lg:gap-10 items-end">
          <div>
            <p className="text-xs sm:text-sm font-medium text-white/70 uppercase tracking-wider">Tu espacio de reuniones</p>
            <h1 className="mt-1 text-[1.75rem] leading-tight sm:text-4xl font-bold tracking-tight font-sora break-words">
              Hola, {d.name} <span className="inline-block origin-bottom-right animate-wave">👋</span>
            </h1>
            <p className="mt-2 text-white/80 text-sm sm:text-base max-w-md leading-relaxed">{summary}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/dashboard/meetings/new?action=record"
              className="group relative rounded-2xl bg-white text-slate-900 p-4 sm:p-5 shadow-lg shadow-indigo-900/20 hover:-translate-y-1 hover:shadow-xl transition-all"
            >
              <span className="relative inline-flex w-11 h-11 rounded-full gradient-primary items-center justify-center">
                <span aria-hidden className="absolute inset-0 rounded-full bg-blue-400/40 animate-ping [animation-duration:2.4s]" />
                <svg className="relative w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                </svg>
              </span>
              <p className="font-semibold mt-3 text-sm sm:text-base">Grabar ahora</p>
              <p className="text-[11px] sm:text-xs text-slate-500">Un toque y empieza</p>
            </Link>
            <Link
              href="/dashboard/meetings/new?action=upload"
              className="group rounded-2xl bg-white/15 backdrop-blur-md border border-white/25 p-4 sm:p-5 hover:bg-white/25 hover:-translate-y-1 transition-all"
            >
              <span className="inline-flex w-11 h-11 rounded-full bg-white/20 items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </span>
              <p className="font-semibold mt-3 text-sm sm:text-base">Subir audio</p>
              <p className="text-[11px] sm:text-xs text-white/70">De tu grabadora</p>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Cifras ─────────────────────────────────────────────────────── */}
      {!isNew && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {stats.map((s) => (
            <Link key={s.label} href={s.href} className="surface p-3.5 sm:p-4 flex items-center gap-3 hover:-translate-y-0.5 hover:shadow-lg transition-all">
              <span className={`w-10 h-10 shrink-0 rounded-xl bg-gradient-to-br ${s.tone} flex items-center justify-center shadow-sm`}>
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d={s.icon} />
                </svg>
              </span>
              <span className="min-w-0">
                <span className="block text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 leading-none tabular-nums">{s.n}</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">{s.label}</span>
              </span>
            </Link>
          ))}
        </div>
      )}

      {/* ── Primeros pasos (sólo sin reuniones) ────────────────────────── */}
      {isNew && (
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { n: '1', title: 'Graba o sube', text: 'Desde la app, o desde la grabadora de tu teléfono.' },
            { n: '2', title: 'La IA trabaja', text: 'Transcribe y redacta el acta mientras haces otra cosa.' },
            { n: '3', title: 'Recibe el acta', text: 'Con los compromisos de cada persona, lista para compartir.' },
          ].map((step) => (
            <div key={step.n} className="surface p-5">
              <span className="inline-flex w-8 h-8 rounded-full border-gradient items-center justify-center text-sm font-bold text-blue-600 dark:text-blue-300">
                {step.n}
              </span>
              <p className="font-semibold text-slate-900 dark:text-slate-100 mt-3">{step.title}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{step.text}</p>
            </div>
          ))}
        </section>
      )}

      {!isNew && (
        <div data-tour="search">
          <MeetingSearch />
        </div>
      )}

      {/* ── Mosaico: reuniones + compromisos ───────────────────────────── */}
      {!isNew && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <section className="lg:col-span-2 min-w-0">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Reuniones recientes</h2>
              <Link href="/dashboard/meetings" className="text-sm text-blue-600 dark:text-blue-400 font-medium hover:underline underline-offset-4">
                Ver todas
              </Link>
            </div>
            <div className="space-y-2.5">
              {d.meetings.map((m) => (
                <MeetingRow key={m.id} meeting={m} now={d.now} />
              ))}
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Compromisos</h2>
              <Link href="/dashboard/action-items" className="text-sm text-blue-600 dark:text-blue-400 font-medium hover:underline underline-offset-4">
                Ver todos
              </Link>
            </div>
            {d.tasks.length > 0 ? (
              <ul className="surface divide-y divide-slate-200/70 dark:divide-slate-700/60 overflow-hidden">
                {d.tasks.map((t) => (
                  <li key={t.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100 leading-snug">{t.description}</p>
                      <PriorityBadge priority={t.priority} />
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                      {t.mine ? 'A tu nombre' : `Responsable: ${t.assignee_name || 'sin asignar'}`}
                      {t.due_date &&
                        ` · vence ${new Date(`${t.due_date}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="surface p-6 text-center">
                <p className="text-3xl" aria-hidden>🎉</p>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">Sin compromisos pendientes</p>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
