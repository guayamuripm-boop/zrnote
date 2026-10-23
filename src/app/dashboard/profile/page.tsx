import type { Metadata } from 'next';
import { createServerSupabase } from '@/lib/supabase/server';
import SettingsView from '@/components/dashboard/SettingsView';

export const metadata: Metadata = { title: 'Ajustes' };

export default async function ProfilePage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  // Si la migración 035 aún no está aplicada la lectura falla y queda en «no
  // activado»; el interruptor avisará al intentar guardar.
  const { data: prefs } = user
    ? await supabase.from('users').select('content_mode_enabled').eq('id', user.id).maybeSingle()
    : { data: null };

  return (
    <SettingsView
      email={user?.email || ''}
      createdAt={user?.created_at}
      contentModeEnabled={Boolean(prefs?.content_mode_enabled)}
    />
  );
}
