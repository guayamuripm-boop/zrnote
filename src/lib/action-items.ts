import { createClient } from '@supabase/supabase-js';

export interface ScopedActionItem {
  id: string;
  description: string;
  priority: string | null;
  due_date: string | null;
  status: string;
  assignee_name: string | null;
  assignee_email: string | null;
  created_at: string;
  meetings?: { id: string; title: string; created_at: string } | null;
  /** true when the item is explicitly assigned to this user (not just "from my meetings") */
  mine: boolean;
}

const PRIORITY_ORDER: Record<string, number> = { alta: 0, media: 1, baja: 2 };
const STATUS_ORDER: Record<string, number> = { pendiente: 0, en_progreso: 1, completado: 2 };

/**
 * Sort the way a person actually wants to read a task list: unfinished first,
 * then by priority, then by the nearest deadline.
 *
 * (The DB `.order('priority')` that used to do this sorts alphabetically —
 * alta, baja, media — which puts LOW priority above MEDIUM.)
 */
export function sortActionItems<T extends { status?: string; priority?: string | null; due_date?: string | null }>(
  items: T[],
): T[] {
  return [...items].sort((a, b) => {
    const s = (STATUS_ORDER[a.status || 'pendiente'] ?? 0) - (STATUS_ORDER[b.status || 'pendiente'] ?? 0);
    if (s !== 0) return s;
    const p = (PRIORITY_ORDER[a.priority || 'media'] ?? 1) - (PRIORITY_ORDER[b.priority || 'media'] ?? 1);
    if (p !== 0) return p;
    return (a.due_date || '9999-12-31').localeCompare(b.due_date || '9999-12-31');
  });
}

/**
 * Every action item this user should care about:
 *   - assigned to them by user id or e-mail, AND
 *   - every item from meetings they created.
 *
 * The second half is the important one. The LLM assigns by NAME ("Speaker 1",
 * "María"), so `assignee_email` is null until somebody opens the assignment UI —
 * which meant the person who ran the meeting opened "Mis Tareas" and saw an
 * empty page, with all their commitments invisible.
 *
 * RLS only exposes rows where `assignee_user_id = me`, so this reads with the
 * service client and scopes the query by hand to this user's id / e-mail / own
 * meetings — never wider.
 */
export async function getUserActionItems(
  userId: string,
  email: string,
  ownMeetingIds: string[],
): Promise<ScopedActionItem[]> {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY!
  );

  const select = 'id, description, priority, due_date, status, assignee_name, assignee_email, assignee_user_id, created_at, meetings!inner(id, title, created_at)';

  const orFilter = [
    userId ? `assignee_user_id.eq.${userId}` : null,
    email ? `assignee_email.ilike.${email}` : null,
  ].filter(Boolean).join(',');

  const queries: Array<PromiseLike<{ data: any[] | null }>> = [];

  if (orFilter) {
    queries.push(admin.from('action_items').select(select).or(orFilter).limit(300));
  }
  if (ownMeetingIds.length > 0) {
    queries.push(admin.from('action_items').select(select).in('meeting_id', ownMeetingIds).limit(300));
  }
  if (queries.length === 0) return [];

  const results = await Promise.all(queries);

  const byId = new Map<string, ScopedActionItem>();
  const lowerEmail = email.toLowerCase();

  for (const { data } of results) {
    for (const row of data || []) {
      const mine =
        row.assignee_user_id === userId ||
        (!!row.assignee_email && row.assignee_email.toLowerCase() === lowerEmail);
      const existing = byId.get(row.id);
      if (existing) {
        existing.mine = existing.mine || mine;
      } else {
        byId.set(row.id, { ...row, mine });
      }
    }
  }

  return sortActionItems(Array.from(byId.values()));
}

/** Meeting ids created by this user — the scope for "tasks from my meetings". */
export async function getOwnMeetingIds(supabase: any, userId: string): Promise<string[]> {
  const { data } = await supabase.from('meetings').select('id').eq('created_by', userId).limit(500);
  return (data || []).map((m: { id: string }) => m.id);
}
