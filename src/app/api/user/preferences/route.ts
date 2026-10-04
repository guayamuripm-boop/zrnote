import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerSupabase } from '@/lib/supabase/server';
import { serverError } from '@/lib/api-errors';

const schema = z.object({
  contentModeEnabled: z.boolean(),
});

/** Activa o desactiva el modo Contenido (podcasts, conferencias, videos). */
export async function PATCH(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Datos no válidos' }, { status: 400 });

  const { error } = await supabase
    .from('users')
    .update({ content_mode_enabled: parsed.data.contentModeEnabled })
    .eq('id', user.id);

  if (error) {
    // La migración 035 aún no está aplicada: decirlo claro, no un 500 mudo.
    if (/content_mode_enabled/.test(error.message || '')) {
      return NextResponse.json({ error: 'Esta opción aún no está disponible. Inténtalo en unos minutos.' }, { status: 503 });
    }
    return serverError('user/preferences', error);
  }

  return NextResponse.json({ ok: true, contentModeEnabled: parsed.data.contentModeEnabled });
}
