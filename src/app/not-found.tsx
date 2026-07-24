import Link from 'next/link';

// Global 404 — covers any unmatched route AND any notFound() call (e.g. a
// deleted or non-existent meeting id). Previously there was no app/not-found.tsx,
// so Next.js fell back to its plain default page, off-brand and a dead end.
export default function NotFound() {
  return (
    <div className="min-h-screen gradient-mesh flex items-center justify-center p-4">
      <div className="glass-strong rounded-3xl p-8 sm:p-10 shadow-float text-center max-w-md w-full">
        <div className="w-16 h-16 gradient-primary rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg">
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">Página no encontrada</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-8">
          Esta reunión o página no existe, o ya fue eliminada.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/dashboard"
            className="gradient-primary text-white px-6 py-3 rounded-xl font-medium hover:shadow-lg hover:shadow-blue-500/25 transition-all"
          >
            Ir al Dashboard
          </Link>
          <Link
            href="/login"
            className="glass border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 px-6 py-3 rounded-xl font-medium hover:bg-white/80 dark:hover:bg-white/5 transition-all"
          >
            Iniciar sesión
          </Link>
        </div>
      </div>
    </div>
  );
}
