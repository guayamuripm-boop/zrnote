import Link from 'next/link';
import { createServerSupabase } from '@/lib/supabase/server';
import { VersionLogger } from '@/components/VersionLogger';
import { VERSION, COMMIT_SHA } from '@/lib/version';
import TermsGate from '@/components/legal/TermsGate';
import DashboardNav from '@/components/DashboardNav';
import MobileNav from '@/components/MobileNav';
import OnboardingTour from '@/components/OnboardingTour';
import PushSync from '@/components/PushSync';

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
      <PushSync />
      {user && <OnboardingTour userId={user.id} />}
      <DashboardNav userInitial={user?.email?.charAt(0).toUpperCase() || '?'} version={VERSION} />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {children}
      </main>

      <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-mobile-nav text-center">
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