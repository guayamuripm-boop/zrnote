import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { verifyMinuteToken } from '@/lib/minute-links';
import { matchItemsToParticipant } from '@/lib/email-service';
import { sortActionItems } from '@/lib/action-items';
import { PriorityBadge } from '@/components/PriorityBadge';
import ZRLogo from '@/components/ZRLogo';

// Vista PÚBLICA de una minuta, para quien la recibió por correo y no tiene
// cuenta. Antes, el botón «Ver en ZRNote» llevaba a /dashboard/meetings/{id},
// que filtra por `created_by`: el participante veía un login y luego un 404.
//
// Nunca se cachea: el acceso depende de un token que puede caducar.
export const dynamic = 'force-dynamic';

// Que un buscador no indexe minutas de reuniones ajenas.
export const metadata = {
  title: 'Minuta — ZRNote',
  robots: { index: false, follow: false, nocache: true },
};

function Aviso({ titulo, detalle }: { titulo: string; detalle: string }) {
  return (
    <main className="min-h-screen gradient-mesh flex items-center justify-center p-4">
      <div className="glass-strong rounded-3xl p-8 sm:p-10 max-w-md w-full text-center shadow-float">
        <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">{titulo}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{detalle}</p>
      </div>
    </main>
  );
}

export default async function MinutaPublicaPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const verified = verifyMinuteToken(token);

  if (!verified.ok) {
    if (verified.reason === 'caducado') {
      return (
        <Aviso
          titulo="Este enlace ha caducado"
          detalle="Los enlaces a las minutas caducan por seguridad. Pídele a quien convocó la reunión que te la reenvíe."
        />
      );
    }
    return (
      <Aviso
        titulo="Enlace no válido"
        detalle="Puede que esté incompleto: algunos clientes de correo cortan los enlaces largos. Prueba a copiarlo entero desde el correo original."
      />
    );
  }

  const { meetingId, email } = verified.payload;

  // El token ya demuestra el derecho a leer esta reunión, así que se consulta
  // con el cliente admin: RLS está pensado para sesiones, y aquí no hay ninguna.
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY!,
  );

  // Se pide SÓLO lo que puede verse en público. En particular NO se pide
  // `transcript_raw`: la transcripción literal de una reunión es mucho más
  // sensible que su acta, y el correo nunca prometió darla.
  const [meetingResult, minuteResult, itemsResult, participantResult] = await Promise.all([
    admin.from('meetings').select('id, title, coordination, created_at, status').eq('id', meetingId).maybeSingle(),
    admin.from('minutes').select('*').eq('meeting_id', meetingId).maybeSingle(),
    admin.from('action_items').select('*').eq('meeting_id', meetingId),
    admin.from('meeting_participants').select('name, email_override').eq('meeting_id', meetingId),
  ]);

  const meeting = meetingResult.data;
  if (!meeting) {
    return (
      <Aviso
        titulo="Esta reunión ya no existe"
        detalle="Puede que se haya borrado, o que haya vencido el plazo de conservación de datos."
      />
    );
  }

  const minute = minuteResult.data;
  const allItems = sortActionItems(itemsResult.data || []);

  // Nombre del destinatario según los participantes, para saludarle y para
  // saber qué compromisos son suyos.
  const me = (participantResult.data || []).find(
    (p: any) => (p.email_override || '').toLowerCase().trim() === email,
  );
  const myName = me?.name || email.split('@')[0];
  const myItems = matchItemsToParticipant(allItems, myName, email);
  const otherItems = allItems.filter((i: any) => !myItems.includes(i));

  const fecha = new Date(meeting.created_at).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <main className="min-h-screen gradient-mesh">
      <header className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200/50 dark:border-slate-700/50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <ZRLogo className="w-8 h-8 rounded-lg shadow" />
            <span className="font-bold text-slate-900 dark:text-slate-100">ZRNote</span>
          </Link>
          <span className="text-xs text-slate-400 dark:text-slate-500">Minuta compartida</span>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="glass-strong rounded-2xl p-5 sm:p-6 shadow-elevated">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">{meeting.title}</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            {meeting.coordination && `${meeting.coordination} · `}
            {fecha}
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-3">
            Hola {myName}, esta es la minuta que se te envió por correo.
          </p>
        </div>

        {!minute && (
          <div className="glass-strong rounded-2xl p-8 text-center">
            <p className="text-slate-500 dark:text-slate-400">
              Esta reunión todavía no tiene minuta generada.
            </p>
          </div>
        )}

        {myItems.length > 0 && (
          <section className="glass-strong rounded-2xl p-5 sm:p-6 shadow-elevated ring-1 ring-emerald-200/60 dark:ring-emerald-800/40">
            <h2 className="text-lg font-semibold text-emerald-800 dark:text-emerald-300 mb-4">
              Tus compromisos
              <span className="ml-2 text-sm font-normal text-slate-400">({myItems.length})</span>
            </h2>
            <div className="space-y-3">
              {myItems.map((item: any) => (
                <div key={item.id} className="glass rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium text-slate-900 dark:text-slate-100">{item.description}</p>
                    <PriorityBadge priority={item.priority} />
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                    {item.due_date
                      ? `Vence ${new Date(`${item.due_date}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}`
                      : 'Fecha por definir'}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {minute?.summary && (
          <section className="glass-strong rounded-2xl p-5 sm:p-6 shadow-elevated">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3">Resumen</h2>
            <p className="text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
              {minute.summary}
            </p>
          </section>
        )}

        {Array.isArray(minute?.decisions) && minute.decisions.length > 0 && (
          <section className="glass-strong rounded-2xl p-5 sm:p-6 shadow-elevated">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3">Decisiones</h2>
            <ul className="space-y-2">
              {(minute.decisions as any[]).map((d, i) => (
                <li key={i} className="text-sm text-slate-700 dark:text-slate-200 pl-4 relative before:content-['·'] before:absolute before:left-0 before:text-slate-300">
                  {typeof d === 'string' ? d : `${d.decision ?? ''}${d.context ? ` (${d.context})` : ''}`}
                </li>
              ))}
            </ul>
          </section>
        )}

        {otherItems.length > 0 && (
          <section className="glass-strong rounded-2xl p-5 sm:p-6 shadow-elevated">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3">
              Otros compromisos de la reunión
            </h2>
            <ul className="space-y-2">
              {otherItems.map((item: any) => (
                <li key={item.id} className="text-sm text-slate-600 dark:text-slate-300">
                  <span className="text-slate-400 dark:text-slate-500">
                    {item.assignee_name || 'Sin asignar'}:
                  </span>{' '}
                  {item.description}
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="text-center space-y-3 pt-4">
          <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed max-w-lg mx-auto">
            Minuta generada automáticamente con inteligencia artificial a partir del audio de la reunión.
            <br />
            <strong>Puede contener errores u omisiones</strong>: revísala antes de tomar decisiones.
          </p>
          <div className="flex items-center justify-center gap-3 text-[11px]">
            <Link href="/signup" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
              Crea tu cuenta gratis
            </Link>
            <span className="text-slate-300 dark:text-slate-600">·</span>
            <Link href="/legal/privacidad" className="text-slate-400 dark:text-slate-500 hover:text-blue-600">
              Privacidad
            </Link>
            <span className="text-slate-300 dark:text-slate-600">·</span>
            <Link href={`/baja/${token}`} className="text-slate-400 dark:text-slate-500 hover:text-rose-500">
              No quiero recibir más correos
            </Link>
          </div>
        </footer>
      </div>
    </main>
  );
}
