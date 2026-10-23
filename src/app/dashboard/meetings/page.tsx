import { createServerSupabase } from '@/lib/supabase/server';
import Link from 'next/link';
import MeetingRow from '@/components/dashboard/MeetingRow';
import PendingMeetingsBanner from '@/components/PendingMeetingsBanner';
import TagFilter from '@/components/TagFilter';
import TagPill from '@/components/TagPill';
import MeetingsTagManager from '@/components/MeetingsTagManager';

export default async function MeetingsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const resolvedParams = await searchParams;
  const activeTagId = typeof resolvedParams.tag === 'string' ? resolvedParams.tag : null;

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: meetings } = await supabase
    .from('meetings')
    .select('id, title, coordination, type, status, created_at')
    .eq('created_by', user?.id)
    .order('created_at', { ascending: false })
    .limit(200);

  // `kept` fetched separately, defensively: this is the main navigation page,
  // and folding an unapplied migration 029 into the primary select above would
  // blank the entire list rather than just hide one small badge.
  const meetingIds = (meetings || []).map((m) => m.id);
  const { data: keptRows } = meetingIds.length
    ? await supabase.from('meetings').select('id, kept').in('id', meetingIds)
    : { data: [] as { id: string; kept: boolean }[] };
  const keptById = new Map((keptRows || []).map((r) => [r.id, r.kept]));

  // Tags — fetched defensively (migration 034 may not be applied yet)
  const { data: allTags } = await supabase
    .from('tags')
    .select('id, name, color')
    .order('name')
    .then((r) => r, () => ({ data: [] as any[] }));
  const tags = (allTags || []) as Array<{ id: string; name: string; color: string }>;

  let meetingTagMap = new Map<string, Array<{ id: string; name: string; color: string }>>();
  if (meetingIds.length && tags.length) {
    const { data: mtRows } = await supabase
      .from('meeting_tags')
      .select('meeting_id, tag_id')
      .in('meeting_id', meetingIds);
    const tagById = new Map(tags.map((t) => [t.id, t]));
    for (const row of mtRows || []) {
      const tag = tagById.get(row.tag_id);
      if (!tag) continue;
      const arr = meetingTagMap.get(row.meeting_id) || [];
      arr.push(tag);
      meetingTagMap.set(row.meeting_id, arr);
    }
  }

  const filteredMeetings = activeTagId
    ? (meetings || []).filter((m) => (meetingTagMap.get(m.id) || []).some((t) => t.id === activeTagId))
    : meetings;

  return (
    <div className="space-y-6">
      <PendingMeetingsBanner />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">Reuniones</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">
            {meetings?.length || 0} reuniones ·{' '}
            <Link href="/notas-sin-conexion" className="text-blue-600 dark:text-blue-400 hover:underline">
              leer sin conexión
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <MeetingsTagManager initialTags={tags} />
          <Link
            href="/dashboard/meetings/new"
            className="gradient-primary text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 inline-flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nueva
          </Link>
        </div>
      </div>

      {tags.length > 0 && <TagFilter tags={tags} />}

      {filteredMeetings && filteredMeetings.length > 0 ? (
        <div className="space-y-2.5">
          {filteredMeetings.map((meeting) => (
            <MeetingRow
              key={meeting.id}
              meeting={meeting}
              meta={
                <>
                  {(meetingTagMap.get(meeting.id) || []).map((tag) => (
                    <TagPill key={tag.id} tag={tag} />
                  ))}
                  {/* `kept` is undefined before migration 029, treated as
                      saved so an older deployment never shows a countdown it
                      cannot act on. */}
                  {keptById.get(meeting.id) === false &&
                    30 - (Date.now() - new Date(meeting.created_at).getTime()) / 86_400_000 <= 3 && (
                      <span
                        title="Se eliminará pronto si no la guardas"
                        className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full whitespace-nowrap"
                      >
                        ⏳ sin guardar
                      </span>
                    )}
                  {meeting.type && <span className="hidden sm:inline capitalize">{meeting.type}</span>}
                </>
              }
            />
          ))}
        </div>
      ) : activeTagId ? (
        <div className="surface p-10 text-center">
          <p className="text-3xl" aria-hidden>🏷️</p>
          <p className="text-slate-600 dark:text-slate-300 font-medium mt-2">Ninguna reunión con esta etiqueta</p>
          <Link href="/dashboard/meetings" className="inline-block mt-3 text-sm text-blue-600 dark:text-blue-400 hover:underline underline-offset-4">
            Ver todas las reuniones
          </Link>
        </div>
      ) : (
        <div className="surface p-10 sm:p-12 text-center">
          <div className="w-16 h-16 aurora rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-500/20">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <p className="text-slate-700 dark:text-slate-200 text-lg font-semibold">Aún no hay reuniones</p>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Graba o sube la primera y aquí aparecerá su acta.</p>
          <div className="flex flex-wrap justify-center gap-2 mt-5">
            <Link href="/dashboard/meetings/new?action=record" className="gradient-primary text-white px-4 py-2.5 rounded-xl text-sm font-medium shadow-md shadow-blue-500/25">
              Grabar ahora
            </Link>
            <Link href="/dashboard/meetings/new?action=upload" className="surface px-4 py-2.5 !rounded-xl text-sm font-medium text-slate-700 dark:text-slate-200">
              Subir audio
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}