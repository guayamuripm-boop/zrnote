// Plantillas de estilo del acta.
//
// Un único registro alimenta tanto el prompt (processing.ts) como el selector
// de la interfaz (dashboard/meetings/new). Añadir un tercer estilo más
// adelante —comités formales, obra— es entonces añadir UNA entrada aquí, no
// tocar la base de datos ni buscar por el código los sitios donde hay que
// actualizar la lista. Ver la migración 025 para por qué no hay una columna
// con CHECK: la validación vive aquí, no en el esquema.

export interface MinuteStyleDef {
  value: string;
  label: string;
  emoji: string;
  /** Para el selector de la interfaz: una frase, no un párrafo. */
  shortDescription: string;
  /** La frase de apertura del prompt — define el rol que adopta el modelo. */
  roleFraming: string;
  /** Sustituye los ejemplos de "qué cuenta como compromiso" en el prompt. */
  commitmentExamples: string;
}

export const DEFAULT_MINUTE_STYLE = 'ejecutiva';

export const MINUTE_STYLES: Record<string, MinuteStyleDef> = {
  ejecutiva: {
    value: 'ejecutiva',
    label: 'Ejecutiva',
    emoji: '💼',
    shortDescription: 'Juntas, comités, seguimiento de equipo',
    roleFraming:
      'Eres un jefe de gabinete con veinte años levantando actas. Tu trabajo no es resumir lo que se habló: es dejar por escrito lo que hay que hacer y lo que quedó decidido, para que alguien que NO estuvo en la reunión pueda actuar mañana sin preguntar nada.',
    commitmentExamples: '"yo me encargo", "quedamos en que…", "necesito que…", "para el viernes tengo…", "lo hago yo"',
  },
  educativa: {
    value: 'educativa',
    label: 'Educativa',
    emoji: '🎓',
    shortDescription: 'Clases, claustros, tutorías',
    roleFraming:
      'Eres un coordinador académico con años levantando actas de clases y reuniones docentes. Tu trabajo no es resumir lo que se explicó: es dejar por escrito qué se cubrió, qué quedó de tarea y para quién, para que alguien que NO estuvo en la sesión —otro docente, un coordinador, un estudiante que faltó— entienda exactamente qué se espera.',
    commitmentExamples:
      '"para la próxima clase traigan…", "queda de tarea…", "revisen el capítulo…", "entreguen el…", "van a preparar…"',
  },
};

/**
 * Cualquier valor que no se reconozca cae a 'ejecutiva' — el comportamiento
 * que ya existía antes de que hubiera estilos. Nunca al revés: un dato
 * corrupto o un estilo retirado no debe cambiar silenciosamente cómo se
 * redactan las actas de alguien.
 */
export function normalizeMinuteStyle(value: unknown): string {
  const key = String(value ?? '').toLowerCase().trim();
  return key in MINUTE_STYLES ? key : DEFAULT_MINUTE_STYLE;
}

export function getMinuteStyle(value: unknown): MinuteStyleDef {
  return MINUTE_STYLES[normalizeMinuteStyle(value)];
}

/** Para el `<select>`/pills de la interfaz, en un orden estable. */
export const MINUTE_STYLE_OPTIONS: MinuteStyleDef[] = Object.values(MINUTE_STYLES);

/** Notas del organizador: cortas a propósito — es contexto, no un prompt libre. */
export const MAX_STYLE_NOTES_LENGTH = 200;
