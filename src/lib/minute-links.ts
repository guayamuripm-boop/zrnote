// Enlaces firmados para que un participante SIN CUENTA pueda abrir la minuta
// que le llegó por correo.
//
// El problema que resuelve: el botón «Ver en ZRNote» de cada correo apuntaba a
// /dashboard/meetings/{id}, y esa página filtra por `created_by = user.id`. O
// sea que el destinatario veía un login y, tras iniciar sesión, un 404. El CTA
// principal de todos nuestros correos estaba roto para todo el que no fuera el
// organizador — que son casi todos.
//
// Cómo funciona: un token autofirmado (HMAC-SHA256) que lleva dentro la
// reunión, el destinatario y la caducidad. Sin tabla nueva y sin escritura en
// base de datos: el servidor sólo tiene que verificar la firma.

import { createHmac, createHash, timingSafeEqual } from 'crypto';

/** Duración por defecto de un enlace. Útil de sobra, pero acotado. */
const DEFAULT_TTL_DAYS = 90;

export interface MinuteTokenPayload {
  /** Reunión a la que da acceso. */
  meetingId: string;
  /** Destinatario, en minúsculas. Permite resaltar SUS compromisos. */
  email: string;
  /** Caducidad, en segundos epoch. */
  exp: number;
}

/**
 * Clave de firma.
 *
 * Preferimos `MINUTE_LINK_SECRET`. Si no está, se DERIVA de la service key con
 * un separador de dominio: el hash es de un solo sentido, así que un token
 * filtrado nunca puede revelar la credencial de la que salió. Esto evita que
 * los enlaces dejen de funcionar sólo porque falte una variable de entorno.
 *
 * Rotar cualquiera de las dos invalida TODOS los enlaces emitidos: es el
 * mecanismo de revocación de emergencia.
 */
function signingKey(): Buffer {
  const explicit = process.env.MINUTE_LINK_SECRET;
  if (explicit) return Buffer.from(explicit, 'utf8');

  const fallback = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!fallback) {
    throw new Error(
      'No hay clave para firmar enlaces de minuta: configura MINUTE_LINK_SECRET o SUPABASE_SERVICE_ROLE_KEY.',
    );
  }
  return createHash('sha256').update(`zrnote-minute-link:${fallback}`).digest();
}

/**
 * ¿Se pueden firmar enlaces?
 *
 * Existe para que quien construye los correos pueda degradar con elegancia. Sin
 * esto, una variable de entorno ausente hacía que `signMinuteToken` lanzara
 * desde dentro de la construcción del HTML y **no saliera ningún correo**: un
 * problema de configuración se convertía en una caída total del envío. Es
 * exactamente el mismo patrón que ya nos rompió los correos en v1.10, cuando
 * `generateGoogleCalendarUrl` lanzaba desde dentro del mismo sitio.
 */
export function canSignLinks(): boolean {
  try {
    signingKey();
    return true;
  } catch {
    return false;
  }
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(input: string): Buffer {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

function sign(payloadB64: string): string {
  return base64url(createHmac('sha256', signingKey()).update(payloadB64).digest());
}

/**
 * Emite el enlace de una persona concreta para una reunión concreta.
 * Cada destinatario recibe un token distinto: si uno se filtra, se sabe cuál.
 */
export function signMinuteToken(
  meetingId: string,
  email: string,
  ttlDays: number = DEFAULT_TTL_DAYS,
): string {
  const payload: MinuteTokenPayload = {
    meetingId,
    email: (email || '').toLowerCase().trim(),
    exp: Math.floor(Date.now() / 1000) + ttlDays * 24 * 60 * 60,
  };
  const payloadB64 = base64url(JSON.stringify(payload));
  return `${payloadB64}.${sign(payloadB64)}`;
}

export type VerifyResult =
  | { ok: true; payload: MinuteTokenPayload }
  | { ok: false; reason: 'malformado' | 'firma-invalida' | 'caducado' };

/**
 * Verifica y decodifica un token. **Falla cerrado**: cualquier duda es un no.
 *
 * La comparación de la firma es en tiempo constante (`timingSafeEqual`). Con
 * `===` un atacante podría deducir la firma byte a byte midiendo cuánto tarda
 * la respuesta.
 */
export function verifyMinuteToken(token: string): VerifyResult {
  if (!token || typeof token !== 'string') return { ok: false, reason: 'malformado' };

  const parts = token.split('.');
  if (parts.length !== 2) return { ok: false, reason: 'malformado' };
  const [payloadB64, providedSig] = parts;
  if (!payloadB64 || !providedSig) return { ok: false, reason: 'malformado' };

  let expectedSig: string;
  try {
    expectedSig = sign(payloadB64);
  } catch {
    // Sin clave de firma no se valida nada. Fallar cerrado.
    return { ok: false, reason: 'firma-invalida' };
  }

  const a = Buffer.from(providedSig);
  const b = Buffer.from(expectedSig);
  // timingSafeEqual exige longitudes iguales; distinta longitud ya es un no.
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'firma-invalida' };
  }

  let payload: MinuteTokenPayload;
  try {
    payload = JSON.parse(fromBase64url(payloadB64).toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformado' };
  }

  if (!payload?.meetingId || typeof payload.exp !== 'number') {
    return { ok: false, reason: 'malformado' };
  }
  if (Math.floor(Date.now() / 1000) > payload.exp) {
    return { ok: false, reason: 'caducado' };
  }

  return { ok: true, payload };
}

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL || 'https://zrnote.vercel.app';

/** URL pública de la minuta para un destinatario. */
export function minuteUrl(meetingId: string, email: string, ttlDays?: number): string {
  return `${appUrl()}/minuta/${signMinuteToken(meetingId, email, ttlDays)}`;
}

/**
 * URL de baja de un clic.
 *
 * Comparte el mismo token que la minuta a propósito: quien puede leer la minuta
 * es exactamente quien puede darse de baja de ella. No hacen falta dos secretos
 * ni dos caducidades.
 */
export function unsubscribeUrl(meetingId: string, email: string, ttlDays?: number): string {
  return `${appUrl()}/api/baja/${signMinuteToken(meetingId, email, ttlDays)}`;
}
