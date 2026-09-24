'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

interface Step {
  title: string;
  description: string;
  selector: string;
  fallbackSelector?: string;
}

const STEPS: Step[] = [
  {
    title: 'Graba o sube audio',
    description: 'Pulsa aquí para grabar una reunión en vivo o subir un audio que ya tengas.',
    selector: 'a[href="/dashboard/meetings/new"]',
    fallbackSelector: '[data-tour="new-meeting"]',
  },
  {
    title: 'Tu minuta automática',
    description: 'Cuando termine el procesamiento, aquí aparece la minuta con los puntos clave.',
    selector: 'a[href="/dashboard/meetings"]',
    fallbackSelector: '[data-tour="meetings"]',
  },
  {
    title: 'Tus compromisos',
    description: 'Las tareas detectadas en cada reunión, con responsable y fecha límite.',
    selector: 'a[href="/dashboard/action-items"]',
    fallbackSelector: '[data-tour="action-items"]',
  },
  {
    title: 'Busca con IA',
    description: 'Pregunta lo que quieras sobre tus reuniones pasadas — la IA busca en todas.',
    selector: '[data-tour="search"]',
    fallbackSelector: 'button:has(svg)',
  },
  {
    title: 'Instala la app',
    description: 'Añade ZRNote a tu pantalla de inicio para grabar mejor en segundo plano.',
    selector: '[data-tour="install"]',
    fallbackSelector: '[aria-label*="nstall"], [aria-label*="nstala"]',
  },
];

const STORAGE_KEY = (userId: string) => `zrnote_onboarding_completed_${userId}`;

export default function OnboardingTour({ userId }: { userId: string }) {
  const [step, setStep] = useState(-1);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== '/dashboard') return;
    try {
      if (localStorage.getItem(STORAGE_KEY(userId))) return;
    } catch { return; }
    const timer = setTimeout(() => setStep(0), 800);
    return () => clearTimeout(timer);
  }, [userId, pathname]);

  const findTarget = useCallback((s: Step): Element | null => {
    return document.querySelector(s.selector) || (s.fallbackSelector ? document.querySelector(s.fallbackSelector) : null);
  }, []);

  useEffect(() => {
    if (step < 0 || step >= STEPS.length) return;
    const el = findTarget(STEPS[step]);
    if (el) {
      setRect(el.getBoundingClientRect());
    } else if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      dismiss();
    }
  }, [step, findTarget]);

  useEffect(() => {
    if (step < 0) return;
    const onResize = () => {
      const el = findTarget(STEPS[step]);
      if (el) setRect(el.getBoundingClientRect());
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize);
    };
  }, [step, findTarget]);

  const dismiss = () => {
    setStep(-1);
    setRect(null);
    try { localStorage.setItem(STORAGE_KEY(userId), 'true'); } catch {}
  };

  const next = () => {
    if (step >= STEPS.length - 1) {
      dismiss();
    } else {
      setStep(step + 1);
    }
  };

  if (step < 0 || !rect) return null;

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
  const current = STEPS[step];
  const pad = 8;

  const spotlightStyle = {
    position: 'absolute' as const,
    top: rect.top + window.scrollY - pad,
    left: rect.left - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
    borderRadius: 16,
    boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.6)',
    pointerEvents: 'none' as const,
    zIndex: 91,
  };

  const tooltipTop = isMobile
    ? undefined
    : rect.bottom + window.scrollY + 16;
  const tooltipBottom = isMobile ? 0 : undefined;

  const tooltipStyle: React.CSSProperties = isMobile
    ? { position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 92 }
    : {
        position: 'absolute',
        top: tooltipTop,
        left: Math.max(16, Math.min(rect.left, window.innerWidth - 320)),
        zIndex: 92,
      };

  return (
    <>
      <div
        className="fixed inset-0 z-[90]"
        onClick={dismiss}
        style={{ background: 'transparent' }}
      />
      <div style={spotlightStyle} />
      <div style={tooltipStyle}>
        <div className={`glass-strong shadow-float p-5 space-y-3 ${
          isMobile ? 'rounded-t-2xl' : 'rounded-2xl max-w-xs'
        }`}>
          <div>
            <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm">{current.title}</p>
            <p className="text-slate-500 dark:text-slate-400 text-xs mt-1 leading-relaxed">{current.description}</p>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex gap-1.5">
              {STEPS.map((_, i) => (
                <span
                  key={i}
                  className={`w-2 h-2 rounded-full transition-all ${
                    i === step ? 'gradient-primary w-4' : 'bg-slate-300 dark:bg-slate-600'
                  }`}
                />
              ))}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={dismiss}
                className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition"
              >
                Omitir
              </button>
              <button
                onClick={next}
                className="gradient-primary text-white px-4 py-1.5 rounded-xl text-xs font-medium hover:shadow-lg hover:shadow-blue-500/25 transition-all"
              >
                {step === STEPS.length - 1 ? 'Listo' : 'Siguiente'}
              </button>
            </div>
          </div>

          <p className="text-[10px] text-slate-400 dark:text-slate-500 text-center">
            Paso {step + 1} de {STEPS.length}
          </p>
        </div>
      </div>
    </>
  );
}
