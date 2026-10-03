import { toParagraphs } from '@/lib/readable-text';
import type { StudyAids } from '@/lib/study-aids';

// One plain-text rendering of the acta, complete and structured with emoji
// section markers, meant to be pasted anywhere that isn't WhatsApp — a chat
// with no rich preview, an email draft, a document, Slack, Notion. This is
// deliberately a SEPARATE formatter from `ShareWhatsApp`, not a shared one:
// that one is edited hard for a phone screen (truncated decisions, capped
// action items, a length ceiling) because it opens straight into WhatsApp's
// composer. This one holds nothing back — every section the detail page
// shows, including the ones ShareWhatsApp leaves behind for the link
// (blockers, project statuses, discussion, ideas) — because "copy" is a
// deliberate action with no length pressure behind it.
//
// A pure function, on purpose: the correctness that matters here is entirely
// in the string it produces, so it is tested directly rather than through a
// button click and a mocked clipboard.

const PRIORITY_EMOJI: Record<string, string> = { alta: '🔴', media: '🟡', baja: '🟢' };

export interface CopyMinute {
  summary?: string | null;
  decisions?: string[] | null;
  blockers?: { issue: string; impact?: string | null; owner?: string | null }[] | null;
  project_statuses?: { project: string; status: string; details?: string | null }[] | null;
  next_steps?: string[] | null;
  discussion?: { topic: string; speaker?: string | null; details?: string | null }[] | null;
  ideas?: string[] | null;
}

export interface CopyActionItem {
  description: string;
  assignee_name?: string | null;
  priority?: string | null;
  due_date?: string | null;
  status?: string | null;
}

export interface FormatMinuteOptions {
  title: string;
  createdAt?: string | null;
  coordination?: string | null;
  minute: CopyMinute;
  actionItems?: CopyActionItem[];
  participants?: { name: string; email: string }[];
  /** Apuntes de clase (modo Clase). Se incluyen ÍNTEGROS: son lo que se estudia. */
  studyAids?: StudyAids | null;
  /** Appended at the end so whoever receives the pasted text can open the real thing. */
  url?: string;
  /** `whatsapp` pone los encabezados en *negrita* de WhatsApp; `plain` en MAYÚSCULAS. */
  style?: 'plain' | 'whatsapp';
}

function formatStudyAids(aids: StudyAids, h: (emoji: string, label: string) => string): string[] {
  const out: string[] = [];

  if (aids.outline.length > 0) {
    out.push(
      `\n${h('🗂️', 'TEMARIO')}\n` +
        aids.outline
          .map((s) => `▪️ ${s.section}\n${s.points.map((p) => `   • ${p}`).join('\n')}`)
          .join('\n'),
    );
  }
  if (aids.key_concepts.length > 0) {
    out.push(
      `\n${h('📖', 'CONCEPTOS CLAVE')}\n` +
        aids.key_concepts.map((c) => `• ${c.term}: ${c.definition}${c.why ? ` (${c.why})` : ''}`).join('\n'),
    );
  }
  if (aids.key_formulas.length > 0) {
    out.push(
      `\n${h('🧮', 'FÓRMULAS Y DATOS CLAVE')}\n` +
        aids.key_formulas
          .map((f) => `• ${f.formula} — ${f.meaning}${f.when_to_use ? ` (cuándo: ${f.when_to_use})` : ''}`)
          .join('\n'),
    );
  }
  if (aids.worked_examples.length > 0) {
    out.push(
      `\n${h('✏️', 'EJEMPLOS RESUELTOS')}\n` +
        aids.worked_examples.map((e, i) => `${i + 1}. ${e.problem}\n   ➜ ${e.approach}`).join('\n'),
    );
  }
  if (aids.common_mistakes.length > 0) {
    out.push(
      `\n${h('⚠️', 'ERRORES FRECUENTES')}\n` +
        aids.common_mistakes.map((m) => `• ${m.mistake} ➜ ${m.correction}`).join('\n'),
    );
  }
  if (aids.exam_notes.length > 0) {
    out.push(`\n${h('🎯', 'SOBRE EL EXAMEN')}\n${aids.exam_notes.map((n) => `• ${n}`).join('\n')}`);
  }
  if (aids.study_questions.length > 0) {
    out.push(
      `\n${h('❓', 'PREGUNTAS DE REPASO')}\n` +
        aids.study_questions.map((q, i) => `${i + 1}. ${q.question}\n   ➜ ${q.answer}`).join('\n'),
    );
  }
  if (aids.flashcards.length > 0) {
    out.push(
      `\n${h('🃏', 'TARJETAS')}\n` + aids.flashcards.map((c) => `• ${c.front} ➜ ${c.back}`).join('\n'),
    );
  }
  if (aids.resources.length > 0) {
    out.push(`\n${h('📚', 'RECURSOS')}\n${aids.resources.map((r) => `• ${r}`).join('\n')}`);
  }
  if (aids.open_questions.length > 0) {
    out.push(`\n${h('🤔', 'DUDAS ABIERTAS')}\n${aids.open_questions.map((q) => `• ${q}`).join('\n')}`);
  }
  return out;
}

