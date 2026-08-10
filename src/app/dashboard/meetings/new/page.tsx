import { createServerSupabase } from '@/lib/supabase/server';
import { normalizeMinuteStyle } from '@/lib/minute-styles';
import NewMeetingForm from '@/components/NewMeetingForm';

export const dynamic = 'force-dynamic';

// Componente de servidor sólo para traer la última elección de estilo del
// usuario y premarcarla — el formulario en sí es interactivo y vive en
// NewMeetingForm.tsx.
export default async function NewMeetingPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase.from('users').select('default_minute_style').eq('id', user.id).maybeSingle()
    : { data: null };

  return <NewMeetingForm initialStyle={normalizeMinuteStyle(profile?.default_minute_style)} />;
}
