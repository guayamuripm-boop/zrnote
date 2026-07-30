import { NextResponse } from 'next/server';

// Credentialed CORS (`Allow-Credentials: true`) hands the listed origins the
// ability to call this API *as the logged-in user*. meet.google.com, zoom.us
// and teams.microsoft.com used to be on this list for the Chrome extension —
// which means any script running on those pages could act on a user's account.
// They are gone: the extension must authenticate with a bearer token from its
// own `chrome-extension://` origin, not by borrowing session cookies.
//
// localhost is only allowed outside production so local development still works.
const ALLOWED_ORIGINS: Array<string | RegExp> = [
  /^chrome-extension:\/\/[a-z]{32}$/,
  ...(process.env.NODE_ENV === 'production' ? [] : ['http://localhost:3000']),
];

function isOriginAllowed(origin: string): boolean {
  return ALLOWED_ORIGINS.some((allowed) => {
    if (typeof allowed === 'string') return origin === allowed;
    return allowed.test(origin);
  });
}

export function corsResponse(origin: string | null, body?: any, init?: ResponseInit): NextResponse {
  const headers = new Headers(init?.headers);
  if (origin && isOriginAllowed(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Credentials', 'true');
    headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    headers.set('Vary', 'Origin');
  }
  return NextResponse.json(body || { ok: true }, { ...init, headers });
}

export function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin || !isOriginAllowed(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin',
  };
}
