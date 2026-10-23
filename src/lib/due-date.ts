/**
 * Vencimiento de un compromiso, por días de calendario.
 *
 * `due_date` es una fecha sin hora (`2026-10-24`). Se interpreta a mediodía
 * LOCAL —como ya hacía la app— para que ninguna zona horaria la mueva al día de
 * al lado, y se compara con «hoy» del dispositivo, no del servidor: por eso
 * conviene llamar a esto en el navegador.
 */

export type DueBucket = 'overdue' | 'today' | 'week' | 'later' | 'none';

const DAY = 86_400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

function parseDue(due: string | null | undefined): Date | null {
  if (!due) return null;
  const d = new Date(`${due.slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Días desde hoy hasta el vencimiento (negativo = ya venció). null sin fecha. */
export function daysUntilDue(due: string | null | undefined, now: Date = new Date()): number | null {
  const d = parseDue(due);
  if (!d) return null;
  return Math.round((startOfDay(d) - startOfDay(now)) / DAY);
}

export function dueBucket(due: string | null | undefined, now: Date = new Date()): DueBucket {
  const days = daysUntilDue(due, now);
  if (days === null) return 'none';
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  if (days < 7) return 'week';
  return 'later';
}

export function dueLabel(due: string | null | undefined, now: Date = new Date()): string {
  const days = daysUntilDue(due, now);
  if (days === null) return '';
  if (days === -1) return 'Venció ayer';
  if (days < 0) return `Venció hace ${-days} días`;
  if (days === 0) return 'Vence hoy';
  if (days === 1) return 'Vence mañana';
  if (days < 7) return `Vence en ${days} días`;
  const d = parseDue(due)!;
  return `Vence el ${d.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  })}`;
}
