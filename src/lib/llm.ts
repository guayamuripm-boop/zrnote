import { MINUTE_PROMPT } from '@/lib/prompts/minute';

const GROQ_BASE = 'https://api.groq.com/openai/v1';

export async function generateMinute(transcript: string): Promise<any> {
  const response = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama3-70b-8192',
      messages: [
        {
          role: 'user',
          content: MINUTE_PROMPT(transcript),
        },
      ],
      temperature: 0.3,
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Groq LLM error: ${error}`);
  }

  const data = await response.json();
  const responseText = data.choices[0]?.message?.content || '';

  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Groq did not return valid JSON');
  }

  return JSON.parse(jsonMatch[0]);
}
