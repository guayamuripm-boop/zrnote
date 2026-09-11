'use client';

// Durable, on-device storage for captured audio segments.
//
// WHY THIS EXISTS
// ---------------
// Until now every recorded segment lived in ONE place: a `Blob[]` inside a
// React ref. That made the whole product depend on the browser tab surviving
// the entire meeting, which on a phone it frequently does not:
//
//   • Android discards backgrounded tabs under memory pressure. A 45-minute
//     class with the screen off is exactly the scenario where that happens.
//   • iOS Safari suspends the page when the app leaves the foreground.
//   • The user swipes back, the browser crashes, the battery dies.
//
// In every one of those cases the in-memory chunks were gone, the recording
// never finalized, and the meeting was left with a few orphan segments on the
// server and no way to continue. That is the "se cortó / se salió y no quedó
// nada" complaint, and no amount of retry logic on top of RAM can fix it.
//
// So a segment is written to IndexedDB the instant it is closed, BEFORE any
// upload is attempted, and is only deleted once the server has confirmed it.
// A tab that dies mid-meeting now loses at most the few seconds of audio the
// recorder had not yet flushed; everything else is still on the device,
// waiting to be uploaded on the next visit.

const DB_NAME = 'zrnote-recordings';
const DB_VERSION = 1;
const SEGMENTS = 'segments';
const SESSIONS = 'sessions';

export type SegmentState = 'pending' | 'uploading' | 'done' | 'failed';

export interface StoredSegment {
  /** `${meetingId}:${index}` — makes re-writing the same segment idempotent. */
  id: string;
  meetingId: string;
  index: number;
  blob: Blob;
  mime: string;
  durationSec: number;
  state: SegmentState;
  attempts: number;
  createdAt: number;
  lastError?: string;
}

export interface StoredSession {
  meetingId: string;
  title: string;
  startedAt: number;
  updatedAt: number;
  /** `recording` = never finalized; `finalizing` = stop requested; `done` = pipeline ran. */
  state: 'recording' | 'finalizing' | 'done';
}

/** IndexedDB is absent in SSR, in some private modes, and inside old WebViews. */
function available(): boolean {
  return typeof indexedDB !== 'undefined';
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SEGMENTS)) {
        const store = db.createObjectStore(SEGMENTS, { keyPath: 'id' });
        store.createIndex('by_meeting', 'meetingId', { unique: false });
      }
      if (!db.objectStoreNames.contains(SESSIONS)) {
        db.createObjectStore(SESSIONS, { keyPath: 'meetingId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  // A failed open must not poison every later call.
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

function run<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(store, mode);
        const req = fn(transaction.objectStore(store));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
      }),
  );
}

/**
 * Persist a freshly closed segment. Called from the recorder's `onstop`, i.e.
 * the moment the media container is complete and the bytes are decodable.
 *
 * Never throws: storage being full or unavailable must degrade the durability
 * guarantee, not abort a meeting that is being recorded right now.
 */
export async function saveSegment(seg: {
  meetingId: string;
  index: number;
  blob: Blob;
  mime: string;
  durationSec: number;
}): Promise<boolean> {
  if (!available()) return false;
  try {
    const record: StoredSegment = {
      id: `${seg.meetingId}:${seg.index}`,
      meetingId: seg.meetingId,
      index: seg.index,
      blob: seg.blob,
      mime: seg.mime,
      durationSec: seg.durationSec,
      state: 'pending',
      attempts: 0,
      createdAt: Date.now(),
    };
    await run(SEGMENTS, 'readwrite', (s) => s.put(record));
    return true;
  } catch {
    return false;
  }
}

/** Every segment of a meeting the server has NOT confirmed yet, in order. */
export async function pendingSegments(meetingId: string): Promise<StoredSegment[]> {
  if (!available()) return [];
  try {
    const all = await run<StoredSegment[]>(SEGMENTS, 'readonly', (s) =>
      s.index('by_meeting').getAll(meetingId),
    );
    return (all || []).filter((r) => r.state !== 'done').sort((a, b) => a.index - b.index);
  } catch {
    return [];
  }
}

export async function updateSegment(
  id: string,
  patch: Partial<Pick<StoredSegment, 'state' | 'attempts' | 'lastError'>>,
): Promise<void> {
  if (!available()) return;
  try {
    const current = await run<StoredSegment | undefined>(SEGMENTS, 'readonly', (s) => s.get(id));
    if (!current) return;
    await run(SEGMENTS, 'readwrite', (s) => s.put({ ...current, ...patch }));
  } catch {
    /* durability is best-effort */
  }
}

/**
 * Drop a segment the server has confirmed. Keeping it would grow the device's
 * storage without bound across meetings.
 */
export async function dropSegment(id: string): Promise<void> {
  if (!available()) return;
  try {
    await run(SEGMENTS, 'readwrite', (s) => s.delete(id));
  } catch {
    /* ignore */
  }
}

/** Forget a meeting entirely: its buffered audio and its session marker. */
export async function dropMeeting(meetingId: string): Promise<void> {
  if (!available()) return;
  try {
    const keys = await run<IDBValidKey[]>(SEGMENTS, 'readonly', (s) =>
      s.index('by_meeting').getAllKeys(meetingId),
    );
    for (const key of keys || []) {
      await run(SEGMENTS, 'readwrite', (s) => s.delete(key));
    }
    await run(SESSIONS, 'readwrite', (s) => s.delete(meetingId));
  } catch {
    /* ignore */
  }
}

export async function markSession(
  meetingId: string,
  patch: { title?: string; state?: StoredSession['state'] },
): Promise<void> {
  if (!available()) return;
  try {
    const current = await run<StoredSession | undefined>(SESSIONS, 'readonly', (s) => s.get(meetingId));
    const next: StoredSession = {
      meetingId,
      title: patch.title ?? current?.title ?? '',
      startedAt: current?.startedAt ?? Date.now(),
      updatedAt: Date.now(),
      state: patch.state ?? current?.state ?? 'recording',
    };
    await run(SESSIONS, 'readwrite', (s) => s.put(next));
  } catch {
    /* ignore */
  }
}

export async function getSession(meetingId: string): Promise<StoredSession | null> {
  if (!available()) return null;
  try {
    return (await run<StoredSession | undefined>(SESSIONS, 'readonly', (s) => s.get(meetingId))) || null;
  } catch {
    return null;
  }
}

/**
 * Recordings that were interrupted: the tab died before the pipeline ran.
 * Lets the UI offer one-tap recovery instead of silently losing a meeting the
 * user believes they recorded.
 */
export async function interruptedSessions(): Promise<StoredSession[]> {
  if (!available()) return [];
  try {
    const all = await run<StoredSession[]>(SESSIONS, 'readonly', (s) => s.getAll());
    return (all || []).filter((s) => s.state !== 'done').sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

/** Bytes currently held on the device, so the UI can be honest about quota. */
export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null;
    const e = await navigator.storage.estimate();
    return { usage: e.usage || 0, quota: e.quota || 0 };
  } catch {
    return null;
  }
}

/**
 * Ask the browser to make this origin's storage persistent.
 *
 * Without it, IndexedDB is "best-effort": Android is free to evict it under
 * storage pressure — precisely when a long recording is filling it. Chrome
 * grants this silently to installed PWAs and to engaged sites; elsewhere it is
 * simply declined, which is why the result is informational, never fatal.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
