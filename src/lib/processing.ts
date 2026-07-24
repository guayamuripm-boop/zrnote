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
): Promise<{ text: string | null; error?: string }> {
  const { data: audioData, error: downloadError } = await supabase.storage
    .from('meeting-audio')
    .download(segment.r2_key);

  if (downloadError) {
    logger.error('Error downloading segment', { meetingId, segmentIndex: segment.segment_index, error: downloadError.message });
    return { text: null, error: `descarga fallida: ${downloadError.message}` };
  }

  if (audioData.size < 10000) {
    logger.warn('Skipping segment: too small', { meetingId, segmentIndex: segment.segment_index, size: audioData.size });
    return { text: null, error: 'segmento demasiado pequeño (posible audio vacío)' };
  }

  const rawExt = (segment.r2_key.split('.').pop() || 'webm').toLowerCase();
  // Groq Whisper only accepts: flac,mp3,mp4,mpeg,mpga,m4a,ogg,wav,webm.
  // Raw .aac is NOT accepted (HTTP 400). We can't decode/transcode server-side,
  // so we present the SAME bytes under several accepted extensions — Groq's
  // ffmpeg backend probes the real content and one of them decodes the AAC.
  const GROQ_EXTS = new Set(['flac', 'mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'ogg', 'wav', 'webm']);
  const candidateExts = GROQ_EXTS.has(rawExt) ? [rawExt] : ['m4a', 'mp4', 'mpga', 'wav', 'ogg'];

  let lastError = 'error desconocido';

  for (const tryExt of candidateExts) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const formData = new FormData();
      formData.append('file', audioData, `audio.${tryExt}`);
      formData.append('model', 'whisper-large-v3');
      formData.append('language', 'es');
      formData.append('response_format', 'verbose_json');
      if (allSpeakerHints) {
        formData.append('prompt', allSpeakerHints);
      }

      logger.debug('Transcribing segment', { meetingId, segmentIndex: segment.segment_index, tryExt, attempt });
      const response = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${groqKey}` },
        body: formData,
      });

      if (response.ok) {
        const result = await response.json();
        if (result.text && result.text.trim().length > 0) {
          logger.info('Segment transcribed', { meetingId, segmentIndex: segment.segment_index, tryExt, chars: result.text.length });
          return { text: result.text };
        }
        logger.warn('Segment produced empty transcription', { meetingId, segmentIndex: segment.segment_index });
        return { text: null, error: 'transcripción vacía (¿el audio no tiene voz audible?)' };
      }

      const errText = await response.text();
      lastError = `Groq HTTP ${response.status}: ${errText.slice(0, 180)}`;
      logger.error('Segment transcription failed', { meetingId, segmentIndex: segment.segment_index, tryExt, attempt, status: response.status, error: errText });

      // 400 = this extension/format was rejected → try the next candidate.
      if (response.status === 400) break;
      // 429 = rate limited → back off; other 5xx → short retry.
      await new Promise((r) => setTimeout(r, (response.status === 429 ? 2000 : 1000) * attempt));
    }
  }

  return { text: null, error: lastError };
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
  const segErrors: string[] = [];
  let processed = 0;

  for (let i = 0; i < batch.length; i += BATCH_SIZE) {
    const miniBatch = batch.slice(i, i + BATCH_SIZE);

    const results = await Promise.allSettled(
      miniBatch.map((seg: any) => transcribeSegment(supabase, seg, groqKey, meetingId, speakerHints))
    );

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.text) {
        newTranscriptions.push(r.value.text);
        processed++;
      } else if (r.status === 'fulfilled' && r.value.error) {
        segErrors.push(r.value.error);
      } else if (r.status === 'rejected') {
        segErrors.push(String(r.reason));
      }
    }

    if (i + BATCH_SIZE < batch.length) {
      await heartbeat(supabase, meetingId);
    }
  }

  const newOffset = offset + processed;
  // Only advance by successfully processed segments. Failed segments stay for retry.
  const finalOffset = newOffset;
  const existingTranscript = meeting.transcript_raw || '';
  const fullTranscript = existingTranscript
    ? existingTranscript + '\n\n' + newTranscriptions.join('\n\n')
    : newTranscriptions.join('\n\n');
  const more = finalOffset < segments.length;

  // If this batch transcribed NOTHING and there is still no transcript at all,
  // fail loudly with the real Groq error instead of silently "succeeding" with
  // an empty transcript (which used to surface later as a confusing 400 on analyze).
  if (processed === 0 && !existingTranscript.trim()) {
    const reason = segErrors[0] || 'ningún segmento pudo transcribirse';
    return { success: false, error: `No se pudo transcribir el audio: ${reason}`, segmentsProcessed: 0, segmentsTotal: segments.length, more: false };
  }

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

  logger.info('Transcription batch completed', { meetingId, processed, newOffset: finalOffset, total: segments.length, more, errors: segErrors.length });
  return { success: true, transcript: fullTranscript, segmentsProcessed: finalOffset, segmentsTotal: segments.length, more };
}

const MINUTE_PROMPT = (transcript: string) => `
Eres ZRNote, un asistente experto en redactar minutas de reunión ACCIONABLES para equipos de trabajo. Tu prioridad #1 son los ACTION ITEMS (compromisos): lo que la gente realmente necesita para saber qué hacer después. Escribes para una persona ocupada que solo va a leer lo importante.

Analiza la transcripción y responde SOLO con un JSON válido. Nada de texto fuera del JSON, ni markdown, ni comentarios.

PRINCIPIOS:
- SEÑAL sobre ruido. Ignora saludos, bromas, divagaciones y relleno. Captura solo lo que a alguien le importaría leer o le sirve para trabajar.
- Los ACTION ITEMS son lo más importante: extrae TODOS los compromisos reales con responsable, tarea concreta, fecha y prioridad.
- Conciso pero fiel. Mejor 5 puntos claros que 20 vagos. No inventes: lo que no se dijo va como null.
- Escribe en español, claro y directo.

ESTRUCTURA JSON (respeta EXACTAMENTE estas claves):
{
  "summary": "Resumen ejecutivo de 3 a 5 frases: de qué trató la reunión, qué se decidió y qué sigue. Enfócate en resultados y en lo que cambia, no en narrar la conversación.",
  "action_items": [
    {
      "assignee_name": "Responsable. Infiere del contexto quién se comprometió. Si no hay nombre, usa el label ('Speaker 1').",
      "description": "Tarea CONCRETA y accionable, empezando por un verbo. Ej: 'Enviar la propuesta de precios a Cecilia antes del viernes'. Nunca vaga.",
      "due_date": "YYYY-MM-DD si se mencionó un plazo (interpreta 'el viernes', 'la próxima semana', 'para fin de mes'); si no, null",
      "priority": "alta | media | baja  (según urgencia e impacto)"
    }
  ],
  "decisions": [ { "decision": "Qué se acordó (concreto)", "context": "Por qué o bajo qué condiciones" } ],
  "blockers": [ { "issue": "Problema, riesgo o bloqueo", "impact": "A qué afecta o qué retrasa", "owner": "Responsable de resolverlo o null" } ],
  "project_statuses": [ { "project": "Nombre del proyecto", "status": "en progreso | retrasado | completado | pendiente", "details": "Qué se avanzó y qué falta" } ],
  "discussion": [ { "topic": "Tema relevante", "details": "Lo esencial que se dijo (máx 2-3 frases). Omite lo trivial.", "speaker": "Quién lo lideró" } ],
  "next_steps": [ { "step": "Próximo paso o follow-up (si no es ya un action item)", "owner": "Quién o null" } ],
  "ideas": ["Ideas o sugerencias sueltas que NO son compromisos ni decisiones"]
}

REGLAS DE ACTION ITEMS (críticas — es el corazón de la minuta):
- Un action item = alguien SE COMPROMETIÓ a hacer algo. Señales: "yo me encargo", "quedamos en que X hará", "hay que…", "necesito que…", "para el viernes tengo que…".
- Cada tarea empieza con un verbo en infinitivo/imperativo y dice QUÉ y para QUIÉN/QUÉ. Específica, no genérica.
- Si una tarea la comparten varias personas, crea un action item por responsable.
- Ordena los action_items por prioridad: primero 'alta', luego 'media', luego 'baja'.
- NO conviertas en action item una idea vaga, un "estaría bien" o algo sin dueño ni acción clara: eso va en "ideas".
- Interpreta fechas relativas respecto a la fecha de la reunión cuando sea posible.

DISTINCIONES:
- decisions = acuerdos oficiales tomados ("se aprueba", "se decide", "quedamos en que…").
- blockers = lo que está frenando o pone en riesgo el trabajo; incluye impacto y responsable.
- Si el contenido es mucho, prioriza en este orden: 1) action_items, 2) decisions, 3) blockers, 4) summary, 5) project_statuses, 6) discussion/next_steps/ideas. Arrays vacíos [] si no aplica.

