import { NextResponse } from 'next/server';

export async function POST() {
  console.warn('AssemblyAI webhook called but ZRNote now uses Groq Whisper. This endpoint is deprecated.');
  return NextResponse.json({ error: 'Deprecated: ZRNote uses Groq Whisper, not AssemblyAI' }, { status: 410 });
}
