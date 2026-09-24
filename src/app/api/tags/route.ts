import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthedUser } from '@/lib/api-auth';
import { checkRateLimit } from '@/lib/rate-limiter';
import { serverError } from '@/lib/api-errors';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const createTagSchema = z.object({
  name: z.string().min(1).max(30).trim(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#3b82f6'),
});

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabaseAdmin();
  const { data: profile } = await supabase
    .from('users')
    .select('org_id')
    .eq('id', auth.user.id)
    .maybeSingle();

  if (!profile?.org_id) return NextResponse.json({ tags: [] });

  const { data: tags, error } = await supabase
    .from('tags')
    .select('id, name, color, created_at')
    .eq('org_id', profile.org_id)
    .order('name');

  if (error) return serverError('list tags', error);
  return NextResponse.json({ tags: tags || [] });
}

export async function POST(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const limited = await checkRateLimit(`tags-create:${auth.user.id}`, { max: 20 });
  if (limited) return NextResponse.json({ error: 'Demasiados intentos.' }, { status: 429 });

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const parsed = createTagSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: profile } = await supabase
    .from('users')
    .select('org_id')
    .eq('id', auth.user.id)
    .maybeSingle();

  if (!profile?.org_id) {
    return NextResponse.json({ error: 'No perteneces a una organización' }, { status: 403 });
  }

  const { data: tag, error } = await supabase
    .from('tags')
    .insert({
      org_id: profile.org_id,
      name: parsed.data.name,
      color: parsed.data.color,
      created_by: auth.user.id,
    })
    .select('id, name, color')
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Ya existe una etiqueta con ese nombre' }, { status: 409 });
    }
    return serverError('create tag', error);
  }

  return NextResponse.json({ tag }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const tagId = searchParams.get('id');
  if (!tagId) return NextResponse.json({ error: 'Falta id' }, { status: 400 });

  const supabase = getSupabaseAdmin();

  const { data: tag } = await supabase
    .from('tags')
    .select('id, created_by')
    .eq('id', tagId)
    .maybeSingle();

  if (!tag) return NextResponse.json({ error: 'Etiqueta no encontrada' }, { status: 404 });
  if (tag.created_by !== auth.user.id) {
    return NextResponse.json({ error: 'Solo el creador puede eliminar la etiqueta' }, { status: 403 });
  }

  const { error } = await supabase.from('tags').delete().eq('id', tagId);
  if (error) return serverError('delete tag', error);

  return NextResponse.json({ ok: true });
}
