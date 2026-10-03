'use client';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

export async function isPushSupported(): Promise<boolean> {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export async function getPushPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied';
  return Notification.permission;
}

export async function requestPushPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied';
  return Notification.requestPermission();
}

export async function subscribeToPush(): Promise<PushSubscription | null> {
  if (!VAPID_PUBLIC_KEY) return null;
  if (!await isPushSupported()) return null;

  const permission = await requestPushPermission();
  if (permission !== 'granted') return null;

  try {
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (existing) return existing;

    return reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
    });
  } catch {
    return null;
  }
}

/** Guarda (upsert) la suscripción en el servidor. Sin esto el aviso nunca sale. */
export async function registerSubscriptionOnServer(sub: PushSubscription): Promise<boolean> {
  const json = sub.toJSON();
  if (!json.keys?.p256dh || !json.keys?.auth) return false;
  try {
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Pide permiso, suscribe y registra en el servidor. */
export async function enablePush(): Promise<'granted' | 'denied' | 'default' | 'error'> {
  const sub = await subscribeToPush();
  if (!sub) return (await getPushPermission()) === 'denied' ? 'denied' : 'error';
  if (!(await registerSubscriptionOnServer(sub))) {
    await sub.unsubscribe().catch(() => {});
    return 'error';
  }
  return 'granted';
}

/**
 * Si ya dio permiso, asegura que la suscripción del navegador exista Y esté en
 * el servidor. Las suscripciones caducan o se rotan, y antes nada las volvía a
 * registrar: el interruptor decía «activado» y los avisos no llegaban.
 * Silenciosa: nunca pide permiso.
 */
export async function resyncPushSubscription(): Promise<void> {
  try {
    if (!(await isPushSupported()) || Notification.permission !== 'granted') return;
    const sub = await subscribeToPush();
    if (sub) await registerSubscriptionOnServer(sub);
  } catch {
    /* best-effort */
  }
}

export async function unsubscribeFromPush(): Promise<boolean> {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return true;
    return sub.unsubscribe();
  } catch {
    return false;
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
