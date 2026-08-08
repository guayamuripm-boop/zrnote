import { describe, it, expect } from 'vitest';
import {
  cleanWhisperResult,
  looksLikeHallucination,
  isRepetitionLoop,
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
});

describe('isRepetitionLoop', () => {
  it('detecta a Whisper atascado repitiendo', () => {
    expect(isRepetitionLoop('sí sí sí sí sí sí sí sí sí sí sí sí sí sí')).toBe(true);
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
});
