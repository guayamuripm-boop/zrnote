import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen gradient-mesh relative overflow-hidden flex items-center justify-center p-4">
      <div className="absolute top-20 left-10 w-72 h-72 bg-indigo-400/20 rounded-full blur-3xl animate-float" />
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-rose-400/15 rounded-full blur-3xl animate-float" style={{ animationDelay: '1s' }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-400/10 rounded-full blur-3xl" />

      <div className="relative z-10 w-full max-w-md">
        <div className="glass-strong rounded-3xl p-8 sm:p-10 shadow-float text-center">
          <div className="inline-flex items-center gap-2.5 mb-6">
            <div className="w-11 h-11 gradient-primary rounded-xl flex items-center justify-center shadow-lg">
              <span className="text-white font-bold text-lg font-poppins">ZR</span>
            </div>
            <span className="text-zr-navy font-poppins font-bold text-xl tracking-tight">
              Mecacademy
            </span>
          </div>

          <h1 className="text-4xl sm:text-5xl font-bold text-zr-navy font-poppins mb-3 leading-tight">
            ZRNote
          </h1>
          <p className="text-zr-blue-mid font-poppins text-base sm:text-lg mb-10 leading-relaxed">
            Minutas inteligentes que impulsan tu crecimiento
          </p>

          <div className="space-y-3">
            <Link
              href="/login"
              className="block w-full gradient-primary text-white px-6 py-3.5 rounded-xl font-medium hover:shadow-lg hover:shadow-indigo-500/25 transition-all duration-300 hover:-translate-y-0.5 font-poppins"
            >
              Iniciar Sesión
            </Link>
            <Link
              href="/signup"
              className="block w-full glass border-zr-blue-mid/30 text-zr-navy px-6 py-3.5 rounded-xl font-medium hover:bg-white/90 transition-all duration-300 font-poppins"
            >
              Crear Cuenta
            </Link>
          </div>

          <p className="text-xs text-zr-blue-mid/60 mt-8 font-poppins">
            Invierte en conocimiento. Impulsa tu crecimiento.
          </p>
        </div>
      </div>
    </main>
  );
}
