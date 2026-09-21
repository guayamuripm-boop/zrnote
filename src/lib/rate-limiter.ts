import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';

const MAX_REQUESTS = 10;
const WINDOW_MS = 60 * 1000;

/**
 * Fixed-window limiter backed by Postgres.
 *
 * The decision is made atomically inside `check_rate_limit()` (migration 032):
 * concurrent requests serialise on the row lock, so a burst cannot all read the
 * same counter and slip past the limit.
 *
 * Fail-open on infrastructure errors — a limiter outage must not take the app
 * down — but it is logged, so it is visible rather than silent.
 */
export async function checkRateLimit(
  key: string,
  opts: { max?: number; windowMs?: number } = {},
): Promise<{ allowed: boolean }> {
  const max = opts.max ?? MAX_REQUESTS;
  const windowMs = opts.windowMs ?? WINDOW_MS;
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase.rpc('check_rate_limit', {
    p_key: key,
    p_max: max,
    p_window_ms: windowMs,
  });

  if (!error) return { allowed: data === true };

  // PGRST202 = function not found: migration 032 not applied yet.
  if (error.code === 'PGRST202') {
    logger.warn('check_rate_limit() missing — apply migration 032; using non-atomic fallback');
    return legacyCheck(supabase, key, max, windowMs);
  }

  logger.error('Rate limiter failed open', { error: error.message });
  return { allowed: true };
}

async function legacyCheck(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  key: string,
  max: number,
  windowMs: number,
): Promise<{ allowed: boolean }> {
  const now = new Date();
  const { data } = await supabase.from('rate_limits').select('count, reset_at').eq('key', key).single();

  if (!data || now >= new Date(data.reset_at)) {
    await supabase
      .from('rate_limits')
      .upsert({ key, count: 1, reset_at: new Date(now.getTime() + windowMs).toISOString() }, { onConflict: 'key' });
    return { allowed: true };
  }
  if (data.count >= max) return { allowed: false };

  await supabase.from('rate_limits').update({ count: data.count + 1 }).eq('key', key);
  return { allowed: true };
}

export async function cleanupExpiredRateLimits(): Promise<void> {
  await getSupabaseAdmin().from('rate_limits').delete().lt('reset_at', new Date().toISOString());
}
