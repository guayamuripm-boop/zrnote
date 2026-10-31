import type { Metadata } from 'next';
import { createServerSupabase } from '@/lib/supabase/server';
import { getOwnMeetingIds, getUserActionItems } from '@/lib/action-items';
import AccountabilityView from '@/components/dashboard/AccountabilityView';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Responsables' };

/**
 * Accountability por responsable. Reutiliza exactamente el mismo conjunto de
 * compromisos que "Compromisos" (los asignados a mí + los de mis reuniones),
 * así que las dos vistas nunca se contradicen; solo cambia cómo se agrupan.
 */
export default async function ResponsablesPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const email = user?.email || '';

  const ownMeetingIds = user?.id ? await getOwnMeetingIds(supabase, user.id) : [];
  const actionItems = user?.id ? await getUserActionItems(user.id, email, ownMeetingIds) : [];

  // Solo lo que la vista necesita viaja al cliente.
  const items = actionItems.map((i) => ({
    status: i.status,
    due_date: i.due_date,
    assignee_name: i.assignee_name,
  }));

  return <AccountabilityView items={items} />;
}
