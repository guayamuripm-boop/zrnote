import { createClient } from '@supabase/supabase-js';

export async function triggerProcessing(meetingId: string): Promise<void> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY!
  );

  supabase.functions.invoke('process-meeting', {
    body: { meetingId },
  }).then(({ error }) => {
    if (error) {
      console.error('Edge Function error:', error.message);
      supabase
        .from('meetings')
        .update({ status: 'failed' })
        .eq('id', meetingId)
        .then(() => {});
    }
  }).catch((err) => {
    console.error('Edge Function invoke error:', err.message);
    supabase
      .from('meetings')
      .update({ status: 'failed' })
      .eq('id', meetingId)
      .then(() => {});
  });
}
