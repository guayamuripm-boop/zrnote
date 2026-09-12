'use client';

// Reading already-generated minutes with NO connection at all.
//
// WHY THIS IS ITS OWN TOP-LEVEL ROUTE, NOT `/dashboard/meetings/[id]`
// --------------------------------------------------------------------
// Every `/dashboard/*` page runs behind `dashboard/layout.tsx`, which calls
// `createServerSupabase().auth.getUser()` on the server for every request.
// That makes the whole subtree dynamic — its HTML is generated per-request
// and is never something a service worker could safely precache, because it
// bakes in per-user content (the account initial in the top-right corner, for
// a start) and would either go stale or, worse, show one person's shell to
// whoever opens the browser next on a shared device.
//
// This page has none of that. It renders identically for everyone at build
// time (Next prerenders it as static HTML, same as /legal or /offline.html),
// authenticates the CURRENT viewer only from their own locally-stored Supabase
// session (no network round-trip — reading a cached session is local by
// design), and reads their minutes from IndexedDB, not from the server. That
// combination is what makes it safe for `sw.js` to precache and serve this
// one navigation while offline, without reopening the privacy hole the
// service worker was rewritten to close. See the comment in `sw.js`'s fetch
// handler for the other half of this.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { getCachedMinutes, type CachedMinute } from '@/lib/minute-cache';
import { toParagraphs } from '@/lib/readable-text';

export default function OfflineNotesPage() {
  const [status, setStatus] = useState<'loading' | 'no-session' | 'ready'>('loading');
  const [minutes, setMinutes] = useState<CachedMinute[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        // getSession() reads the locally-stored token; it does not require a
        // network round trip, which is the whole point of this page.
        const { data } = await supabase.auth.getSession();
        const userId = data.session?.user?.id;
        if (!userId) {
          if (!cancelled) setStatus('no-session');
          return;
        }
        const cached = await getCachedMinutes(userId);
        if (cancelled) return;
        setMinutes(cached);
        setSelectedId(cached[0]?.id ?? null);
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('no-session');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = minutes.find((m) => m.id === selectedId) ?? null;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <header className="border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">📴</span>
          <h1 className="font-semibold">Notas sin conexión</h1>
        </div>
        <Link href="/dashboard" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
          Ir al panel
        </Link>
      </header>

      <main className="max-w-3xl mx-auto p-4 space-y-4">
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          Aquí puedes leer las actas de las reuniones que ya abriste alguna vez con conexión — quedan
          guardadas en este dispositivo para consultarlas sin señal. Esta página no necesita internet
          para abrirse ni para mostrarlas.
        </p>

        {status === 'loading' && <p className="text-sm text-slate-400">Cargando…</p>}

        {status === 'no-session' && (
          <div className="rounded-xl border border-amber-200 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-900/20 p-4 text-sm text-amber-800 dark:text-amber-300">
            No encontramos una sesión iniciada en este dispositivo. Abre ZRNote con conexión al menos
            una vez e inicia sesión — a partir de ahí, cada acta que consultes queda disponible aquí sin
            internet.
          </div>
        )}

        {status === 'ready' && minutes.length === 0 && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 text-sm text-slate-500 dark:text-slate-400">
            Todavía no hay ninguna acta guardada para leer sin conexión. Abre una reunión completada con
            internet una vez y quedará disponible aquí.
          </div>
        )}

        {status === 'ready' && minutes.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-[220px_1fr] gap-4">
            <nav className="space-y-1.5">
              {minutes.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSelectedId(m.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition ${
                    m.id === selectedId
                      ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 font-medium'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-900'
                  }`}
                >
                  <span className="block truncate">{m.title}</span>
                  <span className="block text-xs text-slate-400 dark:text-slate-500">
                    {new Date(m.createdAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </button>
              ))}
            </nav>

            {selected && (
              <article className="rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
                <div>
                  <h2 className="text-lg font-bold">{selected.title}</h2>
                  {selected.coordination && (
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{selected.coordination}</p>
                  )}
                </div>

                {selected.summary && (
                  <section>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1">
                      Resumen
                    </h3>
                    {toParagraphs(selected.summary).map((p, i) => (
                      <p key={i} className="text-sm leading-relaxed mb-2">{p}</p>
                    ))}
                  </section>
                )}

                {[
                  { label: 'Decisiones', items: selected.decisions },
                  { label: 'Temas tratados', items: selected.topics },
                  { label: 'Cambios', items: selected.changes },
                  { label: 'Próximos pasos', items: selected.nextSteps },
                ]
                  .filter((s) => s.items.length > 0)
                  .map((s) => (
                    <section key={s.label}>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1">
                        {s.label}
                      </h3>
                      <ul className="text-sm space-y-1 list-disc list-inside">
                        {s.items.map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                    </section>
                  ))}

                {selected.actionItems.length > 0 && (
                  <section>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1">
                      Compromisos
                    </h3>
                    <ul className="text-sm space-y-2">
                      {selected.actionItems.map((a, i) => (
                        <li key={i} className="border-l-2 border-slate-200 dark:border-slate-700 pl-2">
                          <span className="font-medium">{a.description}</span>
                          {(a.assignee_name || a.due_date) && (
                            <span className="block text-xs text-slate-400 dark:text-slate-500">
                              {a.assignee_name} {a.due_date ? `· vence ${a.due_date}` : ''}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                <p className="text-[11px] text-slate-400 dark:text-slate-500 pt-2 border-t border-slate-100 dark:border-slate-800">
                  Copia guardada el {new Date(selected.cachedAt).toLocaleString('es-ES')}. Puede no reflejar
                  cambios hechos después, con conexión.
                </p>
              </article>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
