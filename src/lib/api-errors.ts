import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

/**
 * 500 response that does NOT leak the database's error text.
 *
 * PostgREST messages name tables, columns and constraints — free reconnaissance
 * for an attacker. The detail goes to the server log (where the owner can read
 * it); the client gets a generic message it can show as-is.
 */
export function serverError(context: string, error: unknown) {
  const detail = error instanceof Error ? error.message : (error as { message?: string } | null)?.message ?? String(error);
  logger.error(`API error: ${context}`, { error: detail });
  return NextResponse.json({ error: 'Error interno. Inténtalo de nuevo en unos segundos.' }, { status: 500 });
}
