import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthedUser } from '@/lib/api-auth';
import { checkRateLimit } from '@/lib/rate-limiter';
import { serverError } from '@/lib/api-errors';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url(),
});

export async function POST(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const limited = await checkRateLimit(`push-subscribe:${auth.user.id}`, { max: 10 });
  if (limited) return NextResponse.json({ error: 'Demasiados intentos.' }, { status: 429 });

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const parsed = subscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  }

  const { endpoint, keys } = parsed.data;
  const supabase = getSupabaseAdmin();

  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        user_id: auth.user.id,
        endpoint,
        keys_p256dh: keys.p256dh,
        keys_auth: keys.auth,
        user_agent: request.headers.get('user-agent')?.slice(0, 255) ?? null,
      },
      { onConflict: 'user_id,endpoint' },
    );

  if (error) return serverError('push subscribe', error);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const parsed = unsubscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  await supabase
    .from('push_subscriptions')
    .delete()
    .eq('user_id', auth.user.id)
    .eq('endpoint', parsed.data.endpoint);

  return NextResponse.json({ ok: true });
}
