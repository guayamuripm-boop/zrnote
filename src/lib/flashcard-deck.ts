// La aritmética del mazo de tarjetas, fuera del componente.
//
// POR QUÉ ESTÁ AQUÍ Y NO DENTRO DE `StudySection`
// Es la parte del modo estudio que más fácil se rompe sin que se note: el
// índice de la tarjeta actual apunta a una lista —las que quedan por saber—
// que se ENCOGE cada vez que el estudiante pulsa "Me la sé". Un `position + 1`
// ingenuo en ese momento salta una tarjeta, y saltarse tarjetas en una app de
// estudio es un fallo silencioso: nadie lo reporta, simplemente no se aprende
// lo que se saltó. Aquí son funciones puras y se pueden probar; dentro de un
// componente de cliente harían falta dependencias de renderizado para llegar a
// ellas.

/** Las tarjetas que quedan por dominar, en el orden actual del mazo. */
export function pendingIndexes(order: number[], known: Set<number>): number[] {
  return order.filter((i) => !known.has(i));
}

/**
 * El índice válido dentro del mazo pendiente.
 *
 * La posición guardada puede haberse quedado fuera: se marcan tarjetas como
 * sabidas y el mazo encoge por debajo de ella. Volver al principio es la
 * respuesta correcta — no hay "siguiente" cuando ya se pasó del final.
 */
export function clampPosition(position: number, pendingLength: number): number {
  if (pendingLength <= 0) return 0;
  // El módulo de un negativo es negativo en JS, así que se normaliza.
  return ((position % pendingLength) + pendingLength) % pendingLength;
}

/** Avanzar o retroceder, dando la vuelta por los extremos. */
export function stepPosition(position: number, delta: number, pendingLength: number): number {
  if (pendingLength <= 0) return 0;
  return clampPosition(clampPosition(position, pendingLength) + delta, pendingLength);
}

/**
 * Dónde queda el cursor tras marcar la tarjeta actual como sabida.
 *
 * NO se avanza: al salir esta tarjeta del mazo, la siguiente ocupa esta misma
 * posición, así que sumar 1 además se saltaría una. La única corrección es
 * cuando la marcada era la última: entonces el cursor se sale y vuelve al
 * principio.
 *
 * @param position       posición actual (ya dentro del mazo)
 * @param pendingLength  tamaño del mazo ANTES de marcarla
 */
export function positionAfterKnown(position: number, pendingLength: number): number {
  const remaining = pendingLength - 1;
  if (remaining <= 0) return 0;
  return clampPosition(position, pendingLength) % remaining;
}

/**
 * Baraja (Fisher-Yates) sin tocar el array de entrada.
 *
 * `rng` se inyecta para poder probar el resultado; en la aplicación es
 * `Math.random`.
 */
export function shuffleOrder(order: number[], rng: () => number = Math.random): number[] {
  const out = [...order];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * El progreso leído de localStorage, saneado.
 *
 * Lo que hay guardado puede ser de una versión anterior del acta: si se volvió
 * a analizar la reunión y ahora hay cinco tarjetas en vez de veinte, los
 * índices viejos apuntarían fuera del mazo y el contador diría "8 de 5".
 * También puede ser cualquier otra cosa: la clave es editable por quien tenga
 * la consola del navegador abierta.
 */
export function sanitizeKnown(raw: unknown, total: number): Set<number> {
  if (!Array.isArray(raw)) return new Set();
  return new Set(
    raw.filter((n): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < total),
  );
}
