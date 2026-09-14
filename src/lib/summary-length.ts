// Nivel de detalle del resumen ("summary"), como eje independiente del estilo
// del acta (minute-styles.ts). El estilo decide DE QUÉ habla el resumen
// (resultados de reunión vs. contenido de clase); esto decide CUÁNTO se
// extiende. Mismo patrón que minute-styles.ts: la lista vive en código, no
// hay CHECK en el esquema — ver la migración 027.

export interface SummaryLengthDef {
  value: string;
  label: string;
  emoji: string;
  shortDescription: string;
  /**
   * Se antepone a la instrucción de contenido del estilo (ver
   * `contentFocus` en minute-styles.ts) para formar la instrucción completa
   * del campo "summary" del prompt.
   */
  lengthInstruction: string;
}

export const DEFAULT_SUMMARY_LENGTH = 'normal';

export const SUMMARY_LENGTHS: Record<string, SummaryLengthDef> = {
  breve: {
    value: 'breve',
    label: 'Breve',
    emoji: '⚡',
    shortDescription: 'Lo justo, para leer en 5 segundos',
    lengthInstruction:
      '1 a 2 frases muy concretas, un solo párrafo corto, sin rodeos. Sólo lo esencial —el resultado y, si lo hay, lo pendiente— nada de contexto ni de detalle secundario.',
  },
  normal: {
    value: 'normal',
    label: 'Normal',
    emoji: '📄',
    shortDescription: 'El equilibrio de siempre',
    lengthInstruction:
      '3 a 5 frases repartidas en 2 o 3 párrafos CORTOS separados por un salto de línea doble (\\n\\n). Máximo 2 frases por párrafo — se lee en el móvil y un bloque largo no lo lee nadie.',
  },
  detallado: {
    value: 'detallado',
    label: 'Detallado',
    emoji: '📖',
    shortDescription: 'Con más contexto — para repasar sin el audio',
    lengthInstruction:
      '8 a 14 frases repartidas en 4 a 6 párrafos separados por un salto de línea doble (\\n\\n). Desarrolla cada punto: no sólo QUÉ se dijo sino el porqué, el contexto y los matices relevantes que de verdad se explicaron. Sigue siendo texto corrido y legible, nunca una lista ni un telegrama — alguien que no estuvo debe poder entender la sesión completa leyendo sólo esto.',
  },
};

/**
 * Cualquier valor que no se reconozca cae a 'normal' — el comportamiento que
 * ya existía antes de que hubiera niveles. Nunca al revés: un dato corrupto
 * o un nivel retirado no debe cambiar silenciosamente cómo se redactan las
 * actas de alguien.
 */
export function normalizeSummaryLength(value: unknown): string {
  const key = String(value ?? '').toLowerCase().trim();
  return key in SUMMARY_LENGTHS ? key : DEFAULT_SUMMARY_LENGTH;
}

export function getSummaryLength(value: unknown): SummaryLengthDef {
  return SUMMARY_LENGTHS[normalizeSummaryLength(value)];
}

/** Para el selector de la interfaz, en un orden estable. */
export const SUMMARY_LENGTH_OPTIONS: SummaryLengthDef[] = Object.values(SUMMARY_LENGTHS);
