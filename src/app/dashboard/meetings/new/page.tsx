import { createServerSupabase } from '@/lib/supabase/server';
import { resolveMinuteStyle } from '@/lib/minute-styles';
import { normalizeSummaryLength } from '@/lib/summary-length';
import NewMeetingForm from '@/components/NewMeetingForm';

export const dynamic = 'force-dynamic';

// Componente de servidor sólo para traer la última elección de estilo y nivel
// de detalle del usuario y premarcarlos — el formulario en sí es interactivo
// y vive en NewMeetingForm.tsx.
export default async function NewMeetingPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase.from('users').select('default_minute_style, default_summary_length').eq('id', user.id).maybeSingle()
    : { data: null };

  // Aparte, a propósito: la columna la crea la migración 035. Metida en el
  // select de arriba, su ausencia haría fallar también el estilo y el nivel.
  const { data: prefs } = user
    ? await supabase.from('users').select('content_mode_enabled').eq('id', user.id).maybeSingle()
    : { data: null };
  const contentModeEnabled = Boolean(prefs?.content_mode_enabled);

  return (
    <NewMeetingForm
      initialStyle={resolveMinuteStyle(profile?.default_minute_style, contentModeEnabled)}
      initialSummaryLength={normalizeSummaryLength(profile?.default_summary_length)}
      contentModeEnabled={contentModeEnabled}
    />
  );
}
