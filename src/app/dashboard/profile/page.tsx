import { createServerSupabase } from '@/lib/supabase/server';
import Link from 'next/link';
import ThemeToggle from '@/components/ThemeToggle';

export default async function ProfilePage() {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-zr-blue-mid/50 hover:text-zr-blue transition mb-4">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Volver
        </Link>
        <h1 className="text-2xl sm:text-3xl font-bold text-zr-navy">Mi Perfil</h1>
      </div>

      <div className="glass-strong rounded-2xl p-6 sm:p-8 shadow-elevated space-y-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 gradient-primary rounded-2xl flex items-center justify-center shadow-lg">
            <span className="text-white text-2xl font-bold">{user?.email?.charAt(0).toUpperCase() || '?'}</span>
          </div>
          <div className="min-w-0">
            <p className="text-lg font-semibold text-zr-navy truncate">{user?.email}</p>
            <p className="text-sm text-zr-blue-mid/50">Cuenta activa</p>
          </div>
        </div>

        <div className="border-t border-zr-blue-pale/30 pt-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
            <span className="text-sm text-zr-blue-mid/50 w-32 shrink-0">Email</span>
            <span className="text-sm text-zr-navy font-medium break-all">{user?.email}</span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
            <span className="text-sm text-zr-blue-mid/50 w-32 shrink-0">Miembro desde</span>
            <span className="text-sm text-zr-navy font-medium">
              {user?.created_at
                ? new Date(user.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
                : '—'}
            </span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
            <span className="text-sm text-zr-blue-mid/50 w-32 shrink-0">ID de usuario</span>
            <span className="text-sm text-zr-navy/60 font-mono break-all">{user?.id}</span>
          </div>
        </div>

        <div className="border-t border-zr-blue-pale/30 pt-4">
          <ThemeToggle />
        </div>

        <div className="border-t border-zr-blue-pale/30 pt-4">
          <form action="/api/auth/signout" method="post">
            <button
              type="submit"
              className="w-full glass border border-red-200/50 text-red-600 py-3 rounded-xl font-medium hover:bg-red-50 transition-all"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
