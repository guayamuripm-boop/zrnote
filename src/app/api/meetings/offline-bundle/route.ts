import { NextResponse } from 'next/server';
import { getAuthedUser } from '@/lib/api-auth';
import { normalizeMinuteSections } from '@/lib/minute-text';

export const dynamic = 'force-dynamic';

/**
 * Las últimas minutas completadas del usuario, ya en el formato que el caché
 * offline necesita. Sirve para pre-guardar en el teléfono las reuniones más
 * recientes SIN que el usuario tenga que abrirlas una por una — así, cuando se
 * quede sin señal, siempre tiene algo que leer en /notas-sin-conexion.
 *
 * Es el complemento de CacheMinuteForOffline (que sólo guarda lo que ya se
 * abrió): aquel reacciona a lo que miras, éste se adelanta a lo reciente.
 */
const LIMIT = 10;

export async function GET(request: Request) {
  const auth = await getAuthedUser(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { user, supabase } = auth;

  const { data: meetings } = await supabase
    .from('meetings')
    .select('id, title, coordination, created_at')
    .eq('created_by', user.id)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(LIMIT);

  const ids = (meetings || []).map((m: any) => m.id);
  if (ids.length === 0) return NextResponse.json({ minutes: [] });

  const [minutesRes, itemsRes, partsRes] = await Promise.all([
    supabase.from('minutes').select('*').in('meeting_id', ids),
    supabase.from('action_items').select('meeting_id, description, priority, status, due_date, assignee_name').in('meeting_id', ids),
    supabase.from('meeting_participants').select('meeting_id, name, email_override').in('meeting_id', ids),
  ]);

  const minuteByMeeting = new Map<string, any>();
  for (const m of minutesRes.data || []) minuteByMeeting.set(m.meeting_id, m);

  const group = <T extends { meeting_id: string }>(rows: T[] | null): Map<string, T[]> => {
    const map = new Map<string, T[]>();
    for (const row of rows || []) {
      const arr = map.get(row.meeting_id) || [];
      arr.push(row);
      map.set(row.meeting_id, arr);
    }
    return map;
  };
  const itemsByMeeting = group(itemsRes.data as any[]);
  const partsByMeeting = group(partsRes.data as any[]);

  const minutes = [];
  for (const meeting of meetings || []) {
    const minute = minuteByMeeting.get(meeting.id);
    if (!minute) continue; // completada pero sin minuta: nada que leer offline
    const s = normalizeMinuteSections(minute);
    minutes.push({
      meetingId: meeting.id,
      title: meeting.title,
      coordination: meeting.coordination ?? null,
      createdAt: meeting.created_at,
      summary: s.summary,
      topics: s.topics,
      decisions: s.decisions,
      changes: s.changes,
      nextSteps: s.nextSteps,
      actionItems: (itemsByMeeting.get(meeting.id) || []).map((a: any) => ({
        description: a.description,
        priority: a.priority ?? null,
        status: a.status ?? null,
        due_date: a.due_date ?? null,
        assignee_name: a.assignee_name ?? null,
      })),
      participants: (partsByMeeting.get(meeting.id) || [])
        .map((p: any) => ({
          name: p.name || p.email_override?.split('@')[0] || 'Participante',
          email: p.email_override || '',
        }))
        .filter((p: { email: string }) => p.email),
    });
  }

  return NextResponse.json({ minutes });
}
