import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY!,
    secretAccessKey: process.env.R2_SECRET_KEY!,
  },
});

const BUCKET = process.env.R2_BUCKET!;

export async function getAudioUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(r2, command, { expiresIn: 3600 });
}

export async function submitTranscription(audioUrl: string): Promise<string> {
  const response = await fetch('https://api.assemblyai.com/v2/transcripts', {
    method: 'POST',
    headers: {
      Authorization: process.env.ASSEMBLYAI_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      audio_url: audioUrl,
      language_code: 'es',
      speaker_labels: true,
      punctuate: true,
      format_text: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`AssemblyAI error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.id;
}

export async function pollTranscription(transcriptId: string): Promise<any> {
  const response = await fetch(
    `https://api.assemblyai.com/v2/transcripts/${transcriptId}`,
    {
      headers: {
        Authorization: process.env.ASSEMBLYAI_API_KEY!,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`AssemblyAI poll error: ${response.statusText}`);
  }

  return response.json();
}
