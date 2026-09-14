'use client';

// Depósito temporal en IndexedDB para el audio que llega vía Web Share Target.
//
// CÓMO ENCAJA
// El service worker intercepta el POST multipart/form-data que envía el
// sistema operativo cuando el usuario toca "Compartir → ZRNote" desde Notas
// de Voz (u otra app grabadora). El SW no puede navegar por sí solo, así que
// guarda el fichero aquí y responde con un 303 al `/share-target`. Esa
// página lee el fichero de vuelta, crea la reunión y se lo pasa al flujo
// de subida existente en `/dashboard/meetings/[id]/upload`.
//
// SEGURIDAD
// El fichero vive en el IndexedDB del NAVEGADOR, sólo accesible desde este
// origen (política del mismo origen del navegador). No se comparte entre
// perfiles. Se borra al consumirlo — un `clear()` explícito— y como
// respaldo se descartan entradas de más de 30 minutos por si algo falla en
// medio del flujo y queda huérfano.

const DB_NAME = 'zrnote-share-stash';
const DB_VERSION = 1;
const STORE = 'shared';
/** Sólo hay una entrada activa a la vez — la última compartida gana. */
const SLOT = 'pending';
/** Descartar automáticamente si algo se quedó a medias hace más de esto. */
const MAX_STASH_AGE_MS = 30 * 60 * 1000;

export interface SharedAudio {
  id: typeof SLOT;
  file: File;
  name: string;
  type: string;
  size: number;
  receivedAt: number;
}

function available(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Lee el fichero pendiente. Devuelve null si no hay nada, o si lo que hay
 * es antiguo (algo se quedó a medias y no vale la pena arrastrarlo).
 */
export async function readSharedAudio(): Promise<SharedAudio | null> {
  if (!available()) return null;
  try {
    const db = await openDb();
    const result = await new Promise<SharedAudio | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(SLOT);
      req.onsuccess = () => resolve((req.result as SharedAudio | undefined) || null);
      req.onerror = () => reject(req.error);
    });
    if (result && Date.now() - result.receivedAt > MAX_STASH_AGE_MS) {
      await clearSharedAudio();
      return null;
    }
    return result;
  } catch {
    return null;
  }
}

export async function clearSharedAudio(): Promise<void> {
  if (!available()) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(SLOT);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* si no se pudo limpiar, MAX_STASH_AGE_MS lo tirará más tarde */
  }
}
