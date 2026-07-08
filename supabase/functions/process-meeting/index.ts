import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GROQ_BASE = 'https://api.groq.com/openai/v1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function transcribeSegment(
  supabase: any,
  segment: any,
  groqKey: string,
): Promise<string | null> {
  const { data: audioData, error: downloadError } = await supabase.storage
    .from('meeting-audio')
    .download(segment.r2_key);

  if (downloadError) {
    console.error(`Error downloading segment ${segment.segment_index}: ${downloadError.message}`);
    return null;
  }

  if (audioData.size < 10000) {
    console.log(`Skipping segment ${segment.segment_index}: too small (${audioData.size} bytes)`);
    return null;
  }

  const ext = segment.r2_key.split('.').pop() || 'webm';

  for (let attempt = 1; attempt <= 3; attempt++) {
    const formData = new FormData();
    formData.append('file', audioData, `audio.${ext}`);
    formData.append('model', 'whisper-large-v3');
    formData.append('language', 'es');
    formData.append('response_format', 'verbose_json');

    console.log(`Transcribing segment ${segment.segment_index} (attempt ${attempt})...`);
    const response = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${groqKey}` },
      body: formData,
    });

    if (response.ok) {
      const result = await response.json();
      if (result.text && result.text.trim().length > 0) {
        console.log(`Segment ${segment.segment_index} transcribed: ${result.text.length} chars`);
        return result.text;
      }
      console.log(`Segment ${segment.segment_index} produced empty transcription`);
      return null;
    }

    const errText = await response.text();
    console.error(`Segment ${segment.segment_index} attempt ${attempt} failed (${response.status}): ${errText}`);

    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }

  return null;
}

async function heartbeat(supabase: any, meetingId: string) {
  await supabase
    .from('meetings')
    .update({ status: 'processing' })
    .eq('id', meetingId);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let meetingId: string | null = null;
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SERVICE_ROLE_KEY')!;
  let supabase;
  try {
    meetingId = (await req.json()).meetingId;
    const groqKey = Deno.env.get('GROQ_API_KEY')!;

    console.log(`Starting processing for meeting: ${meetingId}`);

    supabase = createClient(supabaseUrl, supabaseKey);

    const { data: meeting, error: meetingError } = await supabase
      .from('meetings')
      .select('*')
      .eq('id', meetingId)
      .single();

    if (meetingError || !meeting) {
      throw new Error(`Meeting not found: ${meetingError?.message || 'null'}`);
    }

    const segments = meeting.audio_segments || [];
    if (segments.length === 0) {
      throw new Error('No audio segments found in meeting');
    }

    console.log(`Found ${segments.length} segments — processing in batches of 3`);

    const BATCH_SIZE = 3;
    const allTranscriptions: string[] = [];

    for (let i = 0; i < segments.length; i += BATCH_SIZE) {
      const batch = segments.slice(i, i + BATCH_SIZE);
      console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(segments.length / BATCH_SIZE)}`);

      const results = await Promise.allSettled(
        batch.map((seg: any) => transcribeSegment(supabase, seg, groqKey))
      );

      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) {
          allTranscriptions.push(r.value);
        }
      }

      if (i + BATCH_SIZE < segments.length) {
        await heartbeat(supabase, meetingId);
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    const fullTranscript = allTranscriptions.join('\n\n');
    console.log(`Full transcription: ${fullTranscript.length} chars`);

    if (fullTranscript.trim().length === 0) {
      throw new Error('No se pudo transcribir ningún segmento. Verifica que el audio no esté vacío.');
    }

    await supabase
      .from('meetings')
      .update({ transcript_raw: fullTranscript })
      .eq('id', meetingId);

    const minutePrompt = `
Eres ZRNote, sistema de minutas de ZR Mecacademy.
Analiza la transcripción COMPLETA y responde SOLO con un JSON válido, sin texto adicional.

Tu objetivo es crear una minuta que sirva como RESPALDO HISTÓRICO de todo lo hablado. No omitas nada importante. Si se mencionó un proyecto, un estatus, un problema, una idea, un acuerdo, debe quedar registrado.

ESTRUCTURA JSON REQUERIDA:
{
  "summary": "string — resumen ejecutivo detallado (5-8 oraciones que cubran los puntos principales)",
  "discussion": [
    {
      "topic": "string — tema o subtema discutido",
      "details": "string — TODO lo que se dijo sobre este tema, incluyendo opiniones, argumentos, contexto. Mínimo 2-3 oraciones.",
      "speaker": "string — quién lideró o principal contribuyente de este tema"
    }
  ],
  "decisions": [
    {
      "decision": "string — qué se decidió",
      "context": "string — por qué o bajo qué condiciones"
    }
  ],
  "project_statuses": [
    {
      "project": "string — nombre del proyecto o initiative",
      "status": "string — estado actual (ej: en progreso, retrasado, completado, pendiente)",
      "details": "string — detalles del estado, qué se avanzó, qué falta"
    }
  ],
  "blockers": [
    {
      "issue": "string — problema o bloqueo identificado",
      "impact": "string — qué afecta o retrasa",
      "owner": "string — quién es responsable de resolverlo o null"
    }
  ],
  "ideas": ["string — ideas mencionadas que no son decisiones finales ni tareas"],
  "action_items": [
    {
      "assignee_name": "string — nombre del responsable",
      "description": "string — tarea específica y clara",
      "due_date": "YYYY-MM-DD o null",
      "priority": "alta|media|baja",
      "context": "string — por qué es necesario o qué conecta"
    }
  ],
  "next_steps": [
    {
      "step": "string — próximo paso o follow-up",
      "owner": "string — quién lo hace o null"
    }
  ]
}

REGLAS:
- Si un hablante no tiene nombre, usa el label de la transcripción (ej: "Speaker 1")
- NO omitas información. Si alguien mencionó un proyecto, un bloqueo, una idea, un cambio de estatus, DEBE aparecer.
- Si se discutió el estado de un proyecto, inclúyelo en project_statuses con todos los detalles
- Si hay un problema/bloqueo, inclúyelo en blockers con el impacto y quién es responsable
- decisions = acuerdos oficiales tomados ("se aprueba", "se decide", "quedamos en que...")
- ideas = cosas mencionadas que son brainstorming o sugerencias, no compromisos
- action_items = compromisos REALES con persona responsable. El campo "contexto" explica por qué es necesario
- Sé lo más fiel posible a lo que se dijo. No inventes ni infieras cosas no mencionadas.
- Responde SOLO JSON. Cero texto fuera del JSON.

TRANSCRIPCIÓN:
${fullTranscript}
`;

    console.log('Calling Groq LLM...');
    const llmResponse = await fetch(`${GROQ_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${groqKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: minutePrompt }],
        temperature: 0.3,
        max_tokens: 8192,
      }),
    });

    if (!llmResponse.ok) {
      const errorText = await llmResponse.text();
      throw new Error(`LLM error (${llmResponse.status}): ${errorText}`);
    }

    const llmResult = await llmResponse.json();
    const responseText = llmResult.choices[0]?.message?.content || '';

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('LLM did not return valid JSON');
    }

    const minuteJSON = JSON.parse(jsonMatch[0]);
    console.log('Minute generated. Action items:', (minuteJSON.action_items || []).length);

    const { data: minute, error: minuteError } = await supabase
      .from('minutes')
      .insert({
        meeting_id: meetingId,
        summary: minuteJSON.summary,
        topics: (minuteJSON.discussion || []).map((d: any) => d.topic || d),
        decisions: (minuteJSON.decisions || []).map((d: any) => typeof d === 'string' ? d : `${d.decision}${d.context ? ` (${d.context})` : ''}`),
        changes: [],
        next_steps: (minuteJSON.next_steps || []).map((n: any) => typeof n === 'string' ? n : `${n.step}${n.owner ? ` — ${n.owner}` : ''}`),
        discussion: minuteJSON.discussion || [],
        project_statuses: minuteJSON.project_statuses || [],
        blockers: minuteJSON.blockers || [],
        ideas: minuteJSON.ideas || [],
        raw_llm_output: JSON.stringify(minuteJSON),
      })
      .select()
      .single();

    if (minuteError) throw new Error(`Minute save error: ${minuteError.message}`);

    const actionItemsToInsert = (minuteJSON.action_items || []).map((item: any) => ({
      meeting_id: meetingId,
      minute_id: minute.id,
      assignee_name: item.assignee_name,
      description: item.description,
      due_date: item.due_date,
      priority: item.priority,
    }));

    if (actionItemsToInsert.length > 0) {
      const { error: insertError } = await supabase.from('action_items').insert(actionItemsToInsert);
      if (insertError) {
        console.error('Action items insert error:', insertError.message);
      } else {
        console.log(`Inserted ${actionItemsToInsert.length} action items`);
      }
    }

    await supabase
      .from('meetings')
      .update({ status: 'completed' })
      .eq('id', meetingId);

    try {
      const appUrl = Deno.env.get('NEXT_PUBLIC_APP_URL') || Deno.env.get('APP_URL') || 'https://zrnote.vercel.app';
      const serviceKey = Deno.env.get('SERVICE_ROLE_KEY') || '';
      fetch(`${appUrl}/api/meetings/${meetingId}/send-emails`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
        },
      }).catch(() => {});
    } catch (_) {}

    console.log('Processing complete!');

    return new Response(
      JSON.stringify({ success: true, minuteId: minute.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error.message);
    if (meetingId && supabase) {
      try { await supabase.from('meetings').update({ status: 'failed' }).eq('id', meetingId); } catch (_) { /* ignore */ }
    }
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
