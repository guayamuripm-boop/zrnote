import Link from 'next/link';
import { StatusBadge } from '@/components/StatusBadge';
import { relativeDate } from '@/lib/relative-date';

/** Franja de color a la izquierda según el estado: se lee de un vistazo. */
const RAIL: Record<string, string> = {
  completed: 'bg-emerald-500',
  processing: 'bg-amber-500',
  failed: 'bg-rose-500',
  scheduled: 'bg-blue-500',
  recording: 'bg-violet-500',
};

export interface MeetingRowData {
  id: string;
  title: string;
  status: string;
  created_at: string;
  coordination?: string | null;
}

/**
 * Una reunión en una lista (inicio y «Reuniones»). `meta` añade piezas a la
 * línea de datos (etiquetas, «sin guardar»…): esa línea hace salto de línea en
 * vez de desbordarse, que era lo que rompía la lista en pantallas estrechas.
 */
export default function MeetingRow({
  meeting,
  meta,
  now,
}: {
  meeting: MeetingRowData;
  meta?: React.ReactNode;
  /** Fecha de referencia para «hoy/ayer» (la vista previa la fija). */
  now?: Date;
}) {
  return (
    <Link
      href={`/dashboard/meetings/${meeting.id}`}
      className="group relative flex items-center gap-3 surface p-4 pl-5 hover:-translate-y-0.5 hover:shadow-lg transition-all duration-300 overflow-hidden"
    >
      <span
        aria-hidden
        className={`absolute left-0 top-3 bottom-3 w-1 rounded-r-full ${RAIL[meeting.status] || 'bg-slate-300 dark:bg-slate-600'}`}
      />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-slate-900 dark:text-slate-100 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
          {meeting.title}
        </p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-xs text-slate-500 dark:text-slate-400">
          {meeting.coordination && (
            <span className="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full max-w-[12rem] truncate">
              {meeting.coordination}
            </span>
          )}
          {meta}
          <span className="whitespace-nowrap">{relativeDate(meeting.created_at, now)}</span>
        </div>
      </div>
      <div className="shrink-0">
        <StatusBadge status={meeting.status} />
      </div>
    </Link>
  );
}
