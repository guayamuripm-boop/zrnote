import { createServerSupabase } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { isAdminEmail } from '@/lib/admin';
import { notFound } from 'next/navigation';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

/**
 * Panel oculto de diagnóstico — SOLO para nosotros.
 *
 * No aparece en ningún menú y da 404 a quien no sea admin (ver `isAdminEmail`),
 * así que no existe para el resto del mundo. Sirve para ver, por usuario, qué
 * reunión falló, el mensaje AMABLE que vio la persona y —debajo— el motivo
 * TÉCNICO real que nos dice cómo actuar. El usuario nunca ve esta pantalla ni
 * el detalle técnico; eso es justamente lo que separa lo que ve él de lo que
 * vemos nosotros.
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

export default async function AdminPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  // Puerta: si no eres admin, esta página sencillamente no existe.
  if (!isAdminEmail(user?.email)) notFound();

  const admin = getSupabaseAdmin();

  // `error_detail` llega con la migración 037. Si aún no está aplicada,
  // seleccionarla rompería la consulta entera — así que se intenta con ella y,
  // si falla por columna desconocida, se repite sin ella.
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
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 font-sora">
            Panel de diagnóstico
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Lo que vieron los usuarios y el motivo técnico real. Solo para el equipo.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="text-sm text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition shrink-0"
        >
          ← Volver
        </Link>
      </div>

      {detailColumnMissing && (
        <div className="surface p-4 bg-amber-50/60 dark:bg-amber-900/15 border border-amber-200 dark:border-amber-800/40">
          <p className="text-sm text-amber-800 dark:text-amber-300">
            La migración <code>037_error_detail</code> aún no está aplicada en esta base: por ahora solo se ve
            el mensaje del usuario, no el detalle técnico. Aplícala para ver el motivo real.
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
              <div className="flex items-start justify-between gap-3 flex-wrap">
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
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-slate-50 dark:bg-slate-800/40 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
                    Lo que vio la persona
                  </p>
                  <p className="text-slate-700 dark:text-slate-300 break-words">
                    {m.error_message || '—'}
                  </p>
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
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  {playbook(m.error_detail, m.error_message)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
