// Filtro de alucinaciones de Whisper.
//
// EL PROBLEMA
// Whisper NO se calla cuando el audio está en silencio: emite fragmentos de sus
// datos de entrenamiento. En español eso significa cosas como «Subtítulos
// realizados por la comunidad de Amara.org», «¡Gracias por ver el video!» o
// «Suscríbete al canal», y con léxico y acento mexicano, que es lo que domina
// en su corpus de español. El resultado es que una grabación muda producía una
// transcripción plausible, y el LLM redactaba encima un acta perfectamente
// creíble de una reunión que nunca ocurrió.
//
// LA SEÑAL QUE YA TENÍAMOS Y TIRÁBAMOS
// La petición pide `response_format: verbose_json`, que devuelve por cada
// fragmento tres métricas pensadas EXACTAMENTE para esto. El código sólo leía
// `result.text` y descartaba el resto.
//
// Los umbrales no son inventados: son los que usa la implementación de
// referencia de Whisper (OpenAI) para decidir si un fragmento es basura.

/** Probabilidad de "aquí no hay voz" por encima de la cual el fragmento es sospechoso. */
const NO_SPEECH_THRESHOLD = 0.6;
/** Confianza media por debajo de la cual Whisper está adivinando. */
const LOGPROB_THRESHOLD = -1.0;
/** Texto que se comprime demasiado = repetición en bucle, señal clásica de alucinación. */
const COMPRESSION_RATIO_THRESHOLD = 2.4;

/**
 * CAPA 2 — umbrales agregados, más laxos que los de arriba a propósito.
 *
 * La capa 1 exige que un fragmento sea MALO por sí solo (no_speech alto Y
 * logprob bajo A LA VEZ) para tirarlo. Eso deja pasar el caso real que motivó
 * esta capa: audio dañado o con ruido de fondo que produce texto FLUIDO y
 * verosímil (frases completas, con sentido gramatical) pero con confianza
 * mediocre y sostenida en todos los fragmentos — ninguno lo bastante malo
 * para la capa 1, pero ninguno tampoco con la confianza alta y pareja de una
 * conversación real bien captada.
 *
 * Por eso esta capa no mira un fragmento aislado: promedia la confianza de
 * TODO lo que sobrevivió la capa 1, ponderado por duración (o longitud de
 * texto si Groq no manda `start`/`end`). Un promedio sistemáticamente
 * mediocre es la señal — un fragmento suelto flojo en medio de fragmentos
 * excelentes no dispara esto, porque el promedio lo diluye.
 */
const AGGREGATE_NO_SPEECH_THRESHOLD = 0.35;
const AGGREGATE_LOGPROB_THRESHOLD = -0.65;

/**
 * Frases que Whisper inventa cuando no hay nada que transcribir.
 *
 * Vienen de subtítulos de YouTube presentes en su entrenamiento. Se comparan
 * sobre el texto normalizado (sin tildes, en minúsculas) porque salen con
 * puntuación y acentuación variables.
 *
 * SÓLO frases que serían absurdas en una reunión real. Antes esta lista tenía
 * "hasta la próxima" y URLs genéricas — ambas cosas que la gente dice de verdad
 * en reuniones y clases ("bueno, hasta la próxima reunión", "revisen
 * www.empresa.com"). Un falso positivo aquí no descarta un segmento: puede
 * tirar la transcripción de una reunión entera que sí se escuchó bien. Ver
 * `MAX_HALLUCINATION_CANDIDATE_LEN` más abajo, que es la protección real.
 */
const HALLUCINATION_PATTERNS: RegExp[] = [
  /subtitulos? (realizados?|por|creados?)/,
  /amara\.?org/,
  /gracias por ver (el|este) video/,
  /suscribete (al canal|a mi canal)/,
  /no olvides suscribirte/,
  /dale like y suscribete/,
  /nos vemos en el proximo video/,
  /subtitulado por la comunidad/,
  /editor de subtitulos/,
];

