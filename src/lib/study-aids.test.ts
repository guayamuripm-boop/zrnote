import { describe, it, expect } from 'vitest';
import {
  normalizeStudyAids,
  isStudyAidsEmpty,
  readStudyAids,
  countStudyAids,
  EMPTY_STUDY_AIDS,
} from './study-aids';

describe('normalizeStudyAids', () => {
  it('acepta el bloque bien formado', () => {
    const aids = normalizeStudyAids({
      outline: [{ section: 'Ley de Ohm', points: ['V = I x R'] }],
      key_concepts: [{ term: 'Resistencia', definition: 'Oposición al paso de la corriente', why: 'Limita la corriente' }],
      worked_examples: [{ problem: 'Circuito de 12 V y 4 ohmios', approach: 'I = V/R = 3 A' }],
      study_questions: [{ question: '¿Qué mide un óhmetro?', answer: 'La resistencia' }],
      flashcards: [{ front: 'Unidad de resistencia', back: 'Ohmio' }],
      common_mistakes: [{ mistake: 'Confundir voltaje con corriente', correction: 'El voltaje empuja, la corriente fluye' }],
      exam_notes: ['Entra todo el tema 3'],
      resources: ['Capítulo 4 del Boylestad'],
      open_questions: ['¿Cómo afecta la temperatura?'],
    });

    expect(aids.outline[0].points).toEqual(['V = I x R']);
    expect(aids.key_concepts[0].why).toBe('Limita la corriente');
    expect(countStudyAids(aids)).toBe(9);
    expect(isStudyAidsEmpty(aids)).toBe(false);
  });

  it('devuelve la forma vacía ante cualquier basura, sin lanzar', () => {
    // El modelo puede devolver cualquier cosa; ninguna debe romper la página.
    for (const input of [null, undefined, 'texto', 42, [], [1, 2, 3], true]) {
      const aids = normalizeStudyAids(input);
      expect(isStudyAidsEmpty(aids)).toBe(true);
      expect(aids.outline).toEqual([]);
    }
  });

  it('no muta EMPTY_STUDY_AIDS entre llamadas', () => {
    // Devolver la MISMA referencia haría que quien empujara a un array de un
    // acta lo viera aparecer en la siguiente.
    const a = normalizeStudyAids(null);
    a.outline.push({ section: 'contaminado', points: [] });
    expect(normalizeStudyAids(null).outline).toEqual([]);
    expect(EMPTY_STUDY_AIDS.outline).toEqual([]);
  });

  it('descarta las piezas a medias en vez de mostrarlas rotas', () => {
    const aids = normalizeStudyAids({
      // Un término sin definición no sirve para estudiar.
      key_concepts: [
        { term: 'Inductancia' },
        { definition: 'huérfana' },
        { term: 'Capacitancia', definition: 'Capacidad de almacenar carga' },
      ],
      // Una pregunta sin respuesta es un examen, no una ayuda de estudio.
      study_questions: [{ question: '¿Y esto?' }, { question: 'Vale', answer: 'Sí' }],
      flashcards: [{ front: 'Sola' }, { front: 'A', back: 'B' }],
      worked_examples: [{ problem: 'Sin resolver' }],
      common_mistakes: [{ mistake: 'Sin corrección' }],
    });

    expect(aids.key_concepts).toEqual([{ term: 'Capacitancia', definition: 'Capacidad de almacenar carga' }]);
    expect(aids.study_questions).toHaveLength(1);
    expect(aids.flashcards).toHaveLength(1);
    expect(aids.worked_examples).toEqual([]);
    expect(aids.common_mistakes).toEqual([]);
  });

  it('trata "null" y "N/A" como campos vacíos, no como texto', () => {
    // Algunos modelos rellenan el hueco en vez de omitir el campo, y "why: null"
    // acababa impreso literalmente bajo la definición.
    const aids = normalizeStudyAids({
      key_concepts: [{ term: 'Vatio', definition: 'Unidad de potencia', why: 'null' }],
      exam_notes: ['N/A', '—', 'Entra el tema 2'],
    });
    expect(aids.key_concepts[0].why).toBeUndefined();
    expect(aids.exam_notes).toEqual(['Entra el tema 2']);
  });

  it('acepta los nombres alternativos que usan otros modelos', () => {
    const aids = normalizeStudyAids({
      outline: [{ title: 'Introducción', bullets: ['Primer punto'] }],
      key_concepts: [{ concept: 'Voltaje', description: 'Diferencia de potencial' }],
      study_questions: [{ q: '¿Cuánto?', a: 'Doce' }],
      worked_examples: [{ statement: 'Ejercicio 1', solution: 'Se resuelve así' }],
    });
    expect(aids.outline[0]).toEqual({ section: 'Introducción', points: ['Primer punto'] });
    expect(aids.key_concepts[0].term).toBe('Voltaje');
    expect(aids.study_questions[0]).toEqual({ question: '¿Cuánto?', answer: 'Doce' });
    expect(aids.worked_examples[0].approach).toBe('Se resuelve así');
  });

  it('envuelve un objeto suelto que debía venir en un array', () => {
    const aids = normalizeStudyAids({ key_concepts: { term: 'Ohmio', definition: 'Unidad' } });
    expect(aids.key_concepts).toHaveLength(1);
  });

  it('admite una sección del temario como string suelto', () => {
    const aids = normalizeStudyAids({ outline: ['Repaso de la clase anterior', '  '] });
    expect(aids.outline).toEqual([{ section: 'Repaso de la clase anterior', points: [] }]);
  });

  it('recorta un modelo que se entusiasma', () => {
    // Sin topes, una fila enorme y un PDF de cuarenta páginas.
    const aids = normalizeStudyAids({
      flashcards: Array.from({ length: 200 }, (_, i) => ({ front: `t${i}`, back: `d${i}` })),
      key_concepts: Array.from({ length: 100 }, (_, i) => ({ term: `t${i}`, definition: 'x'.repeat(2000) })),
      outline: Array.from({ length: 50 }, () => ({ section: 'S', points: Array(40).fill('p') })),
    });
    expect(aids.flashcards).toHaveLength(24);
    expect(aids.key_concepts).toHaveLength(24);
    expect(aids.key_concepts[0].definition.length).toBe(700);
    expect(aids.outline).toHaveLength(12);
    expect(aids.outline[0].points).toHaveLength(10);
  });
});

