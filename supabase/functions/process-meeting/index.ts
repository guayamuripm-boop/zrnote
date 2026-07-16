import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const GROQ_BASE = 'https://api.groq.com/openai/v1';

interface QueueItem {
  id: string;
  meeting_id: string;
  step: 'transcribe' | 'analyze' | 'vectorize' | 'emails';
  status: 'pending' | 'running' | 'failed' | 'completed';
  attempts: number;
  max_attempts: number;
  batch_offset: number;
  error: string | null;
}

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get('NEXT_PUBLIC_SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&#039;');
}

function escapeHtmlOrEmpty(text: string | null | undefined): string {
  if (!text) return '';
  return escapeHtml(text);
}

async function lockQueueItem(supabase: any, itemId: string): Promise<boolean> {
  const { data } = await supabase
    .from('processing_queue')
    .update({ 
      status: 'running', 
      locked_at: new Date().toISOString(),
      attempts: supabase.raw('attempts + 1')
    })
    .eq('id', itemId)
    .eq('status', 'pending')
    .select('id')
    .single();
  return !!data;
}

async function completeQueueItem(supabase: any, itemId: string, success: boolean, error?: string) {
  await supabase
    .from('processing_queue')
    .update({ 
      status: success ? 'completed' : 'failed', 
      completed_at: new Date().toISOString(),
      error: error || null
    })
    .eq('id', itemId);
}