function formatDueDate(d?: string | null): string {
  if (!d) return '';
  const date = new Date(`${d}T00:00:00`);
  if (isNaN(date.getTime())) return '';
  return ` (vence ${date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })})`;
}

/** Renders a completed acta as plain text, structured with emoji section markers. */
export function formatMinuteForCopy(opts: FormatMinuteOptions): string {
  const { minute } = opts;
  const parts: string[] = [];
  const wa = opts.style === 'whatsapp';
  const h = (emoji: string, label: string) => (wa ? `${emoji} *${label}*` : `${emoji} ${label}`);

  parts.push(wa ? `📋 *${opts.title}*` : `📋 ${opts.title}`);
  const meta: string[] = [];
  if (opts.coordination) meta.push(opts.coordination);
  if (opts.createdAt) {
    const d = new Date(opts.createdAt);
    if (!isNaN(d.getTime())) {
      meta.push(d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }));
    }
  }
  if (meta.length > 0) parts.push(`🗓️ ${meta.join(' · ')}`);

  const participants = opts.participants || [];
  if (participants.length > 0) {
    parts.push(`👥 ${participants.map((p) => p.name).join(', ')}`);
  }

  const summaryParagraphs = toParagraphs(minute.summary);
  if (summaryParagraphs.length > 0) {
    parts.push(`\n${h('📝', 'RESUMEN')}\n${summaryParagraphs.join('\n\n')}`);
  }

  // Los apuntes de clase van justo tras el resumen: es lo que se estudia.
  if (opts.studyAids) parts.push(...formatStudyAids(opts.studyAids, h));

  const decisions = minute.decisions || [];
  if (decisions.length > 0) {
    parts.push(`\n${h('✅', 'DECISIONES')}\n${decisions.map((d) => `• ${d}`).join('\n')}`);
  }

  const items = opts.actionItems || [];
  if (items.length > 0) {
    // Pending first — what someone reading this actually has to act on.
    const pending = items.filter((i) => i.status !== 'completado');
    const done = items.filter((i) => i.status === 'completado');
    const lines = [...pending, ...done].map((t) => {
      const emoji = t.status === 'completado' ? '✔️' : PRIORITY_EMOJI[t.priority || ''] || '⚪';
      const who = t.assignee_name ? ` — ${t.assignee_name}` : '';
      return `${emoji} ${t.description}${who}${formatDueDate(t.due_date)}`;
    });
    parts.push(`\n${h('📌', `COMPROMISOS (${items.length})`)}\n${lines.join('\n')}`);
  }

  const blockers = minute.blockers || [];
  if (blockers.length > 0) {
    const lines = blockers.map((b) => {
      const impact = b.impact ? ` — Impacto: ${b.impact}` : '';
      const owner = b.owner ? ` (responsable: ${b.owner})` : '';
      return `🚧 ${b.issue}${impact}${owner}`;
    });
    parts.push(`\n${h('⚠️', 'BLOQUEOS')}\n${lines.join('\n')}`);
  }

  const projectStatuses = minute.project_statuses || [];
  if (projectStatuses.length > 0) {
    const lines = projectStatuses.map((p) => `📊 ${p.project} — ${p.status}${p.details ? `: ${p.details}` : ''}`);
    parts.push(`\n${h('📊', 'ESTADO DE PROYECTOS')}\n${lines.join('\n')}`);
  }

  const nextSteps = minute.next_steps || [];
  if (nextSteps.length > 0) {
    parts.push(`\n${h('➡️', 'PRÓXIMOS PASOS')}\n${nextSteps.map((n) => `• ${n}`).join('\n')}`);
  }

  const discussion = minute.discussion || [];
  if (discussion.length > 0) {
    const lines = discussion.map((d) => {
      const speaker = d.speaker ? ` (${d.speaker})` : '';
      return `💬 ${d.topic}${speaker}${d.details ? `\n   ${d.details}` : ''}`;
    });
    parts.push(`\n${h('💬', 'TEMAS DISCUTIDOS')}\n${lines.join('\n')}`);
  }

  const ideas = minute.ideas || [];
  if (ideas.length > 0) {
    parts.push(`\n${h('💡', 'IDEAS')}\n${ideas.map((i) => `• ${i}`).join('\n')}`);
  }

  if (opts.url) parts.push(`\n📄 Acta completa: ${opts.url}`);

  parts.push(`\n🤖 Generado automáticamente por ZRNote a partir de la grabación — puede contener errores, revísala antes de darla por definitiva.`);

  return parts.join('\n');
}
