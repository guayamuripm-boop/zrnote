import { createServerSupabase } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { buildMeetingEmailJobs, dispatchEmailJobs } from '@/lib/meeting-emails';
import { logger } from '@/lib/logger';

/**
 * POST /api/meetings/[id]/send-emails
 *
 * On-demand (re)send. Same builders as the pipeline step — see
 * `src/lib/meeting-emails.ts`; there is exactly one implementation now.
 * Only the meeting creator may trigger it.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const authHeader = request.headers.get('authorization') || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
  const isInternal = serviceKey.length > 0 && authHeader === `Bearer ${serviceKey}`;

  const supabase = createServerSupabase();
  let userId: string | null = null;

  if (!isInternal) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    userId = user.id;
  }

  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return NextResponse.json(
      { error: 'El envío de correos no está configurado en el servidor (GMAIL_USER / GMAIL_APP_PASSWORD).' },
      { status: 503 },
    );
  }

  let meetingQuery = supabase.from('meetings').select('id, title, created_by').eq('id', params.id);
  if (!isInternal) meetingQuery = meetingQuery.eq('created_by', userId!);

  const { data: meeting } = await meetingQuery.maybeSingle();
  if (!meeting) return NextResponse.json({ error: 'Reunión no encontrada' }, { status: 404 });

  // The e-mail builders read participants + minute + action items across tables
  // that RLS scopes to the owner; use the service client so an internal call
  // (and the owner's own call) always sees the full picture.
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);

  const jobs = await buildMeetingEmailJobs(admin, params.id, meeting.title, meeting.created_by);
  const result = await dispatchEmailJobs(admin, params.id, jobs);

  if (jobs.length === 0) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  logger.info('Manual email send', { meetingId: params.id, sent: result.sent, failed: result.failed });

  return NextResponse.json({
    ok: result.failed === 0,
    sent: result.sent,
    failed: result.failed,
    error: result.error,
    results: result.details.map((r) => `${r.email}: ${r.ok ? 'enviado' : `error: ${r.error}`}`),
  });
}
