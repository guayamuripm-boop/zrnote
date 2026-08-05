import nodemailer from 'nodemailer';
import { logger } from '@/lib/logger';

/**
 * Transporte único para TODO el correo de la aplicación.
 *
 * `reminders.ts` tenía su propio `createTransport` en paralelo. Es la misma
 * clase de duplicación que ya nos costó un fallo cuando había dos
 * constructores de minutas distintos: uno escapaba el HTML y el otro no.
 * Si hay que tocar el envío, se toca aquí y afecta a todo.
 *
 * `pool: true` importa más de lo que parece: sin él, nodemailer abre y cierra
 * una conexión TLS por mensaje. En una reunión de 8 participantes eso es un
 * handshake completo ocho veces (~1 s cada uno) que se sumaba al límite de
 * tiempo de la función.
 */
const transporter = nodemailer.createTransport({
  service: 'gmail',
  pool: true,
  maxConnections: 3,
  maxMessages: 50,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  /** Alternativa en texto plano. Si no se pasa, se deriva del HTML. */
  text?: string;
  /** A dónde van las respuestas. Sin esto caen en un buzón que nadie lee. */
  replyTo?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
}

/**
 * ¿Está configurado el envío de correo?
 *
 * Esta comprobación estaba repetida en tres sitios (la ruta de reenvío,
 * processing.ts y reminders.ts) con tres mensajes de error distintos, así que
 * el mismo problema se explicaba de tres maneras según por dónde entraras.
 */
export function isEmailConfigured(): boolean {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

/** El mensaje único para cuando no lo está. */
export const EMAIL_NOT_CONFIGURED =
  'El envío de correos no está configurado en el servidor (faltan GMAIL_USER / GMAIL_APP_PASSWORD).';

/**
 * Comprueba las credenciales contra Gmail sin enviar nada.
 *
 * Verifica **el transporte real** que usa la aplicación, no uno creado al
 * vuelo: si el diagnóstico dice «OK» pero el envío falla, el diagnóstico no
 * sirve de nada. `/api/health/email` construía su propio transporter, así que
 * comprobaba una configuración que no era la que luego se usaba.
 */
export async function verifyTransport(): Promise<{ ok: boolean; error?: string }> {
  if (!isEmailConfigured()) return { ok: false, error: EMAIL_NOT_CONFIGURED };
  try {
    await transporter.verify();
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Versión en texto plano a partir del HTML.
 *
 * Un correo sólo-HTML puntúa peor en los filtros antispam, y hay clientes
 * (relojes, lectores de pantalla, modo texto) que sólo muestran esta parte.
 * No pretende ser bonito: pretende ser legible y existir.
 */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    // Los enlaces se convierten en «texto (url)» para no perder el destino.
    .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export async function sendMail({
  to,
  subject,
  html,
  text,
  replyTo,
  attachments,
}: SendMailOptions): Promise<{ ok: boolean; error?: string }> {
  if (!isEmailConfigured()) {
    return { ok: false, error: EMAIL_NOT_CONFIGURED };
  }

  try {
    await transporter.sendMail({
      from: `"ZRNote" <${process.env.GMAIL_USER}>`,
      to,
      replyTo,
      subject,
      html,
      text: text ?? htmlToPlainText(html),
      attachments,
    });
    return { ok: true };
  } catch (err: any) {
    logger.error('SMTP error', { to, subject, error: err.message });
    return { ok: false, error: err.message };
  }
}
