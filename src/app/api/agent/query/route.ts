import { createServerSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { embedSingle } from '@/lib/embeddings';
import { logger } from '@/lib/logger';

const querySchema = z.object({
  query: z.string().min(1).max(2000),
  orgId: z.string().uuid().optional(),
  meetingId: z.string().uuid().optional(),
  topK: z.number().min(1).max(50).default(10),
  filters: z.record(z.any()).optional(),
});

export async function POST(request: Request) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const parsed = querySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { query, orgId, meetingId, topK } = parsed.data;

  const { data: membership } = await supabase
    .from('users')
    .select('org_id, role')
    .eq('id', user.id)
    .single();

  const effectiveOrgId = orgId || membership?.org_id || null;

  if (orgId && (!membership || membership.org_id !== orgId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const queryEmbedding = await embedSingle(query);

    const { data: chunks, error: searchError } = await supabase
      .rpc('search_meeting_chunks', {
        p_org_id: effectiveOrgId,
        p_query_embedding: queryEmbedding,
        p_limit: topK,
        p_meeting_id: meetingId || null,
      });

    if (searchError) {
      throw new Error(`Search error: ${searchError.message}`);
    }

    if (!chunks || chunks.length === 0) {
      return NextResponse.json({
        answer: 'No tengo información sobre eso en las reuniones registradas.',
        sources: [],
      });
    }

    // Build context from chunks
    const context = chunks
      .map((c: any, i: number) => `[${i + 1}] [${c.metadata?.section || 'general'}] ${c.content}`)
      .join('\n\n');

    // Generate answer with LLM (using Groq)
    const GROQ_BASE = 'https://api.groq.com/openai/v1';
    const groqKey = process.env.GROQ_API_KEY!;

    const systemPrompt = `
Eres un asistente corporativo con acceso al historial de reuniones de la empresa.
Responde basándote SOLO en el contexto proporcionado. Cita fuentes: [número].
Si no hay info suficiente, di: "No tengo información sobre eso en las reuniones registradas."
Sé conciso pero completo.
`;

    const llmResponse = await fetch(`${GROQ_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${groqKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Contexto:\n${context}\n\nPregunta: ${query}` },
        ],
        temperature: 0.2,
        max_tokens: 1024,
      }),
    });

    if (!llmResponse.ok) {
      throw new Error(`LLM error: ${llmResponse.status}`);
    }

    const llmResult = await llmResponse.json();
    const answer = llmResult.choices[0]?.message?.content || 'Error generando respuesta';

    // Format sources
    const sources = chunks.map((c: any, i: number) => ({
      index: i + 1,
      meeting_id: c.meeting_id,
      section: c.metadata?.section,
      similarity: c.similarity,
      preview: c.content.substring(0, 200),
    }));

    return NextResponse.json({ answer, sources });
  } catch (err) {
    logger.error('Agent query error', { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'Error processing query' }, { status: 500 });
  }
}