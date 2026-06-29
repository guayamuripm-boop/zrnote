import Anthropic from '@anthropic-ai/sdk';
import type { MinuteJSON } from '@zrnote/types';
import { MINUTE_PROMPT } from '@/lib/prompts/minute';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export async function generateMinute(transcript: string): Promise<MinuteJSON> {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: MINUTE_PROMPT(transcript),
      },
    ],
  });

  const responseText =
    message.content[0].type === 'text' ? message.content[0].text : '';

  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Claude did not return valid JSON');
  }

  return JSON.parse(jsonMatch[0]) as MinuteJSON;
}
