import { createServerSupabase } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const patchSchema = z.object({
  status: z.enum(['pendiente', 'en_progreso', 'completado']),
});

// PATCH /api/action-items/[id] — update the status of one action item.
// Allowed for the meeting creator OR the assignee (matched by email). Uses the
// service client to write after the authorization check, so the assignee (who
// is not the meeting owner under RLS) can still mark their own tasks done.
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'status inválido' }, { status: 400 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY!
  );

  const { data: item } = await admin
    .from('action_items')
    .select('id, assignee_email, assignee_user_id, meetings!inner(created_by)')
    .eq('id', params.id)
    .single();

  if (!item) {
    return NextResponse.json({ error: 'Tarea no encontrada' }, { status: 404 });
  }

  const { data: profile } = await admin.from('users').select('email').eq('id', user.id).single();
  const isCreator = (item as any).meetings?.created_by === user.id;
  const isAssignee =
    item.assignee_user_id === user.id ||
    (!!profile?.email && !!item.assignee_email && profile.email.toLowerCase() === item.assignee_email.toLowerCase());

  if (!isCreator && !isAssignee) {
    return NextResponse.json({ error: 'No autorizado para esta tarea' }, { status: 403 });
  }

  const { error } = await admin
    .from('action_items')
    .update({ status: parsed.data.status })
    .eq('id', params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, status: parsed.data.status });
}
