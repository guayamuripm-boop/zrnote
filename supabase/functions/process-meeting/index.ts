import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GROQ_BASE = 'https://api.groq.com/openai/v1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { meetingId } = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const groqKey = Deno.env.get('GROQ_API_KEY')!;
    const resendKey = Deno.env.get('RESEND_API_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Get meeting data
    const { data: meeting, error: meetingError } = await supabase
      .from('meetings')
      .select('*')
      .eq('id', meetingId)
      .single();

    if (meetingError || !meeting) {
      throw new Error('Meeting not found');
    }

    console.log(`Processing meeting: ${meeting.title}`);

    // 2. Get audio file from storage
    const segments = meeting.audio_segments || [];
    if (segments.length === 0) {
      throw new Error('No audio segments found');
    }

    // Download and combine audio segments
    let allTranscriptions: string[] = [];

    for (const segment of segments) {
      const { data: audioData, error: downloadError } = await supabase.storage
        .from('meeting-audio')
        .download(segment.r2_key);

      if (downloadError) {
        console.error(`Error downloading segment: ${downloadError}`);
        continue;
      }

      // 3. Transcribe with Groq Whisper
      const formData = new FormData();
      formData.append('file', audioData, 'audio.webm');
      formData.append('model', 'whisper-large-v3');
      formData.append('language', 'es');
      formData.append('response_format', 'verbose_json');

      const transcriptionResponse = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${groqKey}`,
        },
        body: formData,
      });

      if (!transcriptionResponse.ok) {
        const errorText = await transcriptionResponse.text();
        throw new Error(`Transcription error: ${errorText}`);
      }

      const transcriptionResult = await transcriptionResponse.json();
      allTranscriptions.push(transcriptionResult.text);
    }

    const fullTranscript = allTranscriptions.join('\n\n');
    console.log(`Transcription complete: ${fullTranscript.length} chars`);

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

    const llmResponse = await fetch(`${GROQ_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${groqKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama3-70b-8192',
        messages: [{ role: 'user', content: minutePrompt }],
        temperature: 0.3,
        max_tokens: 4096,
      }),
    });

    if (!llmResponse.ok) {
      const errorText = await llmResponse.text();
      throw new Error(`LLM error: ${errorText}`);
    }

    const llmResult = await llmResponse.json();
    const responseText = llmResult.choices[0]?.message?.content || '';

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('LLM did not return valid JSON');
    }

    const minuteJSON = JSON.parse(jsonMatch[0]);
    console.log('Minute generated:', minuteJSON.summary?.substring(0, 50));

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

    if (minuteError) throw minuteError;

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

    // 8. Send emails
    const { data: participants } = await supabase
      .from('meeting_participants')
      .select('*, users(*)')
      .eq('meeting_id', meetingId);

    const { data: actionItems } = await supabase
      .from('action_items')
      .select('*')
      .eq('meeting_id', meetingId);

    // Send to each participant
    for (const participant of participants || []) {
      const user = participant.users;
      if (!user?.email) continue;

      const participantItems = (actionItems || []).filter(
        (item) => item.assignee_name?.toLowerCase().includes(user.full_name?.toLowerCase() || '')
      );

      if (participantItems.length === 0) continue;

      const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Roboto,sans-serif;max-width:600px;margin:0 auto;">
  <div style="background:#21284F;padding:20px;text-align:center;">
    <span style="color:#fff;font-family:Raleway;font-size:18px;font-weight:700;">
      <span style="background:#1E4D96;padding:4px 8px;border-radius:4px;">ZR</span> ZRNote
    </span>
  </div>
  <div style="padding:20px;background:#fff;">
    <h2 style="color:#21284F;font-family:Raleway;">${meeting.title}</h2>
    <p style="color:#6590CB;">${new Date(meeting.created_at).toLocaleDateString('es-ES')}</p>
    <h3 style="color:#1E4D96;">Tus compromisos:</h3>
    ${participantItems.map(item => `
      <div style="padding:10px;background:#f8f9fa;border-left:3px solid #1E4D96;margin:10px 0;">
        <p style="margin:0;font-weight:500;">${item.description}</p>
        <p style="margin:5px 0 0;font-size:12px;color:#6590CB;">
          ${item.due_date ? `Fecha: ${new Date(item.due_date).toLocaleDateString('es-ES')}` : 'Sin fecha'} · ${item.priority}
        </p>
      </div>
    `).join('')}
    <a href="${Deno.env.get('APP_URL') || 'http://localhost:3000'}/dashboard/meetings/${meetingId}"
       style="display:inline-block;background:#1E4D96;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;margin-top:15px;">
      Ver minuta completa
    </a>
  </div>
  <div style="padding:15px;text-align:center;background:#f8f9fa;">
    <small style="color:#6590CB;">ZRNote · ZR Mecacademy</small>
  </div>
</body>
</html>`;

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'ZRNote <noreply@zrnote.app>',
          to: user.email,
          subject: `[ZRNote] ${meeting.title} — Tus compromisos`,
          html: emailHtml,
        }),
      });
    }

    // Send to coordinator
    const { data: coordinator } = await supabase
      .from('users')
      .select('*')
      .eq('id', meeting.created_by)
      .single();

    if (coordinator?.email) {
      const coordinatorHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Roboto,sans-serif;max-width:600px;margin:0 auto;">
  <div style="background:#21284F;padding:20px;text-align:center;">
    <span style="color:#fff;font-family:Raleway;font-size:18px;font-weight:700;">
      <span style="background:#1E4D96;padding:4px 8px;border-radius:4px;">ZR</span> ZRNote
    </span>
  </div>
  <div style="padding:20px;background:#fff;">
    <h2 style="color:#21284F;font-family:Raleway;">${meeting.title} — Resumen completo</h2>
    <p style="color:#6590CB;">${new Date(meeting.created_at).toLocaleDateString('es-ES')}</p>
    <h3 style="color:#1E4D96;">Todos los action items:</h3>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr style="background:#21284F;color:#fff;">
        <th style="padding:8px;text-align:left;">Responsable</th>
        <th style="padding:8px;text-align:left;">Tarea</th>
        <th style="padding:8px;text-align:left;">Prioridad</th>
      </tr>
      ${(actionItems || []).map(item => `
        <tr style="border-bottom:1px solid #eee;">
          <td style="padding:8px;">${item.assignee_name}</td>
          <td style="padding:8px;">${item.description}</td>
          <td style="padding:8px;">${item.priority}</td>
        </tr>
      `).join('')}
    </table>
    <a href="${Deno.env.get('APP_URL') || 'http://localhost:3000'}/dashboard/meetings/${meetingId}"
       style="display:inline-block;background:#1E4D96;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;margin-top:15px;">
      Ver minuta completa
    </a>
  </div>
  <div style="padding:15px;text-align:center;background:#f8f9fa;">
    <small style="color:#6590CB;">ZRNote · ZR Mecacademy</small>
  </div>
</body>
</html>`;

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'ZRNote <noreply@zrnote.app>',
          to: coordinator.email,
          subject: `[ZRNote] ${meeting.title} — Resumen completo`,
          html: coordinatorHtml,
        }),
      });
    }

    console.log('Processing complete!');

    return new Response(
      JSON.stringify({ success: true, minuteId: minute.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
