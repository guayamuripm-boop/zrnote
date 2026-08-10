import { describe, it, expect } from 'vitest';
import { normalizeMinuteStyle, getMinuteStyle, MINUTE_STYLE_OPTIONS, DEFAULT_MINUTE_STYLE } from './minute-styles';

describe('normalizeMinuteStyle', () => {
  it('reconoce los estilos válidos', () => {
    expect(normalizeMinuteStyle('ejecutiva')).toBe('ejecutiva');
    expect(normalizeMinuteStyle('educativa')).toBe('educativa');
  });

  it('ignora mayúsculas y espacios', () => {
    expect(normalizeMinuteStyle('EDUCATIVA')).toBe('educativa');
    expect(normalizeMinuteStyle('  educativa  ')).toBe('educativa');
  });

  it('cualquier valor no reconocido cae a "ejecutiva", nunca al revés', () => {
    // Un dato corrupto o un estilo retirado no debe cambiar silenciosamente
    // cómo se redactan las actas de alguien — el valor por defecto es el
    // comportamiento que ya existía antes de que hubiera estilos.
    expect(normalizeMinuteStyle('comite-formal')).toBe('ejecutiva');
    expect(normalizeMinuteStyle('')).toBe('ejecutiva');
    expect(normalizeMinuteStyle(null)).toBe('ejecutiva');
    expect(normalizeMinuteStyle(undefined)).toBe('ejecutiva');
  });
});

describe('getMinuteStyle', () => {
  it('devuelve la definición completa', () => {
    const style = getMinuteStyle('educativa');
    expect(style.label).toBe('Educativa');
    expect(style.roleFraming).toContain('coordinador académico');
    expect(style.commitmentExamples).toContain('tarea');
  });

  it('degrada a ejecutiva ante un valor desconocido', () => {
    expect(getMinuteStyle('lo-que-sea').value).toBe(DEFAULT_MINUTE_STYLE);
  });
});

describe('MINUTE_STYLE_OPTIONS', () => {
  it('incluye ambos estilos, cada uno con lo que la interfaz necesita', () => {
    const values = MINUTE_STYLE_OPTIONS.map((s) => s.value);
    expect(values).toEqual(['ejecutiva', 'educativa']);
    for (const style of MINUTE_STYLE_OPTIONS) {
      expect(style.label).toBeTruthy();
      expect(style.shortDescription).toBeTruthy();
      expect(style.emoji).toBeTruthy();
    }
  });
});
