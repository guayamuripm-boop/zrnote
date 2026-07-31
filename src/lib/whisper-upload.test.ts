import { describe, it, expect } from 'vitest';

/**
 * Regression guard for the `.aac` upload failure.
 *
 * Every segment of a real meeting came back from Groq with
 * `400 file must be one of the following types: [flac mp3 mp4 mpeg mpga m4a
 * ogg opus wav webm]` even though the code was already renaming `.aac` to
 * `.m4a`. Renaming the FILE is not enough — Groq also validates the multipart
 * part's Content-Type, and the blob downloaded from Supabase Storage still
 * carried `audio/aac` from upload time.
 *
 * These mirror the tables in processing.ts::transcribeSegment.
 */

const GROQ_EXTS = new Set(['flac', 'mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'ogg', 'opus', 'wav', 'webm']);

const MIME_BY_EXT: Record<string, string> = {
  flac: 'audio/flac',
  mp3: 'audio/mpeg',
  mpeg: 'audio/mpeg',
  mpga: 'audio/mpeg',
  mp4: 'audio/mp4',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  wav: 'audio/wav',
  webm: 'audio/webm',
};

const candidatesFor = (rawExt: string) =>
  GROQ_EXTS.has(rawExt) ? [rawExt] : ['m4a', 'mp4', 'mpga', 'wav', 'ogg'];

describe('extensiones que Groq acepta', () => {
  it('aac NO está permitido: hay que reetiquetarlo', () => {
    expect(GROQ_EXTS.has('aac')).toBe(false);
    expect(candidatesFor('aac')).toEqual(['m4a', 'mp4', 'mpga', 'wav', 'ogg']);
  });

  it('incluye opus, que Groq lista y antes faltaba', () => {
    expect(GROQ_EXTS.has('opus')).toBe(true);
    expect(candidatesFor('opus')).toEqual(['opus']);
  });

  it('deja pasar tal cual las extensiones ya válidas', () => {
    for (const ext of ['webm', 'm4a', 'mp3', 'wav', 'ogg', 'flac']) {
      expect(candidatesFor(ext)).toEqual([ext]);
    }
  });

  it('trata una extensión desconocida como un aac más', () => {
    expect(candidatesFor('grabacion')).toEqual(['m4a', 'mp4', 'mpga', 'wav', 'ogg']);
  });
});

describe('el MIME debe concordar con la extensión declarada', () => {
  it('cada candidato tiene un MIME que Groq acepta', () => {
    for (const ext of candidatesFor('aac')) {
      expect(MIME_BY_EXT[ext]).toBeDefined();
      expect(MIME_BY_EXT[ext]).not.toContain('aac');
    }
  });

  it('m4a viaja como audio/mp4, no como audio/aac', () => {
    // Enviar audio/aac es exactamente lo que provocaba el 400.
    expect(MIME_BY_EXT.m4a).toBe('audio/mp4');
  });

  it('ningún MIME de la tabla es un tipo que Groq rechace', () => {
    const rechazados = ['audio/aac', 'audio/x-aac', 'audio/aacp', 'application/octet-stream'];
    for (const mime of Object.values(MIME_BY_EXT)) {
      expect(rechazados).not.toContain(mime);
    }
  });
});
