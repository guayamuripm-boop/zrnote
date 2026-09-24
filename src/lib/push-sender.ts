import webpush from 'web-push';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';

export interface PushPayload {
  title: string;
  body: string;
  tag?: string;
  url?: string;
}

const VAPID_SUBJECT = process.env.VAPID_SUBJECT;
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

function isConfigured(): boolean {
  return !!(VAPID_SUBJECT && VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
}

let vapidSet = false;

function ensureVapid() {
  if (vapidSet) return;
  webpush.setVapidDetails(VAPID_SUBJECT!, VAPID_PUBLIC_KEY!, VAPID_PRIVATE_KEY!);
  vapidSet = true;
}

export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<{ sent: number; failed: number }> {
  if (!isConfigured()) return { sent: 0, failed: 0 };

  ensureVapid();

  const supabase = getSupabaseAdmin();
  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, keys_p256dh, keys_auth')
    .eq('user_id', userId);

  if (error || !subs?.length) return { sent: 0, failed: 0 };

  const body = JSON.stringify(payload);
  let sent = 0;
  let failed = 0;
  const expired: string[] = [];

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth },
          },
          body,
        );
        sent++;
      } catch (err: any) {
        const status = err?.statusCode;
        if (status === 404 || status === 410) {
          expired.push(sub.id);
        }
        failed++;
        logger.warn('Push notification failed', {
          userId,
          endpoint: sub.endpoint.slice(0, 60),
          error: err?.message,
        });
      }
    }),
  );

  if (expired.length) {
    await supabase
      .from('push_subscriptions')
      .delete()
      .in('id', expired);
  }

  return { sent, failed };
}
