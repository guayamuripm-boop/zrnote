import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthedUser } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * End-to-end readiness check for every external service ZRNote depends on.
 *
 * Exists because the failures that actually break this app are invisible in the
 * code: a revoked API key, a model id that the provider retired, a missing
 * storage bucket. Those only show up when a real meeting fails to process.
 *
 * Requires a logged-in user: it reveals which providers are configured.
 * Never returns key material — only whether things work.
 */

interface Check {
  id: string;
  label: string;
  status: 'ok' | 'warn' | 'error';
  detail: string;
  /** true when the app cannot record→minute without this. */
  critical: boolean;
}

const timeout = (ms: number) => AbortSignal.timeout(ms);

async function checkGroq(): Promise<Check[]> {
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    return [{
      id: 'groq', label: 'Groq (transcripción)', status: 'error', critical: true,
      detail: 'Falta GROQ_API_KEY. Sin esto no se puede transcribir nada.',
    }];
  }

  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
      signal: timeout(10000),
    });

    if (!res.ok) {
      const body = await res.text();
      return [{
        id: 'groq', label: 'Groq (transcripción)', status: 'error', critical: true,
        detail: res.status === 401
          ? 'La clave de Groq fue rechazada. Genera una nueva en console.groq.com.'
          : `Groq respondió ${res.status}: ${body.slice(0, 120)}`,
      }];
    }

    const data = await res.json();
    const ids: string[] = (data.data || []).map((m: any) => m.id);

    const checks: Check[] = [{
      id: 'groq', label: 'Groq (conexión)', status: 'ok', critical: true,
      detail: `Clave válida · ${ids.length} modelos disponibles`,
    }];

    // The exact model ids the pipeline hardcodes. If a provider retires one,
    // transcription or the minute silently starts failing in production.
    const whisper = 'whisper-large-v3';
    checks.push({
      id: 'groq-whisper', label: 'Modelo de transcripción', status: ids.includes(whisper) ? 'ok' : 'error',
      critical: true,
      detail: ids.includes(whisper)
        ? `${whisper} disponible`
        : `${whisper} YA NO EXISTE. Disponibles: ${ids.filter((i) => i.includes('whisper')).join(', ') || 'ninguno'}`,
    });

    const llama = 'llama-3.3-70b-versatile';
    const hasGemini = !!process.env.GEMINI_API_KEY;
    checks.push({
      id: 'groq-llm', label: 'Modelo de minuta (respaldo)', status: ids.includes(llama) ? 'ok' : (hasGemini ? 'warn' : 'error'),
      critical: !hasGemini,
      detail: ids.includes(llama)
        ? `${llama} disponible`
        : `${llama} ya no existe.${hasGemini ? ' Se usa Gemini, así que no es urgente.' : ' SIN respaldo: no se generarán minutas.'}`,
    });

    return checks;
  } catch (err: any) {
    return [{
      id: 'groq', label: 'Groq (transcripción)', status: 'error', critical: true,
      detail: `No se pudo conectar: ${err?.message || 'error de red'}`,
    }];
  }
}

async function checkGemini(): Promise<Check> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return {
      id: 'gemini', label: 'Gemini (minuta)', status: 'warn', critical: false,
      detail: 'No configurado. Se usa Groq/Llama, que recorta reuniones de más de ~40 min.',
    };
  }

  try {
    // A real generation call, exactly as processing.ts makes it — a models list
    // would not catch a model that exists but rejects our request shape.
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemini-2.0-flash',
        messages: [{ role: 'user', content: 'Responde solo: {"ok":true}' }],
        max_tokens: 20,
        response_format: { type: 'json_object' },
      }),
      signal: timeout(15000),
    });

    if (!res.ok) {
      const body = await res.text();
      return {
        id: 'gemini', label: 'Gemini (minuta)', status: 'error', critical: false,
        detail: `Rechazado (${res.status}): ${body.slice(0, 140)}. Se usará Groq como respaldo.`,
      };
    }
    return {
      id: 'gemini', label: 'Gemini (minuta)', status: 'ok', critical: false,
      detail: 'gemini-2.0-flash responde correctamente',
    };
  } catch (err: any) {
    return {
      id: 'gemini', label: 'Gemini (minuta)', status: 'error', critical: false,
      detail: `No se pudo conectar: ${err?.message || 'error de red'}`,
    };
  }
}

