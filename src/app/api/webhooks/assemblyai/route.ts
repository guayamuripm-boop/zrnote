import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization') || '';
    const webhookSecret = process.env.ASSEMBLYAI_WEBHOOK_SECRET || '';

    if (webhookSecret && authHeader !== `Bearer ${webhookSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { transcript_id, status } = body;

    if (!transcript_id) {
      return NextResponse.json({ error: 'Missing transcript_id' }, { status: 400 });
    }

    console.log(`Webhook received: transcript ${transcript_id} status ${status}`);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
