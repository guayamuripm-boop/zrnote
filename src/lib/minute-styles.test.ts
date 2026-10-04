import { describe, it, expect } from 'vitest';
import {
  normalizeMinuteStyle,
  getMinuteStyle,
  MINUTE_STYLE_OPTIONS,
  DEFAULT_MINUTE_STYLE,
  availableMinuteStyles,
  resolveMinuteStyle,
} from './minute-styles';

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
    // La etiqueta es "Clase", no "Educativa": junto a "Ejecutiva" en el
    // selector, las dos palabras se leían casi igual. El VALOR sigue siendo
    // 'educativa' — cambiarlo obligaría a migrar las filas ya guardadas.
    expect(style.label).toBe('Clase');
    expect(style.value).toBe('educativa');
    expect(style.commitmentExamples).toContain('tarea');
  });

  it('degrada a ejecutiva ante un valor desconocido', () => {
    expect(getMinuteStyle('lo-que-sea').value).toBe(DEFAULT_MINUTE_STYLE);
  });
});

describe('MINUTE_STYLE_OPTIONS', () => {
  it('incluye todos los estilos, cada uno con lo que la interfaz necesita', () => {
    const values = MINUTE_STYLE_OPTIONS.map((s) => s.value);
    expect(values).toEqual(['ejecutiva', 'educativa', 'contenido']);
    for (const style of MINUTE_STYLE_OPTIONS) {
      expect(style.label).toBeTruthy();
      expect(style.shortDescription).toBeTruthy();
      expect(style.emoji).toBeTruthy();
      expect(style.roleFraming).toBeTruthy();
    }
  });

  it('sólo el estilo de clase pide ayudas de estudio, y trae el prompt para hacerlo', () => {
    // El acoplamiento que importa: si un estilo dice que produce ayudas de
    // estudio, la interfaz muestra la sección — y sin `extraSchema` el modelo
    // nunca devolvería el bloque, así que la sección saldría siempre vacía.
    const clase = getMinuteStyle('educativa');
    expect(clase.producesStudyAids).toBe(true);
    expect(clase.extraSchema).toContain('study_aids');
    expect(clase.extraRules).toBeTruthy();

    expect(getMinuteStyle('ejecutiva').producesStudyAids).toBeFalsy();
    expect(getMinuteStyle('ejecutiva').extraSchema).toBeUndefined();
  });
});

describe('estilo Contenido (opcional)', () => {
  it('no se ofrece hasta que la persona lo activa', () => {
    expect(availableMinuteStyles(false).map((s) => s.value)).toEqual(['ejecutiva', 'educativa']);
    expect(availableMinuteStyles(true).map((s) => s.value)).toEqual(['ejecutiva', 'educativa', 'contenido']);
  });

  it('un estilo opcional no activado cae al valor por defecto', () => {
    expect(resolveMinuteStyle('contenido', false)).toBe('ejecutiva');
    expect(resolveMinuteStyle('contenido', true)).toBe('contenido');
    expect(resolveMinuteStyle('educativa', false)).toBe('educativa');
    expect(resolveMinuteStyle('lo-que-sea', true)).toBe('ejecutiva');
  });

  it('pide capítulos y trae el prompt para producirlos', () => {
    const c = getMinuteStyle('contenido');
    expect(c.producesChapters).toBe(true);
    expect(c.extraSchema).toContain('chapters');
    expect(c.extraRules).toContain('chapters');
  });
});
