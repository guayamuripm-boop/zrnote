import { NextResponse } from 'next/server';
import { getAuthedUser } from '@/lib/api-auth';
import { canSignLinks, minuteUrl } from '@/lib/minute-links';

/**
 * Enlace público de una minuta, para que el organizador lo comparta donde
 * quiera —Telegram, un correo aparte, NotebookLM— sin depender de que el
 * destinatario sea alguno de los participantes registrados.
 *
 * Reusa exactamente el mismo mecanismo que ya usan los correos
 * (minute-links.ts): un token firmado, sin fila nueva en la base de datos.
 * La diferencia es el email dentro del payload: aquí va vacío a propósito,
 * así que /minuta/[token] no intenta personalizar el saludo ni resaltar
 * "tus compromisos" de nadie — ver la comprobación de `email` en esa página.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const resolvedParams = await params;
  const auth = await getAuthedUser(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { user, supabase } = auth;

  const { data: meeting } = await supabase
    .from('meetings')
    .select('id')
    .eq('id', resolvedParams.id)
    .eq('created_by', user.id)
    .maybeSingle();

  if (!meeting) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!canSignLinks()) {
    return NextResponse.json(
      { error: 'No se puede generar el enlace: falta configurar la clave de firma en el servidor.' },
      { status: 503 },
    );
  }

  // TTL más largo que el de los enlaces de correo (90 días): éste lo genera
  // el propio organizador para guardarlo como apunte de consulta —para
  // NotebookLM, para repasar antes de un examen— y no para que alguien lo
  // abra una vez y ya. Un año es de sobra sin ser "para siempre".
  return NextResponse.json({ url: minuteUrl(resolvedParams.id, '', 365) });
}
