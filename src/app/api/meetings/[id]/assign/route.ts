import { createServerSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const assignSchema = z.object({
  assignments: z.array(z.object({
    action_item_id: z.string().uuid(),
    assignee_name: z.string().min(1),
    assignee_email: z.string().email(),
  })),
});

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = assignSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { data: meeting } = await supabase
    .from('meetings')
    .select('created_by')
    .eq('id', params.id)
    .single();

  if (!meeting || meeting.created_by !== user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  await Promise.all(
    parsed.data.assignments.map((a) =>
      supabase
        .from('action_items')
        .update({
          assignee_name: a.assignee_name,
          assignee_email: a.assignee_email,
        })
        .eq('id', a.action_item_id)
        .eq('meeting_id', params.id)
    )
  );

  return NextResponse.json({ ok: true });
}
