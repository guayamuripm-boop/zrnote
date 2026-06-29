import { createClient } from '@supabase/supabase-js';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { submitTranscription, pollTranscription } from '../lib/assemblyai';
import { enqueueAnalyze } from '../lib/queue';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY!,
    secretAccessKey: process.env.R2_SECRET_KEY!,
  },
});

async function waitForTranscription(transcriptId: string): Promise<any> {
  let result;
  do {
    result = await pollTranscription(transcriptId);
    if (result.status !== 'completed' && result.status !== 'failed') {
      await new Promise((r) => setTimeout(r, 3000));
    }
  } while (result.status === 'queued' || result.status === 'processing');

  if (result.status === 'failed') {
    throw new Error(`Transcription failed for ${transcriptId}`);
  }

  return result;
}

export async function transcribeMeeting(meetingId: string): Promise<void> {
  const { data: meeting } = await supabase
    .from('meetings')
    .select('*')
    .eq('id', meetingId)
    .single();

  if (!meeting) throw new Error('Meeting not found');

  const segments = meeting.audio_segments || [];
  const transcriptIds: string[] = [];

  for (const segment of segments) {
    const command = new GetObjectCommand({
      Bucket: process.env.R2_BUCKET!,
      Key: segment.r2_key,
    });
    const audioUrl = await getSignedUrl(r2, command, { expiresIn: 3600 });

    const transcriptId = await submitTranscription(audioUrl);
    transcriptIds.push(transcriptId);
  }

  const allText: string[] = [];
  const allDiarized: any[] = [];

  for (const transcriptId of transcriptIds) {
    const result = await waitForTranscription(transcriptId);
    allText.push(result.text || '');

    if (result.utterances) {
      for (const u of result.utterances) {
        allDiarized.push({
          speaker: u.speaker,
          text: u.text,
          start_ms: u.start,
          end_ms: u.end,
        });
      }
    }
  }

  const combinedText = allText.join('\n\n');

  await supabase
    .from('meetings')
    .update({
      transcript_raw: combinedText,
      transcript_diarized: allDiarized,
    })
    .eq('id', meetingId);

  await enqueueAnalyze(meetingId);
}
