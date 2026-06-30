import Link from 'next/link';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-zr-navy border-b border-zr-blue px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="bg-zr-blue text-white font-bold text-sm px-2 py-1 rounded font-raleway">
              ZR
            </div>
            <span className="text-white font-raleway font-bold text-lg">ZRNote</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-sm text-zr-blue-pale hover:text-white transition">
              Inicio
            </Link>
            <Link href="/dashboard/meetings" className="text-sm text-zr-blue-pale hover:text-white transition">
              Reuniones
            </Link>
            <Link href="/dashboard/action-items" className="text-sm text-zr-blue-pale hover:text-white transition">
              Mis Tareas
            </Link>
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
