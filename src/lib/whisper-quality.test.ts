import { describe, it, expect } from 'vitest';
import {
  cleanWhisperResult,
  looksLikeHallucination,
  isRepetitionLoop,
  hasWeakAggregateSignal,
} from '@/lib/whisper-quality';

/**
 * El bug que motivó este módulo: una grabación en silencio producía una
 * transcripción plausible («Gracias por ver el video», «Subtítulos por
 * Amara.org») porque el único filtro era `transcript.trim().length === 0`.
 * El LLM redactaba encima un acta creíble de una reunión que no ocurrió.
 */
describe('looksLikeHallucination', () => {
  it('reconoce las muletillas de subtítulos de YouTube', () => {
    expect(looksLikeHallucination('Subtítulos realizados por la comunidad de Amara.org')).toBe(true);
    expect(looksLikeHallucination('¡Gracias por ver el video!')).toBe(true);
    expect(looksLikeHallucination('Suscríbete al canal')).toBe(true);
    expect(looksLikeHallucination('No olvides suscribirte')).toBe(true);
  });

  it('funciona sin tildes y con puntuación distinta', () => {
    // Whisper devuelve la misma frase con acentuación y signos variables.
    expect(looksLikeHallucination('Subtitulos realizados por la comunidad de Amara org')).toBe(true);
    expect(looksLikeHallucination('GRACIAS POR VER EL VIDEO')).toBe(true);
  });

  it('trata el texto vacío como alucinación', () => {
    expect(looksLikeHallucination('')).toBe(true);
    expect(looksLikeHallucination('   ')).toBe(true);
  });

  it('NO descarta contenido real de una reunión', () => {
    expect(looksLikeHallucination('Ana enviará la cotización antes del viernes')).toBe(false);
    expect(looksLikeHallucination('Quedamos en revisar el presupuesto la próxima semana')).toBe(false);
    // Una despedida DENTRO de una frase real no debe disparar el filtro.
    expect(looksLikeHallucination('Bueno, gracias a todos por venir, revisamos el lunes')).toBe(false);
  });

  // --- Regresiones reales reportadas en producción (v1.14) ---

  it('NO descarta "hasta la próxima": es una despedida real y normalísima', () => {
    // Bug real: el patrón no estaba anclado, así que cualquier reunión o clase
    // que cerrara con esta frase —carísimamente común— perdía el fragmento
    // entero. Se quitó de la lista de patrones.
    expect(looksLikeHallucination('Hasta la próxima.')).toBe(false);
    expect(looksLikeHallucination('Bueno, entonces quedamos así, hasta la próxima reunión del comité')).toBe(false);
  });

  it('NO descarta que alguien mencione una URL real', () => {
    // "revisen www.empresa.com" es perfectamente normal en una reunión de
    // trabajo; el patrón de URL genérico se quitó por el mismo motivo.
    expect(looksLikeHallucination('También revisen la propuesta en www.empresa.com antes del jueves')).toBe(false);
  });

  it('un texto LARGO nunca cuenta como alucinación, aunque contenga una frase de la lista', () => {
    // Las alucinaciones de Whisper son frases cortas y enlatadas — nunca
    // aparecen incrustadas en una oración real y larga. Esta es la protección
    // de fondo, más importante que la lista de frases en sí.
    const oracionLarga =
      'Quiero agradecer a todos por venir hoy, sé que fue un esfuerzo llegar temprano, y antes de cerrar la reunión les recuerdo que el viernes es la fecha límite para la entrega del informe';
    expect(looksLikeHallucination(oracionLarga)).toBe(false);
  });

  it('SÍ descarta la frase de alucinación cuando es corta y aislada', () => {
    // El contraste con el caso anterior: la misma familia de frase, pero como
    // TODO el contenido de un fragmento corto, sigue siendo el caso que
    // este módulo existe para atrapar.
    expect(looksLikeHallucination('Suscríbete al canal para más videos')).toBe(true);
  });
});

