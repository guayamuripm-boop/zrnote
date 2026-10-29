import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { PANEL_COOKIE, isValidPanelCookie, panelPasswordConfigured } from '@/lib/panel-auth';

export const dynamic = 'force-dynamic';

/**
 * Panel oculto de diagnóstico — SOLO para el equipo.
 *
 * Es público a nivel de ruta (no cuelga de /dashboard, así que no pide iniciar
 * sesión) pero está escondido y protegido por contraseña (ver `panel-auth`).
 * Sin cookie válida muestra solo un formulario de clave; con ella, la lista de
 * reuniones fallidas con el motivo técnico que el usuario nunca ve.
 */

interface FailedMeeting {
  id: string;
  title: string | null;
  status: string;
  created_at: string | null;
  ended_at: string | null;
  error_message: string | null;
  error_detail?: string | null;
  created_by: string | null;
}

/** Qué hacer ante cada tipo de fallo, deducido del motivo técnico. */
function playbook(detail: string | null | undefined, friendly: string | null | undefined): string {
  const t = `${detail || ''} ${friendly || ''}`.toLowerCase();
  if (/429|rate.?limit|quota|resource_exhausted|limit:\s*0|too many|tokens per|ocupado/.test(t)) {
    return 'Límite del proveedor (Groq/Gemini). Suele resolverse solo al reintentar en unos minutos. Si pasa mucho, toca repartir carga o subir de plan.';
  }
  if (/sin_voz|no se detect|voz audible|no contiene/.test(t)) {
    return 'El audio no tenía voz audible (micrófono lejos, silenciado o apagado). No es un fallo nuestro: avísale de revisar el micrófono. Reintentar no cambia nada.';
  }
  if (/formato|adts|aac|container|file must be/.test(t)) {
    return 'Formato de audio que el transcriptor no acepta. Que vuelva a subir el archivo (la app lo convierte ahora). Si persiste, revisar la conversión.';
  }
  if (/413|too large|request too large/.test(t)) {
    return 'La reunión es muy larga para una sola llamada. El pipeline recorta y reintenta; si falla repetido, revisar el troceo.';
  }
  if (/408|502|503|504|network|timeout|fetch failed|econn|gateway|socket/.test(t)) {
    return 'Corte de red o timeout de la función. Reintentar; el trabajo es idempotente y retoma donde quedó.';
  }
  if (/api[_ ]?key|no configurada|unauthorized|401|403/.test(t)) {
    return '⚠️ Falta o caducó una clave de API en el servidor. Revisar las variables de entorno en Vercel — esto NO lo arregla el usuario.';
  }
  return 'Sin patrón claro. Revisar el motivo técnico y los logs de Vercel de esa hora.';
}

function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-VE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function PasswordForm({ error }: { error?: string }) {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <form
        method="post"
        action="/api/panel/login"
        className="w-full max-w-sm surface p-6 space-y-4"
      >
        <div className="text-center space-y-1">
          <p className="text-3xl">🔒</p>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100 font-sora">Panel privado</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Escribe la contraseña para continuar.</p>
        </div>
        <input
          type="password"
          name="password"
          autoFocus
          autoComplete="current-password"
          className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
          placeholder="Contraseña"
        />
        {error === '1' && (
          <p className="text-sm text-rose-600 dark:text-rose-400">Contraseña incorrecta.</p>
        )}
        {error === 'rate' && (
          <p className="text-sm text-rose-600 dark:text-rose-400">Demasiados intentos. Espera un minuto.</p>
        )}
        <button
          type="submit"
          className="w-full gradient-primary text-white rounded-xl py-2.5 text-sm font-medium hover:shadow-lg hover:shadow-blue-500/25 transition"
        >
          Entrar
        </button>
      </form>
    </div>
  );
}

