export const VERSION = '1.10.0';
export const COMMIT_SHA =
  process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  'dev';
export const BUILD_TIME = '2026-07-30T11:00:00-04:00';

export function getVersionString() {
  return `ZRNote v${VERSION} (${COMMIT_SHA})`;
}
