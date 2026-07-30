import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createServerSupabase } from '@/lib/supabase/server';
import { sanitizeHtml } from '@/lib/safe-html';

export const dynamic = 'force-dynamic';

const DOCUMENT_MAP: Record<string, { docType: string; title: string }> = {
  terminos: { docType: 'terms_of_service', title: 'Condiciones de uso' },
  privacidad: { docType: 'privacy_policy', title: 'Aviso de privacidad' },
  cookies: { docType: 'cookie_policy', title: 'Política de cookies' },
  consentimiento: { docType: 'recording_consent', title: 'Consentimiento de grabación' },
  // English slugs kept so older links and bookmarks don't 404.
  terms: { docType: 'terms_of_service', title: 'Condiciones de uso' },
  privacy: { docType: 'privacy_policy', title: 'Aviso de privacidad' },
};

/**
 * Read the document straight from Supabase.
 *
 * This page used to `fetch()` its own `/api/legal/documents` endpoint using
 * NEXT_PUBLIC_APP_URL — a server component calling back into the same
 * deployment over the network, which breaks on preview URLs and whenever that
 * env var is wrong, and costs an extra round trip for no reason.
 */
async function getDocument(docType: string) {
  const supabase = createServerSupabase();
  const { data } = await supabase
    .from('legal_documents')
    .select('content, version, effective_date')
    .eq('doc_type', docType)
    .order('effective_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const entry = DOCUMENT_MAP[params.slug];
  if (!entry) return {};
  return { title: `${entry.title} — ZRNote` };
}

export default async function LegalDocumentPage({ params }: { params: { slug: string } }) {
  const entry = DOCUMENT_MAP[params.slug];
  if (!entry) notFound();

  const doc = await getDocument(entry.docType);

  return (
    <div className="min-h-screen gradient-mesh">
      <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200/60 dark:border-slate-700/60">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <Link
            href="/legal"
            className="inline-flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 font-medium mb-3 hover:underline"
          >
            ← Documentos legales
          </Link>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">{entry.title}</h1>
          {doc && (
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Versión {doc.version} ·{' '}
              {new Date(doc.effective_date).toLocaleDateString('es-ES', {
                day: 'numeric', month: 'long', year: 'numeric',
              })}
            </p>
          )}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
        <div className="glass-strong rounded-2xl p-6 sm:p-8 shadow-elevated">
          {doc ? (
            <div className="legal-doc" dangerouslySetInnerHTML={{ __html: sanitizeHtml(doc.content) }} />
          ) : (
            <div className="space-y-3 text-slate-600 dark:text-slate-300">
              <p className="font-medium text-slate-900 dark:text-slate-100">
                Este documento todavía no está publicado.
              </p>
              <p className="text-sm">
                Si administras esta instalación: ejecuta la migración{' '}
                <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-xs">
                  020_mvp_hardening_and_legal_v2.sql
                </code>{' '}
                en el editor SQL de Supabase para cargar los textos.
              </p>
            </div>
          )}
        </div>

        <div className="mt-8 text-center">
          <a
            href="mailto:zr.coordinacion.tecnologia@gmail.com"
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            ¿Dudas? zr.coordinacion.tecnologia@gmail.com
          </a>
        </div>
      </div>
    </div>
  );
}
