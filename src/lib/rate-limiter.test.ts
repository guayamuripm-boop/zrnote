import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();
const from = vi.fn();

vi.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdmin: () => ({ rpc, from }),
}));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { checkRateLimit } from './rate-limiter';

describe('checkRateLimit', () => {
  beforeEach(() => {
    rpc.mockReset();
    from.mockReset();
  });

  it('allows when the atomic function says yes', async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    expect(await checkRateLimit('k')).toEqual({ allowed: true });
    expect(rpc).toHaveBeenCalledWith('check_rate_limit', { p_key: 'k', p_max: 10, p_window_ms: 60000 });
  });

  it('blocks when the atomic function says no', async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    expect(await checkRateLimit('k')).toEqual({ allowed: false });
  });

  it('passes custom limits through', async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    await checkRateLimit('k', { max: 3, windowMs: 1000 });
    expect(rpc).toHaveBeenCalledWith('check_rate_limit', { p_key: 'k', p_max: 3, p_window_ms: 1000 });
  });

  it('fails open (and does not throw) on an unexpected database error', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '08006', message: 'connection lost' } });
    expect(await checkRateLimit('k')).toEqual({ allowed: true });
    expect(from).not.toHaveBeenCalled();
  });

  it('falls back to the table path when migration 032 is not applied', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'not found' } });
    // legacy path: select -> single() returns a row at the limit => blocked
    from.mockReturnValue({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { count: 10, reset_at: new Date(Date.now() + 30000).toISOString() } }),
        }),
      }),
    });
    expect(await checkRateLimit('k')).toEqual({ allowed: false });
  });
});
