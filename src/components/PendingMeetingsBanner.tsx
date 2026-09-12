'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { allPendingMeetings, type PendingMeeting } from '@/lib/meeting-queue';

/**
 * A meeting created offline (see meeting-queue.ts) does not exist on the
 * server until it syncs — which means the normal "Reuniones" list, which
 * reads from the server, cannot show it. If the tab is closed before that
 * first sync ever happens, the meeting would otherwise be invisible: not in
 * the list, not reachable from anywhere, its audio safely on the device and
 * effectively lost anyway because nobody could find their way back to it.
 *
 * This reads the same local queue directly, so it is the one place such a
 * meeting is always discoverable regardless of whether the server has ever
 * heard of it.
 */
export default function PendingMeetingsBanner() {
  const [pending, setPending] = useState<PendingMeeting[]>([]);

  useEffect(() => {
    void allPendingMeetings().then(setPending);
  }, []);

  if (pending.length === 0) return null;

  return (
    <div className="glass-strong rounded-2xl p-4 space-y-2 border border-amber-200 dark:border-amber-800/40">
      <p className="text-xs font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
        <span>📴</span> Grabada(s) sin conexión, pendiente(s) de sincronizar
      </p>
      {pending.map((m) => (
        <Link
          key={m.id}
          href={`/dashboard/meetings/${m.id}/record`}
          className="block rounded-xl bg-amber-50/60 dark:bg-amber-900/15 px-3 py-2 hover:bg-amber-50 dark:hover:bg-amber-900/25 transition"
        >
          <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{m.title}</span>
          <span className="block text-xs text-slate-500 dark:text-slate-400">
            {new Date(m.createdAt).toLocaleString('es-ES')} · toca para retomarla
          </span>
        </Link>
      ))}
    </div>
  );
}
