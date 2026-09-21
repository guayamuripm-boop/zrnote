import { NextResponse } from 'next/server';
import { getAuthedUser } from '@/lib/api-auth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/rate-limiter';
import { buildMeetingEmailJobs, dispatchEmailJobs } from '@/lib/meeting-emails';
import { isEmailConfigured, EMAIL_NOT_CONFIGURED } from '@/lib/smtp';
import { logger } from '@/lib/logger';

/**
 * POST /api/meetings/[id]/send-emails
 *
 * On-demand (re)send. Same builders as the pipeline step — see
 * `src/lib/meeting-emails.ts`; there is exactly one implementation now.
 * Only the meeting creator may trigger it. There is deliberately NO
 * "internal caller" bypass: the automated pipeline calls the builders
 * directly, and a shared-secret shortcut here would be a second way in.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const resolvedParams = await params;

  const auth = await getAuthedUser(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { user, supabase } = auth;

  // Each call sends real e-mail through a quota-limited Gmail account.
  const { allowed } = await checkRateLimit(`send-emails:${user.id}`);
  if (!allowed) return NextResponse.json({ error: 'Demasiadas solicitudes. Espera un minuto.' }, { status: 429 });

  if (!isEmailConfigured()) {
    return NextResponse.json({ error: EMAIL_NOT_CONFIGURED }, { status: 503 });
  }

  const { data: meeting } = await supabase
    .from('meetings')
    .select('id, title, created_by')
    .eq('id', resolvedParams.id)
    .eq('created_by', user.id)
    .maybeSingle();
  if (!meeting) return NextResponse.json({ error: 'Reunión no encontrada' }, { status: 404 });

  // The e-mail builders read participants + minute + action items across tables
  // that RLS scopes to the owner; use the service client so the owner's call
  // always sees the full picture. Ownership was verified just above.
  const admin = getSupabaseAdmin();

  const jobs = await buildMeetingEmailJobs(admin, resolvedParams.id, meeting.title, meeting.created_by);

  // force: true — aquí el usuario ha pulsado «Enviar correos» a propósito. Una
  // acción explícita debe hacer lo que dice, aunque ya se hubiera enviado
  // antes. La idempotencia protege al pipeline automático, no al usuario.
  const result = await dispatchEmailJobs(admin, resolvedParams.id, jobs, { force: true });

  if (jobs.length === 0) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  logger.info('Manual email send', {
    meetingId: resolvedParams.id,
    sent: result.sent,
    failed: result.failed,
    skipped: result.skipped,
  });

  return NextResponse.json({
    ok: result.failed === 0,
    sent: result.sent,
    failed: result.failed,
    skipped: result.skipped,
    error: result.error,
    results: result.details.map((r) => `${r.email}: ${r.ok ? 'enviado' : `error: ${r.error}`}`),
  });
}
