import { NextResponse } from 'next/server';

/**
 * Guard for `/api/cron/*`.
 *
 * These endpoints run with the service-role key and DELETE data (audio files,
 * expired rows) or move meetings between states. They were reachable by anyone
 * on the internet with a plain GET — a stranger could wipe every recording
 * older than 30 days or flip every failed meeting back to "processing".
 *
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is
 * set in the project's environment variables. We accept that, and nothing else.
 *
 * Set it in Vercel → Settings → Environment Variables:
 *   CRON_SECRET = <a long random string>
 */
export function assertCron(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    // Fail closed. An unauthenticated destructive endpoint is far worse than a
    // cron job that does not run.
    return NextResponse.json(
      { error: 'CRON_SECRET no está configurado en el servidor; el cron está deshabilitado.' },
      { status: 503 },
    );
  }

  const header = request.headers.get('authorization') || '';
  if (header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}
