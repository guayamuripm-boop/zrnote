import { createServerSupabase } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthedUser } from '@/lib/api-auth';
import { normalizeMinuteStyle, MAX_STYLE_NOTES_LENGTH } from '@/lib/minute-styles';
import { normalizeSummaryLength } from '@/lib/summary-length';

const createMeetingSchema = z.object({
  // Present only when the meeting was created OFFLINE (see meeting-queue.ts):
  // the id was generated on the device and used everywhere — the record page,
  // the segment store, the upload queue — before the server ever knew this
  // meeting existed. Absent, this is a normal online creation and Postgres
  // assigns the id as always.
  id: z.string().uuid().optional(),
  title: z.string().min(1),
  coordination: z.string().optional().default(''),
  type: z.enum(['presencial', 'virtual', 'llamada']).default('presencial'),
  participants: z.array(z.object({
    name: z.string().min(1),
    email: z.string().email(),
  })).optional().default([]),
  // "Grabar ahora" manda `title` como la fecha/hora porque todavía no hay
  // audio del que sacar un título real. Esta marca es lo que permite que,
  // cuando analyzeMeeting ya haya leído la transcripción, lo sustituya por uno
  // que la IA redacte a partir del contenido — sin pisar nunca un título que
  // alguien haya escrito a propósito en el formulario normal.
  autoTitle: z.boolean().optional().default(false),
  // Sin `.enum(...)`: la lista de estilos vive en minute-styles.ts, no aquí —
  // normalizeMinuteStyle() valida y degrada a 'ejecutiva' ante cualquier valor
  // que no reconozca, así que un estilo nuevo no exige tocar este schema.
  minuteStyle: z.string().optional(),
  styleNotes: z.string().max(MAX_STYLE_NOTES_LENGTH).optional(),
  // Igual que minuteStyle: la lista vive en summary-length.ts, no aquí —
  // normalizeSummaryLength() degrada a 'normal' ante cualquier valor que no
  // reconozca.
  summaryLength: z.string().optional(),
  // Cuándo se confirmó el aviso de consentimiento — para una reunión creada
  // sin conexión, esto ocurrió en el DISPOSITIVO, potencialmente horas antes
  // de que este POST llegara a suceder. Lo que importa legalmente es que se
  // avisó ANTES de grabar, no cuándo el teléfono recuperó señal, así que se
  // acepta la marca de tiempo del cliente en vez de imponer la del servidor.
  // Es una extensión del mismo modelo de confianza que ya tiene el resto de
  // esta funcionalidad: el usuario declara, y la declaración queda con su
  // usuario y una fecha — aquí, simplemente, la fecha real del momento.
  recordingConsentAt: z.string().min(10).optional(),
});

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: meetings } = await supabase
    .from('meetings')
    .select('id, title, coordination, type, status, created_at')
    .eq('created_by', user.id)
    .order('created_at', { ascending: false })
    .limit(200);

  return NextResponse.json(meetings);
}

export async function POST(request: Request) {
  // Cookie (web app) or bearer token (Chrome extension).
  const auth = await getAuthedUser(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { user, supabase } = auth;

  const body = await request.json();
  const parsed = createMeetingSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { data: userRecord, error: userError } = await supabase
    .from('users')
    .select('org_id')
    .eq('id', user.id)
    .single();

  let orgId = userRecord?.org_id || null;

  if (userError || !userRecord) {
    const adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY!
    );
    const { data: upserted, error: insertError } = await adminSupabase
      .from('users')
      .upsert({
        id: user.id,
        full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Usuario',
        email: user.email || '',
        role: 'coordinator',
      }, { onConflict: 'id' })
      .select('org_id')
      .single();

    if (insertError) {
      return NextResponse.json({ error: `No se pudo crear perfil: ${insertError.message}` }, { status: 500 });
    }
    orgId = upserted?.org_id || null;
  }

  const insertPayload: Record<string, unknown> = {
    title: parsed.data.title,
    coordination: parsed.data.coordination,
    type: parsed.data.type,
    created_by: user.id,
    org_id: orgId,
    status: 'scheduled',
    title_is_auto: parsed.data.autoTitle,
    minute_style: normalizeMinuteStyle(parsed.data.minuteStyle),
    style_notes: parsed.data.styleNotes?.trim() || null,
    summary_length: normalizeSummaryLength(parsed.data.summaryLength),
  };
  if (parsed.data.id) insertPayload.id = parsed.data.id;

  // A client-supplied timestamp, validated as a real date but otherwise
  // trusted — see the schema comment on `recordingConsentAt` for why that is
  // the right call here, not a shortcut.
  if (parsed.data.recordingConsentAt) {
    const parsedDate = new Date(parsed.data.recordingConsentAt);
    if (!Number.isNaN(parsedDate.getTime()) && parsedDate.getTime() <= Date.now()) {
      insertPayload.recording_consent_at = parsedDate.toISOString();
      insertPayload.recording_consent_by = user.id;
    }
  }

  let { data: meeting, error } = await supabase.from('meetings').insert(insertPayload).select().single();

  // A client-generated id lets the offline-creation flow retry the exact same
  // POST after a flaky connection without knowing whether the first attempt
  // actually landed. `23505` (unique_violation) on a retry of THIS user's own
  // meeting is success, not failure — return the row that is already there
  // instead of erroring out on a request that, from the device's point of
  // view, never got an answer the first time.
  if (error?.code === '23505' && parsed.data.id) {
    const { data: existing } = await supabase
      .from('meetings')
      .select()
      .eq('id', parsed.data.id)
      .eq('created_by', user.id)
      .maybeSingle();
    if (existing) {
      meeting = existing;
      error = null;
    }
  }

  if (error || !meeting) {
    return NextResponse.json({ error: error?.message || 'No se pudo crear la reunión' }, { status: 500 });
  }

  // Recordar la elección para la próxima vez — así "Grabar ahora" no obliga a
  // elegir estilo cada vez, sin que el usuario tenga que ir a configurarlo.
  // Sólo si vino un valor explícito: si el cliente no mandó nada, no hay
  // preferencia nueva que guardar.
  if (parsed.data.minuteStyle) {
    await supabase
      .from('users')
      .update({ default_minute_style: normalizeMinuteStyle(parsed.data.minuteStyle) })
      .eq('id', user.id);
  }
  if (parsed.data.summaryLength) {
    await supabase
      .from('users')
      .update({ default_summary_length: normalizeSummaryLength(parsed.data.summaryLength) })
      .eq('id', user.id);
  }

  const { data: creatorProfile } = await supabase
    .from('users')
    .select('id, email, full_name')
    .eq('id', user.id)
    .single();

  const participantsToInsert: Array<{
    meeting_id: string;
    user_id: string | null;
    name: string;
    email_override: string;
  }> = [];

  if (creatorProfile) {
    participantsToInsert.push({
      meeting_id: meeting.id,
      user_id: user.id,
      email_override: creatorProfile.email,
      name: creatorProfile.full_name,
    });
  }

  for (const p of parsed.data.participants) {
    if (creatorProfile?.email && p.email.toLowerCase() === creatorProfile.email.toLowerCase()) continue;

    participantsToInsert.push({
      meeting_id: meeting.id,
      user_id: null,
      name: p.name,
      email_override: p.email,
    });
  }

  if (participantsToInsert.length > 0) {
    await supabase.from('meeting_participants').insert(participantsToInsert);
  }

  return NextResponse.json({ id: meeting.id }, { status: 201 });
}
