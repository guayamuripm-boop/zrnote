import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';
import DeleteAccountSection from '@/components/DeleteAccountSection';
import InstallAppButton from '@/components/InstallAppButton';
import NotificationToggle from '@/components/NotificationToggle';
import ContentModeToggle from '@/components/ContentModeToggle';
import SignOutButton from '@/components/SignOutButton';

export interface SettingsData {
  email: string;
  createdAt?: string | null;
  contentModeEnabled: boolean;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-1 mb-2">
      {children}
    </h2>
  );
}

/** Tarjeta-enlace con icono: misma forma que los interruptores. */
function LinkTile({
  href,
  title,
  text,
  tone,
  icon,
  external,
}: {
  href: string;
  title: string;
  text: string;
  tone: string;
  icon: string;
  external?: boolean;
}) {
  const inner = (
    <>
      <span className={`w-10 h-10 rounded-xl bg-gradient-to-br ${tone} flex items-center justify-center shrink-0`}>
        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={1.9} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
        </svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-slate-900 dark:text-slate-100">{title}</span>
        <span className="block text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{text}</span>
      </span>
      <svg className="w-4 h-4 text-slate-300 dark:text-slate-600 shrink-0 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </>
  );
  const cls = 'group surface p-4 flex items-center gap-3 hover:-translate-y-0.5 hover:shadow-lg transition-all';
  return external ? (
    <a href={href} className={cls}>{inner}</a>
  ) : (
    <Link href={href} className={cls}>{inner}</Link>
  );
}

/**
 * Ajustes (ruta /dashboard/profile). Antes era «Mi Perfil»: una sola columna
 * larga donde el tema era un botón suelto sin etiqueta y todo lo demás iba
 * mezclado. Ahora agrupado, con lo que se toca a menudo arriba («Esenciales»)
 * y lo que casi nunca (datos, legal, cuenta) abajo; en pantallas anchas, en
 * dos columnas en vez de una tira estrecha centrada.
 */
export default function SettingsView({ email, createdAt, contentModeEnabled }: SettingsData) {
  const initial = email.charAt(0).toUpperCase() || '?';
  const since = createdAt
    ? new Date(createdAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  return (
    <div className="max-w-4xl mx-auto space-y-6 sm:space-y-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">Ajustes</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Tu cuenta, la app y tus datos, en un sitio.</p>
      </div>

      {/* Tarjeta de cuenta */}
      <section className="relative overflow-hidden rounded-[1.75rem] aurora text-white p-5 sm:p-6 shadow-xl shadow-indigo-900/20">
        <div aria-hidden className="pointer-events-none absolute -top-16 -right-10 w-56 h-56 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex items-center gap-4">
          <span className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-2xl font-bold shrink-0">
            {initial}
          </span>
          <div className="min-w-0">
            <p className="text-base sm:text-lg font-semibold truncate">{email}</p>
            {since && <p className="text-sm text-white/75">Miembro desde {since}</p>}
          </div>
        </div>
      </section>

      {/* Esenciales: lo que se cambia de verdad */}
      <section>
        <SectionTitle>Esenciales</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="surface p-4 flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 dark:from-amber-400 dark:to-orange-500 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={1.9} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
              </svg>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-slate-900 dark:text-slate-100">Apariencia</span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">Modo claro u oscuro</span>
            </span>
            <ThemeToggle />
          </div>
          <NotificationToggle />
          <InstallAppButton variant="section" />
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
        <section>
          <SectionTitle>Tus actas</SectionTitle>
          <ContentModeToggle initialEnabled={contentModeEnabled} />
        </section>

        <section>
          <SectionTitle>Ayuda</SectionTitle>
          <div className="space-y-3">
            <LinkTile
              href="/dashboard/ayuda"
              title="Cómo usar ZR Note"
              text="Dónde está cada cosa y para qué sirve, en corto."
              tone="from-blue-500 to-indigo-500"
              icon="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
            <LinkTile
              href="/dashboard/diagnostico"
              title="Diagnóstico del sistema"
              text="Comprueba transcripción, IA, almacenamiento, correo y avisos."
              tone="from-emerald-500 to-teal-500"
              icon="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
            />
          </div>
        </section>

        {/* Data rights. `/api/user/export` existed since day one but had no UI,
            so nobody could actually exercise the right to portability. */}
        <section>
          <SectionTitle>Tus datos</SectionTitle>
          <LinkTile
            href="/api/user/export"
            external
            title="Descargar todos mis datos"
            text="Un archivo con tus reuniones, minutas y compromisos."
            tone="from-violet-500 to-fuchsia-500"
            icon="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
          />
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 px-1 leading-relaxed">
            El audio se borra a los 7 días. Una reunión sin guardar se elimina a los 30 días de
            creada: pulsa «Guardar» en la reunión para conservarla.
          </p>
        </section>

        <section>
          <SectionTitle>Legal</SectionTitle>
          <div className="surface p-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
            <Link href="/legal/consentimiento" className="text-blue-600 dark:text-blue-400 hover:underline underline-offset-4">
              Consentimiento de grabación
            </Link>
            <Link href="/legal/terminos" className="text-blue-600 dark:text-blue-400 hover:underline underline-offset-4">
              Condiciones de uso
            </Link>
            <Link href="/legal/privacidad" className="text-blue-600 dark:text-blue-400 hover:underline underline-offset-4">
              Aviso de privacidad
            </Link>
          </div>
        </section>
      </div>

      {/* Cuenta: al final y aparte, para que nadie la toque sin querer. */}
      <section>
        <SectionTitle>Cuenta</SectionTitle>
        <div className="surface p-4 sm:p-5 space-y-4">
          {/* SignOutButton, NO un <form> simple: borra antes la caché de minutas
              sin conexión, para que no quede en un dispositivo compartido. */}
          <SignOutButton
            label="Cerrar sesión"
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-rose-200 dark:border-rose-800/50 text-rose-600 dark:text-rose-400 font-medium hover:bg-rose-50 dark:hover:bg-rose-900/20 transition"
          />
          <DeleteAccountSection />
        </div>
      </section>
    </div>
  );
}
