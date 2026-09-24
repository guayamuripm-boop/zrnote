import Link from 'next/link';
import ZRLogo from '@/components/ZRLogo';
import { createServerSupabase } from '@/lib/supabase/server';
import ThemeToggle from '@/components/ThemeToggle';
import InstallAppButton from '@/components/InstallAppButton';
import { VersionLogger } from '@/components/VersionLogger';
import { VERSION, COMMIT_SHA } from '@/lib/version';
import TermsGate from '@/components/legal/TermsGate';
import SignOutButton from '@/components/SignOutButton';
import MobileNav from '@/components/MobileNav';
import OnboardingTour from '@/components/OnboardingTour';

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
      {user && <OnboardingTour userId={user.id} />}
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
              <Link href="/dashboard/action-items" data-tour="action-items" className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-white/60 dark:hover:bg-white/5 transition-all">
                Tareas
              </Link>

              <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-3" />

              <span data-tour="install"><InstallAppButton iconOnly /></span>
              <ThemeToggle />

              <div className="flex items-center gap-3 ml-2">
                <Link href="/dashboard/profile" className="w-9 h-9 gradient-primary rounded-full flex items-center justify-center shadow-md">
                  <span className="text-white text-xs font-bold">
                    {user?.email?.charAt(0).toUpperCase() || '?'}
                  </span>
                </Link>
                <SignOutButton className="text-xs text-slate-400 dark:text-slate-500 hover:text-rose-500 dark:hover:text-rose-400 transition" />
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

      <MobileNav userInitial={user?.email?.charAt(0).toUpperCase() || '?'} />
    </div>
  );
}