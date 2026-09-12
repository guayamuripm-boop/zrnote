'use client';

import { createClient } from '@/lib/supabase/client';
import { clearMinuteCache } from '@/lib/minute-cache';

/**
 * Wipes the offline-reading cache for whoever is signing out, THEN signs out.
 *
 * The cache exists so a person's own minutes are readable with no connection
 * (see minute-cache.ts) — which means it must not survive them handing the
 * device to someone else, or logging out on a shared computer. A plain
 * `<form action="/api/auth/signout">` had no way to run this first, so
 * signing out is now a click handler instead of a bare form submit.
 */
export default function SignOutButton({ className }: { className?: string }) {
  const handleSignOut = async () => {
    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user?.id;
      if (userId) await clearMinuteCache(userId);
    } catch {
      // Losing the cache-wipe must never block signing out — that would trade
      // a privacy nicety for a stuck session, the wrong side of that trade.
    } finally {
      window.location.href = '/api/auth/signout';
    }
  };

  return (
    <button type="button" onClick={handleSignOut} className={className}>
      Salir
    </button>
  );
}
