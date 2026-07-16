import { createServerSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = user.id;

  // Fetch all user data
  const [
    { data: profile },
    { data: meetings },
    { data: actionItems },
    { data: emailLogs },
    { data: participants },
  ] = await Promise.all([
    supabase.from('users').select('*').eq('id', userId).single(),
    supabase.from('meetings').select('*').eq('created_by', userId).order('created_at', { ascending: false }),
    supabase.from('action_items').select('*').eq('assignee_user_id', userId).order('created_at', { ascending: false }),
    supabase.from('email_logs').select('*').eq('recipient_email', user.email).order('sent_at', { ascending: false }),
    supabase.from('meeting_participants').select('*, meetings(title, created_at)').eq('user_id', userId).order('created_at', { ascending: false }),
  ]);

  // Also get meetings where user is participant (not creator)
  const { data: participatedMeetings } = await supabase
    .from('meetings')
    .select('id, title, coordination, type, status, created_at, created_by')
    .in('id', participants?.map(p => p.meeting_id) || [])
    .order('created_at', { ascending: false });

  // Get minutes for user's meetings
  const meetingIds = [...(meetings?.map(m => m.id) || []), ...(participatedMeetings?.map(m => m.id) || [])];
  const uniqueMeetingIds = [...new Set(meetingIds)];

  const { data: minutes } = await supabase
    .from('minutes')
    .select('*')
    .in('meeting_id', uniqueMeetingIds);

  const exportData = {
    exported_at: new Date().toISOString(),
    user: {
      id: user.id,
      email: user.email,
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at,
      profile: profile || null,
    },
    meetings_created: meetings || [],
    meetings_participated: participatedMeetings || [],
    action_items_assigned: actionItems || [],
    email_logs: emailLogs || [],
    minutes: minutes || [],
  };

  // Return as JSON file download
  const headers = new Headers();
  headers.set('Content-Type', 'application/json');
  headers.set('Content-Disposition', `attachment; filename="zrnote-export-${userId}-${new Date().toISOString().split('T')[0]}.json"`);

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    status: 200,
    headers,
  });
}