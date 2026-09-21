import { createServerSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

// Must mirror the `valid_doc_type` CHECK on legal_documents (migration 020).
const consentSchema = z.object({
  doc_type: z.enum([
    'terms_of_service',
    'privacy_policy',
    'cookie_policy',
    'recording_consent',
    'data_processing_agreement',
    'user_rights',
    'fair_use_policy',
  ]),
  doc_version: z.string().regex(/^\d+\.\d+(\.\d+)?$/, 'Formato: X.Y o X.Y.Z'),
});

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = consentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { doc_type, doc_version } = parsed.data;

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
  const supabase = await createServerSupabase();
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
