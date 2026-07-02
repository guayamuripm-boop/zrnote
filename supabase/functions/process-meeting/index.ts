import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GROQ_BASE = 'https://api.groq.com/openai/v1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { meetingId } = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const groqKey = Deno.env.get('GROQ_API_KEY')!;

    console.log(`Starting processing for meeting: ${meetingId}`);

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Get meeting data
    const { data: meeting, error: meetingError } = await supabase
      .from('meetings')
      .select('*')
      .eq('id', meetingId)
      .single();

    if (meetingError || !meeting) {
      throw new Error(`Meeting not found: ${meetingError?.message || 'null'}`);
    }

    console.log(`Meeting found: ${meeting.title}, status: ${meeting.status}`);

    // 2. Get audio file from storage
    const segments = meeting.audio_segments || [];
    if (segments.length === 0) {
      throw new Error('No audio segments found in meeting');
    }

    console.log(`Found ${segments.length} segments`);

    // Download and combine audio segments
    let allTranscriptions: string[] = [];

    for (const segment of segments) {
      console.log(`Downloading segment: ${segment.r2_key}`);
      const { data: audioData, error: downloadError } = await supabase.storage
        .from('meeting-audio')
        .download(segment.r2_key);

      if (downloadError) {
        console.error(`Error downloading segment: ${downloadError.message}`);
        continue;
      }

      console.log(`Segment downloaded, size: ${audioData.size}`);

      // Skip segments too small (< 50KB) — likely invalid/corrupt webm
      if (audioData.size < 50000) {
        console.log(`Skipping segment ${segment.segment_index}: too small (${audioData.size} bytes)`);
        continue;
      }

      // 3. Transcribe with Groq Whisper
      const formData = new FormData();
      formData.append('file', audioData, 'audio.webm');
      formData.append('model', 'whisper-large-v3');
      formData.append('language', 'es');
      formData.append('response_format', 'verbose_json');

      console.log('Calling Groq Whisper...');
      const transcriptionResponse = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${groqKey}`,
        },
        body: formData,
      });

      if (!transcriptionResponse.ok) {
        const errorText = await transcriptionResponse.text();
        console.error(`Transcription error for segment ${segment.segment_index}: ${errorText}`);
        continue;
      }

      const transcriptionResult = await transcriptionResponse.json();
      if (transcriptionResult.text && transcriptionResult.text.trim().length > 0) {
        allTranscriptions.push(transcriptionResult.text);
        console.log(`Transcribed segment: ${transcriptionResult.text.length} chars`);
      } else {
        console.log(`Segment ${segment.segment_index} produced empty transcription, skipping`);
      }
    }

    const fullTranscript = allTranscriptions.join('\n\n');
    console.log(`Full transcription: ${fullTranscript.length} chars`);

    if (fullTranscript.trim().length === 0) {
      throw new Error('No se pudo transcribir ningún segmento. Verifica que el audio no esté vacío.');
    }

    // 4. Generate minute with Groq Llama 3
    const minutePrompt = `
Eres ZRNote, sistema de minutas de ZR Mecacademy.
Analiza la transcripción y responde SOLO con un JSON válido, sin texto adicional.

ESTRUCTURA JSON REQUERIDA:
{
  "summary": "string — resumen ejecutivo 3-5 oraciones",
  "topics": ["string"],
  "decisions": ["string"],
  "changes": ["string — qué cambia respecto a qué"],
  "action_items": [
    {
      "assignee_name": "string — nombre del responsable",
      "description": "string — tarea específica",
      "due_date": "YYYY-MM-DD o null",
      "priority": "alta|media|baja"
    }
  ],
  "next_steps": ["string"]
}

REGLAS:
- Si un hablante no tiene nombre, usa el label de la transcripción (ej: "Speaker 1")
- Solo extrae action items que sean compromisos reales (no sugerencias vagas)
- decisions = acuerdos oficiales tomados (afirmativo: "Se aprueba...", "Se decide...")
- changes = modificaciones a algo que ya existía
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
        max_tokens: 4096,
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
    console.log('Minute generated');

    // 5. Save minute to database
    const { data: minute, error: minuteError } = await supabase
      .from('minutes')
      .insert({
        meeting_id: meetingId,
        summary: minuteJSON.summary,
        topics: minuteJSON.topics,
        decisions: minuteJSON.decisions,
        changes: minuteJSON.changes,
        next_steps: minuteJSON.next_steps,
        raw_llm_output: JSON.stringify(minuteJSON),
      })
      .select()
      .single();

    if (minuteError) throw new Error(`Minute save error: ${minuteError.message}`);

    // 6. Save action items
    for (const item of minuteJSON.action_items || []) {
      await supabase.from('action_items').insert({
        meeting_id: meetingId,
        minute_id: minute.id,
        assignee_name: item.assignee_name,
        description: item.description,
        due_date: item.due_date,
        priority: item.priority,
      });
    }

    // 7. Update meeting status
    await supabase
      .from('meetings')
      .update({
        status: 'completed',
        transcript_raw: fullTranscript,
      })
      .eq('id', meetingId);

    // 8. Done — emails are sent via the Next.js send-emails route (Gmail SMTP)

    console.log('Processing complete!');

    return new Response(
      JSON.stringify({ success: true, minuteId: minute.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
