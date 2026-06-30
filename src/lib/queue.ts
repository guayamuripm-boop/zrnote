import { createClient } from '@supabase/supabase-js';

export async function triggerProcessing(meetingId: string): Promise<void> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  const { data, error } = await supabase.functions.invoke('process-meeting', {
    body: { meetingId },
  });

  if (error) {
    const detail = data ? JSON.stringify(data) : error.message;
    console.error('Edge Function error:', detail);
    throw new Error(`Edge Function error: ${detail}`);
  }
}
