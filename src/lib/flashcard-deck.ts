// La aritmética del mazo de tarjetas con repetición espaciada (Leitner simplificado).
//
// Tres cajas en vez de un binario "sabe / no sabe":
//   Caja 1 (nueva/difícil) → se repasa primero y más seguido
//   Caja 2 (aprendiendo)  → aparece después de las de caja 1
//   Caja 3 (dominada)     → solo repaso espaciado
//
// Respuesta "Difícil" → baja a caja 1
// Respuesta "Bien"    → sube una caja (o se queda en 3)
// Respuesta "Fácil"   → sube a caja 3 directo
//
// El orden de presentación es: todas las de caja 1, luego caja 2, luego caja 3.
// Dentro de cada caja se mantiene el orden del mazo (o barajado).

export type LeitnerBox = 1 | 2 | 3;

export interface LeitnerState {
  /** Caja de cada tarjeta, indexada por posición en el mazo original. */
  boxes: Record<number, LeitnerBox>;
  /** Cuántas veces se ha repasado cada tarjeta. */
  reps: Record<number, number>;
}

export function emptyLeitnerState(): LeitnerState {
  return { boxes: {}, reps: {} };
}

export function getBox(state: LeitnerState, index: number): LeitnerBox {
  return state.boxes[index] ?? 1;
}

export function getReps(state: LeitnerState, index: number): number {
  return state.reps[index] ?? 0;
}

export function answerCard(
  state: LeitnerState,
  index: number,
  difficulty: 'hard' | 'ok' | 'easy',
): LeitnerState {
  const currentBox = getBox(state, index);
  let newBox: LeitnerBox;
  if (difficulty === 'hard') {
    newBox = 1;
  } else if (difficulty === 'easy') {
    newBox = 3;
  } else {
    newBox = Math.min(currentBox + 1, 3) as LeitnerBox;
  }
  return {
    boxes: { ...state.boxes, [index]: newBox },
    reps: { ...state.reps, [index]: getReps(state, index) + 1 },
  };
}

export function countByBox(state: LeitnerState, total: number): Record<LeitnerBox, number> {
  const counts: Record<LeitnerBox, number> = { 1: 0, 2: 0, 3: 0 };
  for (let i = 0; i < total; i++) {
    counts[getBox(state, i)]++;
  }
  return counts;
}

/** Ordena los índices del mazo priorizando caja 1 > 2 > 3. */
export function leitnerOrder(order: number[], state: LeitnerState): number[] {
  return [...order].sort((a, b) => getBox(state, a) - getBox(state, b));
}

/** Las tarjetas que quedan por dominar (caja < 3), en el orden actual del mazo. */
export function pendingIndexes(order: number[], known: Set<number>): number[] {
  return order.filter((i) => !known.has(i));
}

export function clampPosition(position: number, pendingLength: number): number {
  if (pendingLength <= 0) return 0;
  return ((position % pendingLength) + pendingLength) % pendingLength;
}

export function stepPosition(position: number, delta: number, pendingLength: number): number {
  if (pendingLength <= 0) return 0;
  return clampPosition(clampPosition(position, pendingLength) + delta, pendingLength);
}

export function positionAfterKnown(position: number, pendingLength: number): number {
  const remaining = pendingLength - 1;
  if (remaining <= 0) return 0;
  return clampPosition(position, pendingLength) % remaining;
}

export function shuffleOrder(order: number[], rng: () => number = Math.random): number[] {
  const out = [...order];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function sanitizeKnown(raw: unknown, total: number): Set<number> {
  if (!Array.isArray(raw)) return new Set();
  return new Set(
    raw.filter((n): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < total),
  );
}

export function sanitizeLeitnerState(raw: unknown, total: number): LeitnerState {
  if (!raw || typeof raw !== 'object') return emptyLeitnerState();
  const o = raw as Record<string, unknown>;

  const boxes: Record<number, LeitnerBox> = {};
  const reps: Record<number, number> = {};

  if (o.boxes && typeof o.boxes === 'object') {
    for (const [k, v] of Object.entries(o.boxes as Record<string, unknown>)) {
      const idx = Number(k);
      if (Number.isInteger(idx) && idx >= 0 && idx < total && (v === 1 || v === 2 || v === 3)) {
        boxes[idx] = v;
      }
    }
  }

  if (o.reps && typeof o.reps === 'object') {
    for (const [k, v] of Object.entries(o.reps as Record<string, unknown>)) {
      const idx = Number(k);
      if (Number.isInteger(idx) && idx >= 0 && idx < total && typeof v === 'number' && v >= 0) {
        reps[idx] = Math.floor(v);
      }
    }
  }

  return { boxes, reps };
}
