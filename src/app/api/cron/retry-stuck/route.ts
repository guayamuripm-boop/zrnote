import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { assertCron } from '@/lib/cron-auth';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

// A single /process call is capped at 60s. Anything still "processing" 20
// minutes later is not in flight — the tab was closed, the phone slept, or the
// network dropped mid-pipeline.
const STALE_PROCESSING_MS = 20 * 60 * 1000;

/**
 * Unstick meetings that were left mid-pipeline.
 *
 * This job used to reset them to `processing` and fire a Supabase Edge Function
 * that (a) has to be deployed by hand and (b) had drifted behind the fixes in
 * processing.ts. The result was the opposite of recovery: meetings sat forever
 * on a spinner saying "procesando" with nothing actually working on them.
 *
 * Now it does the honest thing — mark them `failed` with a readable reason, so
 * the meeting page shows what happened and offers a "Reintentar" button that
 * runs the current, working pipeline.
 */
export async function GET(request: Request) {
  const denied = assertCron(request);
  if (denied) return denied;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY!
  );

  const staleCutoff = new Date(Date.now() - STALE_PROCESSING_MS).toISOString();

  const { data: stuck, error } = await supabase
    .from('meetings')
    .select('id, ended_at, created_at')
    .eq('status', 'processing')
    .or(`ended_at.lt.${staleCutoff},and(ended_at.is.null,created_at.lt.${staleCutoff})`);

  if (error) {
    logger.error('[cron/retry-stuck] Error fetching meetings', { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ids = (stuck || []).map((m) => m.id);

  if (ids.length > 0) {
    await supabase
      .from('meetings')
      .update({
        status: 'failed',
        error_message:
          'El procesamiento se interrumpió (se cerró la app, se perdió la conexión o el teléfono se suspendió). Pulsa "Reintentar" para continuar desde donde quedó — el audio ya subido se conserva.',
      })
      .in('id', ids);

    logger.info('[cron/retry-stuck] Released stuck meetings', { count: ids.length });
  }

  // Housekeeping: queue rows left behind by the (optional) async worker.
  await supabase
    .from('processing_queue')
    .delete()
    .in('status', ['pending', 'running'])
    .lt('created_at', staleCutoff);

  return NextResponse.json({ ok: true, released: ids.length });
}