/**
 * Las alucinaciones de Whisper son SIEMPRE frases cortas y enlatadas — nunca
 * aparecen incrustadas en medio de una oración real de veinte palabras. Por
 * eso el filtro de patrones sólo se aplica a texto corto: así "gracias por ver
 * el video" en un fragmento de tres palabras se descarta, pero "les agradezco
 * a todos, y antes de cerrar quería comentar que también revisen la propuesta
 * que envié" NO se descarta sólo porque contenga la palabra "gracias".
 *
 * Es la protección real contra falsos positivos, más que la lista de frases
 * en sí — la lista siempre va a estar incompleta, pero el límite de longitud
 * acota el daño de cualquier coincidencia por casualidad.
 */
const MAX_HALLUCINATION_CANDIDATE_LEN = 80;

export interface WhisperSegment {
  text?: string;
  no_speech_prob?: number;
  avg_logprob?: number;
  compression_ratio?: number;
  start?: number;
  end?: number;
}

export interface CleanResult {
  /** Texto utilizable. Cadena vacía si no quedó nada. */
  text: string;
  /** Fragmentos descartados, para poder diagnosticar sin adivinar. */
  dropped: number;
  /** Total de fragmentos que venían. */
  total: number;
  /** true si prácticamente todo era ruido: el llamador debe fallar, no seguir. */
  isSilence: boolean;
}

/** Minúsculas y sin tildes, para comparar frases con acentuación irregular. */
function normalize(value: string): string {
  const decomposed = (value || '').normalize('NFD');
  let out = '';
  for (const ch of decomposed) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x0300 && code <= 0x036f) continue; // marcas diacríticas
    out += ch;
  }
  return out.toLowerCase().trim();
}

/**
 * ¿El texto es una de las muletillas que Whisper inventa sobre el silencio?
 *
 * Un texto LARGO nunca cuenta como alucinación, aunque contenga alguna de las
 * frases de la lista — ver `MAX_HALLUCINATION_CANDIDATE_LEN`. Antes esto
 * descartaba una reunión real de 40 minutos porque la última frase decía
 * "hasta la próxima reunión".
 */
export function looksLikeHallucination(text: string): boolean {
  const normalized = normalize(text);
  if (normalized.length === 0) return true;
  if (normalized.length > MAX_HALLUCINATION_CANDIDATE_LEN) return false;
  return HALLUCINATION_PATTERNS.some((pattern) => pattern.test(normalized));
}

/**
 * ¿Es el mismo trozo repetido una y otra vez?
 *
 * Whisper se atasca en bucles ("sí, sí, sí, sí…") cuando el audio no le da
 * nada. Es un ÚLTIMO recurso para cuando no hay ninguna métrica de Whisper que
 * consultar (`compression_ratio` es la señal de verdad, y se usa primero
 * siempre que está disponible — ver `cleanWhisperResult`).
 *
 * El umbral es deliberadamente laxo: el español hablado repite muchísimo
 * conectores ("bueno", "entonces", "o sea", "eso"), y un umbral estricto
 * confundía una reunión real y algo repetitiva con un bucle de Whisper.
 */
export function isRepetitionLoop(text: string): boolean {
  const words = normalize(text).split(/\s+/).filter(Boolean);
  if (words.length < 20) return false;
  const unique = new Set(words);
  // Menos de un 15% de palabras distintas: eso ya no es conversación repetitiva,
  // es literalmente la misma palabra o frase sonando en bucle.
  return unique.size / words.length < 0.15;
}

/**
 * CAPA 2 — ¿el conjunto que sobrevivió la capa 1 es, EN PROMEDIO, poco fiable?
 *
 * Pondera por duración (`end - start`) cuando Groq la manda; si no, por
 * longitud de texto — ambas son proxies razonables de "cuánto pesa este
 * fragmento en el resultado final". Exige las dos condiciones a la vez, igual
 * que la capa 1, sólo que con umbrales más laxos: así una reunión real con
 * algo de ruido de fondo (no_speech algo elevado, logprob normal) no cae aquí.
 */
