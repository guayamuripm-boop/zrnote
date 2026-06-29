import { createClient } from '@supabase/supabase-js';

export async function triggerProcessing(meetingId: string): Promise<void> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  const { error } = await supabase.functions.invoke('process-meeting', {
    body: { meetingId },
  });

  if (error) {
    throw new Error(`Error triggering processing: ${error.message}`);
  }
}
