import { createServerSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { doc_type, doc_version } = body;

  if (!doc_type || !doc_version) {
    return NextResponse.json(
      { error: 'Missing doc_type or doc_version' },
      { status: 400 }
    );
  }

  // Get IP and User-Agent for audit trail
  const ip = request.headers.get('x-forwarded-for') ||
             request.headers.get('x-real-ip') ||
             'unknown';
  const userAgent = request.headers.get('user-agent') || '';

  // Upsert consent record
  const { error } = await supabase
    .from('user_consent_log')
    .upsert(
      {
        user_id: user.id,
        doc_type,
        doc_version,
        ip_address: ip,
        user_agent: userAgent,
        agreed_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,doc_type' }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function GET(request: Request) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('user_consent_log')
    .select('doc_type, doc_version, agreed_at')
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Transform to map for easy lookup
  const consentMap = new Map<string, any>();
  (data || []).forEach((record: any) => {
    consentMap.set(record.doc_type, {
      version: record.doc_version,
      agreedAt: record.agreed_at,
    });
  });

  return NextResponse.json(Object.fromEntries(consentMap));
}
