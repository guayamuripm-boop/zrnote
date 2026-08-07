'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Envuelve cualquier sección y la anima al entrar en pantalla.
 *
 * Usa IntersectionObserver en vez de `animation-timeline: view()` porque esa
 * propiedad CSS todavía no la soporta Safari — y una landing pública tiene que
 * verse bien en el navegador que sea, no sólo en el que usamos para probar.
 *
 * `delayMs` desincroniza varias tarjetas hermanas para que no entren todas de
 * golpe a la vez.
 */
export default function RevealOnScroll({
  children,
  delayMs = 0,
  className = '',
}: {
  children: ReactNode;
  delayMs?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Si el navegador no soporta IntersectionObserver (rarísimo hoy), mostrar
    // el contenido directamente en vez de dejarlo invisible para siempre.
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -80px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`reveal ${visible ? 'in-view' : ''} ${className}`}
      style={{ transitionDelay: visible ? `${delayMs}ms` : '0ms' }}
    >
      {children}
    </div>
  );
}
