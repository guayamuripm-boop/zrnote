import { VERSION, COMMIT_SHA, BUILD_TIME } from '@/lib/version';

export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({
    name: 'ZRNote',
    version: VERSION,
    commit: COMMIT_SHA,
    buildTime: BUILD_TIME,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || 'development',
    deployUrl: process.env.NEXT_PUBLIC_VERCEL_URL || null,
  });
}
