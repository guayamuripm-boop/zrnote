import { notFound } from 'next/navigation';
import Link from 'next/link';
import DashboardNav from '@/components/DashboardNav';
import MobileNav from '@/components/MobileNav';
import DashboardHomeView from '@/components/dashboard/DashboardHomeView';
import SettingsView from '@/components/dashboard/SettingsView';
import MeetingRow from '@/components/dashboard/MeetingRow';
import TagPill from '@/components/TagPill';

/**
 * Vista previa de las pantallas internas con datos de ejemplo, SÓLO en
 * desarrollo (`npm run dev`). Sirve para revisar el diseño en móvil, tablet y
 * escritorio sin iniciar sesión ni tocar datos reales.
 *
 * En cualquier despliegue —producción y también los previews de Vercel, que
 * corren con NODE_ENV=production— responde 404.
 *
 *   /dev/preview?screen=home | home-new | meetings | settings
 */

export const dynamic = 'force-dynamic';

const NOW = new Date(2026, 9, 22, 10, 0);
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

const MEETINGS = [
  { id: 'm1', title: 'Comité de dirección — presupuesto Q4', status: 'completed', created_at: daysAgo(0), coordination: 'Dirección Académica' },
  { id: 'm2', title: 'Clase de Física: ley de Ohm y circuitos en serie', status: 'processing', created_at: daysAgo(1), coordination: null },
  { id: 'm3', title: 'Seguimiento semanal del equipo de producto con nombre larguísimo para probar el recorte', status: 'completed', created_at: daysAgo(3), coordination: 'Producto' },
  { id: 'm4', title: 'Entrevista con proveedor', status: 'failed', created_at: daysAgo(9), coordination: null },
  { id: 'm5', title: 'Podcast episodio 12', status: 'scheduled', created_at: daysAgo(40), coordination: 'Contenido' },
];

const TASKS = [
  { id: 't1', description: 'Enviar el borrador del presupuesto a finanzas', priority: 'alta', due_date: '2026-10-24', mine: true },
  { id: 't2', description: 'Reservar la sala para la revisión trimestral', priority: 'media', mine: false, assignee_name: 'Ana' },
  { id: 't3', description: 'Revisar el contrato del proveedor', priority: 'baja', due_date: '2026-11-02', mine: false, assignee_name: null },
];

export default async function DevPreview({
  searchParams,
}: {
  searchParams: Promise<{ screen?: string }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();

  const { screen = 'home' } = await searchParams;

  let body: React.ReactNode;
  if (screen === 'settings') {
    body = <SettingsView email="pedro.mejias@ejemplo.com" createdAt={daysAgo(80)} contentModeEnabled={false} />;
  } else if (screen === 'meetings') {
    body = (
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">Reuniones</h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">{MEETINGS.length} reuniones</p>
          </div>
        </div>
        <div className="space-y-2.5">
          {MEETINGS.map((m, i) => (
            <MeetingRow
              key={m.id}
              meeting={m}
              now={NOW}
              meta={
                i === 0 ? (
                  <>
                    <TagPill tag={{ id: 'a', name: 'Finanzas', color: '#2563eb' }} />
                    <TagPill tag={{ id: 'b', name: 'Urgente', color: '#e11d48' }} />
                    <span className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full whitespace-nowrap">⏳ sin guardar</span>
                  </>
                ) : undefined
              }
            />
          ))}
        </div>
      </div>
    );
  } else {
    const isNew = screen === 'home-new';
    body = (
      <DashboardHomeView
        name="pedro.mejias"
        totalMeetings={isNew ? 0 : 23}
        pendingCount={isNew ? 0 : 7}
        completedCount={isNew ? 0 : 19}
        processingCount={isNew ? 0 : 1}
        meetings={isNew ? [] : MEETINGS}
        tasks={isNew ? [] : TASKS}
        now={NOW}
      />
    );
  }

  return (
    <div className="min-h-screen gradient-mesh">
      <DashboardNav userInitial="P" version="dev" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 flex flex-wrap gap-2 text-xs">
        {['home', 'home-new', 'meetings', 'settings'].map((s) => (
          <Link
            key={s}
            href={`/dev/preview?screen=${s}`}
            className={`px-2.5 py-1 rounded-full border ${s === screen ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-300 text-slate-600 dark:text-slate-300'}`}
          >
            {s}
          </Link>
        ))}
      </div>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">{body}</main>
      <div className="pb-mobile-nav" />
      <MobileNav userInitial="P" />
    </div>
  );
}
