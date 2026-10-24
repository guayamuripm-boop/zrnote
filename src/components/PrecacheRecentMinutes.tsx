'use client';

import { useEffect } from 'react';
import { cacheMinute } from '@/lib/minute-cache';

/**
 * Invisible. Al entrar al panel CON señal, guarda en silencio las últimas
 * minutas completadas en el teléfono, para que /notas-sin-conexion tenga algo
 * que mostrar aunque el usuario no las haya abierto una por una.
 *
 * Es el complemento de CacheMinuteForOffline: aquél guarda lo que miras, éste
 * se adelanta a lo reciente. Todo es mejor-esfuerzo: si falla, leer offline
 * sigue funcionando con lo que ya hubiera; nunca debe estorbar.
 */
export default function PrecacheRecentMinutes({ userId }: { userId: string }) {
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    let cancelled = false;

    const run = async () => {
      try {
        const res = await fetch('/api/meetings/offline-bundle');
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled || !Array.isArray(data?.minutes)) return;
        for (const m of data.minutes) {
          if (cancelled) return;
          await cacheMinute({
            userId,
            meetingId: m.meetingId,
            title: m.title,
            coordination: m.coordination ?? null,
            createdAt: m.createdAt,
            summary: m.summary ?? null,
            topics: Array.isArray(m.topics) ? m.topics : [],
            decisions: Array.isArray(m.decisions) ? m.decisions : [],
            changes: Array.isArray(m.changes) ? m.changes : [],
            nextSteps: Array.isArray(m.nextSteps) ? m.nextSteps : [],
            actionItems: Array.isArray(m.actionItems) ? m.actionItems : [],
            participants: Array.isArray(m.participants) ? m.participants : [],
          });
        }
      } catch {
        /* mejor-esfuerzo: leer offline es un extra, nunca un error visible */
      }
    };

    // Un pequeño retardo para no competir con la carga inicial del panel.
    const timer = setTimeout(run, 2500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [userId]);

  return null;
}
