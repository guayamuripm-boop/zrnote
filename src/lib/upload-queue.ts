'use client';

// The only path by which recorded audio reaches the server.
//
// WHAT IT REPLACES
// ----------------
// The recorder used to upload a segment with three quick retries (1.5s, 3s)
// and, on failure, increment a counter and throw the audio away. In a lecture
// hall, a lift, or a moving car, thirty seconds without signal was enough to
// permanently lose a minute of the meeting — and the user only found out
// afterwards, from a vague "algunos fragmentos no se pudieron subir".
//
// The queue here is durable instead: the bytes are already in IndexedDB
// (see `recording-store.ts`) before a single upload is attempted, so a failure
// is never terminal. It retries with exponential backoff, parks itself while
// the device is offline, wakes up on `online`, and survives a tab reload —
// which is what makes "no method of failure" an achievable claim rather than
// a slogan.
//
// Uploads stay strictly SERIAL. The server does a read-modify-write of
// `meetings.audio_segments`, so two concurrent uploads can drop an entry.

import {
  pendingSegments,
  updateSegment,
  dropSegment,
  type StoredSegment,
} from '@/lib/recording-store';
import { maybeCompressAudio } from '@/lib/audio-compression';
import { ensureMeetingSynced } from '@/lib/meeting-queue';

export interface QueueStatus {
  /** Segments captured but not yet confirmed by the server. */
  pending: number;
  /** Segments that exhausted every retry and need the user to act. */
  failed: number;
  uploading: boolean;
  offline: boolean;
}

export type QueueListener = (status: QueueStatus) => void;

/** Beyond this a failure is no longer plausibly transient. ~8 min of retries. */
const MAX_ATTEMPTS = 8;
/** 2s, 4s, 8s… capped, so a long outage does not spin the radio pointlessly. */
const BACKOFF_MS = (attempt: number) => Math.min(2000 * 2 ** (attempt - 1), 60_000);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function extFor(mime: string): string {
  return mime.includes('mp4') ? 'mp4' : mime.includes('ogg') ? 'ogg' : 'webm';
}

/**
 * A 4xx other than 408/429 means the server will reject these exact bytes
 * every time. Retrying is pure battery drain, and worse, it hides the real
 * problem behind a spinner.
 */
