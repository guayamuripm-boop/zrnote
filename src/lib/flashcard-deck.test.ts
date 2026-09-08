import { describe, it, expect } from 'vitest';
import {
  pendingIndexes,
  clampPosition,
  stepPosition,
  positionAfterKnown,
  shuffleOrder,
  sanitizeKnown,
} from './flashcard-deck';

describe('pendingIndexes', () => {
  it('quita las dominadas y respeta el orden del mazo', () => {
    expect(pendingIndexes([3, 0, 1, 2], new Set([0, 2]))).toEqual([3, 1]);
  });

  it('el mazo entero cuando no se sabe ninguna', () => {
    expect(pendingIndexes([0, 1, 2], new Set())).toEqual([0, 1, 2]);
  });
});

describe('clampPosition', () => {
  it('deja en paz una posición válida', () => {
    expect(clampPosition(2, 5)).toBe(2);
  });

  it('vuelve al principio cuando el mazo encogió por debajo del cursor', () => {
    expect(clampPosition(7, 3)).toBe(1);
  });

  it('un mazo vacío siempre da 0, sin dividir por cero', () => {
    expect(clampPosition(4, 0)).toBe(0);
    expect(clampPosition(0, 0)).toBe(0);
  });

  it('normaliza los negativos (el módulo de JS no lo hace)', () => {
    // -1 % 3 es -1 en JavaScript, y un índice negativo daría `undefined`
    // al leer la tarjeta: pantalla en blanco al pulsar "anterior" en la primera.
    expect(clampPosition(-1, 3)).toBe(2);
  });
});

describe('stepPosition', () => {
  it('avanza y retrocede dando la vuelta', () => {
    expect(stepPosition(0, 1, 3)).toBe(1);
    expect(stepPosition(2, 1, 3)).toBe(0);
    expect(stepPosition(0, -1, 3)).toBe(2);
  });

  it('parte de la posición saneada, no de la cruda', () => {
    // Este es el fallo original: tras marcar tarjetas, el cursor crudo puede
    // haberse quedado fuera del mazo. Sumarle 1 a un 7 en un mazo de 3 saltaba
    // a un sitio arbitrario en vez de a la siguiente tarjeta.
    expect(stepPosition(7, 1, 3)).toBe(2);
  });

  it('un mazo vacío se queda en 0', () => {
    expect(stepPosition(0, 1, 0)).toBe(0);
  });
});

describe('positionAfterKnown', () => {
  it('NO avanza: la siguiente tarjeta ocupa el hueco de la marcada', () => {
    // Mazo [A,B,C], viendo B (posición 1). Al marcar B, el mazo pasa a [A,C]
    // y C queda en la posición 1. Avanzar además se saltaría C.
    expect(positionAfterKnown(1, 3)).toBe(1);
  });

  it('vuelve al principio si la marcada era la última', () => {
    // Mazo [A,B,C], viendo C (posición 2). Sin corrección, el cursor quedaría
    // en 2 sobre un mazo de 2 elementos y no habría tarjeta que mostrar.
    expect(positionAfterKnown(2, 3)).toBe(0);
  });

  it('marcar la única que quedaba deja el mazo vacío en 0', () => {
    expect(positionAfterKnown(0, 1)).toBe(0);
  });

  it('recorre un mazo entero sin saltarse ni una', () => {
    // La prueba que de verdad importa: marcar siempre la tarjeta visible tiene
    // que pasar por las cinco, una vez cada una.
    const order = [0, 1, 2, 3, 4];
    const known = new Set<number>();
    let position = 0;
    const seen: number[] = [];

    while (true) {
      const pending = pendingIndexes(order, known);
      if (pending.length === 0) break;
      const card = pending[clampPosition(position, pending.length)];
      seen.push(card);
      known.add(card);
      position = positionAfterKnown(position, pending.length);
    }

    expect(seen.sort()).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('shuffleOrder', () => {
  it('no toca el array original y conserva todas las tarjetas', () => {
    const order = [0, 1, 2, 3, 4];
    const out = shuffleOrder(order, () => 0.5);
    expect(order).toEqual([0, 1, 2, 3, 4]);
    expect([...out].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
  });

  it('un mazo de una sola tarjeta se queda igual', () => {
    expect(shuffleOrder([7], () => 0.9)).toEqual([7]);
  });
});

describe('sanitizeKnown', () => {
  it('acepta lo que hay guardado si sigue siendo válido', () => {
    expect([...sanitizeKnown([0, 2, 4], 5)]).toEqual([0, 2, 4]);
  });

  it('descarta los índices de una versión anterior del acta', () => {
    // Se volvió a analizar la reunión y ahora hay 3 tarjetas, no 20: sin este
    // filtro el contador diría "8 de 3".
    expect([...sanitizeKnown([0, 1, 8, 19], 3)]).toEqual([0, 1]);
  });

  it('ignora cualquier basura en la clave, que es editable por el usuario', () => {
    expect(sanitizeKnown('no soy un array', 5).size).toBe(0);
    expect(sanitizeKnown(null, 5).size).toBe(0);
    expect([...sanitizeKnown(['1', 1.5, -1, NaN, 2], 5)]).toEqual([2]);
  });
});
