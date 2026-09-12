import { toParagraphs } from '@/lib/readable-text';

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
  /** Appended at the end so whoever receives the pasted text can open the real thing. */
  url?: string;
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

  parts.push(`📋 ${opts.title}`);
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
    parts.push(`\n📝 RESUMEN\n${summaryParagraphs.join('\n\n')}`);
  }

  const decisions = minute.decisions || [];
  if (decisions.length > 0) {
    parts.push(`\n✅ DECISIONES\n${decisions.map((d) => `• ${d}`).join('\n')}`);
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
    parts.push(`\n📌 COMPROMISOS (${items.length})\n${lines.join('\n')}`);
  }

  const blockers = minute.blockers || [];
  if (blockers.length > 0) {
    const lines = blockers.map((b) => {
      const impact = b.impact ? ` — Impacto: ${b.impact}` : '';
      const owner = b.owner ? ` (responsable: ${b.owner})` : '';
      return `🚧 ${b.issue}${impact}${owner}`;
    });
    parts.push(`\n⚠️ BLOQUEOS\n${lines.join('\n')}`);
  }

  const projectStatuses = minute.project_statuses || [];
  if (projectStatuses.length > 0) {
    const lines = projectStatuses.map((p) => `📊 ${p.project} — ${p.status}${p.details ? `: ${p.details}` : ''}`);
    parts.push(`\n📊 ESTADO DE PROYECTOS\n${lines.join('\n')}`);
  }

  const nextSteps = minute.next_steps || [];
  if (nextSteps.length > 0) {
    parts.push(`\n➡️ PRÓXIMOS PASOS\n${nextSteps.map((n) => `• ${n}`).join('\n')}`);
  }

  const discussion = minute.discussion || [];
  if (discussion.length > 0) {
    const lines = discussion.map((d) => {
      const speaker = d.speaker ? ` (${d.speaker})` : '';
      return `💬 ${d.topic}${speaker}${d.details ? `\n   ${d.details}` : ''}`;
    });
    parts.push(`\n💬 TEMAS DISCUTIDOS\n${lines.join('\n')}`);
  }

  const ideas = minute.ideas || [];
  if (ideas.length > 0) {
    parts.push(`\n💡 IDEAS\n${ideas.map((i) => `• ${i}`).join('\n')}`);
  }

  if (opts.url) parts.push(`\n📄 Acta completa: ${opts.url}`);

  parts.push(`\n🤖 Generado automáticamente por ZRNote a partir de la grabación — puede contener errores, revísala antes de darla por definitiva.`);

  return parts.join('\n');
}
