export const VERSION = '1.0.4';
export const COMMIT_SHA =
  process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  'dev';
export const BUILD_TIME = '2026-07-23T15:45:00-04:00';

export function getVersionString() {
  return `ZRNote v${VERSION} (${COMMIT_SHA})`;
}
