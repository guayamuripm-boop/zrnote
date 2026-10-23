/**
 * «hoy», «ayer», «hace 3 días»… y la fecha corta pasada la semana.
 *
 * Una lista de reuniones se lee por cercanía («la de ayer»), no por fecha
 * exacta; la fecha completa sólo ayuda cuando ya pasó un tiempo. Se compara por
 * DÍA de calendario, no por horas: algo de anoche a las 23:00 es «ayer» aunque
 * hayan pasado dos horas.
 */
export function relativeDate(iso: string | Date, now: Date = new Date()): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(date.getTime())) return '';

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);

  if (days <= 0) return 'hoy';
  if (days === 1) return 'ayer';
  if (days < 7) return `hace ${days} días`;

  return date.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  });
}
