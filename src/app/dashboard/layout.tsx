import Link from 'next/link';
import ZRLogo from '@/components/ZRLogo';
import { createServerSupabase } from '@/lib/supabase/server';
import ThemeToggle from '@/components/ThemeToggle';
import InstallAppButton from '@/components/InstallAppButton';
import { VersionLogger } from '@/components/VersionLogger';
import { VERSION, COMMIT_SHA } from '@/lib/version';
import TermsGate from '@/components/legal/TermsGate';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen gradient-mesh">
      <VersionLogger version={`ZRNote v${VERSION}`} commitSha={COMMIT_SHA} />
      <TermsGate />
      {/* Desktop Nav */}
      <nav className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl sticky top-0 z-50 border-b border-slate-200/50 dark:border-slate-700/50 hidden sm:block">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/dashboard" className="flex items-center gap-2.5">
              <ZRLogo className="w-9 h-9 rounded-xl shadow-lg" />
              <span className="text-slate-900 dark:text-slate-100 font-bold text-lg tracking-tight hidden sm:block">
                ZRNote
              </span>
              <span className="hidden sm:inline-flex ml-1.5 px-1.5 py-0.5 text-[10px] font-mono font-medium text-blue-500 bg-blue-50 dark:bg-blue-950/50 rounded-md border border-blue-200 dark:border-blue-800">
                v{VERSION}
              </span>
            </Link>

            <div className="flex items-center gap-1">
              <Link href="/dashboard" className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-white/60 dark:hover:bg-white/5 transition-all">
                Inicio
              </Link>
              <Link href="/dashboard/meetings" className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-white/60 dark:hover:bg-white/5 transition-all">
                Reuniones
              </Link>
              <Link href="/dashboard/action-items" className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-white/60 dark:hover:bg-white/5 transition-all">
                Tareas
              </Link>

              <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-3" />

              <InstallAppButton iconOnly />
              <ThemeToggle />

              <div className="flex items-center gap-3 ml-2">
                <Link href="/dashboard/profile" className="w-9 h-9 gradient-primary rounded-full flex items-center justify-center shadow-md">
                  <span className="text-white text-xs font-bold">
                    {user?.email?.charAt(0).toUpperCase() || '?'}
                  </span>
                </Link>
                <form action="/api/auth/signout" method="post">
                  <button type="submit" className="text-xs text-slate-400 dark:text-slate-500 hover:text-rose-500 dark:hover:text-rose-400 transition">
                    Salir
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 pb-24 sm:pb-8">
        {children}
      </main>

      <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24 sm:pb-8 text-center">
        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          Las minutas las genera una IA y pueden contener errores: revísalas antes de compartirlas.
        </p>
        <div className="flex items-center justify-center gap-3 text-[11px] mt-1.5">
          <Link href="/legal/consentimiento" className="text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition">
            Consentimiento
          </Link>
          <span className="text-slate-300 dark:text-slate-600">·</span>
          <Link href="/legal/terminos" className="text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition">
            Condiciones
          </Link>
          <span className="text-slate-300 dark:text-slate-600">·</span>
          <Link href="/legal/privacidad" className="text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition">
            Privacidad
          </Link>
        </div>
      </footer>

      {/* Mobile Bottom Bar */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-t border-slate-200/50 dark:border-slate-700/50">
        <div className="flex items-center justify-around h-16 px-2">
          <Link href="/dashboard" className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-all">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            <span className="text-[10px] font-medium">Inicio</span>
          </Link>
          <Link href="/dashboard/meetings" className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-all">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
            <span className="text-[10px] font-medium">Reuniones</span>
          </Link>
          <Link href="/dashboard/meetings/new" className="flex flex-col items-center gap-0.5 -mt-5">
            <div className="w-12 h-12 gradient-primary rounded-full flex items-center justify-center shadow-lg shadow-blue-500/30">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
          </Link>
          <Link href="/dashboard/action-items" className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-all">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            <span className="text-[10px] font-medium">Tareas</span>
          </Link>
          <Link href="/dashboard/profile" className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-all">
<div className="w-6 h-6 gradient-primary rounded-full flex items-center justify-center">
              <span className="text-white text-[8px] font-bold">{user?.email?.charAt(0).toUpperCase() || '?'}</span>
            </div>
          </Link>
          {/* Version badge mobile */}
          <div className="flex items-center justify-center px-2">
            <span className="px-2 py-0.5 text-[9px] font-mono font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded">
              v{VERSION}
            </span>
          </div>
        </div>
      </nav>
    </div>
  );
}