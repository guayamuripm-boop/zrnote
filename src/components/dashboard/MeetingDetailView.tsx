import Link from 'next/link';
import AssignActionItems from '@/components/minutes/AssignActionItems';
import DeleteMeetingButton from '@/components/DeleteMeetingButton';
import KeepMeetingButton from '@/components/KeepMeetingButton';
import RetryButton from '@/components/RetryButton';
import { StatusBadge } from '@/components/StatusBadge';
import { PriorityBadge } from '@/components/PriorityBadge';
import ShareWhatsApp from '@/components/ShareWhatsApp';
import ShareLinkButton from '@/components/ShareLinkButton';
import ActionItemStatus from '@/components/ActionItemStatus';
import MeetingParticipants from '@/components/MeetingParticipants';
import ResendEmailsButton from '@/components/ResendEmailsButton';
import ChaptersSection from '@/components/ChaptersSection';
import StudySection from '@/components/study/StudySection';
import CacheMinuteForOffline from '@/components/CacheMinuteForOffline';
import CopyMinuteButton from '@/components/CopyMinuteButton';
import TagAssigner from '@/components/TagAssigner';
import { toParagraphs } from '@/lib/readable-text';
import { isStudyAidsEmpty, type StudyAids } from '@/lib/study-aids';
import type { Chapter } from '@/lib/chapters';
import type { normalizeMinuteSections } from '@/lib/minute-text';

type Sections = ReturnType<typeof normalizeMinuteSections>;

export interface MeetingDetailData {
  meeting: {
    id: string;
    title: string;
    coordination: string | null;
    created_at: string;
    status: string;
    error_message: string | null;
    transcript_raw: string | null;
  };
  userId?: string;
  creatorEmail?: string;
  minute: { id: string } | null;
  sections: Sections;
  studyAids: StudyAids;
  chapters: Chapter[];
  actionItems: any[];
  participants: { name: string; email: string }[];
  hasAudio: boolean;
  canAddAudio: boolean;
  isKept: boolean;
  showDeletionCountdown: boolean;
  daysUntilDeletion: number;
  isStale: boolean;
  abandonedRecording: boolean;
  /** Vista previa de desarrollo: no guarda nada en el dispositivo. */
  preview?: boolean;
}

/** Franja de prioridad, igual que en Compromisos. */
const RAIL: Record<string, string> = {
  alta: 'bg-rose-500',
  media: 'bg-amber-400',
  baja: 'bg-emerald-500',
};

/**
 * `due_date` es una fecha SIN hora. `new Date('2026-10-24')` la toma como
 * medianoche UTC y en América se pintaba el día anterior; a mediodía local no
 * se mueve en ninguna zona.
 */
