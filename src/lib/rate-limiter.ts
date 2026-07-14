import { createClient } from '@supabase/supabase-js';

const MAX_REQUESTS = 10;
const WINDOW_MS = 60 * 1000;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY!
  );
}

export async function checkRateLimit(key: string): Promise<{ allowed: boolean }> {
  const supabase = getAdmin();
  const now = new Date();

  const { data } = await supabase
    .from('rate_limits')
    .select('count, reset_at')
    .eq('key', key)
    .single();

  if (!data || now >= new Date(data.reset_at)) {
    const resetAt = new Date(now.getTime() + WINDOW_MS);
    await supabase
      .from('rate_limits')
      .upsert({ key, count: 1, reset_at: resetAt.toISOString() }, { onConflict: 'key' });
    return { allowed: true };
  }

  if (data.count >= MAX_REQUESTS) {
    return { allowed: false };
  }

  await supabase
    .from('rate_limits')
    .update({ count: data.count + 1 })
    .eq('key', key);

  return { allowed: true };
}

export async function cleanupExpiredRateLimits(): Promise<void> {
  const supabase = getAdmin();
  await supabase
    .from('rate_limits')
    .delete()
    .lt('reset_at', new Date().toISOString());
}
