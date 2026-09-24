import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthedUser } from '@/lib/api-auth';
import { serverError } from '@/lib/api-errors';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const tagSchema = z.object({
  tagId: z.string().uuid(),
});

async function verifyMeetingOwner(userId: string, meetingId: string) {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('meetings')
    .select('id')
    .eq('id', meetingId)
    .eq('created_by', userId)
    .maybeSingle();
  return !!data;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthedUser(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: meetingId } = await params;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('meeting_tags')
    .select('tag_id, tags(id, name, color)')
    .eq('meeting_id', meetingId);

  if (error) return serverError('list meeting tags', error);

  const tags = (data || []).map((row: any) => row.tags).filter(Boolean);
  return NextResponse.json({ tags });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthedUser(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: meetingId } = await params;
  if (!await verifyMeetingOwner(auth.user.id, meetingId)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const parsed = tagSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('meeting_tags')
    .upsert(
      { meeting_id: meetingId, tag_id: parsed.data.tagId },
      { onConflict: 'meeting_id,tag_id' },
    );

  if (error) return serverError('assign tag', error);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getAuthedUser(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: meetingId } = await params;
  if (!await verifyMeetingOwner(auth.user.id, meetingId)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const parsed = tagSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('meeting_tags')
    .delete()
    .eq('meeting_id', meetingId)
    .eq('tag_id', parsed.data.tagId);

  if (error) return serverError('remove tag', error);
  return NextResponse.json({ ok: true });
}
