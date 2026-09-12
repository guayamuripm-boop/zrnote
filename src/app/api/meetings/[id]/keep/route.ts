import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthedUser } from '@/lib/api-auth';

const keepSchema = z.object({ kept: z.boolean() });

/**
 * Toggle a meeting's exemption from the 30-day cleanup (migration 029 /
 * src/lib/meeting-lifecycle.ts). Meetings created before that migration are
 * grandfathered as `kept = true` already; this is what future meetings need.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const resolvedParams = await params;
  const auth = await getAuthedUser(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { user, supabase } = auth;

  const body = await request.json().catch(() => ({}));
  const parsed = keepSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Falta el campo "kept" (true/false)' }, { status: 400 });
  }

  const { error } = await supabase
    .from('meetings')
    .update({ kept: parsed.data.kept, deletion_warned_at: null })
    .eq('id', resolvedParams.id)
    .eq('created_by', user.id);

  if (error) {
    // The column not existing (migration 029 not applied yet) must not look
    // like a generic server error — the fix is a migration, not a retry.
    if (/column .*kept.* does not exist/i.test(error.message)) {
      return NextResponse.json(
        { error: 'La función de "guardar reunión" todavía no está activada en el servidor.' },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, kept: parsed.data.kept });
}