async function transcribeSegment(supabase: any, segment: any, groqKey: string, meetingId: string, speakerHints: string): Promise<string | null> {
  const { data: audioData, error: downloadError } = await supabase.storage
    .from('meeting-audio')
    .download(segment.r2_key);

  if (downloadError || audioData.size < 10000) return null;

  const ext = segment.r2_key.split('.').pop() || 'webm';
  let whisperPrompt = '';
  if (speakerHints) {
    whisperPrompt = `Participantes de la reunión: ${speakerHints}. Identifica a cada orador por su nombre.`;
  }

  for (let attempt = 1; attempt <= 3; attempt++) {
    const formData = new FormData();
    formData.append('file', audioData, `audio.${ext}`);
    formData.append('model', 'whisper-large-v3');
    formData.append('language', 'es');
    formData.append('response_format', 'verbose_json');
    if (speakerHints) formData.append('prompt', speakerHints);

    const response = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${groqKey}` },
      body: formData,
    });

    if (response.ok) {
      const result = await response.json();
      if (result.text && result.text.trim().length > 0) return result.text;
      return null;
    }

    if (attempt < 3) await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
  return null;
}

async function transcribeMeeting(supabase: any, meetingId: string, batchOffset: number, maxSegments = 9): Promise<{ success: boolean; more: boolean; offset: number; error?: string }> {
  const groqKey = Deno.env.get('GROQ_API_KEY');
  if (!groqKey) return { success: false, more: false, offset: batchOffset, error: 'GROQ_API_KEY no configurada' };

  const { data: meeting, error: meetingError } = await supabase
    .from('meetings')
    .select('audio_segments, transcript_raw, segments_transcribed_offset')
    .eq('id', meetingId)
    .single();

  if (meetingError || !meeting) return { success: false, more: false, offset: batchOffset, error: 'Meeting not found' };

  const segments = meeting.audio_segments || [];
  if (segments.length === 0) return { success: false, more: false, offset: batchOffset, error: 'No audio segments' };

  const offset = batchOffset || meeting.segments_transcribed_offset || 0;
  const pendingSegments = segments.slice(offset);
  const batch = pendingSegments.slice(0, maxSegments);

  if (batch.length === 0) {
    const transcript = meeting.transcript_raw || '';
    return { success: true, more: false, offset: segments.length, error: transcript.trim() ? undefined : 'No transcript' };
  }

  const speakerHints = segments
    .filter((s: any) => s.speaker_hint)
    .map((s: any) => `Segmento ${s.segment_index}: ${s.speaker_hint}`)
    .join('; ');

  const BATCH_SIZE = 3;
  const newTranscriptions: string[] = [];
  let processed = 0;

  for (let i = 0; i < batch.length; i += BATCH_SIZE) {
    const miniBatch = batch.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(
      miniBatch.map((seg: any) => transcribeSegment(supabase, seg, groqKey, meetingId, speakerHints))
    );

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) {
        newTranscriptions.push(r.value);
        processed++;
      }
    }
  }

  const finalOffset = offset + processed;
  const existingTranscript = meeting.transcript_raw || '';
  const fullTranscript = existingTranscript
    ? existingTranscript + '\n\n' + newTranscriptions.join('\n\n')
    : newTranscriptions.join('\n\n');
  const more = finalOffset < segments.length;

  const { error: updateError } = await supabase
    .from('meetings')
    .update({
      transcript_raw: fullTranscript,
      segments_transcribed_offset: finalOffset,
    })
    .eq('id', meetingId);

  if (updateError) return { success: false, more: false, offset: finalOffset, error: updateError.message };

  return { success: true, more, offset: finalOffset };
}

const MINUTE_PROMPT = (transcript: string) => `
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
${transcript}
`;

async function analyzeMeeting(supabase: any, meetingId: string, transcript: string): Promise<{ success: boolean; minuteId?: string; error?: string }> {
  const groqKey = Deno.env.get('GROQ_API_KEY')!;
  
  const llmResponse = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${groqKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: MINUTE_PROMPT(transcript) }],
      temperature: 0.3,
      max_tokens: 8192,
    }),
  });

  if (!llmResponse.ok) {
    const errorText = await llmResponse.text();
    return { success: false, error: `LLM error (${llmResponse.status}): ${errorText}` };
  }

  const llmResult = await llmResponse.json();
  const responseText = llmResult.choices[0]?.message?.content || '';
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { success: false, error: 'LLM did not return valid JSON' };

  let minuteJSON;
  try { minuteJSON = JSON.parse(jsonMatch[0]); }
  catch (e) { return { success: false, error: `Failed to parse LLM JSON: ${e}` }; }

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

  if (minuteError) return { success: false, error: `Minute save error: ${minuteError.message}` };

  const actionItemsToInsert = (minuteJSON.action_items || []).map((item: any) => ({
    meeting_id: meetingId,
    minute_id: minute.id,
    assignee_name: item.assignee_name,
    description: item.description,
    due_date: item.due_date,
    priority: item.priority,
  }));

  if (actionItemsToInsert.length > 0) {
    await supabase.from('action_items').insert(actionItemsToInsert);
  }

  return { success: true, minuteId: minute.id };
}

async function vectorizeMeeting(supabase: any, meetingId: string): Promise<{ success: boolean; error?: string }> {
  // Vectorization would use Jina AI embeddings
  // For now, just mark as done
  return { success: true };
}

async function sendMeetingEmails(supabase: any, meetingId: string): Promise<{ success: boolean; error?: string }> {
  // Email sending logic here (uses Nodemailer equivalent for Deno)
  // For now, just mark meeting as completed
  await supabase
    .from('meetings')
    .update({ status: 'completed' })
    .eq('id', meetingId);
  return { success: true };
}

async function processQueueItem(item: QueueItem, supabase: any): Promise<{ success: boolean; error?: string; more?: boolean }> {
  const locked = await lockQueueItem(supabase, item.id);
  if (!locked) return { success: false, error: 'Could not lock item' };

  try {
    let result: { success: boolean; error?: string; more?: boolean } = { success: false, error: 'Unknown step' };

    switch (item.step) {
      case 'transcribe':
        result = await transcribeMeeting(supabase, item.meeting_id, item.batch_offset);
        if (result.success && result.more) {
          await supabase
            .from('processing_queue')
            .update({ 
              status: 'pending', 
              batch_offset: result.offset || 0,
              attempts: 0,
              locked_at: null 
            })
            .eq('id', item.id);
          return { success: true, more: true };
        }
        break;

      case 'analyze': {
        const { data: meeting } = await supabase
          .from('meetings')
          .select('transcript_raw')
          .eq('id', item.meeting_id)
          .single();
        if (meeting?.transcript_raw) {
          result = await analyzeMeeting(supabase, item.meeting_id, meeting.transcript_raw);
        } else {
          result = { success: false, error: 'No transcript available' };
        }
        break;
      }

      case 'vectorize':
        result = await vectorizeMeeting(supabase, item.meeting_id);
        break;

      case 'emails':
        result = await sendMeetingEmails(supabase, item.meeting_id);
        break;
    }

    if (result.success) {
      await completeQueueItem(supabase, item.id, true);

      // Queue next step
      if (item.step !== 'emails') {
        const nextSteps: Record<string, string> = {
          transcribe: 'analyze',
          analyze: 'vectorize',
          vectorize: 'emails',
        };
        await supabase
          .from('processing_queue')
          .insert({
            meeting_id: item.meeting_id,
            step: nextSteps[item.step] as any,
            status: 'pending',
            attempts: 0,
            max_attempts: 5,
            batch_offset: 0,
          });
      }
    } else {
      await completeQueueItem(supabase, item.id, false, result.error);
    }

    return result;

  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    await completeQueueItem(supabase, item.id, false, err.message);
    return { success: false, error: err.message };
  }
}

serve(async (req) => {
  const supabase = getSupabaseAdmin();
  
  // Get next pending item
  const { data: item, error } = await supabase
    .from('processing_queue')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (error || !item) {
    return new Response(JSON.stringify({ processed: 0 }), { 
      headers: { 'Content-Type': 'application/json' } 
    });
  }

  const result = await processQueueItem(item as QueueItem, supabase);

  return new Response(JSON.stringify({ 
    processed: 1, 
    meetingId: item.meeting_id,
    step: item.step,
    success: result.success,
    more: result.more,
    error: result.error 
  }), { 
    headers: { 'Content-Type': 'application/json' } 
  });
});