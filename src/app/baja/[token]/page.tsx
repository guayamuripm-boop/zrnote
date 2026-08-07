import { verifyMinuteToken } from '@/lib/minute-links';
import UnsubscribeForm from '@/components/UnsubscribeForm';
import ZRLogo from '@/components/ZRLogo';
import Link from 'next/link';

// Página humana de baja. La baja de un clic de los clientes de correo va por
// POST a /api/baja/[token]; esto es para quien abre el enlace en el navegador.
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Dejar de recibir correos — ZRNote',
  robots: { index: false, follow: false },
};

export default async function BajaPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const verified = verifyMinuteToken(token);

  return (
    <main className="min-h-screen gradient-mesh flex items-center justify-center p-4">
      <div className="glass-strong rounded-3xl p-8 sm:p-10 max-w-md w-full shadow-float">
        <div className="flex items-center justify-center gap-2.5 mb-6">
          <ZRLogo className="w-9 h-9 rounded-xl shadow" />
          <span className="font-bold text-lg text-slate-900 dark:text-slate-100">ZRNote</span>
        </div>

        {!verified.ok ? (
          <div className="text-center">
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">
              Enlace no válido
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {verified.reason === 'caducado'
                ? 'Este enlace ha caducado. Responde al correo que recibiste y pide que te quiten de la lista.'
                : 'No hemos podido leer este enlace. Puede que tu cliente de correo lo haya cortado: prueba a copiarlo entero.'}
            </p>
          </div>
        ) : (
          <UnsubscribeForm token={token} email={verified.payload.email} />
        )}

        <div className="mt-8 pt-5 border-t border-slate-200/60 dark:border-slate-700/60 text-center">
          <Link href="/legal/privacidad" className="text-[11px] text-slate-400 hover:text-blue-600">
            Política de privacidad
          </Link>
        </div>
      </div>
    </main>
  );
}
