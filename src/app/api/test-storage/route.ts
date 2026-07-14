import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const meetingId = url.searchParams.get('meetingId');

  const results: Record<string, any> = {};

  // 1. Check env vars
  results.env = {
    SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    SERVICE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    SERVICE_KEY_FALLBACK: !!process.env.SUPABASE_SERVICE_KEY,
    GROQ_KEY: !!process.env.GROQ_API_KEY,
  };

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!serviceKey || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    results.error = 'Missing env vars';
    return NextResponse.json(results, { status: 500 });
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, serviceKey);

  // 2. List files in bucket
  try {
    const { data: folders, error: listError } = await supabase.storage
      .from('meeting-audio')
      .list('default', { limit: 5 });

    results.listFiles = {
      count: folders?.length || 0,
      names: folders?.map(f => f.name) || [],
      error: listError?.message || null,
    };
  } catch (e: any) {
    results.listFiles = { error: e.message };
  }

  // 3. If meetingId provided, try to download first segment
  if (meetingId) {
    try {
      const { data: meetingFiles, error: meetErr } = await supabase.storage
        .from('meeting-audio')
        .list(`default/${meetingId}`, { limit: 5 });

      results.meetingFiles = {
        count: meetingFiles?.length || 0,
        names: meetingFiles?.map(f => f.name) || [],
        error: meetErr?.message || null,
      };

      if (meetingFiles && meetingFiles.length > 0) {
        const filePath = `default/${meetingId}/${meetingFiles[0].name}`;
        const { data: fileData, error: downloadErr } = await supabase.storage
          .from('meeting-audio')
          .download(filePath);

        results.downloadTest = {
          path: filePath,
          success: !downloadErr,
          error: downloadErr?.message || null,
          size: fileData?.size || 0,
          type: fileData?.type || null,
        };
      }
    } catch (e: any) {
      results.meetingFiles = { error: e.message };
    }
  }

  // 4. Test Groq API key
  if (process.env.GROQ_API_KEY) {
    try {
      const formData = new FormData();
      const testBlob = new Blob([new ArrayBuffer(16000)], { type: 'audio/webm' });
      formData.append('file', testBlob, 'test.webm');
      formData.append('model', 'whisper-large-v3');
      formData.append('language', 'es');

      const groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
        body: formData,
      });

      results.groqTest = {
        status: groqRes.status,
        ok: groqRes.ok,
        error: groqRes.ok ? null : await groqRes.text(),
      };
    } catch (e: any) {
      results.groqTest = { error: e.message };
    }
  }

  return NextResponse.json(results);
}
