// Ayudas de estudio: el bloque que convierte un acta de clase en material
// con el que de verdad se puede estudiar.
//
// POR QUÉ EXISTE ESTE ARCHIVO
// El acta normal está pensada para una junta: decisiones, bloqueos, estado de
// proyectos, quién se comprometió a qué. Para una clase eso es el envoltorio,
// no el contenido. Lo que un estudiante necesita de una clase que no vio —o
// que vio pero no entendió a la primera— es otra cosa: el temario que se
// cubrió, qué significa cada término nuevo, cómo se resuelve el ejemplo que
// puso el profesor, qué preguntas debería saber contestar, y qué dijo que
// entra en el examen.
//
// Todo eso viaja en UN objeto (`minutes.study_aids`) en vez de en nueve
// columnas: es material de lectura, nunca se consulta por campos sueltos, y
// añadir una sección más no debe costar una migración.
//
// EL MODELO ES TEXTO LIBRE, ASÍ QUE AQUÍ NO SE CONFÍA EN NADA
// `normalizeStudyAids` acepta cualquier cosa y devuelve siempre una forma
// válida. Un modelo que devuelve strings donde se pidieron objetos, arrays
// donde se pidió un string, campos vacíos o cien flashcards no debe romper la
// página ni reventar el insert: se corrige o se descarta, en silencio.

/** Un término del glosario. */
export interface StudyConcept {
  term: string;
  definition: string;
  /** Por qué importa / dónde se usa. Opcional: el modelo no siempre lo sabe. */
  why?: string;
}

/** Un ejemplo resuelto tal como lo desarrolló el docente en clase. */
export interface StudyExample {
  /** El problema o la situación planteada. */
  problem: string;
  /** Cómo se resolvió, paso a paso pero en prosa corta. */
  approach: string;
}

/** Pregunta de autoevaluación, con su respuesta. */
export interface StudyQuestion {
  question: string;
  answer: string;
}

/** Tarjeta de memorización: anverso / reverso. */
export interface StudyCard {
  front: string;
  back: string;
}

/** Un error que el docente advirtió explícitamente. */
export interface StudyMistake {
  mistake: string;
  correction: string;
}

/** Una sección del temario, con sus puntos. */
export interface StudyOutlineSection {
  section: string;
  points: string[];
}

export interface StudyAids {
  /** El temario de la sesión: la estructura formal del resumen. */
  outline: StudyOutlineSection[];
  /** Glosario de términos nuevos. */
  key_concepts: StudyConcept[];
  /** Ejemplos que el docente resolvió delante de la clase. */
  worked_examples: StudyExample[];
  /** Preguntas de repaso con respuesta. */
  study_questions: StudyQuestion[];
  /** Tarjetas para memorizar. */
  flashcards: StudyCard[];
  /** Errores frecuentes que el docente señaló. */
  common_mistakes: StudyMistake[];
  /** Lo que se dijo que entra en el examen o cómo se evalúa. */
  exam_notes: string[];
  /** Libros, capítulos, enlaces o materiales mencionados. */
  resources: string[];
  /** Dudas que quedaron abiertas en clase, sin resolver. */
  open_questions: string[];
}

/**
 * Topes.
 *
 * No son estéticos. El bloque entero se guarda en una columna jsonb, se
 * renderiza completo en la página y se mete en el PDF: un modelo que se
 * entusiasma y devuelve doscientas flashcards produce un documento inútil y
 * una fila enorme. Cortar por arriba es más barato que validar por abajo.
 */
const CAPS = {
  outlineSections: 20,
  outlinePoints: 16,
  concepts: 40,
  examples: 14,
  questions: 25,
  flashcards: 40,
  mistakes: 12,
  examNotes: 12,
  resources: 14,
  openQuestions: 12,
  /** Un término de glosario o el anverso de una tarjeta: una línea. */
  shortText: 200,
  /** Una definición, una respuesta, el desarrollo de un ejemplo. */
  longText: 1000,
} as const;

/**
 * Un bloque vacio NUEVO en cada llamada.
 *
 * Tiene que ser una funcion, no una constante que se copie con `{...}`: esa
 * copia es superficial, asi que los nueve arrays serian el MISMO array
 * compartido por todas las actas del proceso. En un servidor de vida larga eso
 * significa que si algo empuja a `aids.outline` de un acta, ese elemento
 * aparece en la siguiente — y en la de otro usuario.
 */
export function emptyStudyAids(): StudyAids {
  return {
    outline: [],
    key_concepts: [],
    worked_examples: [],
    study_questions: [],
    flashcards: [],
    common_mistakes: [],
    exam_notes: [],
    resources: [],
    open_questions: [],
  };
}

