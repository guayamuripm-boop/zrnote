const ASSEMBLYAI_BASE = 'https://api.assemblyai.com/v2';

interface TranscriptionResponse {
  id: string;
  status: string;
  text?: string;
  utterances?: {
    speaker: string;
    text: string;
    start: number;
    end: number;
  }[];
}

export async function submitTranscription(audioUrl: string): Promise<string> {
  const response = await fetch(`${ASSEMBLYAI_BASE}/transcripts`, {
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

export async function pollTranscription(transcriptId: string): Promise<TranscriptionResponse> {
  const response = await fetch(`${ASSEMBLYAI_BASE}/transcripts/${transcriptId}`, {
    headers: {
      Authorization: process.env.ASSEMBLYAI_API_KEY!,
    },
  });

  if (!response.ok) {
    throw new Error(`AssemblyAI poll error: ${response.statusText}`);
  }

  return response.json();
}
