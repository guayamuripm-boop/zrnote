// Capítulos de un contenido (podcast, conferencia, video): la línea de tiempo
// que produce el estilo "Contenido" (minute-styles.ts).
//
// Viajan dentro de `raw_llm_output` —que ya guarda el JSON íntegro del modelo—
// y no en una columna propia: es material de lectura que nunca se consulta por
// campos sueltos, y así activar el estilo no exige una migración sobre
// `minutes`. Mismo patrón de lectura que `readStudyAids`.
//
// El modelo es texto libre: aquí no se confía en nada. Cualquier forma rara se
// corrige o se descarta en silencio, y nunca lanza.

export interface Chapter {
  /** "12:30" o "1:05:10" — null si la grabación no traía marcas de tiempo. */
  time: string | null;
  title: string;
  /** Qué se dijo en este tramo, cronológicamente. */
  summary: string;
  /** Datos, cifras, nombres o afirmaciones concretas de este tramo. */
  key_points: string[];
}

const CAPS = { chapters: 40, title: 120, summary: 900, point: 240, points: 6 };

function clean(value: unknown, max: number): string {
  if (typeof value === 'string') return value.replace(/\s+/g, ' ').trim().slice(0, max);
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

/** 754 → "12:34"; 3910 → "1:05:10". */
export function formatTimestamp(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`;
}

/** Acepta "12:30", "1:05:10", "[12:30]" o "12:30 - 15:00" y devuelve la primera hora válida. */
export function normalizeTimestamp(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = value.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  const [, a, b, c] = match;
  if (Number(b) > 59 || (c !== undefined && Number(c) > 59)) return null;
  return c !== undefined ? `${Number(a)}:${b}:${c}` : `${Number(a)}:${b}`;
}

export function normalizeChapters(raw: unknown): Chapter[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((entry): Chapter | null => {
      if (!entry || typeof entry !== 'object') return null;
      const o = entry as Record<string, unknown>;
      const title = clean(o.title ?? o.chapter ?? o.topic, CAPS.title);
      const summary = clean(o.summary ?? o.details ?? o.description, CAPS.summary);
      if (!title && !summary) return null;

      const pointsRaw = Array.isArray(o.key_points) ? o.key_points : [];
      const key_points = pointsRaw
        .map((p) => clean(p, CAPS.point))
        .filter(Boolean)
        .slice(0, CAPS.points);

      return {
        time: normalizeTimestamp(o.time ?? o.timestamp ?? o.start),
        title: title || summary.slice(0, 80),
        summary,
        key_points,
      };
    })
    .filter((c): c is Chapter => c !== null)
    .slice(0, CAPS.chapters);
}

/** Lee los capítulos de una fila de `minutes` (vía raw_llm_output). */
export function readChapters(minute: Record<string, any> | null | undefined): Chapter[] {
  if (!minute) return [];
  if (typeof minute.raw_llm_output === 'string' && minute.raw_llm_output.trim()) {
    try {
      return normalizeChapters(JSON.parse(minute.raw_llm_output)?.chapters);
    } catch {
      // raw_llm_output truncado o corrupto: no es motivo para romper la página.
    }
  }
  return [];
}

/**
 * Antepone una marca [mm:ss] a cada fragmento de transcripción para que el
 * modelo pueda decir CUÁNDO ocurrió cada cosa.
 *
 * `segments` trae la duración real de cada trozo de audio (`duration_s`); el
 * inicio de un trozo es la suma de los anteriores, por índice. Si no se conoce
 * ninguna duración (audio subido sin metadatos) devuelve null: sin tiempos
 * fiables es mejor no ponerlos que inventarlos.
 */
export function startOffsetsSeconds(
  segments: Array<{ segment_index?: number; duration_s?: number }>,
): Map<number, number> | null {
  const sorted = [...segments].sort((a, b) => Number(a.segment_index ?? 0) - Number(b.segment_index ?? 0));
  if (!sorted.some((s) => Number(s.duration_s) > 0)) return null;

  const offsets = new Map<number, number>();
  let acc = 0;
  for (const s of sorted) {
    offsets.set(Number(s.segment_index ?? 0), acc);
    acc += Math.max(0, Number(s.duration_s) || 0);
  }
  return offsets;
}
