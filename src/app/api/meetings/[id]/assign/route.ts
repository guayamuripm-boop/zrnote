import { createServerSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const assignSchema = z.object({
  assignments: z.array(z.object({
    action_item_id: z.string().uuid(),
    // Empty strings clear the assignment (the picker's "Sin asignar" option).
    assignee_name: z.string().max(200).nullable().optional(),
    assignee_email: z.union([z.string().email(), z.literal('')]).nullable().optional(),
  })).max(200),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const supabase = await createServerSupabase();
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
    .eq('id', resolvedParams.id)
    .maybeSingle();

  if (!meeting || meeting.created_by !== user.id) {
    return NextResponse.json({ error: 'Solo el creador puede asignar tareas' }, { status: 403 });
  }

  // Resolve e-mails to real accounts so `assignee_user_id` is filled in. That is
  // the column RLS keys off, and it lets the assignee toggle their own task
  // status even if their profile e-mail is written differently.
  const emails = parsed.data.assignments
    .map((a) => (a.assignee_email || '').toLowerCase())
    .filter(Boolean);

  const userIdByEmail = new Map<string, string>();
  if (emails.length > 0) {
    const { data: matched } = await supabase.from('users').select('id, email').in('email', emails);
    for (const u of matched || []) {
      if (u.email) userIdByEmail.set(u.email.toLowerCase(), u.id);
    }
  }

  const errors: string[] = [];
  for (const a of parsed.data.assignments) {
    const email = a.assignee_email || null;
    const { error } = await supabase
      .from('action_items')
      .update({
        assignee_name: a.assignee_name || null,
        assignee_email: email,
        assignee_user_id: email ? userIdByEmail.get(email.toLowerCase()) ?? null : null,
      })
      .eq('id', a.action_item_id)
      .eq('meeting_id', resolvedParams.id);
    if (error) errors.push(error.message);
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: errors[0] }, { status: 500 });
  }

  return NextResponse.json({ ok: true, updated: parsed.data.assignments.length });
}
