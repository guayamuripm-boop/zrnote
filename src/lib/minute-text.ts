// Turning whatever the model actually returned into something React can render.
//
// THE CRASH THIS EXISTS TO STOP
// -----------------------------
// The minute is JSON produced by a language model, and the shape of that JSON
// is a REQUEST, not a guarantee. Ask for `ideas: ["probar un piloto"]` and one
// run in twenty answers `ideas: [{ "idea": "probar un piloto" }]` — the same
// information, one level deeper. Rendering that lands in React as "Objects are
// not valid as a React child" (minified error #31), which is not a blank
// section or a wrong line: it throws during render, so the error boundary
// swallows the ENTIRE meeting page. The acta is intact in the database and
// completely unreachable, and the only clue the user gets is "Algo salió mal".
//
// `decisions` and `next_steps` were already coerced at write time for exactly
// this reason. `ideas` and `topics` were not, and `topics` had a subtle version
// of the same hole: `d.topic || d` quietly falls back to the OBJECT when the
// key is missing.
//
// So the rule here is absolute: these functions CANNOT return a non-string, no
// matter what they are handed. They run at write time, so stored minutes are
// clean going forward, and again at read time, because minutes already stored
// with the bad shape must stop crashing the page today.

/** Keys a model plausibly wraps a single piece of text in, best first. */
const TEXT_KEYS = [
  'idea', 'text', 'title', 'topic', 'item', 'description', 'step', 'decision',
  'change', 'name', 'label', 'value', 'content', 'detail', 'details', 'summary',
];

/**
 * Coerce anything to displayable text. Never returns "[object Object]", which
 * is the other way this goes wrong — no crash, just gibberish in the acta.
 */
export function toText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  if (Array.isArray(value)) {
    return value.map(toText).filter(Boolean).join(', ');
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;

    // A recognised wrapper: unwrap it and keep any qualifier alongside, so
    // `{step: "Enviar informe", owner: "Ana"}` reads as the model meant it
    // rather than losing half of what it said.
    for (const key of TEXT_KEYS) {
      const inner = record[key];
      if (typeof inner === 'string' && inner.trim()) {
        const extras = Object.entries(record)
          .filter(([k, v]) => k !== key && typeof v === 'string' && v.trim())
          .map(([, v]) => String(v).trim());
        return extras.length > 0 ? `${inner.trim()} — ${extras.join(' · ')}` : inner.trim();
      }
    }

    // Unrecognised shape: keep the words, drop the structure. Better a slightly
    // odd line in the acta than a blank one — and far better than a crash.
    const values = Object.values(record)
      .map(toText)
      .filter(Boolean);
    return values.join(' — ');
  }

  return '';
}

/** Coerce anything to a list of displayable strings. Never yields an object. */
export function toTextList(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value === 'string') {
    const text = value.trim();
    return text ? [text] : [];
  }
  if (!Array.isArray(value)) {
    const text = toText(value);
    return text ? [text] : [];
  }
  return value.map(toText).filter((t) => t.length > 0);
}

export interface NormalizedBlocker {
  issue: string;
  impact: string;
  owner: string;
}

export interface NormalizedProjectStatus {
  project: string;
  status: string;
  details: string;
}

export interface NormalizedDiscussion {
  topic: string;
  speaker: string;
  details: string;
}

/**
 * The object-shaped sections get the same treatment field by field: a model
 * that returns a bare string where an object was asked for, or an object one
 * level deeper than requested, must not take the page down either.
 */
export function toBlockers(value: unknown): NormalizedBlocker[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw) => {
      if (typeof raw === 'string') return { issue: raw.trim(), impact: '', owner: '' };
      const r = (raw ?? {}) as Record<string, unknown>;
      return { issue: toText(r.issue ?? r.blocker ?? raw), impact: toText(r.impact), owner: toText(r.owner) };
    })
    .filter((b) => b.issue.length > 0);
}

export function toProjectStatuses(value: unknown): NormalizedProjectStatus[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw) => {
      if (typeof raw === 'string') return { project: raw.trim(), status: '', details: '' };
      const r = (raw ?? {}) as Record<string, unknown>;
      return { project: toText(r.project ?? raw), status: toText(r.status), details: toText(r.details) };
    })
    .filter((p) => p.project.length > 0);
}

export function toDiscussion(value: unknown): NormalizedDiscussion[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw) => {
      if (typeof raw === 'string') return { topic: raw.trim(), speaker: '', details: '' };
      const r = (raw ?? {}) as Record<string, unknown>;
      return { topic: toText(r.topic ?? raw), speaker: toText(r.speaker), details: toText(r.details) };
    })
    .filter((d) => d.topic.length > 0 || d.details.length > 0);
}

export interface NormalizedMinuteSections {
  summary: string;
  topics: string[];
  decisions: string[];
  changes: string[];
  nextSteps: string[];
  ideas: string[];
  blockers: NormalizedBlocker[];
  projectStatuses: NormalizedProjectStatus[];
  discussion: NormalizedDiscussion[];
}

/**
 * One call that makes any stored minute safe to render, whatever shape the
 * model left behind on the day it was written.
 */
export function normalizeMinuteSections(minute: Record<string, any> | null | undefined): NormalizedMinuteSections {
  const m = minute ?? {};
  return {
    summary: toText(m.summary),
    topics: toTextList(m.topics),
    decisions: toTextList(m.decisions),
    changes: toTextList(m.changes),
    nextSteps: toTextList(m.next_steps),
    ideas: toTextList(m.ideas),
    blockers: toBlockers(m.blockers),
    projectStatuses: toProjectStatuses(m.project_statuses),
    discussion: toDiscussion(m.discussion),
  };
}
