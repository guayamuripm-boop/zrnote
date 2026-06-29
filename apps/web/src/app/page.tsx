import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-zr-pattern">
      <div className="max-w-md text-center space-y-8 bg-white/95 backdrop-blur-sm rounded-2xl p-10 shadow-2xl">
        <div className="space-y-2">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="bg-zr-blue text-white font-bold text-2xl px-3 py-2 rounded-lg font-raleway">
              ZR
            </div>
            <span className="text-zr-navy font-raleway font-bold text-2xl tracking-tight">
              Mecacademy
            </span>
          </div>
          <h1 className="text-3xl font-bold text-zr-navy font-raleway">
            ZRNote
          </h1>
          <p className="text-zr-blue-mid font-raleway">
            Minutas inteligentes que impulsan tu crecimiento
          </p>
        </div>

        <div className="space-y-3">
          <Link
            href="/login"
            className="block w-full bg-zr-blue text-white px-6 py-3 rounded-lg font-medium hover:bg-zr-navy transition font-raleway"
          >
            Iniciar Sesión
          </Link>
          <Link
            href="/signup"
            className="block w-full border-2 border-zr-blue text-zr-blue px-6 py-3 rounded-lg font-medium hover:bg-zr-blue/5 transition font-raleway"
          >
            Crear Cuenta
          </Link>
        </div>

        <p className="text-xs text-zr-blue-light">
          Invierte en conocimiento. Impulsa tu crecimiento.
        </p>
      </div>
    </main>
  );
}
