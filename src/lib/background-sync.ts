'use client';

export async function registerBackgroundSync(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('SyncManager' in window)) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    await (reg as any).sync.register('segment-upload');
    return true;
  } catch {
    return false;
  }
}
