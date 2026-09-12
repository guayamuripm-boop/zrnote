'use client';

// On-device cache of already-generated minutes, so they can be read with no
// connection at all — on a plane, in a basement classroom, wherever the app
// itself was already usable but the network was not.
//
// WHY THIS IS SEPARATE FROM THE SERVICE WORKER
// ---------------------------------------------
// The obvious approach — let the service worker cache dashboard pages — is
// exactly what `sw.js` deliberately refuses to do, for a good reason spelled
// out in its own comments: caching authenticated HTML would, on a shared
// device, hand the next person to open the browser someone else's meetings.
// That reasoning does not change just because reading offline would be
// convenient, so this cache lives in IndexedDB instead, namespaced by user id,
// and is only ever rendered by a page that authenticates the CURRENT viewer
// from their own locally-stored session before showing anything (see
// `notas-sin-conexion/page.tsx`) — never by the service worker serving up
// somebody else's cached bytes to whoever opens the tab next.

const DB_NAME = 'zrnote-minute-cache';
const DB_VERSION = 1;
const STORE = 'minutes';
/** Unbounded growth on a phone is its own kind of failure. */
const MAX_CACHED_PER_USER = 40;

export interface CachedActionItem {
  description: string;
  priority: string | null;
  status: string | null;
  due_date: string | null;
  assignee_name: string | null;
}

export interface CachedMinute {
  /** `${userId}:${meetingId}` */
  id: string;
  userId: string;
  meetingId: string;
  title: string;
  coordination: string | null;
  createdAt: string;
  summary: string | null;
  topics: string[];
  decisions: string[];
  changes: string[];
  nextSteps: string[];
  actionItems: CachedActionItem[];
  participants: { name: string; email: string }[];
  cachedAt: number;
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
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('by_user', 'userId', { unique: false });
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

/**
 * Save (or refresh) one meeting's minute for offline reading.
 *
 * Called from a small client component embedded in the meeting detail page
 * whenever that page renders a completed minute — so the cache is simply
 * "whatever you already looked at while you had signal", which is the
 * meetings someone actually cares about revisiting, not a bulk pre-fetch of
 * everything they have ever recorded.
 */
export async function cacheMinute(entry: Omit<CachedMinute, 'id' | 'cachedAt'>): Promise<void> {
  if (!available()) return;
  try {
    const record: CachedMinute = { ...entry, id: `${entry.userId}:${entry.meetingId}`, cachedAt: Date.now() };
    await run('readwrite', (s) => s.put(record) as unknown as IDBRequest);

    // Trim to the most recent N for this user. A background best-effort pass,
    // not on the critical path of the save above.
    const mine = await run<CachedMinute[]>('readonly', (s) => s.index('by_user').getAll(entry.userId));
    if (mine.length > MAX_CACHED_PER_USER) {
      const toDrop = mine.sort((a, b) => a.cachedAt - b.cachedAt).slice(0, mine.length - MAX_CACHED_PER_USER);
      for (const row of toDrop) {
        await run('readwrite', (s) => s.delete(row.id));
      }
    }
  } catch {
    /* offline reading is a bonus feature; failing to cache must not surface as an error */
  }
}

export async function getCachedMinutes(userId: string): Promise<CachedMinute[]> {
  if (!available()) return [];
  try {
    const rows = await run<CachedMinute[]>('readonly', (s) => s.index('by_user').getAll(userId));
    return rows.sort((a, b) => b.cachedAt - a.cachedAt);
  } catch {
    return [];
  }
}

/** Wipe one user's cache. Called on sign-out — this is content from private
 *  meetings, and it must not outlive the session that cached it on a device
 *  someone else might use next. */
export async function clearMinuteCache(userId: string): Promise<void> {
  if (!available()) return;
  try {
    const rows = await run<CachedMinute[]>('readonly', (s) => s.index('by_user').getAll(userId));
    for (const row of rows) {
      await run('readwrite', (s) => s.delete(row.id));
    }
  } catch {
    /* ignore */
  }
}