function formatDue(due: string): string {
  const d = new Date(`${due.slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

function SectionHeading({
  icon,
  tone,
  children,
  count,
}: {
  icon: string;
  tone: string;
  children: React.ReactNode;
  count?: number;
}) {
  return (
    <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2.5">
      <span className={`w-8 h-8 rounded-xl bg-gradient-to-br ${tone} flex items-center justify-center shrink-0 shadow-sm`}>
        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
        </svg>
      </span>
      {children}
      {count !== undefined && (
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-900/5 dark:bg-white/10 px-2 py-0.5 rounded-full tabular-nums">
          {count}
        </span>
      )}
    </h2>
  );
}

const ICON = {
  doc: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  tasks: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
  check: 'M5 13l4 4L19 7',
  warn: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z',
  mic: 'M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z',
  upload: 'M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12',
  user: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  calendar: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
};

/**
 * Detalle de una reunión. Separado de la página (que sólo carga y calcula) para
 * poder revisarlo con datos de ejemplo en /dev/preview.
 *
 * Cambios de fondo respecto a la versión anterior:
 *  - El ESTADO (procesando, falló, sin audio) va justo bajo la cabecera; antes
 *    aparecía al final, debajo de los participantes.
 *  - Compartir sale del título «Minuta» a su propio bloque: en el móvil, una
 *    fila deslizable bajo la cabecera; en escritorio, una columna lateral fija
 *    junto a un índice de la minuta, aprovechando el ancho que antes sobraba.
 */
export default function MeetingDetailView(d: MeetingDetailData) {
  const { meeting, sections, minute, actionItems, participants } = d;
  const completed = meeting.status === 'completed';
  const hasStudy = !isStudyAidsEmpty(d.studyAids);

  const minuteForCopy = {
    summary: sections.summary,
    decisions: sections.decisions,
    blockers: sections.blockers,
    project_statuses: sections.projectStatuses,
    next_steps: sections.nextSteps,
    discussion: sections.discussion,
    ideas: sections.ideas,
  };
  const studyForCopy = hasStudy ? d.studyAids : null;

  // Los mismos botones en las dos ubicaciones (fila del móvil y lateral). Todos
  // reciben las secciones NORMALIZADAS: construyen texto a partir de los mismos
  // campos que pinta la página.
  const shareButtons = [
    <ShareWhatsApp key="wa-s" meetingId={meeting.id} mode="summary" title={meeting.title} createdAt={meeting.created_at} coordination={meeting.coordination} minute={minuteForCopy} studyAids={studyForCopy} chapters={d.chapters} actionItems={actionItems} />,
    <ShareWhatsApp key="wa-f" meetingId={meeting.id} mode="full" title={meeting.title} createdAt={meeting.created_at} coordination={meeting.coordination} minute={minuteForCopy} studyAids={studyForCopy} chapters={d.chapters} actionItems={actionItems} />,
    <CopyMinuteButton key="copy" title={meeting.title} createdAt={meeting.created_at} coordination={meeting.coordination} minute={minuteForCopy} studyAids={studyForCopy} chapters={d.chapters} actionItems={actionItems} participants={participants} />,
    <ShareLinkButton key="nb" meetingId={meeting.id} title={meeting.title} mode="notebook" />,
    <a
      key="pdf"
      href={`/api/meetings/${meeting.id}/export-pdf`}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 px-3 py-1.5 rounded-lg"
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      PDF
    </a>,
    <ResendEmailsButton key="mail" meetingId={meeting.id} />,
  ];

  const index = [
    { id: 'resumen', label: 'Resumen', show: true },
    { id: 'capitulos', label: 'Capítulos', show: d.chapters.length > 0 },
    { id: 'estudio', label: 'Apuntes de estudio', show: hasStudy },
    { id: 'compromisos', label: 'Compromisos', n: actionItems.length, show: actionItems.length > 0 },
    { id: 'decisiones', label: 'Decisiones', n: sections.decisions.length, show: sections.decisions.length > 0 },
    { id: 'bloqueos', label: 'Bloqueos', n: sections.blockers.length, show: sections.blockers.length > 0 },
    {
      id: 'detalle',
      label: 'Más detalle',
      show:
        sections.discussion.length + sections.projectStatuses.length + sections.ideas.length + sections.nextSteps.length > 0,
    },
    { id: 'transcripcion', label: 'Transcripción', show: !!meeting.transcript_raw },
    { id: 'participantes', label: 'Participantes', n: participants.length, show: true },
  ].filter((s) => s.show);

  return (
    <div className="space-y-6">
      {/* ── Cabecera ──────────────────────────────────────────────────── */}
      <header className="relative overflow-hidden surface p-5 sm:p-7">
        <div aria-hidden className="absolute inset-x-0 top-0 h-1.5 aurora" />
        <Link
          href="/dashboard/meetings"
          className="inline-flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition mb-3"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Reuniones
        </Link>

        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-2 text-xs text-slate-500 dark:text-slate-400">
              <StatusBadge status={meeting.status} />
              {meeting.coordination && (
                <span className="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full max-w-[16rem] truncate">
                  {meeting.coordination}
                </span>
              )}
              <span>
                {new Date(meeting.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 break-words font-sora">
              {meeting.title}
            </h1>
            <div className="mt-2.5">
              <TagAssigner meetingId={meeting.id} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <KeepMeetingButton meetingId={meeting.id} kept={d.isKept} />
            <DeleteMeetingButton meetingId={meeting.id} />
          </div>
        </div>

        {d.canAddAudio && (
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <Link
              href={`/dashboard/meetings/${meeting.id}/record`}
              className="flex items-center gap-3 rounded-2xl gradient-primary text-white px-4 py-3 shadow-md shadow-blue-500/25 hover:-translate-y-0.5 hover:shadow-lg transition-all"
            >
              <span className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                </svg>
              </span>
              <span className="text-sm font-semibold">Grabar</span>
            </Link>
            <Link
              href={`/dashboard/meetings/${meeting.id}/upload`}
              className="flex items-center gap-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-white/5 px-4 py-3 hover:-translate-y-0.5 hover:border-blue-300 dark:hover:border-blue-700 transition-all"
            >
              <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d={ICON.upload} />
                </svg>
              </span>
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">Subir audio</span>
            </Link>
            <Link
              href={`/dashboard/meetings/${meeting.id}/transcript`}
              title="Pega una transcripción ya hecha (Zoom, Meet…) en vez de audio"
              className="flex items-center gap-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-white/5 px-4 py-3 hover:-translate-y-0.5 hover:border-blue-300 dark:hover:border-blue-700 transition-all"
            >
              <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d={ICON.doc} />
                </svg>
              </span>
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-tight">Ya tengo la transcripción</span>
            </Link>
          </div>
        )}

        {d.showDeletionCountdown && (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-900/20 p-3">
            <span className="text-base leading-none">⏳</span>
            <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
              {d.daysUntilDeletion === 0
                ? 'Esta reunión se eliminará hoy'
                : `Esta reunión se eliminará en ${d.daysUntilDeletion} día${d.daysUntilDeletion === 1 ? '' : 's'}`}{' '}
              porque nadie la marcó como guardada — junto con su transcripción, minuta y compromisos. Pulsa «Guardar»
              arriba para conservarla indefinidamente.
            </p>
          </div>
        )}
      </header>

      {/* ── Estado: justo bajo la cabecera, que es lo primero que se busca ── */}
      {meeting.status === 'processing' && (
        <section className="relative overflow-hidden rounded-[1.5rem] aurora text-white p-6 text-center space-y-3 shadow-lg shadow-indigo-900/20">
          <div className="w-10 h-10 border-4 border-white/30 border-t-white rounded-full animate-spin mx-auto" />
          <p className="font-semibold">{d.isStale ? 'Retomando el procesamiento…' : 'Generando la minuta…'}</p>
          <p className="text-sm text-white/80 max-w-md mx-auto">
            {d.isStale
              ? 'Se había interrumpido y lo estamos continuando desde donde quedó. No se pierde nada.'
              : 'Puede tardar unos minutos. Si cierras la app, al volver aquí continuará sola.'}
          </p>
          <RetryButton meetingId={meeting.id} autoStart={d.isStale && !d.preview} />
        </section>
      )}

      {d.abandonedRecording && (
        <section className="relative overflow-hidden rounded-[1.5rem] aurora text-white p-6 text-center space-y-3 shadow-lg shadow-indigo-900/20">
          <div className="w-10 h-10 border-4 border-white/30 border-t-white rounded-full animate-spin mx-auto" />
          <p className="font-semibold">Retomando una grabación que quedó a medias…</p>
          <p className="text-sm text-white/80 max-w-md mx-auto">
            El audio se subió pero la minuta nunca llegó a generarse. Lo estamos haciendo ahora.
          </p>
          <RetryButton meetingId={meeting.id} autoStart={!d.preview} />
        </section>
      )}

      {meeting.status === 'failed' && (
        <section className="surface p-5 sm:p-6 space-y-4 border-rose-200 dark:border-rose-800/50">
          <div className="flex items-start gap-3">
            <span className="w-10 h-10 gradient-error rounded-xl flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d={ICON.warn} />
              </svg>
            </span>
            <div className="min-w-0">
              <p className="text-rose-600 dark:text-rose-400 font-semibold">El procesamiento no se completó</p>
              {/* The real reason, instead of a generic "falló". */}
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 break-words">
                {meeting.error_message || 'No se registró el motivo. Vuelve a intentarlo.'}
              </p>
              {!d.hasAudio && (
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                  Esta reunión no tiene audio todavía: graba o sube un archivo antes de reintentar.
                </p>
              )}
            </div>
          </div>
          {d.hasAudio && <RetryButton meetingId={meeting.id} />}
        </section>
      )}

      {!minute && !d.hasAudio && ['scheduled', 'recording'].includes(meeting.status) && (
        <div className="surface p-8 text-center space-y-2 border-dashed">
          <p className="text-3xl" aria-hidden>🎙️</p>
          <p className="text-slate-700 dark:text-slate-200 font-semibold">Esta reunión aún no tiene audio</p>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            Usa «Grabar» para capturarla en vivo, o «Subir audio» si ya la tienes grabada.
          </p>
        </div>
      )}

      {!minute && completed && (
        <div className="surface p-8 text-center space-y-3">
          <p className="text-slate-500 dark:text-slate-400">La reunión está marcada como completada pero no tiene minuta.</p>
          <RetryButton meetingId={meeting.id} />
        </div>
      )}

      {/* ── Compartir en el móvil: una fila deslizable ─────────────────── */}
      {minute && completed && (
        <div className="lg:hidden surface p-3">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-1 mb-2">Compartir</p>
          <div className="-mx-3 px-3 flex gap-2 overflow-x-auto no-scrollbar">
            {shareButtons.map((b) => (
              <span key={b.key} className="shrink-0">{b}</span>
            ))}
          </div>
        </div>
      )}

      {minute ? (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_19rem] xl:grid-cols-[minmax(0,1fr)_21rem] gap-6 items-start">
          {/* ── Columna principal: la minuta ─────────────────────────────── */}
          <div className="min-w-0 space-y-6">
            {/* Invisible: saves this minute to the device so it can be read
                later with no connection at all — see minute-cache.ts. */}
            {d.userId && !d.preview && (
              <CacheMinuteForOffline
                userId={d.userId}
                meetingId={meeting.id}
                title={meeting.title}
                coordination={meeting.coordination}
                createdAt={meeting.created_at}
                summary={sections.summary}
                topics={sections.topics}
                decisions={sections.decisions}
                changes={sections.changes}
                nextSteps={sections.nextSteps}
                actionItems={actionItems.map((a) => ({
                  description: a.description,
                  priority: a.priority,
                  status: a.status,
                  due_date: a.due_date,
                  assignee_name: a.assignee_name,
                }))}
                participants={participants}
              />
            )}

            <section id="resumen" className="surface p-5 sm:p-7 scroll-mt-24">
              <SectionHeading icon={ICON.doc} tone="from-blue-500 to-indigo-500">Resumen</SectionHeading>
              {/* Párrafos cortos en vez de un bloque: ver `readable-text.ts`. */}
              <div className="space-y-3 text-[15px] sm:text-base">
                {toParagraphs(sections.summary).map((p, i) => (
                  <p key={i} className="text-slate-700 dark:text-slate-200 leading-relaxed">
                    {p}
                  </p>
                ))}
              </div>
            </section>

            {/* Estudiar esta clase — va inmediatamente despues del resumen y
                ANTES de los compromisos porque, en una clase, esto es lo que la
                persona vuelve a abrir: las tareas ya le llegaron por correo. */}
            {d.chapters.length > 0 && (
              <div id="capitulos" className="scroll-mt-24">
                <ChaptersSection chapters={d.chapters} />
              </div>
            )}

            {hasStudy && (
              <div id="estudio" className="scroll-mt-24">
                <StudySection aids={d.studyAids} minuteId={minute.id} />
              </div>
            )}

            {/* Action Items — the most important part of the minute, promoted
                right after the summary. Creator can toggle status here too. */}
            {actionItems.length > 0 && (
              <section id="compromisos" className="surface p-5 sm:p-7 scroll-mt-24 ring-1 ring-blue-200/60 dark:ring-blue-800/40">
                <SectionHeading icon={ICON.tasks} tone="from-amber-500 to-orange-500" count={actionItems.length}>
                  Compromisos
                </SectionHeading>
                <ul className="space-y-2.5">
                  {actionItems.map((item) => (
                    <li
                      key={item.id}
                      className="relative rounded-2xl border border-slate-200/80 dark:border-slate-700/70 bg-white/50 dark:bg-white/[0.03] p-4 pl-5 overflow-hidden"
                    >
                      <span aria-hidden className={`absolute left-0 top-3 bottom-3 w-1 rounded-r-full ${RAIL[item.priority || 'media'] || 'bg-slate-300'}`} />
                      <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <p className={`font-medium text-slate-900 dark:text-slate-100 leading-snug ${item.status === 'completado' ? 'line-through opacity-60' : ''}`}>
                            {item.kind === 'evento' && <span title="Evento: ocurre en un momento concreto" aria-hidden="true">📅 </span>}
                            {item.description}
                          </p>
                          <div className="flex items-center gap-3 mt-2 flex-wrap text-xs text-slate-500 dark:text-slate-400">
                            <span className="inline-flex items-center gap-1">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d={ICON.user} />
                              </svg>
                              {item.assignee_name || 'Sin asignar'}
                            </span>
                            {item.due_date && (
                              <span className="inline-flex items-center gap-1">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d={ICON.calendar} />
                                </svg>
                                {formatDue(item.due_date)}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <PriorityBadge priority={item.priority} />
                          <ActionItemStatus itemId={item.id} initialStatus={item.status} />
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {actionItems.length === 0 && completed && (
              <div className="surface p-6 text-center">
                <p className="text-slate-600 dark:text-slate-300 text-sm font-medium">No se detectaron compromisos en esta reunión.</p>
                <p className="text-slate-500 dark:text-slate-400 text-xs mt-1">
                  Nadie se comprometió a algo concreto con responsable o fecha.
                </p>
              </div>
            )}

            {/* Assign Action Items - shown whenever there are items and participants */}
            {actionItems.length > 0 && participants.length > 0 && (
              <AssignActionItems meetingId={meeting.id} actionItems={actionItems} participants={participants} />
            )}

            {sections.decisions.length > 0 && (
              <section id="decisiones" className="surface p-5 sm:p-7 scroll-mt-24">
                <SectionHeading icon={ICON.check} tone="from-emerald-500 to-teal-500" count={sections.decisions.length}>
                  Decisiones
                </SectionHeading>
                <ol className="space-y-2.5">
                  {sections.decisions.map((dec, i) => (
                    <li key={i} className="flex items-start gap-3 text-slate-700 dark:text-slate-200 text-sm leading-relaxed">
                      <span className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center justify-center shrink-0 tabular-nums">
                        {i + 1}
                      </span>
                      <span className="pt-0.5">{dec}</span>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {sections.blockers.length > 0 && (
              <section id="bloqueos" className="surface p-5 sm:p-7 scroll-mt-24">
                <SectionHeading icon={ICON.warn} tone="from-rose-500 to-pink-500" count={sections.blockers.length}>
                  Bloqueos
                </SectionHeading>
                <div className="space-y-3">
                  {sections.blockers.map((b, i) => (
                    <div key={i} className="bg-rose-50/80 border border-rose-100 dark:bg-rose-900/20 dark:border-rose-800/30 rounded-2xl p-4">
                      <h3 className="font-semibold text-rose-800 dark:text-rose-300 text-sm">{b.issue}</h3>
                      <p className="text-sm text-rose-600 dark:text-rose-400 mt-0.5">Impacto: {b.impact}</p>
                      {b.owner && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Responsable: {b.owner}</p>}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Secondary detail — de-emphasized, since it is background info. */}
            {(sections.discussion.length > 0 ||
              sections.projectStatuses.length > 0 ||
              sections.ideas.length > 0 ||
              sections.nextSteps.length > 0) && (
              <section id="detalle" className="surface p-5 sm:p-7 space-y-6 scroll-mt-24">
                <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Más detalle</h2>

                {sections.projectStatuses.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">📊 Estado de proyectos</h3>
                    <div className="space-y-2">
                      {sections.projectStatuses.map((p, i) => (
                        <div key={i} className="border-l-2 border-blue-300 dark:border-blue-700 pl-3 py-0.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-sm text-slate-800 dark:text-slate-200">{p.project}</span>
                            <span className="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-full text-xs">{p.status}</span>
                          </div>
                          <p className="text-sm text-slate-500 dark:text-slate-400">{p.details}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {sections.nextSteps.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">➡️ Próximos pasos</h3>
                    <ul className="space-y-1.5">
                      {sections.nextSteps.map((n, i) => (
                        <li key={i} className="text-sm text-slate-600 dark:text-slate-300 pl-4 relative before:content-['·'] before:absolute before:left-0 before:text-slate-400">
                          {n}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {sections.discussion.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">💬 Temas discutidos</h3>
                    <div className="space-y-3">
                      {sections.discussion.map((dis, i) => (
                        <div key={i} className="border-l-2 border-slate-200 dark:border-slate-700 pl-3">
                          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{dis.topic}</p>
                          {dis.speaker && <p className="text-xs text-slate-400 dark:text-slate-500">{dis.speaker}</p>}
                          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 whitespace-pre-wrap">{dis.details}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {sections.ideas.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">💡 Ideas</h3>
                    <ul className="space-y-1.5">
                      {sections.ideas.map((idea, i) => (
                        <li key={i} className="text-sm text-slate-500 dark:text-slate-400 pl-4 relative before:content-['·'] before:absolute before:left-0 before:text-slate-400">
                          {idea}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            )}

            {meeting.transcript_raw && (
              <details id="transcripcion" className="group surface p-5 sm:p-6 scroll-mt-24">
                <summary className="text-sm font-semibold text-slate-600 dark:text-slate-300 cursor-pointer select-none flex items-center gap-2 list-none">
                  <svg className="w-4 h-4 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  Transcripción completa
                </summary>
                <pre className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap break-words mt-4 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/70 dark:border-slate-700/60 p-4 max-h-[32rem] overflow-y-auto font-sans leading-relaxed">
                  {meeting.transcript_raw}
                </pre>
              </details>
            )}

            {/* Participants — editable, so a "Grabar ahora" meeting can still e-mail people */}
            <div id="participantes" className="scroll-mt-24">
              <MeetingParticipants meetingId={meeting.id} initialParticipants={participants} creatorEmail={d.creatorEmail} />
            </div>
          </div>

          {/* ── Lateral de escritorio: compartir + índice, fijos al hacer scroll ── */}
          <aside className="hidden lg:block min-w-0 lg:sticky lg:top-24 space-y-4">
            {completed && (
              <div className="surface p-5">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">Compartir</p>
                <div className="flex flex-wrap gap-2">{shareButtons}</div>
              </div>
            )}
            <nav aria-label="En esta minuta" className="surface p-5">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">En esta minuta</p>
              <ul className="space-y-0.5">
                {index.map((s) => (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-900/5 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white transition"
                    >
                      {s.label}
                      {s.n !== undefined && s.n > 0 && (
                        <span className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">{s.n}</span>
                      )}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>
        </div>
      ) : (
        <MeetingParticipants meetingId={meeting.id} initialParticipants={participants} creatorEmail={d.creatorEmail} />
      )}
    </div>
  );
}