/**
 * Congelado de verdad —el objeto y sus nueve arrays— porque existe para
 * comparar y para tipar, nunca para copiarse. Si alguien vuelve a escribir
 * `{ ...EMPTY_STUDY_AIDS }` y empuja a uno de esos arrays, saltara en el acto
 * en modo estricto en vez de contaminar en silencio las actas siguientes.
 * Quien necesite un bloque vacio usa `emptyStudyAids()`.
 */
export const EMPTY_STUDY_AIDS: Readonly<StudyAids> = (() => {
  const aids = emptyStudyAids();
  for (const value of Object.values(aids)) Object.freeze(value);
  return Object.freeze(aids);
})();

/**
 * Un campo de texto que venía del modelo.
 *
 * Devuelve '' para cualquier cosa que no sea texto aprovechable — incluidos
 * los `null`, los objetos, y el literal "null" que algunos modelos escriben
 * dentro del JSON cuando no tienen nada que poner.
 */
function text(value: unknown, max: number): string {
  if (typeof value === 'number') return String(value);
  if (typeof value !== 'string') return '';
  const clean = value.trim();
  if (!clean) return '';
  // "null", "N/A", "-": el modelo rellenando el hueco en vez de omitirlo.
  if (/^(null|none|n\/?a|-{1,3}|—)$/i.test(clean)) return '';
  return clean.slice(0, max);
}

/** Un array del modelo, sea lo que sea lo que haya llegado. */
function list(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  // Un solo elemento sin envolver en array es un fallo común y recuperable.
  if (value && typeof value === 'object') return [value];
  if (typeof value === 'string' && value.trim()) return [value];
  return [];
}

/** Lista de strings sueltos (recursos, notas de examen, dudas abiertas). */
function stringList(value: unknown, cap: number): string[] {
  return list(value)
    .map((entry) => {
      if (typeof entry === 'string' || typeof entry === 'number') return text(entry, CAPS.longText);
      // A veces llegan como { item: "..." } o { text: "..." }.
      if (entry && typeof entry === 'object') {
        const o = entry as Record<string, unknown>;
        return text(o.text ?? o.item ?? o.note ?? o.title ?? o.resource ?? o.question, CAPS.longText);
      }
      return '';
    })
    .filter(Boolean)
    .slice(0, cap);
}

function normalizeOutline(value: unknown): StudyOutlineSection[] {
  return list(value)
    .map((entry) => {
      // Una sección puede llegar como string suelto: es un título sin puntos,
      // y sigue siendo información útil sobre el orden de la clase.
      if (typeof entry === 'string') {
        const section = text(entry, CAPS.shortText);
        return section ? { section, points: [] } : null;
      }
      if (!entry || typeof entry !== 'object') return null;
      const o = entry as Record<string, unknown>;
      const section = text(o.section ?? o.title ?? o.topic, CAPS.shortText);
      if (!section) return null;
      return {
        section,
        points: stringList(o.points ?? o.details ?? o.bullets, CAPS.outlinePoints),
      };
    })
    .filter((s): s is StudyOutlineSection => s !== null)
    .slice(0, CAPS.outlineSections);
}

function normalizeConcepts(value: unknown): StudyConcept[] {
  return list(value)
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const o = entry as Record<string, unknown>;
      const term = text(o.term ?? o.concept ?? o.name, CAPS.shortText);
      const definition = text(o.definition ?? o.meaning ?? o.description, CAPS.longText);
      // Un término sin definición no sirve para estudiar, y una definición
      // huérfana no se puede buscar. Hacen falta las dos.
      if (!term || !definition) return null;
      const why = text(o.why ?? o.why_it_matters ?? o.importance ?? o.usage, CAPS.longText);
      return why ? { term, definition, why } : { term, definition };
    })
    .filter((c): c is StudyConcept => c !== null)
    .slice(0, CAPS.concepts);
}

function normalizeExamples(value: unknown): StudyExample[] {
  return list(value)
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const o = entry as Record<string, unknown>;
      const problem = text(o.problem ?? o.situation ?? o.statement ?? o.title, CAPS.longText);
      const approach = text(o.approach ?? o.solution ?? o.resolution ?? o.steps, CAPS.longText);
      if (!problem || !approach) return null;
      return { problem, approach };
    })
    .filter((e): e is StudyExample => e !== null)
    .slice(0, CAPS.examples);
}

