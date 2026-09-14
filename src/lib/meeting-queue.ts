'use client';

// Starting a brand-new recording with ZERO connectivity from the very first
// second — not "recording survives a dropped signal", which the durable
// segment store and upload queue already handle, but "there was never a
// server round trip to create the meeting in the first place."
//
// WHY THIS IS ITS OWN MODULE, SEPARATE FROM recording-store.ts
// --------------------------------------------------------------
// That store is the hardened core this whole audit exists to protect: every
// segment of every recording passes through it. Adding a second, unrelated
// concern to the same file — and the same IndexedDB version — would mean any
// future change here risks a migration bug that corrupts the thing that
// actually matters. So this is a separate database entirely; a bug here can,
// at worst, lose the metadata of an offline-created meeting, never a byte of
// recorded audio.
//
// THE IDEA
// --------
// `POST /api/meetings` normally creates the row and hands back a server-
// generated id before anything else happens. Offline, that call cannot
// happen at all. So the id is generated on the DEVICE instead
// (`crypto.randomUUID()`), used everywhere immediately — the record page, the
// segment store, the upload queue — exactly as if the server had already
// agreed to it. The actual server row is created LATER, the first time there
// is a connection, by replaying this same id and payload
// (`POST /api/meetings` accepts a client-supplied id precisely for this).
// Until that happens, `ensureMeetingSynced()` is what every other part of the
// pipeline calls before it dares talk to the server about this meeting id.

const DB_NAME = 'zrnote-meeting-queue';
const DB_VERSION = 1;
const STORE = 'pending';

export interface PendingMeeting {
  /** The client-generated id — used everywhere as if it were the server's. */
  id: string;
  title: string;
  coordination: string;
  type: 'presencial' | 'virtual' | 'llamada';
  autoTitle: boolean;
  minuteStyle?: string;
  styleNotes?: string;
  summaryLength?: string;
  participants: { name: string; email: string }[];
  /**
   * When the recording-consent checkbox was confirmed, LOCALLY, before this
   * meeting existed on the server. The legally significant moment is when the
   * organiser actually confirmed it — before a word was recorded — not
   * whenever a connection happens to come back, so this timestamp is what
   * travels to the server as `recording_consent_at`, not the sync time.
   */
  consentAt: string | null;
  state: 'pending' | 'syncing' | 'done' | 'failed';
  attempts: number;
  createdAt: number;
  lastError?: string;
}

function available(): boolean {
  return typeof indexedDB !== 'undefined';
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
      }),
  );
}

export async function savePendingMeeting(m: Omit<PendingMeeting, 'state' | 'attempts' | 'createdAt'>): Promise<boolean> {
  if (!available()) return false;
  try {
    const record: PendingMeeting = { ...m, state: 'pending', attempts: 0, createdAt: Date.now() };
    await run('readwrite', (s) => s.put(record));
    return true;
  } catch {
    return false;
  }
}

export async function getPendingMeeting(id: string): Promise<PendingMeeting | null> {
  if (!available()) return null;
  try {
    return (await run<PendingMeeting | undefined>('readonly', (s) => s.get(id))) || null;
  } catch {
    return null;
  }
}

export async function allPendingMeetings(): Promise<PendingMeeting[]> {
  if (!available()) return [];
  try {
    const all = await run<PendingMeeting[]>('readonly', (s) => s.getAll());
    return (all || []).filter((m) => m.state !== 'done').sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

async function updatePendingMeeting(id: string, patch: Partial<PendingMeeting>): Promise<void> {
  if (!available()) return;
  try {
    const current = await run<PendingMeeting | undefined>('readonly', (s) => s.get(id));
    if (!current) return;
    await run('readwrite', (s) => s.put({ ...current, ...patch }));
  } catch {
    /* ignore */
  }
}

/** Record the consent confirmation locally — see `PendingMeeting.consentAt`. */
export async function confirmPendingConsent(id: string): Promise<void> {
  await updatePendingMeeting(id, { consentAt: new Date().toISOString() });
}

/**
 * Make sure this meeting exists on the server, creating it now if it does
 * not, and return whether it is safe to talk to the server about it.
 *
 * This is the ONE thing every other part of the pipeline needs to know before
 * it uploads a segment, checks consent, or asks about processing status for a
 * meeting id that might still be entirely local. It is cheap to call
 * repeatedly: an already-synced id resolves instantly with no network call.
 */
export async function ensureMeetingSynced(meetingId: string): Promise<boolean> {
  const pending = await getPendingMeeting(meetingId);
  // No local record at all: either a perfectly normal server-created meeting
  // (the overwhelmingly common case), or one this device already forgot about
  // after syncing. Either way, there is nothing for this function to do.
  if (!pending) return true;
  if (pending.state === 'done') return true;

  await updatePendingMeeting(meetingId, { state: 'syncing', attempts: pending.attempts + 1 });

  try {
    const res = await fetch('/api/meetings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: pending.id,
        title: pending.title,
        coordination: pending.coordination,
        type: pending.type,
        autoTitle: pending.autoTitle,
        minuteStyle: pending.minuteStyle,
        styleNotes: pending.styleNotes,
        summaryLength: pending.summaryLength,
        participants: pending.participants,
        recordingConsentAt: pending.consentAt,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      await updatePendingMeeting(meetingId, { state: 'pending', lastError: data.error || `HTTP ${res.status}` });
      return false;
    }

    await updatePendingMeeting(meetingId, { state: 'done' });
    return true;
  } catch (err: any) {
    // Still offline, or a genuine network blip — indistinguishable from here,
    // and both get the same answer: not synced yet, try again later.
    await updatePendingMeeting(meetingId, { state: 'pending', lastError: err?.message || String(err) });
    return false;
  }
}
