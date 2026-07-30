import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// `getAuthedUser` is what lets the Chrome extension talk to the API at all.
// The extension cannot use cookies (Supabase's auth cookie is SameSite=Lax, so
// the browser never attaches it to a cross-site request) — every extension call
// used to come back 401 for exactly this reason.

const getUser = vi.fn();
const createClientMock = vi.fn(() => ({ auth: { getUser } }));
const cookieUser = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: any[]) => createClientMock(...(args as [])),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({ auth: { getUser: cookieUser } }),
}));

const req = (headers: Record<string, string> = {}) =>
  new Request('https://zrnote.vercel.app/api/meetings', { headers });

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
  getUser.mockReset();
  cookieUser.mockReset();
  createClientMock.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getAuthedUser', () => {
  it('accepts a valid bearer token and reports how it authenticated', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@b.com' } }, error: null });
    const { getAuthedUser } = await import('./api-auth');

    const result = await getAuthedUser(req({ authorization: 'Bearer real-jwt' }));

    expect(result?.user.id).toBe('u1');
    expect(result?.via).toBe('bearer');
    expect(getUser).toHaveBeenCalledWith('real-jwt');
  });

  it('rejects an invalid bearer token', async () => {
    getUser.mockResolvedValue({ data: null, error: { message: 'invalid jwt' } });
    const { getAuthedUser } = await import('./api-auth');

    expect(await getAuthedUser(req({ authorization: 'Bearer nope' }))).toBeNull();
  });

  it('REFUSES the service-role key as a bearer token', async () => {
    // That key bypasses RLS entirely; accepting it here would let any caller
    // act as every user at once.
    const { getAuthedUser } = await import('./api-auth');

    expect(await getAuthedUser(req({ authorization: 'Bearer service-role-key' }))).toBeNull();
    expect(getUser).not.toHaveBeenCalled();
  });

  it('falls back to the cookie session when there is no Authorization header', async () => {
    cookieUser.mockResolvedValue({ data: { user: { id: 'u2', email: 'c@d.com' } } });
    const { getAuthedUser } = await import('./api-auth');

    const result = await getAuthedUser(req());

    expect(result?.user.id).toBe('u2');
    expect(result?.via).toBe('cookie');
  });

  it('returns null when neither a cookie nor a token is present', async () => {
    cookieUser.mockResolvedValue({ data: { user: null } });
    const { getAuthedUser } = await import('./api-auth');

    expect(await getAuthedUser(req())).toBeNull();
  });

  it('ignores a malformed Authorization header instead of trusting it', async () => {
    cookieUser.mockResolvedValue({ data: { user: null } });
    const { getAuthedUser } = await import('./api-auth');

    expect(await getAuthedUser(req({ authorization: 'Basic abc123' }))).toBeNull();
    expect(getUser).not.toHaveBeenCalled();
  });

  it('is case-insensitive about the "Bearer" scheme', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u3' } }, error: null });
    const { getAuthedUser } = await import('./api-auth');

    const result = await getAuthedUser(req({ authorization: 'bearer real-jwt' }));
    expect(result?.user.id).toBe('u3');
  });
});
