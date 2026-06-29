import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function triggerProcessing(meetingId: string): Promise<void> {
  const { error } = await supabase.functions.invoke('process-meeting', {
    body: { meetingId },
  });

  if (error) {
    throw new Error(`Error triggering processing: ${error.message}`);
  }
}