Responde SOLO el JSON.

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

  // Groq free tier caps llama-3.3-70b at 12,000 tokens/MINUTE, and that budget
  // counts input (prompt+transcript) + max_tokens together. Size the request to
  // stay under it: pick max_tokens from what's left, and only if the transcript
  // itself is enormous do we trim it (keeping as much as fits).
  const TPM_BUDGET = 11000; // safety margin below Groq's 12,000 TPM
  const MIN_OUTPUT = 2000;
  const MAX_OUTPUT = 6000;
  const estTokens = (s: string) => Math.ceil(s.length / 4);
  const overheadTokens = estTokens(MINUTE_PROMPT(''));

  let transcriptForLlm = meetingTranscript;
  let inputTokens = estTokens(MINUTE_PROMPT(transcriptForLlm));
  if (inputTokens + MIN_OUTPUT > TPM_BUDGET) {
    const transcriptTokenBudget = Math.max(0, TPM_BUDGET - MIN_OUTPUT - overheadTokens);
    transcriptForLlm = meetingTranscript.slice(0, transcriptTokenBudget * 4);
    inputTokens = estTokens(MINUTE_PROMPT(transcriptForLlm));
    logger.warn('Transcript trimmed to fit Groq TPM budget', { meetingId, originalChars: meetingTranscript.length, keptChars: transcriptForLlm.length });
  }
  const maxOut = Math.max(MIN_OUTPUT, Math.min(MAX_OUTPUT, TPM_BUDGET - inputTokens));

  logger.info('Calling Groq LLM', { meetingId, inputTokens, maxOut });

  let llmResponse: Response | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    llmResponse = await fetch(`${GROQ_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${groqKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: MINUTE_PROMPT(transcriptForLlm) }],
        temperature: 0.3,
        max_tokens: maxOut,
      }),
    });
    if (llmResponse.ok) break;
    // 429 = per-minute rate limit hit by other requests — wait for the window to
    // reset and retry (our request already fits the budget).
    if (llmResponse.status === 429 && attempt < 3) {
      await new Promise((r) => setTimeout(r, 15000));
      continue;
    }
    break;
  }

  if (!llmResponse || !llmResponse.ok) {
    const errorText = llmResponse ? await llmResponse.text() : 'sin respuesta';
    return { success: false, error: `LLM error (${llmResponse?.status}): ${errorText}` };
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
  const emailStatuses: Array<{ job: typeof emailQueue[0]; status: 'sent' | 'failed' }> = [];

  for (const job of emailQueue) {
    const result = await sendWithRetry(() =>
      sendMail({ to: job.to, subject: job.subject, html: job.html, attachments: job.attachments })
    );
    if (result.ok) { sent++; emailStatuses.push({ job, status: 'sent' }); }
    else { failed++; errors.push(`${job.label}: ${result.error}`); emailStatuses.push({ job, status: 'failed' }); }
    if (emailQueue.indexOf(job) < emailQueue.length - 1) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  try {
    await supabase.from('email_logs').insert(
      emailStatuses.map(({ job, status }) => ({
        meeting_id: meetingId,
        recipient_email: job.to,
        type: job.label.includes('coordinator') ? 'coordinator_summary' : 'personal',
        status,
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