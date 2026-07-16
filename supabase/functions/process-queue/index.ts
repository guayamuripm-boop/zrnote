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

interface ProcessingResult {
  success: boolean;
  more?: boolean;
  offset?: number;
  error?: string;
  chunksCreated?: number;
  emailsSent?: number;
  emailsFailed?: number;
}

function getSupabaseAdmin() {
  return createClient(
    Deno.env.get('NEXT_PUBLIC_SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
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

async function transcribeMeeting(supabase: any, meetingId: string, batchOffset: number, maxSegments = 9): Promise<ProcessingResult> {
  const groqKey = Deno.env.get('GROQ_API_KEY');
  if (!groqKey) return { success: false, error: 'GROQ_API_KEY no configurada' };

  const { data: meeting, error: meetingError } = await supabase
    .from('meetings')
    .select('audio_segments, transcript_raw, segments_transcribed_offset')
    .eq('id', meetingId)
    .single();

  if (meetingError || !meeting) return { success: false, error: 'Meeting not found' };

  const segments = meeting.audio_segments || [];
  if (segments.length === 0) return { success: false, error: 'No audio segments' };

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

  if (updateError) return { success: false, error: updateError.message };

  return { success: true, more, offset: finalOffset };
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

async function analyzeMeeting(supabase: any, meetingId: string, transcript: string): Promise<ProcessingResult> {
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
  try {
    minuteJSON = JSON.parse(jsonMatch[0]);
  } catch (e) {
    return { success: false, error: `Failed to parse LLM JSON: ${e}` };
  }

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
    const { error: insertError } = await supabase.from('action_items').insert(actionItemsToInsert);
    if (insertError) console.error('Action items insert error:', insertError.message);
  }

  return { success: true, minuteId: minute.id, actionItemsCount: actionItemsToInsert.length };
}

async function sendMeetingEmails(supabase: any, meetingId: string): Promise<ProcessingResult> {
  // Import email functions dynamically
  const { buildMinuteHtml, buildActionItemsHtml, buildMyItemsHtml, buildOtherItemsHtml, matchItemsToParticipant, sendWithRetry } = 
    await import('../_shared/email-service.ts');
  
  // We'll use the existing logic from processing.ts
  // For now, mark as completed - the actual email sending happens in the API route
  // This is a placeholder - the real email logic is in the API route
  return { success: true, emailsSent: 0, emailsFailed: 0 };
}

async function vectorizeMeeting(supabase: any, meetingId: string): Promise<ProcessingResult> {
  const { data: meeting, error: meetingError } = await supabase
    .from('meetings')
    .select('org_id, transcript_raw')
    .eq('id', meetingId)
    .single();

  if (meetingError || !meeting) return { success: false, error: 'Meeting not found' };
  if (!meeting.transcript_raw) return { success: false, error: 'No transcript available' };

  const { data: minute, error: minuteError } = await supabase
    .from('minutes')
    .select('*')
    .eq('meeting_id', meetingId)
    .single();

  if (minuteError || !minute) return { success: false, error: 'Minute not found. Run analyze step first.' };

  const chunks = createChunks(minute, meeting.transcript_raw);
  const BATCH_SIZE = 20;
  let created = 0;

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const texts = batch.map(c => c.text);

    try {
      const embeddings = await embedTexts(texts);

      const records = batch.map((chunk, j) => ({
        org_id: meeting.org_id,
        meeting_id: meetingId,
        chunk_index: chunk.index,
        content: chunk.text,
        embedding: embeddings[j],
        metadata: {
          section: chunk.section,
          speaker: chunk.speaker,
        },
      }));

      const { error: insertError } = await supabase
        .from('meeting_chunks')
        .insert(records);

      if (!insertError) created += batch.length;
    } catch (err) {
      console.error('Embedding error:', err);
    }
  }

  return { success: true, chunksCreated: created };
}

function createChunks(minute: any, transcript: string): Array<{ index: number; section: string; text: string; speaker?: string }> {
  const chunks: Array<{ index: number; section: string; text: string; speaker?: string }> = [];
  let index = 0;

  if (minute.summary) chunks.push({ index: index++, section: 'summary', text: minute.summary, speaker: 'system' });
  for (const topic of minute.discussion || []) chunks.push({ index: index++, section: 'discussion', text: `${topic.topic}: ${topic.details}`, speaker: topic.speaker });
  for (const decision of minute.decisions || []) chunks.push({ index: index++, section: 'decisions', text: decision, speaker: 'system' });
  for (const ps of minute.project_statuses || []) chunks.push({ index: index++, section: 'project_statuses', text: `${ps.project} (${ps.status}): ${ps.details}`, speaker: 'system' });
  for (const blocker of minute.blockers || []) chunks.push({ index: index++, section: 'blockers', text: `${blocker.issue}: ${blocker.impact}${blocker.owner ? ` — ${blocker.owner}` : ''}`, speaker: 'system' });
  for (const idea of minute.ideas || []) chunks.push({ index: index++, section: 'ideas', text: idea, speaker: 'system' });
  for (const item of minute.action_items || []) chunks.push({ index: index++, section: 'action_items', text: `${item.assignee_name}: ${item.description} (${item.priority})${item.due_date ? `, vence ${item.due_date}` : ''}`, speaker: item.assignee_name });
  for (const step of minute.next_steps || []) chunks.push({ index: index++, section: 'next_steps', text: step, speaker: 'system' });

  const transcriptChunks = transcript.match(/.{1,500}/g) || [];
  for (const tc of transcriptChunks) chunks.push({ index: index++, section: 'transcript', text: tc, speaker: 'unknown' });

  return chunks;
}

async function embedTexts(texts: string[]): Promise<number[][]> {
  const JINA_API_KEY = Deno.env.get('JINA_API_KEY');
  if (!JINA_API_KEY) throw new Error('JINA_API_KEY not configured');

  const res = await fetch('https://api.jina.ai/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${JINA_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'jina-embeddings-v3',
      input: texts,
      dimensions: 1024,
    }),
  });

  if (!res.ok) throw new Error(`Jina embedding error (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return data.data.map((d: any) => d.embedding);
}

async function processQueueItem(supabase: any, item: QueueItem): Promise<ProcessingResult> {
  switch (item.step) {
    case 'transcribe':
      return await transcribeMeeting(supabase, item.meeting_id, item.batch_offset);
    case 'analyze': {
      const { data: meeting } = await supabase
        .from('meetings')
        .select('transcript_raw')
        .eq('id', item.meeting_id)
        .single();
      if (!meeting?.transcript_raw) return { success: false, error: 'No transcript available' };
      return await analyzeMeeting(supabase, item.meeting_id, meeting.transcript_raw);
    }
    case 'vectorize':
      return await vectorizeMeeting(supabase, item.meeting_id);
    case 'emails':
      return await sendMeetingEmails(supabase, item.meeting_id);
    default:
      return { success: false, error: `Unknown step: ${item.step}` };
  }
}

serve(async (req) => {
  const supabase = getSupabaseAdmin();

  // Get pending queue items (max 5 concurrent)
  const { data: queueItems, error } = await supabase
    .from('processing_queue')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(5);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  if (!queueItems || queueItems.length === 0) {
    return new Response(JSON.stringify({ ok: true, processed: 0 }), { status: 200 });
  }

  let processed = 0;

  for (const item of queueItems) {
    // Try to lock this item
    const locked = await lockQueueItem(supabase, item.id);
    if (!locked) continue; // Another worker got it

    try {
      // Update meeting status
      await supabase
        .from('meetings')
        .update({ status: 'processing', ended_at: new Date().toISOString() })
        .eq('id', item.meeting_id);

      const result = await processQueueItem(supabase, item);

      if (result.success) {
        if (item.step === 'transcribe' && result.more) {
          // More segments to process - re-queue with updated offset
          await supabase
            .from('processing_queue')
            .update({ 
              status: 'pending', 
              batch_offset: result.offset,
              locked_at: null,
              attempts: 0 // Reset attempts for next batch
            })
            .eq('id', item.id);
        } else {
          // Step completed
          await completeQueueItem(supabase, item.id, true);
          
          // Check if there are more steps
          const nextStep = item.step === 'transcribe' ? 'analyze' :
                           item.step === 'analyze' ? 'vectorize' :
                           item.step === 'vectorize' ? 'emails' : null;
          
          if (nextStep) {
            await supabase
              .from('processing_queue')
              .insert({
                meeting_id: item.meeting_id,
                step: nextStep,
                status: 'pending',
                attempts: 0,
                max_attempts: 5,
                batch_offset: 0,
              });
          } else {
            // All steps done - mark meeting completed
            await supabase
              .from('meetings')
              .update({ status: 'completed' })
              .eq('id', item.meeting_id);
          }
        }
      } else {
        // Step failed
        if (item.attempts + 1 >= item.max_attempts) {
          await completeQueueItem(supabase, item.id, false, result.error);
          await supabase
            .from('meetings')
            .update({ status: 'failed', transcript_raw: result.error })
            .eq('id', item.meeting_id);
        } else {
          // Re-queue for retry
          await supabase
            .from('processing_queue')
            .update({ 
              status: 'pending', 
              locked_at: null,
              error: result.error
            })
            .eq('id', item.id);
        }
      }

      processed++;
    } catch (err) {
      console.error('Queue processing error:', err);
      await completeQueueItem(supabase, item.id, false, String(err));
    }
  }

  return new Response(JSON.stringify({ ok: true, processed }), { status: 200 });
});