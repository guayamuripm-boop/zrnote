'use client';

import { useEffect, useState } from 'react';

// Botón "Instalar app" para la PWA.
//
// Tres navegadores, tres comportamientos distintos, y ninguno se puede tratar
// igual:
//
//  1. Chrome/Edge/Android disparan `beforeinstallprompt`: lo capturamos,
//     evitamos que el navegador muestre su propio mini-infobar, y lanzamos
//     `prompt()` nosotros cuando el usuario pulsa el botón.
//  2. iOS Safari NO dispara ese evento NUNCA — Apple no lo implementa. La
//     única vía es manual: compartir → «Añadir a pantalla de inicio». Si
//     escondiéramos el botón ahí, la mitad de los móviles no verían ninguna
//     forma de instalar.
//  3. Si ya está instalada (abierta en modo standalone), no hay nada que
//     ofrecer: el botón no se muestra.
//
// Sin la comprobación de iOS, este componente habría funcionado en la mitad
// de los teléfonos y desaparecido silenciosamente en la otra mitad.

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as any).MSStream;
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // Safari en iOS no soporta la media query: expone su propia propiedad.
    (navigator as any).standalone === true
  );
}

export default function InstallAppButton({
  className = '',
  iconOnly = false,
  variant = 'button',
}: {
  className?: string;
  /** Sólo el icono, sin la palabra "Instalar app" — para barras de navegación estrechas. */
  iconOnly?: boolean;
  /**
   * 'button' = sólo el botón, para meter en una barra existente.
   * 'section' = tarjeta con título y explicación, para páginas de ajustes.
   * En ambos casos el componente entero desaparece si no hay nada que
   * ofrecer — así la página que lo usa no tiene que saber por qué.
   */
  variant?: 'button' | 'section';
}) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());
    setIos(isIos());

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed) return null;
  // Ni el evento nativo ni iOS: no hay nada accionable que ofrecer todavía
  // (Firefox de escritorio, por ejemplo, no soporta instalar PWAs).
  if (!deferredPrompt && !ios) return null;

  const handleClick = async () => {
    if (ios) {
      setShowIosHelp(true);
      return;
    }
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    // Se use o no, el evento sólo puede consumirse una vez.
    setDeferredPrompt(null);
  };

  const button = (
    <button
      onClick={handleClick}
      title="Instalar app"
      className={
        className ||
        (variant === 'section'
          ? 'block w-full text-center glass border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 py-3 rounded-xl font-medium hover:bg-white/80 dark:hover:bg-white/5 transition-all'
          : iconOnly
            ? 'w-9 h-9 rounded-xl glass flex items-center justify-center text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-all'
            : 'inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium glass text-slate-700 dark:text-slate-200 hover:bg-white/80 dark:hover:bg-white/10 transition-all')
      }
    >
      {variant !== 'section' && (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16" />
        </svg>
      )}
      {!iconOnly && 'Instalar app'}
    </button>
  );

  return (
    <>
      {variant === 'section' ? (
        <div className="border-t border-slate-200 dark:border-slate-700 pt-4 space-y-2">
          <h2 className="text-sm font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">
            Instalar la app
          </h2>
          {button}
          <p className="text-xs text-slate-400 dark:text-slate-500">
            {ios
              ? 'Se añade a tu pantalla de inicio y se abre como una app, sin la barra del navegador.'
              : 'Queda como un icono en tu escritorio o pantalla de inicio, se abre como una app y graba mejor en segundo plano.'}
          </p>
        </div>
      ) : (
        button
      )}

      {showIosHelp && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
          onClick={() => setShowIosHelp(false)}
        >
          <div
            className="glass-strong rounded-2xl p-6 shadow-float max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">
              Instalar en iPhone o iPad
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              Safari no deja instalar apps con un botón — hay que hacerlo desde el menú de compartir.
            </p>
            <ol className="space-y-3 text-sm text-slate-700 dark:text-slate-200">
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full gradient-primary text-white text-xs font-bold flex items-center justify-center shrink-0">1</span>
                Pulsa el icono <strong>Compartir</strong> (el cuadrado con la flecha hacia arriba) en la barra de Safari.
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full gradient-primary text-white text-xs font-bold flex items-center justify-center shrink-0">2</span>
                Elige <strong>«Añadir a pantalla de inicio»</strong>.
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full gradient-primary text-white text-xs font-bold flex items-center justify-center shrink-0">3</span>
                Pulsa <strong>«Añadir»</strong>. El icono de ZRNote queda en tu pantalla de inicio.
              </li>
            </ol>
            <button
              onClick={() => setShowIosHelp(false)}
              className="mt-5 w-full gradient-primary text-white py-2.5 rounded-xl text-sm font-medium hover:shadow-lg transition-all"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </>
  );
}