export default async function PanelPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  // Fallo cerrado: sin contraseña configurada, el panel no existe para nadie.
  if (!panelPasswordConfigured()) notFound();

  const { error } = await searchParams;
  const cookieStore = await cookies();
  const token = cookieStore.get(PANEL_COOKIE)?.value;

  if (!isValidPanelCookie(token)) {
    return <PasswordForm error={error} />;
  }

  const admin = getSupabaseAdmin();

  // `error_detail` llega con la migración 037. Si aún no está aplicada,
  // seleccionarla rompería la consulta — se intenta con ella y, si falla por
  // columna desconocida, se repite sin ella.
  const columnsWithDetail = 'id, title, status, created_at, ended_at, error_message, error_detail, created_by';
  const columnsNoDetail = 'id, title, status, created_at, ended_at, error_message, created_by';

  let failed: FailedMeeting[] = [];
  let detailColumnMissing = false;
  {
    const q = await admin
      .from('meetings')
      .select(columnsWithDetail)
      .eq('status', 'failed')
      .order('ended_at', { ascending: false, nullsFirst: false })
      .limit(100);
    if (q.error && /error_detail/.test(q.error.message || '')) {
      detailColumnMissing = true;
      const q2 = await admin
        .from('meetings')
        .select(columnsNoDetail)
        .eq('status', 'failed')
        .order('ended_at', { ascending: false, nullsFirst: false })
        .limit(100);
      failed = (q2.data as FailedMeeting[]) || [];
    } else {
      failed = (q.data as FailedMeeting[]) || [];
    }
  }

  // Correo de cada usuario afectado, para saber "a quién le está pasando".
  const ids = Array.from(new Set(failed.map((f) => f.created_by).filter(Boolean))) as string[];
  const emailById = new Map<string, string>();
  if (ids.length > 0) {
    const { data: users } = await admin.from('users').select('id, email, full_name').in('id', ids);
    for (const u of users || []) {
      emailById.set(u.id, u.email || u.full_name || u.id);
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 font-sora">
            Panel de diagnóstico
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Lo que vieron los usuarios y el motivo técnico real. Solo para el equipo.
          </p>
        </div>
      </div>

      {detailColumnMissing && (
        <div className="surface p-4 bg-amber-50/60 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-800/40">
          <p className="text-sm text-amber-800 dark:text-amber-300">
            La migración <code>037_error_detail</code> aún no está aplicada: por ahora solo se ve el mensaje del
            usuario, no el detalle técnico.
          </p>
        </div>
      )}

      {failed.length === 0 ? (
        <div className="surface p-8 text-center">
          <p className="text-3xl mb-2">✅</p>
          <p className="text-slate-600 dark:text-slate-300">Ninguna reunión fallida. Todo en orden.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-slate-400 dark:text-slate-500">
            {failed.length} reunión{failed.length !== 1 ? 'es' : ''} fallida{failed.length !== 1 ? 's' : ''} (últimas 100)
          </p>
          {failed.map((m) => (
            <div key={m.id} className="surface p-4 space-y-3">
              <div className="min-w-0">
                <Link
                  href={`/dashboard/meetings/${m.id}`}
                  className="font-medium text-slate-900 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 transition break-words"
                >
                  {m.title || 'Reunión sin título'}
                </Link>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {emailById.get(m.created_by || '') || m.created_by || 'usuario desconocido'} · {timeAgo(m.ended_at || m.created_at)}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-slate-50 dark:bg-slate-800/40 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
                    Lo que vio la persona
                  </p>
                  <p className="text-slate-700 dark:text-slate-300 break-words">{m.error_message || '—'}</p>
                </div>
                <div className="rounded-lg bg-rose-50/60 dark:bg-rose-900/15 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-400 dark:text-rose-500 mb-1">
                    Motivo técnico (solo nosotros)
                  </p>
                  <p className="text-rose-700 dark:text-rose-300 break-words font-mono text-xs leading-relaxed">
                    {m.error_detail || (detailColumnMissing ? 'columna pendiente' : 'sin detalle (revisar logs de Vercel)')}
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-blue-100 dark:border-blue-900/30 bg-blue-50/40 dark:bg-blue-900/10 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-500 dark:text-blue-400 mb-1">
                  Qué hacer
                </p>
                <p className="text-sm text-slate-700 dark:text-slate-300">{playbook(m.error_detail, m.error_message)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
