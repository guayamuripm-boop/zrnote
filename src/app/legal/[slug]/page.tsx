import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Shield } from 'lucide-react';

const documentMap: Record<string, string> = {
  terms: 'terms_of_service',
  privacy: 'privacy_policy',
  cookies: 'cookie_policy',
};

async function getDocument(docType: string) {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/api/legal/documents?type=${docType}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return res.json();
  } catch (err) {
    console.error('Error fetching document:', err);
    return null;
  }
}

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const docType = documentMap[params.slug];
  if (!docType) return {};

  const doc = await getDocument(docType);
  const titles: Record<string, string> = {
    terms_of_service: 'Términos de Servicio',
    privacy_policy: 'Política de Privacidad',
    cookie_policy: 'Política de Cookies',
  };

  return {
    title: `${titles[docType]} - ZRNote`,
    description: `Leer los ${titles[docType].toLowerCase()} de ZRNote`,
  };
}

export default async function LegalDocumentPage({
  params,
}: {
  params: { slug: string };
}) {
  const docType = documentMap[params.slug];
  if (!docType) notFound();

  const doc = await getDocument(docType);
  if (!doc) notFound();

  const titles: Record<string, string> = {
    terms_of_service: 'Términos de Servicio',
    privacy_policy: 'Política de Privacidad',
    cookie_policy: 'Política de Cookies',
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-800">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <Link
            href="/legal"
            className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 dark:hover:text-blue-400 font-medium mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver a Documentos Legales
          </Link>
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-blue-600" />
            <div>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
                {titles[docType]}
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Última actualización: 25 de julio de 2026 • Versión {doc.version}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-8">
          <div
            className="prose prose-sm dark:prose-invert max-w-none
              prose-headings:text-slate-900 dark:prose-headings:text-white
              prose-a:text-blue-600 dark:prose-a:text-blue-400
              prose-a:hover:underline
              prose-table:border-slate-200 dark:prose-table:border-slate-700
              prose-th:bg-slate-100 dark:prose-th:bg-slate-700
              prose-td:border-slate-200 dark:prose-td:border-slate-700
              prose-strong:text-slate-900 dark:prose-strong:text-white
              prose-code:text-slate-700 dark:prose-code:text-slate-300
              prose-pre:bg-slate-100 dark:prose-pre:bg-slate-700"
            dangerouslySetInnerHTML={{ __html: doc.content }}
          />
        </div>

        {/* Footer */}
        <div className="mt-12 pt-8 border-t border-slate-200 dark:border-slate-700 text-center">
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
            Al usar ZRNote, aceptas estar vinculado por estos términos.
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Link
              href="/legal"
              className="text-blue-600 hover:text-blue-700 font-medium transition-colors"
            >
              Otros documentos
            </Link>
            <span className="text-slate-300 dark:text-slate-600">•</span>
            <a
              href="mailto:zriagnosis@gmail.com"
              className="text-blue-600 hover:text-blue-700 font-medium transition-colors"
            >
              Contactar
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
