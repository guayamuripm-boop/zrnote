'use client';

import { useState } from 'react';

export interface FaqItem {
  question: string;
  answer: string;
}

/**
 * El texto de las preguntas vive en `page.tsx`, no aquí — el mismo array
 * alimenta este acordeón Y el JSON-LD de FAQPage que se imprime en la página.
 * Si vivieran en dos sitios, tarde o temprano se desincronizan y el marcado
 * estructurado deja de coincidir con lo que un visitante ve en pantalla, que
 * es exactamente lo que los buscadores penalizan.
 */
export default function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="space-y-3">
      {items.map((item, i) => {
        const isOpen = openIndex === i;
        return (
          <div key={item.question} className="glass-strong rounded-2xl overflow-hidden">
            <button
              type="button"
              onClick={() => setOpenIndex(isOpen ? null : i)}
              aria-expanded={isOpen}
              className="w-full flex items-center justify-between gap-4 text-left px-5 py-4 sm:px-6 sm:py-5"
            >
              <span className="font-medium text-slate-900 dark:text-slate-100">{item.question}</span>
              <svg
                className={`w-5 h-5 shrink-0 text-slate-400 transition-transform duration-300 ${isOpen ? 'rotate-45' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
            {/* Truco grid-template-rows 0fr/1fr: transición suave de altura sin
                medir el contenido en JS ni fijar un max-height arbitrario. */}
            <div
              className="grid transition-[grid-template-rows] duration-300 ease-out"
              style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
            >
              <div className="overflow-hidden">
                <p className="px-5 sm:px-6 pb-5 sm:pb-6 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  {item.answer}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
