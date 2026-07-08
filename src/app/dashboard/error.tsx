'use client';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="glass-strong rounded-3xl p-8 sm:p-10 shadow-float text-center max-w-md w-full">
        <div className="w-16 h-16 gradient-error rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg">
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">Algo salió mal</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-8">
          {error.message || 'Error inesperado al cargar el dashboard.'}
        </p>
        <button
          onClick={reset}
          className="gradient-primary text-white px-6 py-3 rounded-xl font-medium hover:shadow-lg hover:shadow-blue-500/25 transition-all"
        >
          Intentar de nuevo
        </button>
      </div>
    </div>
  );
}
