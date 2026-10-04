import type { Chapter } from '@/lib/chapters';

// Guía por capítulos del estilo «Contenido»: una línea de tiempo para leer de
// arriba abajo o saltar al tramo que interesa.
export default function ChaptersSection({ chapters }: { chapters: Chapter[] }) {
  if (chapters.length === 0) return null;

  return (
    <section className="glass-strong rounded-2xl p-5 sm:p-6 shadow-elevated">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
        <span aria-hidden="true">🎙️</span> Capítulos
        <span className="text-sm font-normal text-slate-400 dark:text-slate-500">({chapters.length})</span>
      </h2>
      <ol className="space-y-5">
        {chapters.map((c, i) => (
          <li key={i} className="flex gap-3">
            <div className="shrink-0 w-14 pt-0.5">
              {c.time ? (
                <span className="inline-block text-xs font-mono font-medium text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-900/30 rounded-md px-1.5 py-0.5">
                  {c.time}
                </span>
              ) : (
                <span className="inline-block text-xs font-medium text-slate-400 dark:text-slate-500">{i + 1}.</span>
              )}
            </div>
            <div className="min-w-0 flex-1 border-l-2 border-violet-200 dark:border-violet-800/60 pl-3">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">{c.title}</h3>
              {c.summary && <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">{c.summary}</p>}
              {c.key_points.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {c.key_points.map((p, j) => (
                    <li
                      key={j}
                      className="text-xs text-slate-500 dark:text-slate-400 pl-3 relative before:content-['·'] before:absolute before:left-0"
                    >
                      {p}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
