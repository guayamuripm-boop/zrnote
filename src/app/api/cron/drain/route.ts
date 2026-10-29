import { NextResponse } from 'next/server';
import { assertCron } from '@/lib/cron-auth';
import { logger } from '@/lib/logger';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { userFacingProcessingError } from '@/lib/user-errors';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * El "trabajador" que termina la minuta SOLO, sin que la app esté abierta.
 *
 * El pipeline lo empuja normalmente el navegador del cliente (una función de
 * Vercel no puede transcribir 45 minutos de una vez por el tope de 60s). Pero
 * si la persona cierra la app a media grabación-procesada, nadie seguía
 * empujando: hasta ahora la reunión se quedaba en "procesando" hasta el rescate
 * diario de las 2am.
 *
 * Este endpoint retoma esas reuniones huérfanas y las avanza en el servidor,
 * un poco en cada llamada, hasta completar la minuta y avisar por push/correo.
 * Como Vercel (plan free) solo corre cron 1×/día, lo dispara un programador
 * externo cada 1-2 minutos (cron-job.org, pg_cron de Supabase, etc.) con el
 * mismo CRON_SECRET que el resto de los cron.
 *
 * NO toca una reunión que un tab esté empujando: el navegador refresca
 * `ended_at` en cada lote, así que ~90s sin latido = huérfana, nadie la trabaja.
 */

// Sin latido durante este tiempo = la dejó un tab que ya no existe.
const ORPHAN_MS = 90 * 1000;
// Margen cómodo bajo el límite de 60s de la función.
const BUDGET_MS = 50 * 1000;

export async function GET(request: Request) {
  const denied = assertCron(request);
  if (denied) return denied;

  const supabase = getSupabaseAdmin();
  const deadline = Date.now() + BUDGET_MS;

  const orphanCutoff = new Date(Date.now() - ORPHAN_MS).toISOString();

  // Huérfanas: en 'processing' y sin latido reciente. La más antigua primero.
  const { data: candidates, error } = await supabase
    .from('meetings')
    .select('id, ended_at, created_at')
    .eq('status', 'processing')
    .or(`ended_at.lt.${orphanCutoff},and(ended_at.is.null,created_at.lt.${orphanCutoff})`)
    .order('ended_at', { ascending: true, nullsFirst: true })
    .limit(10);

  if (error) {
    logger.error('[cron/drain] fetch error', { error: error.message });
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const fns = await import('@/lib/processing');
  const results: Array<{ id: string; outcome: string }> = [];

  for (const m of candidates || []) {
    if (Date.now() >= deadline) break;

    // Re-leer el estado fresco: pudo cambiar entre el SELECT y ahora (un tab lo
    // retomó, otro drain lo tocó). Solo seguimos si sigue huérfana y procesando.
    const { data: fresh } = await supabase
      .from('meetings')
      .select('status, ended_at')
      .eq('id', m.id)
      .maybeSingle();
    if (!fresh || fresh.status !== 'processing') continue;
    if (fresh.ended_at && Date.now() - new Date(fresh.ended_at).getTime() < ORPHAN_MS) continue;

    // Latido: la reclamamos para que otro drain (o el rescate de las 2am) no la
    // dé por abandonada mientras la trabajamos.
    await supabase.from('meetings').update({ ended_at: new Date().toISOString() }).eq('id', m.id);

    const outcome = await drainMeeting(supabase, m.id, deadline, fns);
    results.push({ id: m.id, outcome });

    // Una reunión por invocación: transcribir puede comerse todo el presupuesto.
    // Las demás huérfanas se atienden en las siguientes llamadas (van rotando
    // porque acabamos de refrescarles el latido a esta).
    break;
  }

  logger.info('[cron/drain] run', { candidates: candidates?.length || 0, worked: results.length, results });
  return NextResponse.json({ ok: true, candidates: candidates?.length || 0, results });
}

/**
 * Lleva UNA reunión lo más lejos posible dentro del presupuesto de tiempo:
 * transcribe los lotes que falten, redacta la minuta, manda los correos y la
 * marca completada (que a su vez envía el push "tu minuta está lista").
 *
 * Es seguro llamarlo a medias una y otra vez: cada paso es idempotente y la
 * transcripción retoma desde el marcador guardado.
 */
async function drainMeeting(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  id: string,
  deadline: number,
  fns: typeof import('@/lib/processing'),
): Promise<string> {
  const { transcribeMeeting, analyzeMeeting, sendMeetingEmails, markMeetingCompleted, markMeetingFailed } = fns;

  // ¿Ya existe la minuta? Entonces solo faltan correos + completar.
  const { data: minute } = await supabase.from('minutes').select('id').eq('meeting_id', id).maybeSingle();

  if (!minute) {
    // 1) Transcribir los lotes que falten (9 segmentos por lote, ~40s cada uno).
    while (Date.now() < deadline) {
      const t = await transcribeMeeting(id, 9, {});
      if (!t.success) {
        await markMeetingFailed(id, t.error || userFacingProcessingError('transcribe'), t.detail);
        return 'failed:transcribe';
      }
      if (!t.more) break;
    }
    // Si quedaron lotes por hacer (se acabó el tiempo), lo retoma la próxima
    // llamada; aún no hay transcripción completa para analizar.
    if (Date.now() >= deadline) return 'advanced:transcribe';

    // 2) Redactar la minuta.
    const a = await analyzeMeeting(id);
    if (!a.success) {
      await markMeetingFailed(id, a.error || userFacingProcessingError('analyze'), a.detail);
      return 'failed:analyze';
    }
  }

  // 3) Correos (cortesía: no tumban la minuta si fallan) y marcar completada,
  //    lo que dispara el push "tu minuta está lista".
  try {
    await sendMeetingEmails(id);
  } catch (err: any) {
    logger.warn('[cron/drain] email step failed (non-fatal)', { meetingId: id, error: err?.message });
  }
  await markMeetingCompleted(id);
  return 'completed';
}
