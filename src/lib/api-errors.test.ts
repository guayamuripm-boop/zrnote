import { describe, it, expect, vi } from 'vitest';

const error = vi.fn();
vi.mock('@/lib/logger', () => ({ logger: { error: (...a: unknown[]) => error(...a), warn: vi.fn(), info: vi.fn() } }));

import { serverError } from './api-errors';

describe('serverError', () => {
  it('returns a generic 500 that leaks nothing from the database error', async () => {
    const res = serverError('test', { message: 'relation "minutes" violates unique constraint "minutes_meeting_id_key"' });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toMatch(/minutes|constraint|relation/i);
  });

  it('logs the real detail server-side', () => {
    serverError('ctx', new Error('boom'));
    expect(error).toHaveBeenCalledWith('API error: ctx', { error: 'boom' });
  });
});
