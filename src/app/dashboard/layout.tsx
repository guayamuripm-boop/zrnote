import Link from 'next/link';
import { createServerSupabase } from '@/lib/supabase/server';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* Top Navigation */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link href="/dashboard" className="flex items-center gap-3">
              <div className="w-9 h-9 bg-zr-navy rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm font-raleway">ZR</span>
              </div>
              <span className="text-zr-navy font-raleway font-bold text-xl tracking-tight hidden sm:block">
                ZRNote
              </span>
            </Link>

            {/* Nav Links */}
            <div className="flex items-center gap-0.5 sm:gap-1">
              <Link
                href="/dashboard"
                className="px-2 sm:px-3 py-2 rounded-lg text-xs sm:text-sm font-medium text-gray-600 hover:text-zr-navy hover:bg-gray-100 transition"
              >
                Inicio
              </Link>
              <Link
                href="/dashboard/meetings"
                className="px-2 sm:px-3 py-2 rounded-lg text-xs sm:text-sm font-medium text-gray-600 hover:text-zr-navy hover:bg-gray-100 transition"
              >
                Reuniones
              </Link>
              <Link
                href="/dashboard/action-items"
                className="px-2 sm:px-3 py-2 rounded-lg text-xs sm:text-sm font-medium text-gray-600 hover:text-zr-navy hover:bg-gray-100 transition"
              >
                Tareas
              </Link>

              {/* Divider */}
              <div className="w-px h-6 bg-gray-200 mx-1 sm:mx-2" />

              {/* User */}
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 bg-zr-blue/10 rounded-full flex items-center justify-center">
                  <span className="text-zr-blue text-xs font-bold">
                    {user?.email?.charAt(0).toUpperCase() || '?'}
                  </span>
                </div>
                <form action="/api/auth/signout" method="post">
                  <button
                    type="submit"
                    className="text-xs sm:text-sm text-gray-400 hover:text-red-500 transition"
                  >
                    Salir
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