describe('isRepetitionLoop', () => {
  it('detecta a Whisper atascado repitiendo', () => {
    expect(isRepetitionLoop(Array(22).fill('sí').join(' '))).toBe(true);
  });

  it('no marca texto corto', () => {
    // Frases cortas repetitivas son normales; hace falta longitud para juzgar.
    expect(isRepetitionLoop('sí sí sí')).toBe(false);
  });

  it('no marca una frase larga y variada', () => {
    expect(
      isRepetitionLoop(
        'Revisamos el avance del proyecto, Ana envía la cotización el viernes y Luis contacta al proveedor la semana entrante',
      ),
    ).toBe(false);
  });

  it('NO marca español hablado real con muletillas repetidas', () => {
    // Bug real: el umbral anterior (25% de palabras únicas sobre 12 palabras)
    // confundía conversación normal con un bucle. El español hablado repite
    // "bueno", "entonces", "o sea" constantemente sin que eso sea Whisper
    // alucinando.
    const hablaNatural =
      'Bueno entonces yo creo que bueno lo que pasa es que bueno tenemos que revisar bueno el tema del presupuesto entonces bueno vamos a quedar en eso';
    expect(isRepetitionLoop(hablaNatural)).toBe(false);
  });
});

describe('cleanWhisperResult', () => {
  const buenSegmento = {
    text: 'Ana enviará la cotización de materiales antes del viernes.',
    no_speech_prob: 0.02,
    avg_logprob: -0.3,
    compression_ratio: 1.4,
  };

  it('conserva los fragmentos con voz real', () => {
    const r = cleanWhisperResult({ segments: [buenSegmento] });
    expect(r.isSilence).toBe(false);
    expect(r.text).toContain('cotización');
    expect(r.dropped).toBe(0);
  });

  it('descarta el silencio: sin voz Y sin confianza', () => {
    const r = cleanWhisperResult({
      segments: [{ text: 'Gracias por ver el video.', no_speech_prob: 0.95, avg_logprob: -1.8, compression_ratio: 1.1 }],
    });
    expect(r.isSilence).toBe(true);
    expect(r.text).toBe('');
    expect(r.dropped).toBe(1);
  });

  it('NO descarta voz baja o lejana', () => {
    // Se exigen las DOS condiciones a propósito: `no_speech_prob` alto por sí
    // solo aparece con micrófonos lejanos, y ahí sí queremos el texto.
    const r = cleanWhisperResult({
      segments: [{ ...buenSegmento, no_speech_prob: 0.8, avg_logprob: -0.4 }],
    });
    expect(r.isSilence).toBe(false);
    expect(r.text).toContain('cotización');
  });

  it('descarta los bucles de repetición por compression_ratio', () => {
    const r = cleanWhisperResult({
      segments: [{ text: 'sí sí sí sí sí', no_speech_prob: 0.1, avg_logprob: -0.5, compression_ratio: 3.9 }],
    });
    expect(r.isSilence).toBe(true);
  });

  it('cuando compression_ratio viene y es normal, NO recurre a la heurística de texto', () => {
    // Bug real: antes se aplicaban las dos comprobaciones a la vez, así que un
    // segmento real con una métrica de Whisper perfectamente sana podía caer
    // igual por el heurístico de texto sobre habla repetitiva normal.
    const textoRepetitivoPeroReal =
      'bueno bueno entonces bueno yo creo que bueno tenemos que bueno revisar esto bueno antes del jueves bueno';
    const r = cleanWhisperResult({
      segments: [
        { text: textoRepetitivoPeroReal, no_speech_prob: 0.05, avg_logprob: -0.3, compression_ratio: 1.3 },
      ],
    });
    expect(r.isSilence).toBe(false);
    expect(r.text).toContain('revisar esto');
  });

  it('descarta alucinaciones aunque las métricas parezcan buenas', () => {
    // Whisper a veces está MUY seguro de su alucinación.
    const r = cleanWhisperResult({
      segments: [
        { text: 'Subtítulos realizados por la comunidad de Amara.org', no_speech_prob: 0.05, avg_logprob: -0.2, compression_ratio: 1.2 },
      ],
    });
    expect(r.isSilence).toBe(true);
  });

  it('mezcla: se queda con lo bueno y tira lo malo', () => {
    const r = cleanWhisperResult({
      segments: [
        { text: 'Gracias por ver el video.', no_speech_prob: 0.9, avg_logprob: -1.5, compression_ratio: 1.1 },
        buenSegmento,
        { text: 'Suscríbete al canal', no_speech_prob: 0.1, avg_logprob: -0.4, compression_ratio: 1.0 },
      ],
    });
    expect(r.text).toContain('cotización');
    expect(r.text).not.toContain('Suscríbete');
    expect(r.text).not.toContain('Gracias por ver');
    expect(r.dropped).toBe(2);
    expect(r.total).toBe(3);
  });

  it('trata como silencio lo que queda en cuatro palabras sueltas', () => {
    // Ruido que se cuela no es una reunión; mejor fallar que redactar sobre eso.
    const r = cleanWhisperResult({
      segments: [{ text: 'eh', no_speech_prob: 0.2, avg_logprob: -0.5, compression_ratio: 1.0 }],
    });
    expect(r.isSilence).toBe(true);
  });

  it('sin métricas por fragmento, filtra por el texto completo', () => {
    // Algunos formatos de respuesta no traen `segments`.
    expect(cleanWhisperResult({ text: '¡Gracias por ver el video!' }).isSilence).toBe(true);
    expect(cleanWhisperResult({ text: 'Ana envía la cotización el viernes sin falta' }).isSilence).toBe(false);
  });

  it('aguanta una respuesta vacía sin reventar', () => {
    expect(cleanWhisperResult({}).isSilence).toBe(true);
    expect(cleanWhisperResult({ segments: [] }).isSilence).toBe(true);
  });

  // --- El bug reportado: reunión audible marcada como silencio ---

  it('NO marca como silencio una transcripción real completa que cierra con "hasta la próxima"', () => {
    // Esto es exactamente lo que pasaba en producción: analyzeMeeting() llama
    // a cleanWhisperResult({ text: transcripcionCompleta }) — sin `segments`,
    // porque la transcripción ya viene concatenada de varios fragmentos — y
    // esa es la rama de texto completo. Antes, "hasta la próxima" en
    // cualquier parte de una reunión real y larga tiraba TODA la
    // transcripción a la basura.
    const transcripcionReal =
      'Buenos días a todos, empezamos revisando el avance del proyecto de la semana pasada. ' +
      'Ana comentó que la cotización de materiales ya está lista y la va a enviar el viernes. ' +
      'Luis quedó en contactar al proveedor para coordinar la entrega la próxima semana. ' +
      'También se habló del presupuesto general, que queda pendiente de aprobar en la próxima reunión. ' +
      'Bueno, creo que eso es todo por hoy, gracias a todos por venir, hasta la próxima.';
    const r = cleanWhisperResult({ text: transcripcionReal });
    expect(r.isSilence).toBe(false);
    expect(r.text).toContain('cotización de materiales');
    expect(r.text).toContain('hasta la próxima');
  });
});

