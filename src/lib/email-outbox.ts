// Libro mayor de correos: reserva la fila ANTES de enviar, para que reintentar
// nunca duplique.
//
// El problema que resuelve: `dispatchEmailJobs` enviaba en serie y registraba
// todo de golpe al final. Si la función moría a mitad — y moría, porque
// /send-emails corría con el maxDuration por defecto de 10 s — algunos correos
// habían salido pero no quedaba constancia de ninguno. Volver a pulsar
// «Enviar correos» reenviaba a quien ya lo había recibido.
//
// Ahora: se reserva la fila (INSERT ... ON CONFLICT DO NOTHING) y sólo se envía
// lo que se ha logrado reservar. La unicidad la resuelve Postgres, no la
// aplicación, así que dos pestañas pulsando a la vez tampoco duplican.

import { createHash } from 'crypto';
import { logger } from '@/lib/logger';

export type EmailKind = 'personal' | 'coordinator_summary' | 'reminder';

export interface ClaimableJob {
  to: string;
  subject: string;
  html: string;
  kind: EmailKind;
}

export interface ClaimedJob<T> {
  job: T;
  /** id de la fila de email_logs que hay que cerrar tras enviar. */
  logId: string | null;
}

/**
 * Identidad de un correo: misma reunión + mismo destinatario + mismo tipo +
 * mismo contenido = el mismo correo.
 *
 * El hash del contenido está a propósito: si se regenera la minuta, el HTML
 * cambia, la clave cambia y el reenvío se permite. Lo que se bloquea es
 * mandar DOS VECES EL MISMO correo, no volver a informar de algo nuevo.
 */
export function buildDedupeKey(meetingId: string, kind: EmailKind, recipient: string, html: string): string {
  const contentHash = createHash('sha256').update(html).digest('hex').slice(0, 16);
  return `${meetingId}:${kind}:${recipient.toLowerCase().trim()}:${contentHash}`;
}

/**
 * Reserva en email_logs los correos que hay que enviar y devuelve sólo esos.
 *
 * - `force: false` (pipeline automático) → se salta los que ya constan 'sent'.
 *   Es lo que evita el duplicado cuando el paso «emails» se reintenta.
 * - `force: true` (el usuario pulsa «Enviar correos») → manda todo. Una acción
 *   explícita del usuario debe hacer lo que dice; ahí el duplicado es
 *   intencionado.
 *
 * Las filas que quedaron en 'pending' o 'failed' de un intento anterior SÍ se
 * reenvían en ambos modos: son precisamente los correos que no llegaron.
 */
export async function claimEmailJobs<T extends ClaimableJob>(
  supabase: any,
  meetingId: string | null,
  jobs: T[],
  opts: { force?: boolean } = {},
): Promise<ClaimedJob<T>[]> {
  if (jobs.length === 0) return [];

  const withKeys = jobs.map((job) => ({
    job,
    dedupe_key: buildDedupeKey(meetingId || 'sin-reunion', job.kind, job.to, job.html),
  }));

  // ¿Cuáles constan ya y en qué estado?
  const keys = withKeys.map((w) => w.dedupe_key);
  const { data: existing, error: readError } = await supabase
    .from('email_logs')
    .select('id, dedupe_key, status')
    .in('dedupe_key', keys);

  if (readError) {
    // Sin libro mayor no podemos garantizar idempotencia, pero dejar al usuario
    // sin correos es peor que arriesgar un duplicado. Se envía y se avisa.
    logger.error('email-outbox: no se pudo leer el estado previo', {
      meetingId: meetingId ?? undefined,
      error: readError.message,
    });
    return withKeys.map((w) => ({ job: w.job, logId: null }));
  }

  const byKey = new Map<string, { id: string; status: string | null }>(
    (existing || []).map((r: any) => [r.dedupe_key, { id: r.id, status: r.status }]),
  );

  const toSend: ClaimedJob<T>[] = [];
  const toInsert: any[] = [];

  for (const { job, dedupe_key } of withKeys) {
    const prev = byKey.get(dedupe_key);

    if (!prev) {
      toInsert.push({
        meeting_id: meetingId,
        recipient_email: job.to,
        subject: job.subject,
        type: job.kind,
        status: 'pending',
        dedupe_key,
        attempts: 0,
      });
      continue;
    }

    if (prev.status === 'sent' && !opts.force) continue; // ya salió: no repetir
    toSend.push({ job, logId: prev.id }); // pendiente, fallido, o reenvío forzado
  }

  if (toInsert.length > 0) {
    // ignoreDuplicates → ON CONFLICT DO NOTHING. Si otra petición ganó la
    // carrera entre el SELECT de arriba y este INSERT, su fila permanece y
    // .select() no nos la devuelve: no la enviamos dos veces.
    const { data: inserted, error: insertError } = await supabase
      .from('email_logs')
      .upsert(toInsert, { onConflict: 'dedupe_key', ignoreDuplicates: true })
      .select('id, dedupe_key');

    if (insertError) {
      logger.error('email-outbox: no se pudo reservar', { meetingId: meetingId ?? undefined, error: insertError.message });
      const insertedKeys = new Set(toInsert.map((r) => r.dedupe_key));
      for (const { job, dedupe_key } of withKeys) {
        if (insertedKeys.has(dedupe_key)) toSend.push({ job, logId: null });
      }
    } else {
      const jobByKey = new Map(withKeys.map((w) => [w.dedupe_key, w.job]));
      for (const row of inserted || []) {
        const job = jobByKey.get(row.dedupe_key);
        if (job) toSend.push({ job, logId: row.id });
      }
    }
  }

  const skipped = jobs.length - toSend.length;
  if (skipped > 0) {
    logger.info('email-outbox: correos omitidos por estar ya enviados', { meetingId: meetingId ?? undefined, skipped });
  }

  return toSend;
}

/** Cierra la fila como enviada. `providerId` queda listo para Resend (v1.12). */
export async function markEmailSent(supabase: any, logId: string | null, providerId?: string): Promise<void> {
  if (!logId) return;
  const { error } = await supabase
    .from('email_logs')
    .update({ status: 'sent', sent_at: new Date().toISOString(), resend_id: providerId ?? null, last_error: null })
    .eq('id', logId);
  if (error) logger.error('email-outbox: no se pudo marcar como enviado', { logId, error: error.message });
}

/** Cierra la fila como fallida, guardando el motivo para poder diagnosticarlo. */
export async function markEmailFailed(supabase: any, logId: string | null, reason?: string): Promise<void> {
  if (!logId) return;
  const { error } = await supabase
    .from('email_logs')
    .update({ status: 'failed', last_error: (reason || 'error desconocido').slice(0, 500) })
    .eq('id', logId);
  if (error) logger.error('email-outbox: no se pudo marcar como fallido', { logId, error: error.message });
}
