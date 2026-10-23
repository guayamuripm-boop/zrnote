import type { Metadata } from 'next';
import { createServerSupabase } from '@/lib/supabase/server';
import { getOwnMeetingIds, getUserActionItems } from '@/lib/action-items';
import ActionItemsView from '@/components/dashboard/ActionItemsView';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Compromisos' };

export default async function ActionItemsPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const email = user?.email || '';

  const ownMeetingIds = user?.id ? await getOwnMeetingIds(supabase, user.id) : [];
  const actionItems = user?.id ? await getUserActionItems(user.id, email, ownMeetingIds) : [];

  // Sólo lo que la vista usa: es un componente de cliente y todo lo que se le
  // pasa viaja en la página.
  const items = actionItems.map((i) => ({
    id: i.id,
    description: i.description,
    priority: i.priority,
    due_date: i.due_date,
    status: i.status,
    kind: i.kind,
    assignee_name: i.assignee_name,
    mine: i.mine,
    meetings: i.meetings ? { id: i.meetings.id, title: i.meetings.title } : null,
  }));

  return <ActionItemsView items={items} />;
}