describe('readStudyAids', () => {
  it('prefiere la columna cuando tiene contenido', () => {
    const aids = readStudyAids({
      study_aids: { exam_notes: ['De la columna'] },
      raw_llm_output: JSON.stringify({ study_aids: { exam_notes: ['Del raw'] } }),
    });
    expect(aids.exam_notes).toEqual(['De la columna']);
  });

  it('cae a raw_llm_output cuando la columna no existe todavía', () => {
    // Es el caso real de una base donde la migración 026 aún no se ha aplicado:
    // Supabase no devuelve la columna, pero el JSON completo está guardado.
    const aids = readStudyAids({
      raw_llm_output: JSON.stringify({ summary: 'x', study_aids: { flashcards: [{ front: 'A', back: 'B' }] } }),
    });
    expect(aids.flashcards).toEqual([{ front: 'A', back: 'B' }]);
  });

  it('no rompe con un raw_llm_output truncado o ausente', () => {
    expect(isStudyAidsEmpty(readStudyAids({ raw_llm_output: '{"summary": "cort' }))).toBe(true);
    expect(isStudyAidsEmpty(readStudyAids({}))).toBe(true);
    expect(isStudyAidsEmpty(readStudyAids(null))).toBe(true);
  });

  it('un acta ejecutiva no trae ayudas de estudio', () => {
    const aids = readStudyAids({
      study_aids: {},
      raw_llm_output: JSON.stringify({ summary: 'Se acordó el presupuesto', decisions: [] }),
    });
    expect(isStudyAidsEmpty(aids)).toBe(true);
  });
});
