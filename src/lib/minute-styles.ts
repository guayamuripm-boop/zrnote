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
   * Sustituye el CONTENIDO del campo `summary` — de qué tiene que hablar, no
   * cuánto tiene que extenderse (eso es summary-length.ts, un eje aparte). Un
   * acta de clase no resume "para qué se reunieron y qué se resolvió": resume
   * qué se enseñó.
   */
  contentFocus?: string;
  /**
   * Si este estilo produce el bloque `study_aids`. Gobierna la interfaz (si se
   * muestra la sección de estudio) y el aviso del selector.
   */
  producesStudyAids?: boolean;
  /** Si este estilo produce el bloque `chapters` (línea de tiempo por momentos). */
  producesChapters?: boolean;
  /**
   * Estilo opcional: no aparece para nadie hasta que la persona lo activa en su
   * perfil (`users.content_mode_enabled`). Existe para no llenar el selector de
   * opciones que casi nadie necesita.
   */
  optIn?: boolean;
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
    contentFocus:
      'Primero qué se resolvió o decidió (con cifras, fechas y nombres exactos), después qué queda pendiente y quién lo tiene. Cuenta resultados, no narres la conversación ni digas "se habló de". Si la reunión no llegó a nada concreto, dilo con esas palabras.',
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
    contentFocus:
      'Explica el contenido que se enseñó como si fueras un compañero que le cuenta a otro qué vieron en clase. No listes los temas: DESARRÓLLALOS. Para cada concepto importante, di qué es, cómo funciona y para qué sirve, con las palabras con que se explicó en clase. Si se vieron fórmulas, escríbelas y explica qué calcula cada una. Si se hicieron ejercicios, describe el planteamiento y la solución. Que alguien que no estuvo pueda leer este resumen y ENTENDER la clase, no solo saber de qué habló. Nunca digas "se vio", "se habló de", "el profesor explicó" — ve directo al contenido ("La ley de Ohm establece que V = I × R, donde…"). Al final, si quedaron tareas o deberes, menciónalos.',

    extraRules: `APUNTES DE CLASE: EL BLOQUE "study_aids"
Además del acta, esta sesión es una CLASE, así que produces también material de estudio. Es la parte que más se va a usar, así que trátala con el mismo cuidado que los compromisos.

LA REGLA QUE MANDA SOBRE TODO ESTE BLOQUE — LÉELA DOS VECES
Todo lo que escribas aquí tiene que salir de la transcripción. TÚ SABES DE ESTOS TEMAS, y esa es exactamente la trampa: si el docente definió mal un término, o lo definió a medias, escribes lo que él dijo, no lo que tú sabes. No completes una explicación con conocimiento tuyo, no añadas conceptos correctos que nadie mencionó, no "arregles" un ejemplo mal resuelto. Unos apuntes con seis conceptos que de verdad se explicaron valen más que veinte sacados de tu memoria: el estudiante los usará para responder a ESTE profesor.
Si la sesión no fue una clase —es un claustro, una reunión de coordinación, una tutoría administrativa— deja todos los arrays de study_aids vacíos. No es un fallo: no había nada que enseñar.

CÓMO LLENAR CADA PARTE
- outline: el temario REAL de la sesión, en el orden en que se cubrió. Es el esqueleto de los apuntes. Cada sección con sus puntos, y cada punto una afirmación completa que se entienda sola ("La corriente es directamente proporcional al voltaje e inversamente proporcional a la resistencia"), no una etiqueta ("ley de Ohm"). Si la clase saltó de un tema a otro y volvió, agrupa: manda el orden lógico, no el cronológico.
- key_concepts: los términos que un estudiante tendría que buscar si no los conociera. La definición, CON LAS PALABRAS CON QUE SE EXPLICÓ EN CLASE. Si un término se nombró pero nunca se explicó, no lo pongas — no lo definas tú.
- key_formulas: fórmulas, leyes, teoremas, constantes, fechas clave o datos numéricos que en un cuaderno se enmarcarían o subrayarían. "formula" es el enunciado exacto (V = I × R, fecha de la Revolución Francesa: 1789, etc.); "meaning" qué calcula o qué representa; "when_to_use" cuándo se aplica — null si no se dijo. NO repitas aquí lo que ya está en key_concepts: si algo es un término conceptual va al glosario, si es una expresión cuantificable o un dato puntual va aquí.
- worked_examples: los ejercicios, casos o demostraciones que se desarrollaron delante de la clase. "problem" es lo que se planteó; "approach" es cómo se resolvió, con los pasos que se dieron. Si no se resolvió ningún ejemplo, array vacío.
- study_questions: preguntas de repaso cuya respuesta está EN LA CLASE. Cada respuesta tiene que poder señalarse en la transcripción. Que no sean todas de definición: pregunta también por el porqué, por la diferencia entre dos cosas, por cuándo se aplica una y cuándo la otra.
- flashcards: memorización pura, cortas. Anverso: un término, una fórmula, una pregunta de una línea. Reverso: la respuesta, breve. No repitas literalmente las study_questions — la tarjeta es para el dato suelto, la pregunta es para el razonamiento.
- common_mistakes: SÓLO si el docente advirtió de un error, una confusión frecuente o un "ojo con esto". No inventes errores plausibles.
- exam_notes: SÓLO lo que se dijo de forma explícita sobre la evaluación — qué entra, qué formato tiene, cuánto pesa, qué hay que traer. Si no se habló del examen, array vacío.
- resources: libros, capítulos, páginas, vídeos o materiales que se mencionaron por su nombre. Nada de recomendaciones tuyas.
- open_questions: preguntas que se hicieron en clase y quedaron SIN responder, o algo que el docente dejó "para la próxima". Es lo que el estudiante tiene que preguntar.

CANTIDAD
Ajústala a lo que dio la clase, no a llenar el documento — pero por defecto, PECA DE MÁS, no de menos: estos apuntes tienen que poder sustituir el cuaderno de quien no pudo tomar los suyos, así que es mejor un concepto de más que uno que falte. Una clase densa de una hora: 15-25 conceptos, 5-15 fórmulas/datos clave, 10-18 preguntas, 20-30 tarjetas, y el outline con TODAS las secciones que se cubrieron, no un resumen de las principales. Una charla corta o una sesión de dudas: mucho menos, o nada. Un array vacío sigue siendo una respuesta correcta cuando de verdad no hay nada que poner — pero no recortes contenido real que sí se explicó sólo para que la lista quede corta.`,

    extraSchema: `,
  "study_aids": {
    "outline": [ { "section": "Título de la parte de la clase", "points": ["Afirmación completa que se entiende sola", "..."] } ],
    "key_concepts": [ { "term": "El término", "definition": "Qué es, con las palabras con que se explicó en clase", "why": "Para qué sirve o dónde se usa — null si no se dijo" } ],
    "key_formulas": [ { "formula": "V = I × R", "meaning": "El voltaje es el producto de la corriente por la resistencia", "when_to_use": "Para calcular voltaje en un circuito resistivo — null si no se dijo" } ],
    "worked_examples": [ { "problem": "El ejercicio o caso que se planteó", "approach": "Cómo se resolvió, con los pasos que se dieron" } ],
    "study_questions": [ { "question": "Pregunta de repaso", "answer": "La respuesta, tal como se explicó en clase" } ],
    "flashcards": [ { "front": "Término, fórmula o pregunta de una línea", "back": "La respuesta, breve" } ],
    "common_mistakes": [ { "mistake": "El error del que advirtió el docente", "correction": "Lo correcto, según él" } ],
    "exam_notes": ["Lo que se dijo explícitamente sobre la evaluación"],
    "resources": ["Libro, capítulo o material mencionado por su nombre"],
    "open_questions": ["Pregunta que quedó sin responder en clase"]
  }`,
  },
  contenido: {
    value: 'contenido',
    label: 'Contenido',
    emoji: '🎙️',
    shortDescription: 'Podcasts, conferencias y videos — por capítulos',
    producesChapters: true,
    optIn: true,
    roleFraming:
      'Eres un editor que prepara la guía de un podcast, una conferencia o un video para quien no lo va a ver entero. Tu trabajo no es opinar ni adornar: es dejar por escrito, en orden cronológico, qué se dijo en cada momento, para que alguien pueda entender el contenido completo o saltar justo al tramo que le interesa.',
    commitmentExamples:
      '"les dejo de tarea…", "les pido que…", "escriban a…", "inscríbanse en…", "descarguen…" — sólo si quien habla pide algo concreto a la audiencia. En un contenido normal NO hay compromisos: array vacío',
    contentFocus:
      'Di de qué trata el contenido y cuáles son las 3 a 5 ideas o conclusiones más importantes de principio a fin, sin adornos, sin elogios y sin "en este episodio se habló de". Ve directo a las afirmaciones: qué se sostiene, qué se concluye, qué se recomienda. Si hay una tesis central, dila en la primera frase.',
    extraRules: `CONTENIDO POR CAPÍTULOS: EL BLOQUE "chapters"
Esta sesión es un CONTENIDO (podcast, conferencia, charla o video), no una reunión de trabajo. Además del resumen produces una guía cronológica por capítulos o momentos.

CÓMO DIVIDIR
- Cada capítulo es un tramo con un tema propio: cuando cambia el tema, empieza otro capítulo. No cortes por minutos fijos ni por número.
- Contenido de una hora: 6 a 12 capítulos. Charla corta: 3 a 5. Que cada capítulo cubra unos minutos de contenido, no una frase suelta ni media hora.
- El orden es SIEMPRE el de la grabación. Si el orador vuelve a un tema anterior, va dentro del capítulo donde ocurre, no se reordena.
- Cubre la grabación ENTERA, hasta el final. Los últimos capítulos son los que más se olvidan.

TIEMPOS
- La transcripción puede traer marcas como [12:30] al inicio de cada bloque. "time" es la marca del bloque donde EMPIEZA el capítulo, copiada tal cual. Nunca inventes una hora ni la calcules: si no hay marcas en el texto, "time" es null.

QUÉ ESCRIBIR EN CADA CAPÍTULO
- title: 3 a 8 palabras que digan DE QUÉ trata el tramo ("Por qué fallan los cohetes reutilizables"), no etiquetas vacías como "Introducción" salvo que de verdad lo sea.
- summary: 2 a 4 frases con lo que se dijo en ese tramo, en el orden en que se dijo. Directo al contenido: nada de "el orador explica que" ni "se habla de". Sin adjetivos de relleno.
- key_points: hasta 4 datos concretos de ese tramo — cifras, nombres propios, fechas, recomendaciones, afirmaciones que alguien querría citar. Sólo lo que se dijo. Si no hay nada concreto, array vacío.

REGLA QUE MANDA: todo sale de la transcripción. No añadas contexto, datos ni correcciones de tu conocimiento aunque sepas que el orador se equivocó. Un invitado no es un compromiso: los nombres de quienes hablan sólo se usan si se pronuncian con claridad.
Los demás campos (decisions, blockers, project_statuses…) casi siempre van vacíos en un contenido: no los rellenes por rellenar. "discussion" también va vacío: la guía cronológica son los capítulos.`,
    extraSchema: `,
  "chapters": [ { "time": "Marca [mm:ss] del bloque donde empieza este tramo, o null si el texto no trae marcas", "title": "3 a 8 palabras que digan de qué trata el tramo", "summary": "2 a 4 frases, en orden cronológico, directo al contenido", "key_points": ["Dato, cifra o afirmación concreta de este tramo"] } ]`,
  },
};

/**
 * Estilos que esta persona puede elegir: los de siempre más los opcionales
 * que activó en su perfil.
 */
export function availableMinuteStyles(contentModeEnabled: boolean): MinuteStyleDef[] {
  return MINUTE_STYLE_OPTIONS.filter((s) => !s.optIn || contentModeEnabled);
}

/**
 * Valida un estilo contra lo que la persona tiene activado. Un estilo opcional
 * que no ha activado (o que desactivó después de guardarlo como favorito) cae
 * al valor por defecto, igual que un valor desconocido.
 */
export function resolveMinuteStyle(value: unknown, contentModeEnabled: boolean): string {
  const key = normalizeMinuteStyle(value);
  return MINUTE_STYLES[key].optIn && !contentModeEnabled ? DEFAULT_MINUTE_STYLE : key;
}

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
