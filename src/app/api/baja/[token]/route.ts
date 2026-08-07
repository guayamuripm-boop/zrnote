import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyMinuteToken } from '@/lib/minute-links';
import { logger } from '@/lib/logger';

// Baja de un clic (RFC 8058).
//
// El cliente de correo (Gmail, Yahoo, Outlook) hace un POST a esta URL cuando
// el usuario pulsa «Cancelar suscripción» junto al remitente. Lo hace desde SUS
// servidores: sin sesión, sin cookies y sin interacción posterior. Por eso:
//
//  - La autorización es el token firmado, no una sesión.
//  - NO se puede pedir confirmación: la RFC exige que el POST baste. Una página
//    intermedia incumple, y Gmail penaliza al remitente por ello.
//
// El mismo token que abre la minuta sirve aquí: quien puede leerla es
// exactamente quien puede darse de baja de ella.

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY!,
  );
}

async function darDeBaja(token: string, source: 'one-click' | 'pagina') {
  const verified = verifyMinuteToken(token);
  if (!verified.ok) return { ok: false as const, reason: verified.reason };

  const { email, meetingId } = verified.payload;
  if (!email) return { ok: false as const, reason: 'malformado' as const };

  // upsert y no insert: darse de baja dos veces no es un error, es la misma
  // intención repetida. Un cliente de correo puede reintentar el POST.
  const { error } = await admin()
    .from('email_unsubscribes')
    .upsert({ email, source, meeting_id: meetingId }, { onConflict: 'email' });

  if (error) {
    logger.error('baja: no se pudo registrar', { error: error.message });
    return { ok: false as const, reason: 'error-servidor' as const };
  }

  logger.info('baja registrada', { source });
  return { ok: true as const, email };
}

/** El POST de la baja de un clic. Debe responder 200 y no pedir nada más. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const result = await darDeBaja(token, 'one-click');

  if (!result.ok) {
    // Un token caducado no debe devolver error al cliente de correo: reintentaría
    // y podría marcar al remitente como problemático. Se acepta y se registra.
    const status = result.reason === 'error-servidor' ? 500 : 200;
    return NextResponse.json({ ok: false, reason: result.reason }, { status });
  }

  return NextResponse.json({ ok: true });
}

/**
 * Alguien pegó la URL en el navegador. No damos de baja con un GET —un
 * prefetch o un antivirus que abre enlaces daría de baja a quien no quería—:
 * se le lleva a la página con el botón.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  return NextResponse.redirect(new URL(`/baja/${token}`, request.url));
}
