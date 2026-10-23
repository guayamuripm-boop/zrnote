import { createServerSupabase } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { sortActionItems } from '@/lib/action-items';
import { readStudyAids } from '@/lib/study-aids';
import { readChapters } from '@/lib/chapters';
import { normalizeMinuteSections } from '@/lib/minute-text';
import MeetingDetailView from '@/components/dashboard/MeetingDetailView';

export default async function MeetingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: meeting } = await supabase
    .from('meetings')
    .select('id, title, coordination, created_at, status, transcript_raw, error_message, audio_segments, ended_at')
    .eq('id', resolvedParams.id)
    .eq('created_by', user?.id)
    .maybeSingle();

  if (!meeting) notFound();

  const [minuteResult, actionItemsResult, participantsResult] = await Promise.all([
    // maybeSingle, not single: a duplicate/absent minute used to surface as
    // "Minuta no disponible" even when the data was there.
    supabase.from('minutes').select('*').eq('meeting_id', resolvedParams.id).maybeSingle(),
    supabase.from('action_items').select('*').eq('meeting_id', resolvedParams.id),
    supabase.from('meeting_participants').select('*').eq('meeting_id', resolvedParams.id),
  ]);

  const minute = minuteResult.data;
  // Normalised BEFORE anything renders it. A minute stored by an older build
  // can hold objects where strings belong (see minute-text.ts) and React
  // throws on those mid-render, which the error boundary turns into "Algo
  // salió mal" for the whole page — the acta intact and unreachable. Write
  // time is now guarded too, but that does nothing for what is already saved.
  const sections = normalizeMinuteSections(minute);
  // Apuntes de clase. Solo los produce el estilo "Clase", asi que en un acta
  // ejecutiva vienen vacios y la seccion entera no se pinta.
  const studyAids = readStudyAids(minute);
  const chapters = readChapters(minute);
  // Ordering by the `priority` column alphabetically put "baja" above "media".
  const actionItems = sortActionItems(actionItemsResult.data || []);
  const participantsRaw = participantsResult.data;

  const participants = (participantsRaw || []).map((p: any) => ({
    name: p.name || p.email_override?.split('@')[0] || 'Participante',
    email: p.email_override || '',
  })).filter((p) => p.email);

  const hasAudio = (meeting.audio_segments || []).length > 0;
  const canAddAudio = ['scheduled', 'recording', 'failed'].includes(meeting.status);

  // Is anything actually working on this meeting right now?
  //
  // The pipeline is driven by the user's browser, so "processing" only means
  // "a tab said it was starting". A single /process call is capped at 60s and
  // the transcription loop heartbeats between batches, so nothing legitimate
  // goes two minutes without touching `ended_at`. Past that the tab is gone —
  // the phone slept, the app was closed, the signal dropped — and the meeting
  // is nobody's responsibility until someone reopens this page. Which they
  // just did.
  const STALE_AFTER_MS = 2 * 60 * 1000;
  const lastTouched = new Date(meeting.ended_at || meeting.created_at).getTime();
  const isStale = Number.isFinite(lastTouched) && Date.now() - lastTouched > STALE_AFTER_MS;

  // Audio was uploaded but the pipeline never ran at all: the recording tab
  // died before "Finalizar" completed. This used to render NOTHING — no
  // spinner, no error, no button — and the meeting was a dead end even though
  // every second of audio was safely on the server.
  const abandonedRecording =
    hasAudio && !minute && ['scheduled', 'recording'].includes(meeting.status);

  // `kept` is queried SEPARATELY from the meeting above, on purpose: this page
  // is the one every user hits constantly, and the column does not exist until
  // migration 029 is applied. Folding it into the main select would 404 every
  // meeting the moment this code deploys, for however long the migration lags
  // behind — exactly the kind of self-inflicted outage this whole audit exists
  // to prevent. A failed or missing read defaults to "kept", the safe reading:
  // no countdown shown, nothing to act on, nothing at risk.
  const { data: retentionRow } = await supabase
    .from('meetings')
    .select('kept')
    .eq('id', resolvedParams.id)
    .maybeSingle();
  const isKept = retentionRow?.kept ?? true;

  const MEETING_RETENTION_DAYS = 30;
  const ageDays = (Date.now() - new Date(meeting.created_at).getTime()) / 86_400_000;
  const daysUntilDeletion = Math.max(0, Math.ceil(MEETING_RETENTION_DAYS - ageDays));
  // Matches the cron's own warning threshold (30 - 3 days) so the banner and
  // the e-mail agree on when this becomes worth mentioning.
  const showDeletionCountdown = !isKept && daysUntilDeletion <= 3;

  return (
    <MeetingDetailView
      meeting={{
        id: meeting.id,
        title: meeting.title,
        coordination: meeting.coordination,
        created_at: meeting.created_at,
        status: meeting.status,
        error_message: meeting.error_message,
        transcript_raw: meeting.transcript_raw,
      }}
      userId={user?.id}
      creatorEmail={user?.email}
      minute={minute ? { id: minute.id } : null}
      sections={sections}
      studyAids={studyAids}
      chapters={chapters}
      actionItems={actionItems}
      participants={participants}
      hasAudio={hasAudio}
      canAddAudio={canAddAudio}
      isKept={isKept}
      showDeletionCountdown={showDeletionCountdown}
      daysUntilDeletion={daysUntilDeletion}
      isStale={isStale}
      abandonedRecording={abandonedRecording}
    />
  );
}
