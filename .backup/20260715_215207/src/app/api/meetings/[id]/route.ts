import { createServerSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const patchMeetingSchema = z.object({
  title: z.string().min(1).optional(),
  coordination: z.string().optional(),
  type: z.enum(['presencial', 'virtual', 'llamada']).optional(),
}).strict();

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: meeting } = await supabase
    .from('meetings')
    .select('id, title, coordination, type, status, created_at, started_at, ended_at, duration_seconds, created_by')
    .eq('id', params.id)
    .eq('created_by', user.id)
    .single();

  if (!meeting) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(meeting);
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = patchMeetingSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { data: meeting, error } = await supabase
    .from('meetings')
    .update(parsed.data)
    .eq('id', params.id)
    .eq('created_by', user.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(meeting);
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { error } = await supabase
    .from('meetings')
    .delete()
    .eq('id', params.id)
    .eq('created_by', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
