import { JINA_API_KEY } from '@/lib/env';

const JINA_EMBED_URL = 'https://api.jina.ai/v1/embeddings';
const JINA_MODEL = 'jina-embeddings-v3';
const EMBED_DIMENSIONS = 1024;

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (!JINA_API_KEY) {
    throw new Error('JINA_API_KEY not configured');
  }

  const res = await fetch(JINA_EMBED_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${JINA_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: JINA_MODEL,
      input: texts,
      dimensions: EMBED_DIMENSIONS,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Jina embedding error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.data.map((d: any) => d.embedding);
}

export async function embedSingle(text: string): Promise<number[]> {
  const [embedding] = await embedTexts([text]);
  return embedding;
}