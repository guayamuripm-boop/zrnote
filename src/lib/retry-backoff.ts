// One retry policy, used everywhere something is uploaded to ZRNote's own API.
//
// This used to be a private constant inside `upload-queue.ts` (the recorder's
// upload queue). The manual "Subir Audio" page had its OWN retry logic —
// which is to say none at all: one failed request and a chunk sat there
// marked "error" until a human clicked a button. That is the same class of
// drift this codebase has hit before (see pipeline-client.ts's own comment
// about three copies of the pipeline loop that quietly disagreed with each
// other) — two upload paths, two opinions about how hard to retry before
// giving up. Extracting the one policy that already proved itself in the
// recorder removes the opportunity for the two to drift apart again.

/** Beyond this a failure is no longer plausibly transient. */
export const MAX_UPLOAD_ATTEMPTS = 8;

/** 2s, 4s, 8s… capped, so a long outage does not spin the radio pointlessly. */
export function backoffMs(attempt: number): number {
  return Math.min(2000 * 2 ** (attempt - 1), 60_000);
}

/**
 * A 4xx other than 408 (timeout) or 429 (rate limit) means the server will
 * reject these exact bytes every time — retrying is pure battery and bandwidth
 * for a result that cannot change.
 */
export function isPermanentHttpFailure(status: number): boolean {
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}
