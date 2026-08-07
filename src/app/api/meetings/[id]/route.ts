import { createServerSupabase } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { logger } from '@/lib/logger';

const patchMeetingSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  coordination: z.string().max(200).optional(),
  type: z.enum(['presencial', 'virtual', 'llamada']).optional(),
  // "Grabar ahora" creates a meeting with no participants and tells the user
  // they can add them later — this is what makes that true.
  participants: z
    .array(z.object({ name: z.string().min(1).max(120), email: z.string().email() }))
    .max(50)
    .optional(),
}).strict();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: meeting } = await supabase
    .from('meetings')
    .select('id, title, coordination, type, status, created_at, started_at, ended_at, duration_seconds, created_by')
    .eq('id', resolvedParams.id)
    .eq('created_by', user.id)
    .single();

  if (!meeting) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(meeting);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = patchMeetingSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
  }

  const { participants, ...meetingFields } = parsed.data;

  // Un título puesto a mano deja de ser "provisional": si más tarde
  // analyzeMeeting genera uno con la IA, no debe pisar lo que la persona
  // escribió a propósito. Ver migración 023.
  const updateFields: Record<string, unknown> = { ...meetingFields };
  if (meetingFields.title !== undefined) updateFields.title_is_auto = false;

  const { data: meeting, error } = await supabase
    .from('meetings')
    .update(Object.keys(updateFields).length > 0 ? updateFields : { id: resolvedParams.id })
    .eq('id', resolvedParams.id)
    .eq('created_by', user.id)
    .select()
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!meeting) {
    return NextResponse.json({ error: 'Reunión no encontrada' }, { status: 404 });
  }

  if (participants) {
    const { data: creatorProfile } = await supabase
      .from('users')
      .select('email, full_name')
      .eq('id', user.id)
      .maybeSingle();

    // Replace the guest list wholesale, but always keep the creator in it —
    // they are the one who receives the full summary.
    await supabase.from('meeting_participants').delete().eq('meeting_id', resolvedParams.id);

    const rows: Array<Record<string, unknown>> = [];
    if (creatorProfile?.email) {
      rows.push({
        meeting_id: resolvedParams.id,
        user_id: user.id,
        name: creatorProfile.full_name || creatorProfile.email.split('@')[0],
        email_override: creatorProfile.email,
      });
    }

    const seen = new Set([creatorProfile?.email?.toLowerCase()].filter(Boolean) as string[]);
    for (const p of participants) {
      const email = p.email.trim().toLowerCase();
      if (seen.has(email)) continue;
      seen.add(email);
      rows.push({ meeting_id: resolvedParams.id, user_id: null, name: p.name.trim(), email_override: p.email.trim() });
    }

    if (rows.length > 0) {
      const { error: partError } = await supabase.from('meeting_participants').insert(rows);
      if (partError) {
        return NextResponse.json({ error: partError.message }, { status: 500 });
      }
    }
  }

  return NextResponse.json(meeting);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Read the storage keys BEFORE deleting the row: database cascades do not
  // reach Supabase Storage, so deleting a meeting used to leave its audio files
  // sitting in the bucket forever — filling the free quota and, worse, keeping
  // a recording the user believed they had erased.
  const { data: meeting } = await supabase
    .from('meetings')
    .select('audio_segments')
    .eq('id', resolvedParams.id)
    .eq('created_by', user.id)
    .maybeSingle();

  if (!meeting) {
    return NextResponse.json({ error: 'Reunión no encontrada' }, { status: 404 });
  }

  const { error } = await supabase
    .from('meetings')
    .delete()
    .eq('id', resolvedParams.id)
    .eq('created_by', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const storageKeys = (meeting.audio_segments || [])
    .map((s: any) => s.r2_key)
    .filter(Boolean);

  if (storageKeys.length > 0) {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY!
    );
    const { error: removeError } = await admin.storage.from('meeting-audio').remove(storageKeys);
    if (removeError) {
      logger.error('Meeting delete: audio removal failed', { meetingId: resolvedParams.id, error: removeError.message });
    }
  }

  return NextResponse.json({ ok: true });
}
