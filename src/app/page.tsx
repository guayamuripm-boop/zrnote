import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen gradient-mesh relative overflow-hidden flex items-center justify-center p-4">
      <div className="absolute top-20 left-10 w-72 h-72 bg-blue-400/15 rounded-full blur-3xl animate-float" />
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-blue-300/10 rounded-full blur-3xl animate-float" style={{ animationDelay: '1s' }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-400/10 rounded-full blur-3xl" />

      <div className="relative z-10 w-full max-w-md">
        <div className="glass-strong rounded-3xl p-8 sm:p-10 shadow-float text-center">
          <div className="inline-flex items-center gap-2.5 mb-6">
            <div className="w-11 h-11 gradient-primary rounded-xl flex items-center justify-center shadow-lg">
              <span className="text-white font-bold text-lg">ZR</span>
            </div>
            <span className="text-slate-900 dark:text-slate-100 font-bold text-xl tracking-tight">
              Mecacademy
            </span>
          </div>

          <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 dark:text-slate-100 mb-3 leading-tight">
            ZRNote
          </h1>
          <p className="text-slate-600 dark:text-slate-300 text-base sm:text-lg mb-10 leading-relaxed">
            Minutas inteligentes que impulsan tu crecimiento
          </p>

          <div className="space-y-3">
            <Link
              href="/login"
              className="block w-full gradient-primary text-white px-6 py-3.5 rounded-xl font-medium hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 hover:-translate-y-0.5"
            >
              Iniciar Sesión
            </Link>
            <Link
              href="/signup"
              className="block w-full glass border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 px-6 py-3.5 rounded-xl font-medium hover:bg-white/90 dark:hover:bg-white/5 transition-all duration-300"
            >
              Crear Cuenta
            </Link>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400 mt-8">
            Invierte en conocimiento. Impulsa tu crecimiento.
          </p>

          <div className="mt-6 pt-5 border-t border-slate-200/60 dark:border-slate-700/60 space-y-2">
            <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed">
              Antes de grabar, avisa a todos los participantes y obtén su consentimiento.
            </p>
            <div className="flex items-center justify-center gap-3 text-[11px]">
              <Link href="/legal/terminos" className="text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition">
                Condiciones
              </Link>
              <span className="text-slate-300 dark:text-slate-600">·</span>
              <Link href="/legal/privacidad" className="text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition">
                Privacidad
              </Link>
              <span className="text-slate-300 dark:text-slate-600">·</span>
              <Link href="/legal" className="text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition">
                Legal
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}