import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limiter';
import {
  PANEL_COOKIE,
  checkPanelPassword,
  expectedPanelToken,
  panelPasswordConfigured,
} from '@/lib/panel-auth';

/**
 * Comprueba la contraseña del panel y, si es correcta, deja una cookie para no
 * volver a pedirla en unas horas. Todo en el servidor: la clave nunca llega al
 * navegador.
 */
export async function POST(request: Request) {
  // Fallo cerrado: sin contraseña configurada, el panel no existe.
  if (!panelPasswordConfigured()) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
  }

  // Límite por IP para que nadie pueda probar contraseñas a lo bruto.
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'desconocida';
  const { allowed } = await checkRateLimit(`panel-login:${ip}`, { max: 8, windowMs: 60_000 });
  if (!allowed) {
    return NextResponse.redirect(new URL('/panel?error=rate', request.url), { status: 303 });
  }

  const form = await request.formData().catch(() => null);
  const password = form ? String(form.get('password') || '') : '';

  if (!checkPanelPassword(password)) {
    return NextResponse.redirect(new URL('/panel?error=1', request.url), { status: 303 });
  }

  const response = NextResponse.redirect(new URL('/panel', request.url), { status: 303 });
  response.cookies.set(PANEL_COOKIE, expectedPanelToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 8 * 60 * 60, // 8 horas
  });
  return response;
}
