import { createServerSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const createMeetingSchema = z.object({
  title: z.string().min(1),
  coordination: z.string().optional().default(''),
  type: z.enum(['presencial', 'virtual', 'llamada']).default('presencial'),
  participants: z.array(z.string().email()).optional().default([]),
});

export async function GET() {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: meetings } = await supabase
    .from('meetings')
    .select('*')
    .order('created_at', { ascending: false });

  return NextResponse.json(meetings);
}

export async function POST(request: Request) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createMeetingSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { data: userRecord } = await supabase
    .from('users')
    .select('org_id')
    .eq('id', user.id)
    .single();

  const { data: meeting, error } = await supabase
    .from('meetings')
    .insert({
      title: parsed.data.title,
      coordination: parsed.data.coordination,
      type: parsed.data.type,
      created_by: user.id,
      org_id: userRecord?.org_id,
      status: 'scheduled',
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Auto-add creator as participant
  const { data: creatorProfile } = await supabase
    .from('users')
    .select('id, email, full_name')
    .eq('id', user.id)
    .single();

  if (creatorProfile) {
    await supabase.from('meeting_participants').insert({
      meeting_id: meeting.id,
      user_id: user.id,
      email_override: creatorProfile.email,
    });
  }

  // Add invited participants by email
  for (const email of parsed.data.participants) {
    // Skip if it's the creator's own email
    if (creatorProfile?.email && email.toLowerCase() === creatorProfile.email.toLowerCase()) continue;

    await supabase.from('meeting_participants').insert({
      meeting_id: meeting.id,
      user_id: null,
      email_override: email,
    });
  }

  return NextResponse.json({ id: meeting.id }, { status: 201 });
}
