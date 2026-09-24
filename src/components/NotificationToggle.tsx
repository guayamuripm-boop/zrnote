'use client';

import { useEffect, useState } from 'react';
import {
  isPushSupported,
  getPushPermission,
  subscribeToPush,
  unsubscribeFromPush,
} from '@/lib/push-notifications';

export default function NotificationToggle() {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    isPushSupported().then(setSupported);
    getPushPermission().then(setPermission);
  }, []);

  if (!supported) return null;

  const enabled = permission === 'granted';

  const toggle = async () => {
    setLoading(true);
    try {
      if (enabled) {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await fetch('/api/push/subscribe', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
        }
        await unsubscribeFromPush();
        setPermission('default');
      } else {
        const sub = await subscribeToPush();
        if (sub) {
          const json = sub.toJSON();
          const res = await fetch('/api/push/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              endpoint: sub.endpoint,
              keys: { p256dh: json.keys!.p256dh, auth: json.keys!.auth },
            }),
          });
          if (!res.ok) {
            await sub.unsubscribe();
            setPermission('default');
            return;
          }
        }
        setPermission(sub ? 'granted' : 'denied');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={loading || permission === 'denied'}
      className="flex items-center gap-3 w-full p-4 glass-strong rounded-2xl text-left transition hover:shadow-elevated disabled:opacity-50"
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
        enabled ? 'bg-gradient-to-br from-blue-500 to-indigo-500' : 'bg-slate-200 dark:bg-slate-700'
      }`}>
        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-slate-900 dark:text-slate-100 text-sm">Notificaciones</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {permission === 'denied'
            ? 'Bloqueadas en el navegador — actívalas en la configuración del sitio'
            : enabled
              ? 'Recibirás avisos cuando tus minutas estén listas'
              : 'Activa para saber cuando tus minutas estén listas'}
        </p>
      </div>
      <div className={`w-11 h-6 rounded-full relative transition-colors ${
        enabled ? 'bg-blue-500' : 'bg-slate-300 dark:bg-slate-600'
      }`}>
        <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
          enabled ? 'translate-x-[22px]' : 'translate-x-0.5'
        }`} />
      </div>
    </button>
  );
}
