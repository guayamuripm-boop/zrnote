import { createServerSupabase } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { logger } from '@/lib/logger';

const deleteSchema = z.object({
  confirmation: z.literal('DELETE_MY_ACCOUNT'),
  password: z.string().min(1, 'Password required for confirmation'),
});

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = deleteSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Verify password by attempting to sign in
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email!,
    password: parsed.data.password,
  });

  if (signInError) {
    return NextResponse.json({ error: 'Contraseña incorrecta' }, { status: 400 });
  }

  const userId = user.id;
  const adminSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY!
  );

  try {
    // 1. Get all meetings created by user, WITH their storage keys.
    const { data: userMeetings } = await adminSupabase
      .from('meetings')
      .select('id, audio_segments')
      .eq('created_by', userId);

    const meetingIds = userMeetings?.map(m => m.id) || [];

    // 2. Delete related data in correct order (FK constraints)
    if (meetingIds.length > 0) {
      // Delete audio files from storage FIRST, while we still know their paths.
      //
      // This used to list the bucket root and match `f.name.includes(meetingId)`.
      // Supabase returns FOLDER entries at the root (one per org), never full
      // object paths, so that filter matched nothing and **no audio was ever
      // deleted** when a user deleted their account. The real paths live in
      // meetings.audio_segments[].r2_key.
      const storageKeys = (userMeetings || [])
        .flatMap((m: any) => (m.audio_segments || []).map((s: any) => s.r2_key))
        .filter(Boolean);

      if (storageKeys.length > 0) {
        // Storage.remove() takes a bounded list; chunk it for heavy accounts.
        for (let i = 0; i < storageKeys.length; i += 100) {
          const { error: removeError } = await adminSupabase.storage
            .from('meeting-audio')
            .remove(storageKeys.slice(i, i + 100));
          if (removeError) {
            logger.error('Account delete: audio removal failed', { userId, error: removeError.message });
          }
        }
      }

      await adminSupabase.from('email_logs').delete().in('meeting_id', meetingIds);
      await adminSupabase.from('action_items').delete().in('meeting_id', meetingIds);
      // Vector embeddings contain verbatim fragments of the conversation —
      // leaving them behind would keep personal data after an erasure request.
      await adminSupabase.from('meeting_chunks').delete().in('meeting_id', meetingIds);
      await adminSupabase.from('minutes').delete().in('meeting_id', meetingIds);
      await adminSupabase.from('meeting_participants').delete().in('meeting_id', meetingIds);
      await adminSupabase.from('meetings').delete().in('id', meetingIds);
    }

    // 3. Delete action_items where user is assignee (but meeting created by others)
    await adminSupabase.from('action_items').delete().eq('assignee_user_id', userId);

    // 4. Delete meeting_participants where user is participant
    await adminSupabase.from('meeting_participants').delete().eq('user_id', userId);

    // 5. Delete email_logs where user is recipient
    await adminSupabase.from('email_logs').delete().eq('recipient_email', user.email);

    // 6. Delete the consent audit trail and the user profile.
    // (user_consent_log also cascades from auth.users, but be explicit.)
    await adminSupabase.from('user_consent_log').delete().eq('user_id', userId);
    await adminSupabase.from('users').delete().eq('id', userId);

    // 7. Delete auth user (this cascades to auth.identities, etc.)
    const { error: deleteAuthError } = await adminSupabase.auth.admin.deleteUser(userId);

    if (deleteAuthError) {
      logger.error('Auth delete error', { error: deleteAuthError.message });
      return NextResponse.json({ error: 'Error al eliminar cuenta de autenticación' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, message: 'Cuenta eliminada permanentemente' });
  } catch (error) {
    logger.error('Delete account error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}