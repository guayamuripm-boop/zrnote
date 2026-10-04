import { describe, it, expect } from 'vitest';
import { normalizeChapters, readChapters, formatTimestamp, normalizeTimestamp, startOffsetsSeconds } from './chapters';

describe('formatTimestamp', () => {
  it('formatea minutos y horas', () => {
    expect(formatTimestamp(0)).toBe('0:00');
    expect(formatTimestamp(754)).toBe('12:34');
    expect(formatTimestamp(3910)).toBe('1:05:10');
  });
});

describe('normalizeTimestamp', () => {
  it('acepta marcas con corchetes o rangos y descarta lo inválido', () => {
    expect(normalizeTimestamp('[12:30]')).toBe('12:30');
    expect(normalizeTimestamp('1:05:10 - 1:20:00')).toBe('1:05:10');
    expect(normalizeTimestamp('12:75')).toBeNull();
    expect(normalizeTimestamp(null)).toBeNull();
    expect(normalizeTimestamp('al inicio')).toBeNull();
  });
});

describe('normalizeChapters', () => {
  it('corrige formas raras sin lanzar', () => {
    expect(normalizeChapters(undefined)).toEqual([]);
    expect(normalizeChapters('x')).toEqual([]);
    const out = normalizeChapters([
      { time: '[0:00]', title: 'Apertura', summary: 'Presenta al invitado', key_points: ['Dato', '', 5] },
      { title: '', summary: '' },
      'basura',
      { summary: 'Solo resumen' },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ time: '0:00', title: 'Apertura', summary: 'Presenta al invitado', key_points: ['Dato', '5'] });
    expect(out[1].time).toBeNull();
    expect(out[1].title).toBe('Solo resumen');
  });
});

describe('readChapters', () => {
  it('lee de raw_llm_output y tolera JSON roto', () => {
    expect(readChapters({ raw_llm_output: JSON.stringify({ chapters: [{ title: 'A', summary: 'b' }] }) })).toHaveLength(1);
    expect(readChapters({ raw_llm_output: '{roto' })).toEqual([]);
    expect(readChapters(null)).toEqual([]);
  });
});

describe('startOffsetsSeconds', () => {
  it('suma las duraciones de los trozos anteriores por índice', () => {
    const m = startOffsetsSeconds([
      { segment_index: 1, duration_s: 30 },
      { segment_index: 0, duration_s: 30 },
      { segment_index: 2, duration_s: 30 },
    ])!;
    expect(m.get(0)).toBe(0);
    expect(m.get(1)).toBe(30);
    expect(m.get(2)).toBe(60);
  });

  it('sin duraciones conocidas no inventa tiempos', () => {
    expect(startOffsetsSeconds([{ segment_index: 0, duration_s: 0 }, { segment_index: 1 }])).toBeNull();
  });
});