function isPermanent(status: number): boolean {
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

export class SegmentUploader {
  private readonly meetingId: string;
  private listeners = new Set<QueueListener>();
  private running: Promise<void> | null = null;
  private stopped = false;
  private failed = 0;
  private pending = 0;
  private wakeUp: (() => void) | null = null;

  constructor(meetingId: string) {
    this.meetingId = meetingId;
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.onOnline);
    }
  }

  private onOnline = () => {
    // Coming back from a dead zone is the single most valuable moment to retry,
    // and waiting out a 60s backoff at that point is needless.
    this.wakeUp?.();
    void this.drain();
  };

  subscribe(fn: QueueListener): () => void {
    this.listeners.add(fn);
    fn(this.status());
    return () => this.listeners.delete(fn);
  }

  status(): QueueStatus {
    return {
      pending: this.pending,
      failed: this.failed,
      uploading: this.running !== null,
      offline: typeof navigator !== 'undefined' && navigator.onLine === false,
    };
  }

  private emit() {
    const s = this.status();
    for (const fn of this.listeners) fn(s);
  }

  /**
   * Start the drain loop, or join the one already running.
   *
   * Returning the IN-FLIGHT promise rather than `undefined` is what makes
   * `waitUntilDrained` trustworthy: a caller that arrives mid-drain must block
   * until the uploads finish, not be told immediately that there is nothing to
   * wait for. (Finalizing the recording is exactly that caller, and it would
   * have started transcribing a meeting whose last segments were still in the
   * air.) The single shared promise is also what keeps uploads serial.
   */
  drain(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (this.running) return this.running;
    this.running = this.runDrain();
    return this.running;
  }

  private async runDrain(): Promise<void> {
    this.emit();

    try {
      // Re-read from IndexedDB each pass instead of holding a list: segments
      // recorded *while* this loop runs must be picked up by the same loop.
      for (;;) {
        if (this.stopped) break;
        const queue = await pendingSegments(this.meetingId);
        const next = queue.find((s) => s.state !== 'failed');
        this.pending = queue.filter((s) => s.state !== 'failed').length;
        this.failed = queue.filter((s) => s.state === 'failed').length;
        this.emit();
        if (!next) break;
        await this.uploadOne(next);
      }
    } finally {
      this.running = null;
      this.emit();
    }
  }

  private async uploadOne(seg: StoredSegment): Promise<void> {
    let attempt = seg.attempts;

    for (;;) {
      if (this.stopped) return;
      attempt += 1;

      // Offline: park rather than burn attempts against a radio that is off.
      // The `online` listener (or a 15s poll, for browsers that lie about it)
      // releases this.
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        await new Promise<void>((resolve) => {
          this.wakeUp = resolve;
          setTimeout(resolve, 15_000);
        });
        this.wakeUp = null;
        attempt -= 1;
        continue;
      }

      try {
        // A meeting created offline does not exist on the server yet (see
        // meeting-queue.ts) — uploading a segment for it would 404. This is a
        // no-op, no-network call for the overwhelmingly common case of a
        // meeting that was already created normally.
        const synced = await ensureMeetingSynced(this.meetingId);
        if (!synced) throw Object.assign(new Error('La reunión todavía no se ha podido crear en el servidor'), { permanent: false });

        await updateSegment(seg.id, { state: 'uploading', attempts: attempt });
        await this.postSegment(seg);
        // Confirmed by the server — and only now is it safe to free the bytes.
        await dropSegment(seg.id);
        return;
      } catch (err: any) {
        const message = err?.message || String(err);

        if (err?.permanent || attempt >= MAX_ATTEMPTS) {
          await updateSegment(seg.id, { state: 'failed', attempts: attempt, lastError: message });
          return;
        }

        await updateSegment(seg.id, { state: 'pending', attempts: attempt, lastError: message });
        this.emit();
        await sleep(BACKOFF_MS(attempt));
      }
    }
  }

  private async postSegment(seg: StoredSegment): Promise<void> {
    const blob = await maybeCompressAudio(seg.blob, 2);
    const form = new FormData();
    form.append('audio', blob, `segment_${seg.index}.${extFor(seg.mime)}`);
    form.append('segmentIndex', String(seg.index));
    form.append('durationSec', String(seg.durationSec));

    const res = await fetch(`/api/meetings/${this.meetingId}/upload-segment`, {
      method: 'POST',
      body: form,
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({} as any));
      const error: any = new Error(data.error || `HTTP ${res.status}`);
      error.permanent = isPermanent(res.status);
      throw error;
    }
  }

  /**
   * Block until nothing is left to upload (or everything left has permanently
   * failed). This is what `finalizeRecording` awaits before starting the
   * pipeline — the transcript must not be built from a partial upload.
   */
  async waitUntilDrained(): Promise<QueueStatus> {
    // A segment can be handed to the queue while a drain is already winding
    // down, so keep going until a full pass finds nothing left to do.
    for (;;) {
      await this.drain();
      const left = await pendingSegments(this.meetingId);
      if (left.every((s) => s.state === 'failed')) break;
    }
    const queue = await pendingSegments(this.meetingId);
    this.pending = queue.filter((s) => s.state !== 'failed').length;
    this.failed = queue.filter((s) => s.state === 'failed').length;
    this.emit();
    return this.status();
  }

  /** Give permanently-failed segments one more chance (user pressed retry). */
  async retryFailed(): Promise<void> {
    const queue = await pendingSegments(this.meetingId);
    for (const seg of queue) {
      if (seg.state === 'failed') {
        await updateSegment(seg.id, { state: 'pending', attempts: 0 });
      }
    }
    await this.drain();
  }

  dispose(): void {
    this.stopped = true;
    this.wakeUp?.();
    this.listeners.clear();
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.onOnline);
    }
  }
}
