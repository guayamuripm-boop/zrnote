import { describe, it, expect } from 'vitest';
import { backoffMs, isPermanentHttpFailure, MAX_UPLOAD_ATTEMPTS } from '@/lib/retry-backoff';

describe('backoffMs', () => {
  it('doubles each attempt starting at 2s', () => {
    expect(backoffMs(1)).toBe(2000);
    expect(backoffMs(2)).toBe(4000);
    expect(backoffMs(3)).toBe(8000);
  });

  it('caps at 60s so a long outage does not grow forever', () => {
    expect(backoffMs(20)).toBe(60_000);
  });
});

describe('isPermanentHttpFailure', () => {
  it('treats a plain 4xx as permanent — retrying will never fix these bytes', () => {
    expect(isPermanentHttpFailure(400)).toBe(true);
    expect(isPermanentHttpFailure(404)).toBe(true);
  });

  it('treats 408 and 429 as transient, not permanent', () => {
    expect(isPermanentHttpFailure(408)).toBe(false);
    expect(isPermanentHttpFailure(429)).toBe(false);
  });

  it('treats 5xx as transient — the server, not the request, is the problem', () => {
    expect(isPermanentHttpFailure(500)).toBe(false);
    expect(isPermanentHttpFailure(503)).toBe(false);
  });

  it('exposes a sane attempt ceiling', () => {
    expect(MAX_UPLOAD_ATTEMPTS).toBeGreaterThan(1);
  });
});