export function hasWeakAggregateSignal(segments: WhisperSegment[]): boolean {
  let weightedNoSpeech = 0;
  let weightedLogprob = 0;
  let totalWeight = 0;

  for (const segment of segments) {
    const text = (segment.text || '').trim();
    if (!text) continue;

    const weight =
      typeof segment.start === 'number' && typeof segment.end === 'number' && segment.end > segment.start
        ? segment.end - segment.start
        : text.length;

    weightedNoSpeech += (segment.no_speech_prob ?? 0) * weight;
    weightedLogprob += (segment.avg_logprob ?? 0) * weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) return false;

  const avgNoSpeech = weightedNoSpeech / totalWeight;
  const avgLogprob = weightedLogprob / totalWeight;

  return avgNoSpeech > AGGREGATE_NO_SPEECH_THRESHOLD && avgLogprob < AGGREGATE_LOGPROB_THRESHOLD;
}

/**
 * Limpia la respuesta de Whisper usando las métricas por fragmento.
 *
 * Se descarta un fragmento cuando:
 *  - Whisper dice que no hay voz Y además tenía poca confianza. Se exigen LAS
 *    DOS condiciones a propósito: `no_speech_prob` alto por sí solo aparece en
 *    audio con voz baja o lejana, que sí queremos conservar.
 *  - El texto se comprime demasiado (repetición en bucle).
 *  - El texto coincide con una alucinación conocida.
 *
 * Y se descarta el resultado COMPLETO (capa 2, `hasWeakAggregateSignal`)
 * cuando ningún fragmento individual fue tan malo como para caer arriba, pero
 * el conjunto entero tiene una confianza mediocre y sostenida — el patrón de
 * audio dañado/con ruido que alucina texto fluido en vez de muletillas cortas.
 */
export function cleanWhisperResult(result: {
  text?: string;
  segments?: WhisperSegment[];
}): CleanResult {
  const segments = Array.isArray(result?.segments) ? result.segments : null;

  // Sin métricas por fragmento sólo se puede filtrar por el texto completo.
  if (!segments || segments.length === 0) {
    const raw = (result?.text || '').trim();
    const bad = raw.length === 0 || looksLikeHallucination(raw) || isRepetitionLoop(raw);
    return {
      text: bad ? '' : raw,
      dropped: bad ? 1 : 0,
      total: 1,
      isSilence: bad,
    };
  }

  const kept: string[] = [];
  const keptSegments: WhisperSegment[] = [];
  let dropped = 0;

  for (const segment of segments) {
    const text = (segment.text || '').trim();
    if (!text) {
      dropped++;
      continue;
    }

    const noSpeech = segment.no_speech_prob ?? 0;
    const logprob = segment.avg_logprob ?? 0;

    const silentAndUnsure = noSpeech > NO_SPEECH_THRESHOLD && logprob < LOGPROB_THRESHOLD;

    // `compression_ratio` es la métrica REAL de Whisper para "esto se repite" —
    // se usa siempre que Groq la envía. La heurística de texto
    // (`isRepetitionLoop`) es sólo el último recurso para cuando el campo no
    // vino: aplicarla también encima de una métrica real no aporta nada y sólo
    // añade una vía más de falso positivo sobre español hablado, que repite
    // conectores constantemente.
    const looping =
      segment.compression_ratio !== undefined
        ? segment.compression_ratio > COMPRESSION_RATIO_THRESHOLD
        : isRepetitionLoop(text);

    if (silentAndUnsure || looping || looksLikeHallucination(text)) {
      dropped++;
      continue;
    }

    kept.push(text);
    keptSegments.push(segment);
  }

  const text = kept.join(' ').replace(/\s+/g, ' ').trim();

  // Un puñado de palabras sueltas tras filtrar no es una reunión: es ruido que
  // se coló. Mejor tratarlo como silencio que redactar un acta sobre ello.
  const tooShort = text.length < 25;

  // Capa 2: nada individual fue lo bastante malo, pero el conjunto entero
  // tiene una confianza mediocre y sostenida — el patrón de audio dañado que
  // alucina texto fluido en vez de muletillas cortas y aisladas.
  const weakAggregate = !tooShort && hasWeakAggregateSignal(keptSegments);
  const isSilence = tooShort || weakAggregate;

  return { text: isSilence ? '' : text, dropped: weakAggregate ? segments.length : dropped, total: segments.length, isSilence };
}