function normalizeQuestions(value: unknown): StudyQuestion[] {
  return list(value)
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const o = entry as Record<string, unknown>;
      const question = text(o.question ?? o.q ?? o.prompt, CAPS.longText);
      const answer = text(o.answer ?? o.a ?? o.response, CAPS.longText);
      // Una pregunta sin respuesta no es una ayuda de estudio, es un examen.
      if (!question || !answer) return null;
      return { question, answer };
    })
    .filter((q): q is StudyQuestion => q !== null)
    .slice(0, CAPS.questions);
}

function normalizeFlashcards(value: unknown): StudyCard[] {
  return list(value)
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const o = entry as Record<string, unknown>;
      const front = text(o.front ?? o.question ?? o.term, CAPS.shortText);
      const back = text(o.back ?? o.answer ?? o.definition, CAPS.longText);
      if (!front || !back) return null;
      return { front, back };
    })
    .filter((c): c is StudyCard => c !== null)
    .slice(0, CAPS.flashcards);
}

function normalizeMistakes(value: unknown): StudyMistake[] {
  return list(value)
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const o = entry as Record<string, unknown>;
      const mistake = text(o.mistake ?? o.error ?? o.confusion, CAPS.longText);
      const correction = text(o.correction ?? o.fix ?? o.clarification, CAPS.longText);
      if (!mistake || !correction) return null;
      return { mistake, correction };
    })
    .filter((m): m is StudyMistake => m !== null)
    .slice(0, CAPS.mistakes);
}

/**
 * Convierte lo que sea que haya devuelto el modelo en un `StudyAids` válido.
 *
 * Nunca lanza y nunca devuelve `null`: si no se puede aprovechar nada, el
 * resultado son nueve arrays vacíos, e `isStudyAidsEmpty` lo detecta. Eso es
 * deliberado — la ausencia de ayudas de estudio no debe ser un caso especial
 * para quien las lee, sino simplemente "no hay nada que mostrar".
 */
export function normalizeStudyAids(raw: unknown): StudyAids {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyStudyAids();
  const o = raw as Record<string, unknown>;

  return {
    outline: normalizeOutline(o.outline),
    key_concepts: normalizeConcepts(o.key_concepts),
    worked_examples: normalizeExamples(o.worked_examples),
    study_questions: normalizeQuestions(o.study_questions),
    flashcards: normalizeFlashcards(o.flashcards),
    common_mistakes: normalizeMistakes(o.common_mistakes),
    exam_notes: stringList(o.exam_notes, CAPS.examNotes),
    resources: stringList(o.resources, CAPS.resources),
    open_questions: stringList(o.open_questions, CAPS.openQuestions),
  };
}

export function isStudyAidsEmpty(aids: StudyAids | null | undefined): boolean {
  if (!aids) return true;
  return (
    aids.outline.length === 0 &&
    aids.key_concepts.length === 0 &&
    aids.worked_examples.length === 0 &&
    aids.study_questions.length === 0 &&
    aids.flashcards.length === 0 &&
    aids.common_mistakes.length === 0 &&
    aids.exam_notes.length === 0 &&
    aids.resources.length === 0 &&
    aids.open_questions.length === 0
  );
}

/**
 * Lee las ayudas de estudio de una fila de `minutes`.
 *
 * Mira primero la columna `study_aids` y, si no hay nada, cae a
 * `raw_llm_output` —donde SIEMPRE está el JSON completo que devolvió el
 * modelo—. Eso hace que la sección de estudio funcione aunque la migración
 * 026 todavía no se haya aplicado en esa base de datos, y también para las
 * actas generadas entre el despliegue del código y el de la migración.
 */
export function readStudyAids(minute: Record<string, any> | null | undefined): StudyAids {
  if (!minute) return emptyStudyAids();

  const fromColumn = normalizeStudyAids(minute.study_aids);
  if (!isStudyAidsEmpty(fromColumn)) return fromColumn;

  if (typeof minute.raw_llm_output === 'string' && minute.raw_llm_output.trim()) {
    try {
      const parsed = JSON.parse(minute.raw_llm_output);
      return normalizeStudyAids(parsed?.study_aids);
    } catch {
      // raw_llm_output truncado o corrupto: no es motivo para romper la página.
    }
  }

  return emptyStudyAids();
}

/** Cuántas piezas de estudio hay en total — para el encabezado de la sección. */
export function countStudyAids(aids: StudyAids): number {
  return (
    aids.outline.length +
    aids.key_concepts.length +
    aids.worked_examples.length +
    aids.study_questions.length +
    aids.flashcards.length +
    aids.common_mistakes.length +
    aids.exam_notes.length +
    aids.resources.length +
    aids.open_questions.length
  );
}
