'use client';

import { useEffect } from 'react';

export default function AppBadge({ count }: { count: number }) {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready.then((reg) => {
      reg.active?.postMessage({ type: 'set-badge', count });
    }).catch(() => {});
  }, [count]);

  return null;
}