async function checkStorage(): Promise<Check> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) {
    return {
      id: 'storage', label: 'Almacenamiento de audio', status: 'error', critical: true,
      detail: 'Faltan las credenciales de servicio de Supabase.',
    };
  }

  try {
    const admin = createClient(url, serviceKey);
    const { data, error } = await admin.storage.listBuckets();
    if (error) throw new Error(error.message);

    const bucket = (data || []).find((b) => b.name === 'meeting-audio');
    if (!bucket) {
      return {
        id: 'storage', label: 'Almacenamiento de audio', status: 'error', critical: true,
        detail: 'No existe el bucket "meeting-audio". Ninguna grabación se puede guardar.',
      };
    }
    return {
      id: 'storage', label: 'Almacenamiento de audio', status: bucket.public ? 'warn' : 'ok', critical: true,
      detail: bucket.public
        ? 'El bucket "meeting-audio" es PÚBLICO: cualquiera con la URL puede oír las grabaciones.'
        : 'Bucket "meeting-audio" listo y privado',
    };
  } catch (err: any) {
    return {
      id: 'storage', label: 'Almacenamiento de audio', status: 'error', critical: true,
      detail: `No se pudo consultar: ${err?.message}`,
    };
  }
}

async function checkDatabase(): Promise<Check> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) {
    return { id: 'db', label: 'Base de datos', status: 'error', critical: true, detail: 'Faltan credenciales.' };
  }

  try {
    const admin = createClient(url, serviceKey);
    // `error_message` and `recording_consent_at` only exist after migration 020.
    // Selecting them is the cheapest way to prove the migration ran.
    const { error } = await admin
      .from('meetings')
      .select('id, error_message, recording_consent_at')
      .limit(1);

    if (error) {
      return {
        id: 'db', label: 'Base de datos', status: 'error', critical: true,
        detail: `Falta la migración 020: ${error.message}`,
      };
    }

    const { error: legalError } = await admin.from('legal_documents').select('doc_type').limit(1);
    if (legalError) {
      return {
        id: 'db', label: 'Base de datos', status: 'warn', critical: false,
        detail: 'Esquema al día, pero faltan los documentos legales (migración 020).',
      };
    }

    return { id: 'db', label: 'Base de datos', status: 'ok', critical: true, detail: 'Esquema y textos legales al día (migración 020)' };
  } catch (err: any) {
    return { id: 'db', label: 'Base de datos', status: 'error', critical: true, detail: err?.message };
  }
}

async function checkEmail(): Promise<Check> {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return {
      id: 'email', label: 'Envío de correos', status: 'warn', critical: false,
      detail: 'No configurado. Las minutas se generan pero nadie las recibe por correo.',
    };
  }
  try {
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.default.createTransport({
      service: 'gmail',
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    });
    await transporter.verify();
    return { id: 'email', label: 'Envío de correos', status: 'ok', critical: false, detail: 'Gmail acepta las credenciales' };
  } catch (err: any) {
    return {
      id: 'email', label: 'Envío de correos', status: 'error', critical: false,
      detail: `Gmail rechazó las credenciales: ${err?.message?.slice(0, 120)}. Suele ser una contraseña de aplicación caducada.`,
    };
  }
}

function checkCron(): Check {
  return process.env.CRON_SECRET
    ? { id: 'cron', label: 'Tareas programadas', status: 'ok', critical: false, detail: 'CRON_SECRET configurado (limpieza y recordatorios activos)' }
    : {
        id: 'cron', label: 'Tareas programadas', status: 'warn', critical: false,
        detail: 'Falta CRON_SECRET: no se borra el audio viejo ni se envían recordatorios.',
      };
}

export async function GET(request: Request) {
  const auth = await getAuthedUser(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [groq, gemini, storage, db, email] = await Promise.all([
    checkGroq(),
    checkGemini(),
    checkStorage(),
    checkDatabase(),
    checkEmail(),
  ]);

  const checks: Check[] = [...groq, gemini, storage, db, email, checkCron()];

  const blocking = checks.filter((c) => c.critical && c.status === 'error');
  const warnings = checks.filter((c) => c.status === 'warn' || (!c.critical && c.status === 'error'));

  return NextResponse.json({
    ready: blocking.length === 0,
    summary: blocking.length > 0
      ? `${blocking.length} problema(s) impiden que la app funcione`
      : warnings.length > 0
        ? `Funciona, con ${warnings.length} aviso(s)`
        : 'Todo en orden',
    checks,
    checkedAt: new Date().toISOString(),
  });
}
