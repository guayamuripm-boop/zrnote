import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const GROQ_BASE = 'https://api.groq.com/openai/v1';
const JINA_EMBED_URL = 'https://api.jina.ai/v1/embeddings';
const JINA_MODEL = 'jina-embeddings-v3';
const EMBED_DIMENSIONS = 1024;
const SMTP_HOST = 'smtp.gmail.com';
const SMTP_PORT = 465;

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
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
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

// ─── TRANSCRIBE ────────────────────────────────────────────────────────────────

async function transcribeSegment(supabase: any, segment: any, groqKey: string, meetingId: string, speakerHints: string): Promise<string | null> {
  const { data: audioData, error: downloadError } = await supabase.storage
    .from('meeting-audio')
    .download(segment.r2_key);

  if (downloadError || audioData.size < 10000) return null;

  const rawExt = (segment.r2_key.split('.').pop() || 'webm').toLowerCase();
  // Groq rejects .aac (not in its allowlist); relabel to .m4a so ffmpeg decodes it.
  const GROQ_EXTS = new Set(['flac', 'mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'ogg', 'wav', 'webm']);
  const ext = GROQ_EXTS.has(rawExt) ? rawExt : 'm4a';

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

  // Use batchOffset from queue item; fall back to meeting's stored offset
  const offset = batchOffset > 0 ? batchOffset : (meeting.segments_transcribed_offset || 0);
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

// ─── ANALYZE ───────────────────────────────────────────────────────────────────

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

// ─── VECTORIZAR ────────────────────────────────────────────────────────────────

function createChunks(minute: any, transcript: string): Array<{ index: number; section: string; text: string; speaker?: string }> {
  const chunks: Array<{ index: number; section: string; text: string; speaker?: string }> = [];
  let index = 0;

  if (minute.summary) {
    chunks.push({ index: index++, section: 'summary', text: minute.summary, speaker: 'system' });
  }

  for (const topic of minute.discussion || []) {
    chunks.push({ index: index++, section: 'discussion', text: `${topic.topic}: ${topic.details}`, speaker: topic.speaker });
  }

  for (const decision of minute.decisions || []) {
    chunks.push({ index: index++, section: 'decisions', text: typeof decision === 'string' ? decision : `${decision.decision} ${decision.context || ''}`, speaker: 'system' });
  }

  for (const ps of minute.project_statuses || []) {
    chunks.push({ index: index++, section: 'project_statuses', text: `${ps.project} (${ps.status}): ${ps.details}`, speaker: 'system' });
  }

  for (const blocker of minute.blockers || []) {
    chunks.push({ index: index++, section: 'blockers', text: `${blocker.issue}: ${blocker.impact}${blocker.owner ? ` — ${blocker.owner}` : ''}`, speaker: 'system' });
  }

  for (const idea of minute.ideas || []) {
    chunks.push({ index: index++, section: 'ideas', text: idea, speaker: 'system' });
  }

  for (const item of minute.action_items || []) {
    chunks.push({ index: index++, section: 'action_items', text: `${item.assignee_name}: ${item.description} (${item.priority})${item.due_date ? `, vence ${item.due_date}` : ''}`, speaker: item.assignee_name });
  }

  for (const step of minute.next_steps || []) {
    const text = typeof step === 'string' ? step : `${step.step}${step.owner ? ` — ${step.owner}` : ''}`;
    chunks.push({ index: index++, section: 'next_steps', text, speaker: 'system' });
  }

  // Transcript in ~500 char chunks
  const transcriptChunks = transcript.match(/.{1,500}/g) || [];
  for (const tc of transcriptChunks) {
    chunks.push({ index: index++, section: 'transcript', text: tc, speaker: 'unknown' });
  }

  return chunks;
}

async function embedTexts(texts: string[]): Promise<number[][]> {
  const jinaKey = Deno.env.get('JINA_API_KEY');
  if (!jinaKey) throw new Error('JINA_API_KEY not configured');

  const res = await fetch(JINA_EMBED_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${jinaKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: JINA_MODEL,
      input: texts,
      dimensions: EMBED_DIMENSIONS,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Jina embedding error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.data.map((d: any) => d.embedding);
}

async function vectorizeMeeting(supabase: any, meetingId: string): Promise<{ success: boolean; error?: string }> {
  const { data: meeting, error: meetingError } = await supabase
    .from('meetings')
    .select('org_id, transcript_raw')
    .eq('id', meetingId)
    .single();

  if (meetingError || !meeting) return { success: false, error: `Meeting not found: ${meetingError?.message || 'null'}` };
  if (!meeting.transcript_raw) return { success: false, error: 'No transcript available for vectorization' };

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

      if (insertError) {
        console.error('Vector insert error:', insertError.message);
      } else {
        created += batch.length;
      }
    } catch (err) {
      console.error('Embedding error:', err instanceof Error ? err.message : String(err));
    }
  }

  return { success: true };
}

// ─── EMAILS (SMTP via Deno TLS) ────────────────────────────────────────────────

function base64Encode(text: string): string {
  return btoa(text);
}

async function smtpCommand(writer: WritableStreamDefaultWriter<Uint8Array>, reader: ReadableStreamDefaultReader<Uint8Array>, command: string, expectCode?: number): Promise<string> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  await writer.write(encoder.encode(command + '\r\n'));

  const buffer = new Uint8Array(4096);
  let response = '';
  
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    response += decoder.decode(value, { stream: true });
    // SMTP responses end with a line not containing '-' after the code
    const lines = response.split('\r\n');
    for (const line of lines) {
      if (line.length >= 4 && line[3] === ' ' && /^\d{3}/.test(line)) {
        if (expectCode && !line.startsWith(String(expectCode))) {
          throw new Error(`SMTP error: ${line}`);
        }
        return response;
      }
    }
  }
  return response;
}

async function sendSmtpEmail(to: string, subject: string, htmlBody: string): Promise<{ ok: boolean; error?: string }> {
  const gmailUser = Deno.env.get('GMAIL_USER');
  const gmailPass = Deno.env.get('GMAIL_APP_PASSWORD');
  if (!gmailUser || !gmailPass) return { ok: false, error: 'GMAIL_USER or GMAIL_APP_PASSWORD not configured' };

  try {
    const conn = await Deno.connectTls({ hostname: SMTP_HOST, port: SMTP_PORT });
    const reader = conn.readable.getReader();
    const writer = conn.writable.getWriter();

    // Read server greeting
    await smtpCommand(writer, reader, '', 220);

    // EHLO
    await smtpCommand(writer, reader, 'EHLO zrnote.vercel.app', 250);

    // AUTH LOGIN
    await smtpCommand(writer, reader, 'AUTH LOGIN', 334);
    await smtpCommand(writer, reader, base64Encode(gmailUser), 334);
    await smtpCommand(writer, reader, base64Encode(gmailPass), 235);

    // MAIL FROM
    await smtpCommand(writer, reader, `MAIL FROM:<${gmailUser}>`, 250);

    // RCPT TO
    await smtpCommand(writer, reader, `RCPT TO:<${to}>`, 250);

    // DATA
    await smtpCommand(writer, reader, 'DATA', 354);

    // Build MIME message
    const boundary = `----=_Part_${Date.now()}`;
    const mimeMessage = [
      `From: "ZRNote" <${gmailUser}>`,
      `To: <${to}>`,
      `Subject: =?UTF-8?B?${base64Encode(subject)}?=`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      base64Encode('Minuta procesada. Ver en ZRNote para el contenido completo.'),
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      base64Encode(htmlBody),
      '',
      `--${boundary}--`,
      '.',
    ].join('\r\n');

    await smtpCommand(writer, reader, mimeMessage, 250);

    // QUIT
    await smtpCommand(writer, reader, 'QUIT', 221);

    await writer.close();
    await reader.cancel();

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function buildMinuteHtml(minute: any): string {
  if (!minute) return '<p>Minuta no disponible.</p>';
  let html = '';
  html += `<h2>Resumen</h2><p>${escapeHtml(minute.summary) || 'No disponible'}</p>`;

  if (Array.isArray(minute.discussion) && minute.discussion.length > 0) {
    html += `<h2>Temas Discutidos</h2>`;
    for (const d of minute.discussion) {
      html += `<div><h3>${escapeHtml(d.topic || '')}</h3>`;
      if (d.speaker) html += `<p style="font-size:12px;color:#999">Liderado por: ${escapeHtml(d.speaker)}</p>`;
      html += `<p>${escapeHtml(d.details || '')}</p></div>`;
    }
  }

  if (Array.isArray(minute.decisions) && minute.decisions.length > 0) {
    html += `<h2>Decisiones</h2><ul>`;
    for (const d of minute.decisions) {
      const text = typeof d === 'string' ? d : `${d.decision ?? ''}${d.context ? ` (${d.context})` : ''}`;
      html += `<li>${escapeHtml(text)}</li>`;
    }
    html += `</ul>`;
  }

  if (Array.isArray(minute.project_statuses) && minute.project_statuses.length > 0) {
    html += `<h2>Estados de Proyectos</h2>`;
    for (const p of minute.project_statuses) {
      html += `<div><strong>${escapeHtml(p.project)}</strong> <span>${escapeHtml(p.status)}</span><p>${escapeHtml(p.details)}</p></div>`;
    }
  }

  if (Array.isArray(minute.blockers) && minute.blockers.length > 0) {
    html += `<h2>Bloqueos</h2>`;
    for (const b of minute.blockers) {
      html += `<div><strong>${escapeHtml(b.issue)}</strong><p>Impacto: ${escapeHtml(b.impact)}</p>`;
      if (b.owner) html += `<p>Responsable: ${escapeHtml(b.owner)}</p>`;
      html += `</div>`;
    }
  }

  if (Array.isArray(minute.ideas) && minute.ideas.length > 0) {
    html += `<h2>Ideas</h2><ul>`;
    for (const idea of minute.ideas) html += `<li>${escapeHtml(idea)}</li>`;
    html += `</ul>`;
  }

  if (Array.isArray(minute.next_steps) && minute.next_steps.length > 0) {
    html += `<h2>Próximos Pasos</h2><ul>`;
    for (const n of minute.next_steps) {
      const text = typeof n === 'string' ? n : `${n.step ?? ''}${n.owner ? ` — ${n.owner}` : ''}`;
      html += `<li>${escapeHtml(text)}</li>`;
    }
    html += `</ul>`;
  }

  return html;
}

function buildActionItemsHtml(items: any[]): string {
  if (!items || items.length === 0) return '<p>No se generaron action items.</p>';
  const rows = items.map((i) => {
    const assignee = escapeHtmlOrEmpty(i.assignee_name) || 'Sin asignar';
    const description = escapeHtmlOrEmpty(i.description);
    const priority = escapeHtmlOrEmpty(i.priority);
    const dueDate = i.due_date ? escapeHtml(i.due_date) : '—';
    return `<tr><td>${assignee}</td><td>${description}</td><td>${priority}</td><td>${dueDate}</td></tr>`;
  }).join('');
  return `<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:14px">
    <thead><tr style="background:#f3f4f6"><th>Responsable</th><th>Tarea</th><th>Prioridad</th><th>Fecha</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
}

function matchItemsToParticipant(items: any[], participantName: string, participantEmail: string): any[] {
  if (!items || !participantName) return [];
  const nameLower = participantName.toLowerCase().trim();
  const emailLocal = (participantEmail || '').split('@')[0].toLowerCase().trim();
  return items.filter((item: any) => {
    if (item.assignee_email && item.assignee_email.toLowerCase() === (participantEmail || '').toLowerCase()) return true;
    if (!item.assignee_name) return false;
    const itemName = item.assignee_name.toLowerCase().trim();
    if (itemName === nameLower) return true;
    if (itemName.includes(nameLower) || nameLower.includes(itemName)) return true;
    if (emailLocal && (itemName.includes(emailLocal) || emailLocal.includes(itemName))) return true;
    return false;
  });
}

async function sendMeetingEmails(supabase: any, meetingId: string): Promise<{ success: boolean; error?: string }> {
  const { data: meeting } = await supabase
    .from('meetings')
    .select('id, title, created_by, started_at, ended_at')
    .eq('id', meetingId)
    .single();

  if (!meeting) return { success: false, error: 'Meeting not found' };

  const [actionItemsResult, minuteResult, participantsResult, creatorResult, creatorUserResult] = await Promise.all([
    supabase.from('action_items').select('*').eq('meeting_id', meetingId),
    supabase.from('minutes').select('*').eq('meeting_id', meetingId).single(),
    supabase.from('meeting_participants').select('*').eq('meeting_id', meetingId),
    supabase.from('meeting_participants').select('email_override').eq('meeting_id', meetingId).eq('user_id', meeting.created_by).single(),
    supabase.from('users').select('email').eq('id', meeting.created_by).single(),
  ]);

  const allItems = actionItemsResult.data || [];
  const minute = minuteResult.data;
  const participantsRaw = participantsResult.data;
  const creatorEmail = creatorResult.data?.email_override || creatorUserResult.data?.email;

  const participants = (participantsRaw || []).map((p: any) => ({
    name: p.name || p.email_override?.split('@')[0] || 'Participante',
    email: p.email_override || '',
  })).filter((p) => p.email);

  const appUrl = Deno.env.get('NEXT_PUBLIC_APP_URL') || 'https://zrnote.vercel.app';

  const minuteHtml = buildMinuteHtml(minute);
  const allItemsHtml = buildActionItemsHtml(allItems);

  const emailQueue: Array<{ to: string; subject: string; html: string; label: string }> = [];

  // Calendar URL (public, no OAuth)
  const calStart = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const calEnd = new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const calUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent('Revisar: ' + meeting.title)}&dates=${calStart}/${calEnd}&details=${encodeURIComponent('Revisión de minuta: ' + meeting.title + '\n' + appUrl + '/dashboard/meetings/' + meetingId)}`;

  for (const p of participants) {
    if (creatorEmail && p.email.toLowerCase() === creatorEmail.toLowerCase()) continue;

    const myItems = matchItemsToParticipant(allItems, p.name, p.email);
    const otherItems = allItems.filter((i) => !myItems.includes(i));

    const myItemsHtml = myItems.length > 0
      ? `<div style="background:#ecfdf5;border-left:3px solid #22c55e;padding:12px;margin:16px 0;border-radius:0 8px 8px 0"><h3 style="margin:0 0 8px;color:#166534">Tus compromisos</h3><ul style="margin:0;padding-left:20px">${myItems.map((i: any) => `<li><strong>${escapeHtml(i.description || '')}</strong> — ${escapeHtml(i.priority || '')}${i.due_date ? `, vence ${escapeHtml(i.due_date)}` : ''}</li>`).join('')}</ul></div>`
      : '';
    const otherItemsHtml = otherItems.length > 0
      ? `<div style="margin-top:16px"><h4 style="color:#666;font-size:13px">Otros compromisos:</h4><ul style="padding-left:20px;color:#666;font-size:13px">${otherItems.map((i: any) => `<li>${escapeHtml(i.assignee_name || 'Sin asignar')}: ${escapeHtml(i.description || '')}</li>`).join('')}</ul></div>`
      : '';

    emailQueue.push({
      to: p.email,
      subject: `[ZRNote] ${meeting.title} — Minuta y compromisos`,
      html: `<p>Hola ${escapeHtml(p.name)},</p><p>Reunión <b>${escapeHtml(meeting.title)}</b> procesada.</p>${myItemsHtml}${otherItemsHtml}<hr/><h2>Minuta Completa</h2>${minuteHtml}<hr/><a href="${appUrl}/dashboard/meetings/${meetingId}">Ver en ZRNote</a> | <a href="${calUrl}">Añadir a Calendar</a>`,
      label: p.email,
    });
  }

  if (creatorEmail) {
    emailQueue.push({
      to: creatorEmail,
      subject: `[ZRNote] ${meeting.title} — Minuta completa + todas las tareas`,
      html: `<p>Reunión <b>${escapeHtml(meeting.title)}</b> procesada. Todas las tareas:</p>${allItemsHtml}<hr/><h2>Minuta Completa</h2>${minuteHtml}<hr/><a href="${appUrl}/dashboard/meetings/${meetingId}">Ver en ZRNote</a> | <a href="${calUrl}">Añadir a Calendar</a>`,
      label: `coordinator (${creatorEmail})`,
    });
  }

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const job of emailQueue) {
    const result = await sendSmtpEmail(job.to, job.subject, job.html);
    if (result.ok) {
      sent++;
    } else {
      failed++;
      errors.push(`${job.label}: ${result.error}`);
    }
    // Rate limit: 1 email per second
    await new Promise((r) => setTimeout(r, 1000));
  }

  // Log results
  try {
    await supabase.from('email_logs').insert(
      emailQueue.map((job) => ({
        meeting_id: meetingId,
        recipient_email: job.to,
        type: job.label.includes('coordinator') ? 'coordinator_summary' : 'personal',
        status: 'sent',
      }))
    );
  } catch (_) { /* non-critical */ }

  if (failed > 0) {
    return { success: false, error: errors.join('; ') };
  }
  return { success: true };
}

// ─── QUEUE PROCESSING ──────────────────────────────────────────────────────────

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

// ─── MAIN HANDLER (process up to 5 items per invocation) ───────────────────────

serve(async (_req) => {
  const supabase = getSupabaseAdmin();
  const MAX_ITEMS_PER_INVOCATION = 5;
  const results: Array<{ meetingId: string; step: string; success: boolean; more?: boolean; error?: string }> = [];

  // Get pending items (batch)
  const { data: items, error } = await supabase
    .from('processing_queue')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(MAX_ITEMS_PER_INVOCATION);

  if (error || !items || items.length === 0) {
    return new Response(JSON.stringify({ processed: 0 }), { 
      headers: { 'Content-Type': 'application/json' } 
    });
  }

  // Process each item sequentially (each item touches different meetings)
  for (const item of items) {
    const result = await processQueueItem(item as QueueItem, supabase);
    results.push({
      meetingId: item.meeting_id,
      step: item.step,
      success: result.success,
      more: result.more,
      error: result.error,
    });
  }

  return new Response(JSON.stringify({ 
    processed: results.length, 
    results 
  }), { 
    headers: { 'Content-Type': 'application/json' } 
  });
});