/**
 * CAPA 2 — el caso real que la motivó: audio dañado/con ruido que Whisper
 * transcribe como texto fluido y con sentido gramatical (no las muletillas
 * cortas de siempre), con confianza mediocre y pareja en todos los
 * fragmentos. Ninguno cruza el umbral estricto de la capa 1 por sí solo.
 */
describe('hasWeakAggregateSignal (capa 2)', () => {
  it('detecta confianza mediocre y sostenida en todo el conjunto', () => {
    const fragmentosDudosos = [
      { text: 'Esta lucha se ha realizado en el estudio de la serie de tráfico de fábricas.', no_speech_prob: 0.45, avg_logprob: -0.75, start: 0, end: 5 },
      { text: 'La sección de tráfico se ha encargado de la distribución de fábricas.', no_speech_prob: 0.5, avg_logprob: -0.8, start: 5, end: 10 },
      { text: 'Cuando no importa o no se sabe quién realizó la acción.', no_speech_prob: 0.42, avg_logprob: -0.7, start: 10, end: 15 },
    ];
    expect(hasWeakAggregateSignal(fragmentosDudosos)).toBe(true);
  });

  it('NO se dispara con una reunión real, aunque tenga algo de ruido de fondo', () => {
    const fragmentosReales = [
      { text: 'Ana enviará la cotización de materiales antes del viernes.', no_speech_prob: 0.1, avg_logprob: -0.3, start: 0, end: 4 },
      { text: 'Luis va a contactar al proveedor la próxima semana.', no_speech_prob: 0.15, avg_logprob: -0.35, start: 4, end: 8 },
      // Un fragmento algo ruidoso en medio de otros buenos no debe pesar tanto.
      { text: 'También quedó pendiente revisar el presupuesto general.', no_speech_prob: 0.3, avg_logprob: -0.5, start: 8, end: 12 },
    ];
    expect(hasWeakAggregateSignal(fragmentosReales)).toBe(false);
  });

  it('pondera por duración cuando viene start/end, no por cantidad de fragmentos', () => {
    // Un fragmento largo y bueno debe pesar más que dos cortos y dudosos.
    const fragmentos = [
      { text: 'eh', no_speech_prob: 0.5, avg_logprob: -0.9, start: 0, end: 1 },
      { text: 'ajá', no_speech_prob: 0.5, avg_logprob: -0.9, start: 1, end: 2 },
      {
        text: 'Quedamos en que Ana revisa el contrato completo y lo envía firmado antes del jueves a primera hora.',
        no_speech_prob: 0.05,
        avg_logprob: -0.25,
        start: 2,
        end: 30,
      },
    ];
    expect(hasWeakAggregateSignal(fragmentos)).toBe(false);
  });

  it('sin duración disponible, pondera por longitud de texto', () => {
    const fragmentosDudosos = [
      { text: 'Esta lucha se ha realizado en el estudio de la serie de tráfico de fábricas y contactos.', no_speech_prob: 0.45, avg_logprob: -0.75 },
      { text: 'La sección de tráfico se ha encargado de la distribución completa de las fábricas locales.', no_speech_prob: 0.48, avg_logprob: -0.78 },
    ];
    expect(hasWeakAggregateSignal(fragmentosDudosos)).toBe(true);
  });

  it('ignora fragmentos vacíos y no revienta con una lista vacía', () => {
    expect(hasWeakAggregateSignal([])).toBe(false);
    expect(hasWeakAggregateSignal([{ text: '', no_speech_prob: 0.9, avg_logprob: -2 }])).toBe(false);
  });
});

