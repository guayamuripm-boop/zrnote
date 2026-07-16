import { createClient } from '@supabase/supabase-js';
import { logger, withTiming } from '@/lib/logger';
import { embedTexts } from '@/lib/embeddings';
import { buildMinuteHtml, buildActionItemsHtml, buildMyItemsHtml, buildOtherItemsHtml, matchItemsToParticipant, sendWithRetry } from '@/lib/email-service';

const GROQ_BASE = 'https://api.groq.com/openai/v1';

export interface ProcessingResult {
  success: boolean;
  error?: string;
  data?: any;
}

export interface TranscribeResult {
  success: boolean;
  transcript?: string;
  error?: string;
  segmentsProcessed: number;
  segmentsTotal: number;
  more: boolean;
}

export interface AnalyzeResult {
  success: boolean;
  minuteId?: string;
  actionItemsCount?: number;
  error?: string;
}

export interface EmailResult {
  success: boolean;
  sent: number;
  failed: number;
  error?: string;
}

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY!
  );
}

async function transcribeSegment(
  supabase: any,
  segment: any,
  groqKey: string,
  meetingId: string,
  allSpeakerHints: string = '',
): Promise<string | null> {
  const { data: audioData, error: downloadError } = await supabase.storage
    .from('meeting-audio')
    .download(segment.r2_key);

  if (downloadError) {
    logger.error('Error downloading segment', { meetingId, segmentIndex: segment.segment_index, error: downloadError.message });
    return null;
  }

  if (audioData.size < 10000) {
    logger.warn('Skipping segment: too small', { meetingId, segmentIndex: segment.segment_index, size: audioData.size });
    return null;
  }

  const ext = segment.r2_key.split('.').pop() || 'webm';

  // Build global speaker hint from ALL segments
  let whisperPrompt = '';
  if (allSpeakerHints) {
    whisperPrompt = `Participantes de la reunión: ${allSpeakerHints}. Identifica a cada orador por su nombre.`;
  }

  for (let attempt = 1; attempt <= 3; attempt++) {
    const formData = new FormData();
    formData.append('file', audioData, `audio.${ext}`);
    formData.append('model', 'whisper-large-v3');
    formData.append('language', 'es');
    formData.append('response_format', 'verbose_json');
    if (allSpeakerHints) {
      formData.append('prompt', allSpeakerHints);
    }

    logger.debug('Transcribing segment', { meetingId, segmentIndex: segment.segment_index, attempt, hasPrompt: !!whisperPrompt });
    const response = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${groqKey}` },
      body: formData,
    });

    if (response.ok) {
      const result = await response.json();
      if (result.text && result.text.trim().length > 0) {
        logger.info('Segment transcribed', { meetingId, segmentIndex: segment.segment_index, chars: result.text.length });
        return result.text;
      }
      logger.warn('Segment produced empty transcription', { meetingId, segmentIndex: segment.segment_index });
      return null;
    }

    const errText = await response.text();
    logger.error('Segment transcription failed', { meetingId, segmentIndex: segment.segment_index, attempt, status: response.status, error: errText });

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

export async function transcribeMeeting(meetingId: string, maxSegments: number = 9): Promise<TranscribeResult> {
  const supabase = getSupabaseAdmin();
  const groqKey = process.env.GROQ_API_KEY;

  if (!groqKey) {
    return { success: false, error: 'GROQ_API_KEY no configurada en el servidor', segmentsProcessed: 0, segmentsTotal: 0, more: false };
  }

  logger.info('Starting transcription batch', { meetingId, operation: 'transcribe', maxSegments });

  const { data: meeting, error: meetingError } = await supabase
    .from('meetings')
    .select('audio_segments, transcript_raw, segments_transcribed_offset')
    .eq('id', meetingId)
    .single();

  if (meetingError || !meeting) {
    return { success: false, error: `Meeting not found: ${meetingError?.message || 'null'}`, segmentsProcessed: 0, segmentsTotal: 0, more: false };
  }

  const segments = meeting.audio_segments || [];
  if (segments.length === 0) {
    return { success: false, error: 'No audio segments found in meeting', segmentsProcessed: 0, segmentsTotal: 0, more: false };
  }

  const offset = meeting.segments_transcribed_offset || 0;
  const pendingSegments = segments.slice(offset);
  const batch = pendingSegments.slice(0, maxSegments);

  if (batch.length === 0) {
    const transcript = meeting.transcript_raw || '';
    if (!transcript.trim()) {
      return { success: false, error: 'No segments to process and no existing transcript', segmentsProcessed: 0, segmentsTotal: segments.length, more: false };
    }
    return { success: true, transcript, segmentsProcessed: segments.length, segmentsTotal: segments.length, more: false };
  }

  logger.info('Processing batch', { meetingId, batchStart: offset, batchSize: batch.length, totalSegments: segments.length });

  // Build global speaker hints from all segments
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

    if (i + BATCH_SIZE < batch.length) {
      await heartbeat(supabase, meetingId);
    }
  }

const newOffset = offset + processed;
    // Only advance by successfully processed segments. Failed segments stay for retry.
    // This avoids infinite loop while preserving failed segments for recovery.
    const finalOffset = newOffset;
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

  if (updateError) {
    return { success: false, error: `Failed to save transcript: ${updateError.message}`, segmentsProcessed: processed, segmentsTotal: segments.length, more: false };
  }

  logger.info('Transcription batch completed', { meetingId, processed, newOffset: finalOffset, total: segments.length, more });
  return { success: true, transcript: fullTranscript, segmentsProcessed: finalOffset, segmentsTotal: segments.length, more };
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

export async function analyzeMeeting(meetingId: string, transcript?: string): Promise<AnalyzeResult> {
  const supabase = getSupabaseAdmin();
  const groqKey = process.env.GROQ_API_KEY!;

  logger.info('Starting analysis', { meetingId, operation: 'analyze' });

  let meetingTranscript = transcript;
  if (!meetingTranscript) {
    const { data: meeting, error: meetingError } = await supabase
      .from('meetings')
      .select('transcript_raw')
      .eq('id', meetingId)
      .single();
    meetingTranscript = meeting?.transcript_raw;
    if (meetingError || !meeting) {
      return { success: false, error: `Meeting not found: ${meetingError?.message || 'null'}` };
    }
  }

  if (!meetingTranscript || meetingTranscript.trim().length === 0) {
    return { success: false, error: 'No transcript available for analysis' };
  }

  logger.info('Calling Groq LLM', { meetingId });
  const llmResponse = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${groqKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: MINUTE_PROMPT(meetingTranscript) }],
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
  if (!jsonMatch) {
    return { success: false, error: 'LLM did not return valid JSON' };
  }

  let minuteJSON;
  try {
    minuteJSON = JSON.parse(jsonMatch[0]);
  } catch (e) {
    return { success: false, error: `Failed to parse LLM JSON: ${e}` };
  }

  logger.info('Minute generated', { meetingId, actionItems: (minuteJSON.action_items || []).length });

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

  if (minuteError) {
    return { success: false, error: `Minute save error: ${minuteError.message}` };
  }

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
      logger.error('Action items insert error', { meetingId, error: insertError.message });
    } else {
      logger.info('Action items inserted', { meetingId, count: actionItemsToInsert.length });
    }
  }

  return { success: true, minuteId: minute.id, actionItemsCount: actionItemsToInsert.length };
}

export async function sendMeetingEmails(meetingId: string): Promise<EmailResult> {
  try {
    return await _sendMeetingEmails(meetingId);
  } catch (err: any) {
    logger.error('sendMeetingEmails crashed', { meetingId, error: err?.message, stack: err?.stack });
    return { success: false, sent: 0, failed: 0, error: err?.message || 'Unknown error' };
  }
}

async function _sendMeetingEmails(meetingId: string): Promise<EmailResult> {
  const supabase = getSupabaseAdmin();

  logger.info('Starting email send', { meetingId });

  const { data: meeting } = await supabase
    .from('meetings')
    .select('id, title, created_by, started_at, ended_at')
    .eq('id', meetingId)
    .single();

  if (!meeting) {
    return { success: false, sent: 0, failed: 0, error: 'Meeting not found' };
  }

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

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://zrnote.vercel.app';

  const { generateGoogleCalendarUrl } = await import('@/lib/google-calendar');

  const nodemailer = await import('nodemailer');
  const transporter = nodemailer.default.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  async function sendMail({ to, subject, html, attachments }: { to: string; subject: string; html: string; attachments?: any[] }): Promise<{ ok: boolean; error?: string }> {
    try {
      await transporter.sendMail({
        from: `"ZRNote" <${process.env.GMAIL_USER}>`,
        to,
        subject,
        html,
        attachments,
      });
      return { ok: true };
    } catch (err: any) {
      logger.error('SMTP error', { meetingId, error: err.message });
      return { ok: false, error: err.message };
    }
  }

  const minuteHtml = buildMinuteHtml(minute);
  const allItemsHtml = buildActionItemsHtml(allItems);

  const emailQueue: Array<{ to: string; subject: string; html: string; label: string; attachments?: any[] }> = [];

  for (const p of participants) {
    if (creatorEmail && p.email.toLowerCase() === creatorEmail.toLowerCase()) continue;

    const myItems = matchItemsToParticipant(allItems, p.name, p.email);
    const otherItems = allItems.filter((i) => !myItems.includes(i));

    const myItemsHtml = buildMyItemsHtml(myItems);
    const otherItemsHtml = buildOtherItemsHtml(otherItems);

    const calendarUrl = generateGoogleCalendarUrl({
      title: `Revisar: ${meeting.title}`,
      description: `Revisión de la minuta de la reunión: ${meeting.title}\n\nEnlace: ${appUrl}/dashboard/meetings/${meetingId}`,
      startTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
      endTime: new Date(Date.now() + 25 * 60 * 60 * 1000),
    });

    emailQueue.push({
      to: p.email,
      subject: `[ZRNote] ${meeting.title} — Minuta y compromisos`,
      html: `<p>Hola ${p.name},</p><p>Reunión <b>${meeting.title}</b> procesada. Aquí tienes la minuta completa y tus compromisos.</p>${myItemsHtml}${otherItemsHtml}<hr style="margin:24px 0;border:none;border-top:1px solid #eee"/><h2 style="color:#1a1a2e;font-size:20px;margin-bottom:12px">Minuta Completa</h2>${minuteHtml}<hr style="margin:24px 0;border:none;border-top:1px solid #eee"/><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><a href="${appUrl}/dashboard/meetings/${meetingId}" style="display:inline-block;background:#2563eb;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:500;margin-right:8px">Ver en ZRNote</a><a href="${calendarUrl}" style="display:inline-block;background:#16a34a;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:500">Añadir a Calendar</a></td></tr></table>`,
      label: p.email,
    });
  }

  const creatorItems = matchItemsToParticipant(allItems, '', creatorEmail || '');
  if (creatorEmail) {
    const calendarUrl = generateGoogleCalendarUrl({
        title: `Revisar: ${meeting.title}`,
        description: `Revisión de la minuta de la reunión: ${meeting.title}\n\nEnlace: ${appUrl}/dashboard/meetings/${meetingId}`,
        startTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
        endTime: new Date(Date.now() + 25 * 60 * 60 * 1000),
      });

    emailQueue.push({
      to: creatorEmail,
      subject: `[ZRNote] ${meeting.title} — Minuta completa + todas las tareas`,
      html: `<p>Reunión <b>${meeting.title}</b> procesada. Aquí tienes la minuta completa con todas las tareas asignadas.</p>${allItemsHtml}<hr style="margin:24px 0;border:none;border-top:1px solid #eee"/><h2 style="color:#1a1a2e;font-size:20px;margin-bottom:12px">Minuta Completa</h2>${minuteHtml}<hr style="margin:24px 0;border:none;border-top:1px solid #eee"/><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><a href="${appUrl}/dashboard/meetings/${meetingId}" style="display:inline-block;background:#2563eb;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:500;margin-right:8px">Ver en ZRNote</a><a href="${calendarUrl}" style="display:inline-block;background:#16a34a;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:500">Añadir a Calendar</a></td></tr></table>`,
      label: `coordinator (${creatorEmail})`,
    });
  }

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const job of emailQueue) {
    const result = await sendWithRetry(() =>
      sendMail({ to: job.to, subject: job.subject, html: job.html, attachments: job.attachments })
    );
    if (result.ok) sent++;
    else { failed++; errors.push(`${job.label}: ${result.error}`); }
    if (emailQueue.indexOf(job) < emailQueue.length - 1) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  try {
    await supabase.from('email_logs').insert(
      emailQueue.map((job, idx) => ({
        meeting_id: meetingId,
        recipient_email: job.label,
        type: job.label.includes('coordinator') ? 'coordinator_summary' : 'personal',
        status: idx < sent ? 'sent' : 'failed',
      }))
    );
  } catch (logErr: any) {
    logger.error('Failed to insert email_logs', { meetingId, error: logErr.message });
  }

  return { success: failed === 0, sent, failed, error: failed > 0 ? errors.join('; ') : undefined };
}

export async function markMeetingCompleted(meetingId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('meetings')
    .update({ status: 'completed' })
    .eq('id', meetingId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function markMeetingFailed(meetingId: string, errorMsg: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  await supabase
    .from('meetings')
    .update({ status: 'failed', transcript_raw: errorMsg })
    .eq('id', meetingId);
}

export interface VectorizeResult {
  success: boolean;
  chunksCreated?: number;
  error?: string;
}

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
    chunks.push({ index: index++, section: 'decisions', text: decision, speaker: 'system' });
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
    chunks.push({ index: index++, section: 'next_steps', text: step, speaker: 'system' });
  }

  // Transcript in ~500 char chunks
  const transcriptChunks = transcript.match(/.{1,500}/g) || [];
  for (const tc of transcriptChunks) {
    chunks.push({ index: index++, section: 'transcript', text: tc, speaker: 'unknown' });
  }

  return chunks;
}

export async function vectorizeMeeting(meetingId: string): Promise<VectorizeResult> {
  const supabase = getSupabaseAdmin();

  logger.info('Starting vectorization', { meetingId, operation: 'vectorize' });

  // Get meeting with org_id
  const { data: meeting, error: meetingError } = await supabase
    .from('meetings')
    .select('org_id, transcript_raw')
    .eq('id', meetingId)
    .single();

  if (meetingError || !meeting) {
    return { success: false, error: `Meeting not found: ${meetingError?.message || 'null'}` };
  }

  if (!meeting.transcript_raw) {
    return { success: false, error: 'No transcript available for vectorization' };
  }

  // Get minute
  const { data: minute, error: minuteError } = await supabase
    .from('minutes')
    .select('*')
    .eq('meeting_id', meetingId)
    .single();

  if (minuteError || !minute) {
    return { success: false, error: 'Minute not found. Run analyze step first.' };
  }

  // Create semantic chunks
  const chunks = createChunks(minute, meeting.transcript_raw);
  logger.info('Created chunks', { meetingId, count: chunks.length });

  // Generate embeddings in batches
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
        logger.error('Vector insert error', { meetingId, error: insertError.message });
      } else {
        created += batch.length;
      }
    } catch (err) {
      logger.error('Embedding error', { meetingId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  logger.info('Vectorization completed', { meetingId, chunksCreated: created });
  return { success: true, chunksCreated: created };
}