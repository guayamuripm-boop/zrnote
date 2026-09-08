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
  /**
   * Reglas extra que se insertan ANTES del bloque de formato JSON.
   *
   * Un estilo no cambia sólo el tono: puede cambiar QUÉ hay que extraer. La
   * clase necesita glosario y preguntas de repaso; la junta, no.
   */
  extraRules?: string;
  /**
   * Campos adicionales del JSON de respuesta, en el mismo formato que el resto
   * del esquema del prompt. Se pegan dentro del objeto, así que deben empezar
   * por coma y venir ya indentados.
   */
  extraSchema?: string;
  /**
   * Sustituye la instrucción del campo `summary`. Un acta de clase no resume
   * "para qué se reunieron y qué se resolvió": resume qué se enseñó.
   */
  summaryInstruction?: string;
  /**
   * Si este estilo produce el bloque `study_aids`. Gobierna la interfaz (si se
   * muestra la sección de estudio) y el aviso del selector.
   */
  producesStudyAids?: boolean;
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
    label: 'Clase',
    emoji: '🎓',
    shortDescription: 'Clases y tutorías — con apuntes y repaso',
    producesStudyAids: true,
    roleFraming:
      'Eres el mejor estudiante de la clase tomando apuntes, con la disciplina de un coordinador académico. Tu trabajo no es narrar lo que dijo el profesor: es dejar unos apuntes formales con los que otra persona pueda ESTUDIAR esta clase sin haber estado en ella — entender los conceptos, repasarlos y llegar preparada al examen.',
    commitmentExamples:
      '"para la próxima clase traigan…", "queda de tarea…", "revisen el capítulo…", "entreguen el…", "van a preparar…", "esto entra en el examen"',
    summaryInstruction:
      'De qué trató la clase y qué hay que llevarse de ella, en 3 a 5 frases repartidas en 2 o 3 párrafos CORTOS separados por un salto de línea doble (\\n\\n): primero el tema y cómo encaja con lo anterior, después las ideas principales que se explicaron y, si las hubo, lo que queda pendiente de entregar o estudiar. Máximo 2 frases por párrafo — se lee en el móvil. Escribe sobre el CONTENIDO ("la clase cubrió la ley de Ohm y su aplicación a circuitos en serie"), no sobre la sesión ("el profesor habló de…", "se discutió el tema de…").',

    extraRules: `APUNTES DE CLASE: EL BLOQUE "study_aids"
Además del acta, esta sesión es una CLASE, así que produces también material de estudio. Es la parte que más se va a usar, así que trátala con el mismo cuidado que los compromisos.

LA REGLA QUE MANDA SOBRE TODO ESTE BLOQUE — LÉELA DOS VECES
Todo lo que escribas aquí tiene que salir de la transcripción. TÚ SABES DE ESTOS TEMAS, y esa es exactamente la trampa: si el docente definió mal un término, o lo definió a medias, escribes lo que él dijo, no lo que tú sabes. No completes una explicación con conocimiento tuyo, no añadas conceptos correctos que nadie mencionó, no "arregles" un ejemplo mal resuelto. Unos apuntes con seis conceptos que de verdad se explicaron valen más que veinte sacados de tu memoria: el estudiante los usará para responder a ESTE profesor.
Si la sesión no fue una clase —es un claustro, una reunión de coordinación, una tutoría administrativa— deja todos los arrays de study_aids vacíos. No es un fallo: no había nada que enseñar.

CÓMO LLENAR CADA PARTE
- outline: el temario REAL de la sesión, en el orden en que se cubrió. Es el esqueleto de los apuntes. Cada sección con sus puntos, y cada punto una afirmación completa que se entienda sola ("La corriente es directamente proporcional al voltaje e inversamente proporcional a la resistencia"), no una etiqueta ("ley de Ohm"). Si la clase saltó de un tema a otro y volvió, agrupa: manda el orden lógico, no el cronológico.
- key_concepts: los términos que un estudiante tendría que buscar si no los conociera. La definición, CON LAS PALABRAS CON QUE SE EXPLICÓ EN CLASE. Si un término se nombró pero nunca se explicó, no lo pongas — no lo definas tú.
- worked_examples: los ejercicios, casos o demostraciones que se desarrollaron delante de la clase. "problem" es lo que se planteó; "approach" es cómo se resolvió, con los pasos que se dieron. Si no se resolvió ningún ejemplo, array vacío.
- study_questions: preguntas de repaso cuya respuesta está EN LA CLASE. Cada respuesta tiene que poder señalarse en la transcripción. Que no sean todas de definición: pregunta también por el porqué, por la diferencia entre dos cosas, por cuándo se aplica una y cuándo la otra.
- flashcards: memorización pura, cortas. Anverso: un término, una fórmula, una pregunta de una línea. Reverso: la respuesta, breve. No repitas literalmente las study_questions — la tarjeta es para el dato suelto, la pregunta es para el razonamiento.
- common_mistakes: SÓLO si el docente advirtió de un error, una confusión frecuente o un "ojo con esto". No inventes errores plausibles.
- exam_notes: SÓLO lo que se dijo de forma explícita sobre la evaluación — qué entra, qué formato tiene, cuánto pesa, qué hay que traer. Si no se habló del examen, array vacío.
- resources: libros, capítulos, páginas, vídeos o materiales que se mencionaron por su nombre. Nada de recomendaciones tuyas.
- open_questions: preguntas que se hicieron en clase y quedaron SIN responder, o algo que el docente dejó "para la próxima". Es lo que el estudiante tiene que preguntar.

CANTIDAD
Ajústala a lo que dio la clase, no a llenar el documento. Una clase densa de una hora: 8-15 conceptos, 6-10 preguntas, 10-15 tarjetas. Una charla corta o una sesión de dudas: mucho menos, o nada. Un array vacío es una respuesta correcta.`,

    extraSchema: `,
  "study_aids": {
    "outline": [ { "section": "Título de la parte de la clase", "points": ["Afirmación completa que se entiende sola", "..."] } ],
    "key_concepts": [ { "term": "El término", "definition": "Qué es, con las palabras con que se explicó en clase", "why": "Para qué sirve o dónde se usa — null si no se dijo" } ],
    "worked_examples": [ { "problem": "El ejercicio o caso que se planteó", "approach": "Cómo se resolvió, con los pasos que se dieron" } ],
    "study_questions": [ { "question": "Pregunta de repaso", "answer": "La respuesta, tal como se explicó en clase" } ],
    "flashcards": [ { "front": "Término, fórmula o pregunta de una línea", "back": "La respuesta, breve" } ],
    "common_mistakes": [ { "mistake": "El error del que advirtió el docente", "correction": "Lo correcto, según él" } ],
    "exam_notes": ["Lo que se dijo explícitamente sobre la evaluación"],
    "resources": ["Libro, capítulo o material mencionado por su nombre"],
    "open_questions": ["Pregunta que quedó sin responder en clase"]
  }`,
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
