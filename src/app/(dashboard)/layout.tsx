import { createServerSupabase } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-zr-navy border-b border-zr-blue px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <a href="/" className="flex items-center gap-2">
            <div className="bg-zr-blue text-white font-bold text-sm px-2 py-1 rounded font-raleway">
              ZR
            </div>
            <span className="text-white font-raleway font-bold text-lg">ZRNote</span>
          </a>
          <div className="flex items-center gap-4">
            <a href="/meetings" className="text-sm text-zr-blue-pale hover:text-white transition">
              Reuniones
            </a>
            <a href="/action-items" className="text-sm text-zr-blue-pale hover:text-white transition">
              Mis Tareas
            </a>
            <form action="/api/auth/signout" method="post">
              <button type="submit" className="text-sm text-zr-blue-pale hover:text-white transition">
                Salir
              </button>
            </form>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto p-6">{children}</main>
    </div>
  );
}
