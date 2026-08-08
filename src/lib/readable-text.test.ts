import { describe, it, expect } from 'vitest';
import { toParagraphs } from '@/lib/readable-text';

describe('toParagraphs', () => {
  it('parte un bloque largo en párrafos de 2 frases', () => {
    const bloque =
      'Se revisó el avance de compras. Ana enviará la cotización el viernes. Luis contactará al proveedor. El presupuesto queda para la próxima reunión.';
    const r = toParagraphs(bloque);
    expect(r).toHaveLength(2);
    expect(r[0]).toBe('Se revisó el avance de compras. Ana enviará la cotización el viernes.');
    expect(r[1]).toBe('Luis contactará al proveedor. El presupuesto queda para la próxima reunión.');
  });

  it('respeta los cortes que ya trae el modelo', () => {
    // Si el modelo hizo caso al prompt, sabe mejor que nosotros dónde separar.
    const yaPartido = 'Primera idea completa.\n\nSegunda idea, distinta de la anterior.';
    expect(toParagraphs(yaPartido)).toEqual([
      'Primera idea completa.',
      'Segunda idea, distinta de la anterior.',
    ]);
  });

  it('deja en paz un texto ya corto', () => {
    expect(toParagraphs('Reunión breve sin acuerdos.')).toEqual(['Reunión breve sin acuerdos.']);
  });

  it('no parte por abreviaturas', () => {
    // "Sr." o "9 a.m." reventarían un split ingenuo por punto.
    const texto = 'El Sr. Pérez llega a las 9 a.m. La reunión empieza puntual.';
    const r = toParagraphs(texto);
    expect(r.join(' ')).toContain('Sr. Pérez');
    expect(r.join(' ')).toContain('9 a.m.');
  });

  it('corta bien tras interrogación y exclamación', () => {
    const texto = '¿Quién lleva el informe? Ana se ofreció. ¡Quedó cerrado! Se revisa el lunes.';
    const r = toParagraphs(texto);
    expect(r).toHaveLength(2);
    expect(r[0]).toContain('¿Quién lleva el informe?');
  });

  it('no deja un párrafo huérfano de una sola frase corta', () => {
    const texto = 'Primera frase bastante larga para llenar el párrafo entero. Segunda frase igual de larga que la anterior. Vale.';
    const r = toParagraphs(texto);
    expect(r[r.length - 1]).toContain('Vale.');
    expect(r[r.length - 1].length).toBeGreaterThan(60);
  });

  it('aguanta vacío y nulo', () => {
    expect(toParagraphs('')).toEqual([]);
    expect(toParagraphs(null)).toEqual([]);
    expect(toParagraphs(undefined)).toEqual([]);
    expect(toParagraphs('   ')).toEqual([]);
  });

  it('permite ajustar cuántas frases por párrafo', () => {
    const texto = 'Una. Dos. Tres. Cuatro. Cinco. Seis.';
    expect(toParagraphs(texto, 3).length).toBe(2);
  });

  it('normaliza los espacios de sobra', () => {
    expect(toParagraphs('Texto   con     espacios raros.')).toEqual(['Texto con espacios raros.']);
  });
});