describe('cleanWhisperResult — capa 2 integrada', () => {
  it('descarta una transcripción fluida pero de confianza mediocre y sostenida', () => {
    // El bug real reportado: transcripción coherente gramaticalmente pero sin
    // relación con una conversación real, producto de audio dañado/con
    // ruido. Ningún fragmento individual es tan malo como para que la capa 1
    // lo tumbe, pero el conjunto es sistemáticamente mediocre.
    const r = cleanWhisperResult({
      segments: [
        { text: 'Esta lucha se ha realizado en el estudio de la serie de tráfico de fábricas.', no_speech_prob: 0.45, avg_logprob: -0.75, compression_ratio: 1.3, start: 0, end: 6 },
        { text: 'La sección de tráfico se ha encargado de la distribución de fábricas.', no_speech_prob: 0.5, avg_logprob: -0.8, compression_ratio: 1.4, start: 6, end: 12 },
        { text: 'Cuando no importa o no se sabe quién realizó la acción, coloquen nota.', no_speech_prob: 0.42, avg_logprob: -0.7, compression_ratio: 1.2, start: 12, end: 18 },
      ],
    });
    expect(r.isSilence).toBe(true);
    expect(r.text).toBe('');
  });

  it('NO descarta una reunión real por la capa 2, aunque tenga ruido de fondo disperso', () => {
    const r = cleanWhisperResult({
      segments: [
        { text: 'Buenos días a todos, empezamos revisando el avance del proyecto.', no_speech_prob: 0.08, avg_logprob: -0.25, compression_ratio: 1.2, start: 0, end: 5 },
        { text: 'Ana comentó que la cotización de materiales ya está lista.', no_speech_prob: 0.12, avg_logprob: -0.3, compression_ratio: 1.3, start: 5, end: 10 },
        { text: 'Luis quedó en contactar al proveedor la próxima semana.', no_speech_prob: 0.28, avg_logprob: -0.55, compression_ratio: 1.2, start: 10, end: 15 },
      ],
    });
    expect(r.isSilence).toBe(false);
    expect(r.text).toContain('cotización de materiales');
  });
});
