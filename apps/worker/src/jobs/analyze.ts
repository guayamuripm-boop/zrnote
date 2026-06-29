import { createClient } from '@supabase/supabase-js';
import { generateMinute } from '../lib/claude';
import { enqueueSendEmails } from '../lib/queue';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function analyzeMeeting(meetingId: string): Promise<void> {
  const { data: meeting } = await supabase
    .from('meetings')
    .select('*')
    .eq('id', meetingId)
    .single();

  if (!meeting) throw new Error('Meeting not found');

  if (!meeting.transcript_diarized || meeting.transcript_diarized.length === 0) {
    throw new Error('No transcript available for analysis');
  }

  const transcriptText = meeting.transcript_diarized
    .map((s: any) => {
      const speakerName = meeting.speaker_map?.[s.speaker] || s.speaker;
      return `[${speakerName}]: ${s.text}`;
    })
    .join('\n\n');

  const minuteJSON = await generateMinute(transcriptText);

  const { data: minute, error: minuteError } = await supabase
    .from('minutes')
    .insert({
      meeting_id: meetingId,
      summary: minuteJSON.summary,
      topics: minuteJSON.topics,
      decisions: minuteJSON.decisions,
      changes: minuteJSON.changes,
      next_steps: minuteJSON.next_steps,
      raw_llm_output: JSON.stringify(minuteJSON),
    })
    .select()
    .single();

  if (minuteError) throw minuteError;

  for (const item of minuteJSON.action_items) {
    await supabase.from('action_items').insert({
      meeting_id: meetingId,
      minute_id: minute.id,
      assignee_name: item.assignee_name,
      description: item.description,
      due_date: item.due_date,
      priority: item.priority,
    });
  }

  await supabase
    .from('meetings')
    .update({ status: 'completed' })
    .eq('id', meetingId);

  await enqueueSendEmails(meetingId);
}
