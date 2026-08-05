import { createServerSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { verifyTransport } from '@/lib/smtp';

// Diagnostic: checks whether Gmail SMTP is correctly configured and reachable,
// WITHOUT sending any email (nodemailer's verify() only does login handshake).
// Requires auth so it never leaks config to anonymous callers.
export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const hasUser = !!process.env.GMAIL_USER;
  const hasPass = !!process.env.GMAIL_APP_PASSWORD;
  // Never return the actual values — only whether they exist and are shaped right.
  const status: Record<string, unknown> = {
    gmailUserConfigured: hasUser,
    gmailAppPasswordConfigured: hasPass,
    gmailUserMasked: hasUser ? maskEmail(process.env.GMAIL_USER!) : null,
    appPasswordLength: hasPass ? process.env.GMAIL_APP_PASSWORD!.replace(/\s/g, '').length : 0,
  };

  if (!hasUser || !hasPass) {
    return NextResponse.json({
      ok: false,
      ...status,
      verdict: 'Faltan credenciales de Gmail en Vercel. Configura GMAIL_USER y GMAIL_APP_PASSWORD (contraseña de aplicación de 16 caracteres) en Settings → Environment Variables y vuelve a desplegar.',
    });
  }

  // Verifica el transporte REAL de la app (pooled, el mismo que envía las
  // minutas). Antes se creaba aquí uno nuevo, así que este diagnóstico podía
  // decir «OK» sobre una configuración que no era la que se usaba de verdad.
  const result = await verifyTransport();

  if (result.ok) {
    return NextResponse.json({
      ok: true,
      ...status,
      verdict: 'SMTP OK: Gmail acepta las credenciales. Los correos se pueden enviar.',
    });
  }

  return NextResponse.json({
    ok: false,
    ...status,
    error: result.error,
    verdict: 'Gmail rechazó las credenciales. La app password suele ser inválida/expirada, o falta activar la verificación en 2 pasos en esa cuenta.',
  });
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return `${local.slice(0, 2)}***@${domain}`;
}
