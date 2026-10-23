import { createServerSupabase } from '@/lib/supabase/server';
import { getOwnMeetingIds, getUserActionItems } from '@/lib/action-items';
import PendingMeetingsBanner from '@/components/PendingMeetingsBanner';
import AppBadge from '@/components/AppBadge';
import DashboardHomeView from '@/components/dashboard/DashboardHomeView';

export const dynamic = 'force-dynamic';

/** Cuántas reuniones recientes caben en la columna del inicio. */
const RECENT_LIMIT = 6;

export default async function DashboardHome() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  const email = user?.email || '';

  // `count: 'exact'` on the stats query: the card used to display
  // `meetings.length` from a list capped at 10, so anyone with more than ten
  // meetings saw a permanent "10".
  const [meetingsResult, statsResult, ownMeetingIds] = await Promise.all([
    supabase
      .from('meetings')
      .select('id, title, status, created_at, coordination')
      .eq('created_by', user?.id)
      .order('created_at', { ascending: false })
      .limit(RECENT_LIMIT),
    supabase
      .from('meetings')
      .select('status', { count: 'exact' })
      .eq('created_by', user?.id),
    user?.id ? getOwnMeetingIds(supabase, user.id) : Promise.resolve([]),
  ]);

  const allStatuses = statsResult.data || [];
  const allItems = user?.id ? await getUserActionItems(user.id, email, ownMeetingIds) : [];
  const pending = allItems.filter((i) => i.status !== 'completado');

  return (
    <div className="space-y-6 sm:space-y-8">
      <PendingMeetingsBanner />
      <AppBadge count={pending.length} />
      <DashboardHomeView
        name={email.split('@')[0] || 'ahí'}
        totalMeetings={statsResult.count ?? allStatuses.length}
        pendingCount={pending.length}
        completedCount={allStatuses.filter((m: any) => m.status === 'completed').length}
        processingCount={allStatuses.filter((m: any) => m.status === 'processing').length}
        meetings={meetingsResult.data || []}
        tasks={pending.slice(0, 5)}
      />
    </div>
  );
}
