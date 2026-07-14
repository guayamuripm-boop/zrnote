import { NextResponse } from 'next/server';

const ALLOWED_ORIGINS = [
  'https://meet.google.com',
  'https://zoom.us',
  'https://teams.microsoft.com',
  'http://localhost:3000',
  /^chrome-extension:\/\/[a-z]{32}$/,
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
