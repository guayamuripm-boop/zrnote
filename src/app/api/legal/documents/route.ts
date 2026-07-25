import { createServerSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const supabase = createServerSupabase();
  const { searchParams } = new URL(request.url);
  const docType = searchParams.get('type');

  if (!docType) {
    // Return list of all available documents
    const { data, error } = await supabase
      .from('legal_documents')
      .select('doc_type, version, effective_date')
      .order('doc_type')
      .order('effective_date', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get latest version of each document
    const latest = new Map<string, any>();
    (data || []).forEach((doc: any) => {
      if (!latest.has(doc.doc_type)) {
        latest.set(doc.doc_type, doc);
      }
    });

    return NextResponse.json(Array.from(latest.values()));
  }

  // Get specific document (latest version)
  const { data, error } = await supabase
    .from('legal_documents')
    .select('*')
    .eq('doc_type', docType)
    .order('effective_date', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  return NextResponse.json(data);
}
