import Link from 'next/link';
import { createServerSupabase } from '@/lib/supabase/server';
import ThemeToggle from '@/components/ThemeToggle';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen gradient-mesh">
      {/* Desktop Nav */}
      <nav className="glass-strong sticky top-0 z-50 border-b border-white/20 dark:border-white/5 hidden sm:block">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/dashboard" className="flex items-center gap-2.5">
              <div className="w-9 h-9 gradient-primary rounded-xl flex items-center justify-center shadow-lg">
                <span className="text-white font-bold text-sm">ZR</span>
              </div>
              <span className="text-zr-navy dark:text-zr-blue-pale font-bold text-lg tracking-tight hidden sm:block">
                ZRNote
              </span>
            </Link>

            <div className="flex items-center gap-1">
              <Link href="/dashboard" className="px-4 py-2 rounded-xl text-sm font-medium text-zr-blue-mid/70 hover:text-zr-navy hover:bg-white/60 dark:hover:bg-white/5 dark:hover:text-zr-blue-pale transition-all">
                Inicio
              </Link>
              <Link href="/dashboard/meetings" className="px-4 py-2 rounded-xl text-sm font-medium text-zr-blue-mid/70 hover:text-zr-navy hover:bg-white/60 dark:hover:bg-white/5 dark:hover:text-zr-blue-pale transition-all">
                Reuniones
              </Link>
              <Link href="/dashboard/action-items" className="px-4 py-2 rounded-xl text-sm font-medium text-zr-blue-mid/70 hover:text-zr-navy hover:bg-white/60 dark:hover:bg-white/5 dark:hover:text-zr-blue-pale transition-all">
                Tareas
              </Link>

              <div className="w-px h-6 bg-zr-blue-pale/30 mx-3" />

              <ThemeToggle />

              <div className="flex items-center gap-3 ml-2">
                <Link href="/dashboard/profile" className="w-9 h-9 gradient-primary rounded-full flex items-center justify-center shadow-md">
                  <span className="text-white text-xs font-bold">
                    {user?.email?.charAt(0).toUpperCase() || '?'}
                  </span>
                </Link>
                <form action="/api/auth/signout" method="post">
                  <button type="submit" className="text-xs text-zr-blue-mid/40 hover:text-red-500 transition">
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

      {/* Mobile Bottom Bar */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-50 glass-strong border-t border-white/20 dark:border-white/5">
        <div className="flex items-center justify-around h-16 px-2">
          <Link href="/dashboard" className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-zr-blue-mid/50 hover:text-zr-blue transition-all">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            <span className="text-[10px] font-medium">Inicio</span>
          </Link>
          <Link href="/dashboard/meetings" className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-zr-blue-mid/50 hover:text-zr-blue transition-all">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
            <span className="text-[10px] font-medium">Reuniones</span>
          </Link>
          <Link href="/dashboard/meetings/new" className="flex flex-col items-center gap-0.5 -mt-5">
            <div className="w-12 h-12 gradient-primary rounded-full flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
          </Link>
          <Link href="/dashboard/action-items" className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-zr-blue-mid/50 hover:text-zr-blue transition-all">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            <span className="text-[10px] font-medium">Tareas</span>
          </Link>
          <Link href="/dashboard/profile" className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-zr-blue-mid/50 hover:text-zr-blue transition-all">
            <div className="w-6 h-6 gradient-primary rounded-full flex items-center justify-center">
              <span className="text-white text-[8px] font-bold">{user?.email?.charAt(0).toUpperCase() || '?'}</span>
            </div>
          </Link>
        </div>
      </nav>
    </div>
  );
}
