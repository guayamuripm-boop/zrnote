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
  const supabase = createServerSupabase();
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
    // 1. Get all meetings created by user
    const { data: userMeetings } = await adminSupabase
      .from('meetings')
      .select('id')
      .eq('created_by', userId);

    const meetingIds = userMeetings?.map(m => m.id) || [];

    // 2. Delete related data in correct order (FK constraints)
    if (meetingIds.length > 0) {
      // Delete email_logs for these meetings
      await adminSupabase.from('email_logs').delete().in('meeting_id', meetingIds);

      // Delete action_items for these meetings
      await adminSupabase.from('action_items').delete().in('meeting_id', meetingIds);

      // Delete minutes for these meetings
      await adminSupabase.from('minutes').delete().in('meeting_id', meetingIds);

      // Delete meeting_participants for these meetings
      await adminSupabase.from('meeting_participants').delete().in('meeting_id', meetingIds);

      // Delete audio files from storage
      const { data: audioFiles } = await adminSupabase.storage
        .from('meeting-audio')
        .list('', { limit: 1000 });
      
      const userAudioFiles = audioFiles?.filter(f => 
        meetingIds.some(id => f.name.includes(id))
      ) || [];
      
      if (userAudioFiles.length > 0) {
        await adminSupabase.storage
          .from('meeting-audio')
          .remove(userAudioFiles.map(f => f.name));
      }

      // Finally delete meetings
      await adminSupabase.from('meetings').delete().in('id', meetingIds);
    }

    // 3. Delete action_items where user is assignee (but meeting created by others)
    await adminSupabase.from('action_items').delete().eq('assignee_user_id', userId);

    // 4. Delete meeting_participants where user is participant
    await adminSupabase.from('meeting_participants').delete().eq('user_id', userId);

    // 5. Delete email_logs where user is recipient
    await adminSupabase.from('email_logs').delete().eq('recipient_email', user.email);

    // 6. Delete user profile
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