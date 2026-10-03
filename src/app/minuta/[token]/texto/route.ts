import { verifyMinuteToken } from '@/lib/minute-links';
import { normalizeMinuteSections } from '@/lib/minute-text';
import { readStudyAids, isStudyAidsEmpty } from '@/lib/study-aids';
import { formatMinuteForCopy } from '@/lib/minute-copy-format';
import { sortActionItems } from '@/lib/action-items';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * La minuta completa como texto plano, para pegar el ENLACE en NotebookLM (o
 * cualquier lector de URLs).
 *
 * La página /minuta/[token] enseña los apuntes de clase en pestañas, y un
 * lector que sólo ve el HTML inicial se queda con una de ellas. Aquí va todo,
 * en un único documento sin interfaz. Mismo token y mismas garantías que la
 * página: no expone la transcripción.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const verified = verifyMinuteToken(token);
  if (!verified.ok) {
    return new Response('Enlace no válido o caducado.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }

  const { meetingId } = verified.payload;
  const admin = getSupabaseAdmin();
  const [meetingResult, minuteResult, itemsResult] = await Promise.all([
    admin.from('meetings').select('title, coordination, created_at').eq('id', meetingId).maybeSingle(),
    admin.from('minutes').select('*').eq('meeting_id', meetingId).maybeSingle(),
    admin.from('action_items').select('*').eq('meeting_id', meetingId),
  ]);

  const meeting = meetingResult.data;
  if (!meeting || !minuteResult.data) {
    return new Response('Minuta no disponible.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }

  const sections = normalizeMinuteSections(minuteResult.data);
  const aids = readStudyAids(minuteResult.data);

  const text = formatMinuteForCopy({
    title: meeting.title,
    createdAt: meeting.created_at,
    coordination: meeting.coordination,
    minute: {
      summary: sections.summary,
      decisions: sections.decisions,
      blockers: sections.blockers,
      project_statuses: sections.projectStatuses,
      next_steps: sections.nextSteps,
      discussion: sections.discussion,
      ideas: sections.ideas,
    },
    actionItems: sortActionItems(itemsResult.data || []),
    studyAids: isStudyAidsEmpty(aids) ? null : aids,
  });

  return new Response(text, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Robots-Tag': 'noindex, nofollow',
      'Cache-Control': 'private, no-store',
    },
  });
}
