import { describe, it, expect } from 'vitest';
import { sanitizeGeneratedTitle } from './processing';

/**
 * "Grabar ahora" crea la reunión con "Grabación 5 ago 14:30" porque todavía no
 * hay audio del que sacar un título real. `sanitizeGeneratedTitle` es el filtro
 * entre lo que el modelo devuelve en `suggested_title` y lo que de verdad se
 * escribe en `meetings.title` — null significa "no lo uses", nunca "usa una
 * cadena vacía".
 */
describe('sanitizeGeneratedTitle', () => {
  it('acepta un título limpio tal cual', () => {
    expect(sanitizeGeneratedTitle('Presupuesto de marketing Q3')).toBe('Presupuesto de marketing Q3');
  });

  it('quita las comillas con las que el modelo a veces lo envuelve', () => {
    expect(sanitizeGeneratedTitle('"Seguimiento obra edificio B"')).toBe('Seguimiento obra edificio B');
    expect(sanitizeGeneratedTitle('“Onboarding cliente Acme”')).toBe('Onboarding cliente Acme');
  });

  it('recorta espacios de sobra, incluidos saltos de línea', () => {
    expect(sanitizeGeneratedTitle('  Reunión   de \n equipo  ')).toBe('Reunión de equipo');
  });

  it('trunca un título excesivamente largo', () => {
    // Pasado los 80 caracteres deja de ser un título y pasa a ser un resumen.
    const largo = 'A'.repeat(120);
    const resultado = sanitizeGeneratedTitle(largo);
    expect(resultado).not.toBeNull();
    expect(resultado!.length).toBe(80);
    expect(resultado!.endsWith('…')).toBe(true);
  });

  it('devuelve null si el modelo no dio nada usable', () => {
    // null, no '' — así el llamador sabe que debe CONSERVAR el título
    // automático en vez de machacarlo con una cadena vacía.
    expect(sanitizeGeneratedTitle(undefined)).toBeNull();
    expect(sanitizeGeneratedTitle(null)).toBeNull();
    expect(sanitizeGeneratedTitle('')).toBeNull();
    expect(sanitizeGeneratedTitle('   ')).toBeNull();
    expect(sanitizeGeneratedTitle('"   "')).toBeNull();
  });

  it('devuelve null si el modelo manda un tipo que no es texto', () => {
    expect(sanitizeGeneratedTitle(123 as any)).toBeNull();
    expect(sanitizeGeneratedTitle({ title: 'x' } as any)).toBeNull();
    expect(sanitizeGeneratedTitle(['x'] as any)).toBeNull();
  });

  it('acepta el título honesto para reuniones sin tema claro', () => {
    // Es la salida que el prompt sugiere cuando no hay nada que titular con
    // propiedad — no debe tratarse como "vacío".
    expect(sanitizeGeneratedTitle('Reunión sin tema definido')).toBe('Reunión sin tema definido');
  });
});
