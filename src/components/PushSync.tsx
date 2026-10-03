'use client';

import { useEffect } from 'react';
import { resyncPushSubscription } from '@/lib/push-notifications';

/**
 * Re-registra en el servidor la suscripción push de quien ya dio permiso.
 * Una vez por carga del panel; no pide permiso ni muestra nada.
 */
export default function PushSync() {
  useEffect(() => {
    void resyncPushSubscription();
  }, []);
  return null;
}
