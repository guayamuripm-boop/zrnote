import { createServerSupabase } from '@/lib/supabase/server';
import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';
import DeleteAccountSection from '@/components/DeleteAccountSection';

export default async function ProfilePage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition mb-4">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Volver
        </Link>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">Mi Perfil</h1>
      </div>

      <div className="glass-strong rounded-2xl p-6 sm:p-8 shadow-elevated space-y-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 gradient-primary rounded-2xl flex items-center justify-center shadow-lg">
            <span className="text-white text-2xl font-bold">{user?.email?.charAt(0).toUpperCase() || '?'}</span>
          </div>
          <div className="min-w-0">
            <p className="text-lg font-semibold text-slate-900 dark:text-slate-100 truncate">{user?.email}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Miembro desde{' '}
              {user?.created_at
                ? new Date(user.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
                : '—'}
            </p>
          </div>
        </div>

        <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
          <ThemeToggle />
        </div>

        {/* Data rights. `/api/user/export` existed since day one but had no UI,
            so nobody could actually exercise the right to portability. */}
        <div className="border-t border-slate-200 dark:border-slate-700 pt-4 space-y-3">
          <h2 className="text-sm font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">
            Tus datos
          </h2>
          <a
            href="/api/user/export"
            className="block w-full text-center glass border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 py-3 rounded-xl font-medium hover:bg-white/80 dark:hover:bg-white/5 transition-all"
          >
            Descargar todos mis datos
          </a>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Archivo JSON con tus reuniones, minutas y compromisos. El audio se borra
            automáticamente a los 30 días.
          </p>
        </div>

        <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
          <Link
            href="/dashboard/diagnostico"
            className="block w-full text-center glass border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 py-3 rounded-xl font-medium hover:bg-white/80 dark:hover:bg-white/5 transition-all"
          >
            Diagnóstico del sistema
          </Link>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
            Comprueba que la transcripción, la IA, el almacenamiento y los correos funcionan.
          </p>
        </div>

        <div className="border-t border-slate-200 dark:border-slate-700 pt-4 space-y-2">
          <h2 className="text-sm font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">
            Legal
          </h2>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <Link href="/legal/consentimiento" className="text-blue-600 dark:text-blue-400 hover:underline">
              Consentimiento de grabación
            </Link>
            <Link href="/legal/terminos" className="text-blue-600 dark:text-blue-400 hover:underline">
              Condiciones de uso
            </Link>
            <Link href="/legal/privacidad" className="text-blue-600 dark:text-blue-400 hover:underline">
              Aviso de privacidad
            </Link>
          </div>
        </div>

        <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
          <form action="/api/auth/signout" method="post">
            <button
              type="submit"
              className="w-full glass border border-rose-200/50 dark:border-rose-800/40 text-rose-600 dark:text-rose-400 py-3 rounded-xl font-medium hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-all"
            >
              Cerrar sesión
            </button>
          </form>
        </div>

        <DeleteAccountSection />
      </div>
    </div>
  );
}
