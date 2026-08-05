import nodemailer from 'nodemailer';
import { logger } from '@/lib/logger';

// Punto único de salida de TODO el correo de la aplicación.
//
// `reminders.ts` tenía su propio `createTransport` en paralelo. Es la misma
// clase de duplicación que ya nos costó un fallo cuando había dos
// constructores de minutas distintos: uno escapaba el HTML y el otro no.
//
// El proveedor está detrás de una interfaz A PROPÓSITO. Hoy sólo hay uno
// (Gmail), y es la única opción gratuita que funciona: Gmail firma con la clave
// DKIM de gmail.com, que es suya. Cualquier ESP de terceros (Brevo, Resend,
// MailerSend) exige un dominio propio verificado — mandar desde una dirección
// @gmail.com a través de ellos provoca fallos SILENCIOSOS hacia destinatarios
// de Gmail desde los requisitos de remitente de 2024.
//
// Cuando haya dominio propio (~10 €/año), añadir Brevo es un `const` más aquí
// abajo y un `case` en `activeProvider()`. Nada más del sistema se entera.

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  /** Alternativa en texto plano. Si no se pasa, se deriva del HTML. */
  text?: string;
  /** A dónde van las respuestas. Sin esto caen en un buzón que nadie lee. */
  replyTo?: string;
  /** Cabeceras extra (List-Unsubscribe, etc.). */
  headers?: Record<string, string>;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
}

export interface MailResult {
  ok: boolean;
  error?: string;
  /** Id del proveedor, para cruzar con sus webhooks. Gmail no da ninguno. */
  providerId?: string;
}

interface MailProvider {
  readonly name: string;
  isConfigured(): boolean;
  /** Qué falta por configurar, en un mensaje que el usuario pueda accionar. */
  readonly missingConfigMessage: string;
  send(message: MailMessage): Promise<MailResult>;
  /** Comprueba credenciales sin enviar nada. */
  verify(): Promise<{ ok: boolean; error?: string }>;
  /** Tope diario del proveedor, para avisar antes de chocar contra él. */
  readonly dailyLimit: number;
}

// --- Proveedor: Gmail SMTP -------------------------------------------------

/**
 * `pool: true` importa más de lo que parece: sin él, nodemailer abre y cierra
 * una conexión TLS por mensaje. En una reunión de 8 participantes eso es un
 * handshake completo ocho veces (~1 s cada uno) que se sumaba al límite de
 * tiempo de la función.
 */
const gmailTransporter = nodemailer.createTransport({
  service: 'gmail',
  pool: true,
  maxConnections: 3,
  maxMessages: 50,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

const gmailProvider: MailProvider = {
  name: 'gmail',

  isConfigured() {
    return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
  },

  missingConfigMessage:
    'El envío de correos no está configurado en el servidor (faltan GMAIL_USER / GMAIL_APP_PASSWORD).',

  // 500/día en una cuenta Gmail gratuita, 2.000 en Workspace. Se puede ajustar
  // con EMAIL_DAILY_LIMIT sin tocar código.
  get dailyLimit() {
    const fromEnv = Number(process.env.EMAIL_DAILY_LIMIT);
    return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : 500;
  },

  async send(message) {
    try {
      const info = await gmailTransporter.sendMail({
        from: `"ZRNote" <${process.env.GMAIL_USER}>`,
        to: message.to,
        replyTo: message.replyTo,
        subject: message.subject,
        html: message.html,
        text: message.text ?? htmlToPlainText(message.html),
        headers: message.headers,
        attachments: message.attachments,
      });
      return { ok: true, providerId: info?.messageId };
    } catch (err: any) {
      logger.error('SMTP error', { to: message.to, subject: message.subject, error: err.message });
      return { ok: false, error: err.message };
    }
  },

  async verify() {
    try {
      await gmailTransporter.verify();
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message || String(err) };
    }
  },
};

/**
 * El proveedor activo. Hoy siempre Gmail; `MAIL_PROVIDER` existe para que el
 * día de mañana el cambio sea una variable de entorno, no un despliegue.
 */
function activeProvider(): MailProvider {
  switch (process.env.MAIL_PROVIDER) {
    case 'gmail':
    default:
      return gmailProvider;
  }
}

/**
 * ¿Está configurado el envío de correo?
 *
 * Esta comprobación estaba repetida en tres sitios (la ruta de reenvío,
 * processing.ts y reminders.ts) con tres mensajes de error distintos, así que
 * el mismo problema se explicaba de tres maneras según por dónde entraras.
 */
export function isEmailConfigured(): boolean {
  return activeProvider().isConfigured();
}

/** El mensaje único para cuando no lo está. */
export const EMAIL_NOT_CONFIGURED = gmailProvider.missingConfigMessage;

/** Tope de envíos diarios del proveedor activo. */
export function dailyEmailLimit(): number {
  return activeProvider().dailyLimit;
}

/**
 * Comprueba las credenciales contra Gmail sin enviar nada.
 *
 * Verifica **el transporte real** que usa la aplicación, no uno creado al
 * vuelo: si el diagnóstico dice «OK» pero el envío falla, el diagnóstico no
 * sirve de nada. `/api/health/email` construía su propio transporter, así que
 * comprobaba una configuración que no era la que luego se usaba.
 */
export async function verifyTransport(): Promise<{ ok: boolean; error?: string }> {
  const provider = activeProvider();
  if (!provider.isConfigured()) return { ok: false, error: provider.missingConfigMessage };
  return provider.verify();
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

/**
 * Cabeceras de baja.
 *
 * Con `url` se anuncia baja de un clic (RFC 8058): el cliente de correo enseña
 * «Cancelar suscripción» junto al remitente y hace un POST a esa URL. Es lo que
 * Gmail y Yahoo premian en la reputación del remitente desde 2024.
 *
 * `List-Unsubscribe-Post` SÓLO se envía si hay URL. Anunciarlo con un `mailto:`
 * sería mentirle al cliente de correo —un mailto no responde a un POST— y eso
 * penaliza más que no ofrecer nada.
 *
 * Sin URL se cae al `mailto:` al organizador, que al menos llega a alguien que
 * puede quitar al participante de la reunión.
 */
export function unsubscribeHeaders(organizerEmail?: string, url?: string): Record<string, string> {
  if (url) {
    return {
      'List-Unsubscribe': `<${url}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    };
  }
  if (organizerEmail) {
    return {
      'List-Unsubscribe': `<mailto:${organizerEmail}?subject=Baja%20de%20las%20minutas%20de%20ZRNote>`,
    };
  }
  return {};
}

export async function sendMail(message: MailMessage): Promise<MailResult> {
  const provider = activeProvider();
  if (!provider.isConfigured()) {
    return { ok: false, error: provider.missingConfigMessage };
  }
  return provider.send(message);
}
