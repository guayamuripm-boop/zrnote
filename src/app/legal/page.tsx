import Link from 'next/link';
import { FileText, Shield, Cookie } from 'lucide-react';

export default function LegalPage() {
  const documents = [
    {
      slug: 'terms',
      title: 'Términos de Servicio',
      description: 'Condiciones de uso, limitaciones y consentimiento de grabación',
      icon: FileText,
    },
    {
      slug: 'privacy',
      title: 'Política de Privacidad',
      description: 'Cómo recopilamos, usamos y protegemos tus datos',
      icon: Shield,
    },
    {
      slug: 'cookies',
      title: 'Política de Cookies',
      description: 'Información sobre cookies y tecnologías de seguimiento',
      icon: Cookie,
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white dark:from-slate-900 dark:to-slate-800">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
        <div className="max-w-4xl mx-auto px-4 py-12">
          <div className="flex items-center gap-3 mb-4">
            <Shield className="w-8 h-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
              Documentos Legales
            </h1>
          </div>
          <p className="text-slate-600 dark:text-slate-300">
            Información importante sobre cómo usamos ZRNote de forma segura y legal
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-12">
        {/* Important Notice */}
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-6 mb-12">
          <h2 className="text-lg font-semibold text-amber-900 dark:text-amber-200 mb-2">
            ⚠️ Importante: Consentimiento de Grabación
          </h2>
          <p className="text-amber-800 dark:text-amber-300 text-sm mb-3">
            <strong>ANTES de usar ZRNote para grabar reuniones, debes:</strong>
          </p>
          <ul className="list-disc list-inside space-y-2 text-amber-800 dark:text-amber-300 text-sm">
            <li>Obtener consentimiento escrito/verbal de TODOS los participantes</li>
            <li>Informarles que estás grabando y cómo se usará la grabación</li>
            <li>Verificar las leyes de grabación en tu jurisdicción (varían mucho)</li>
            <li>En muchas regiones, grabar sin consentimiento es DELITO</li>
            <li>ZRNote NO es responsable de violaciones legales de grabación</li>
          </ul>
        </div>

        {/* Documents Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-12">
          {documents.map((doc) => {
            const Icon = doc.icon;
            return (
              <Link
                key={doc.slug}
                href={`/legal/${doc.slug}`}
                className="group bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-6 hover:shadow-lg hover:border-blue-300 dark:hover:border-blue-600 transition-all"
              >
                <div className="flex items-center gap-3 mb-3">
                  <Icon className="w-6 h-6 text-blue-600 group-hover:scale-110 transition-transform" />
                  <h3 className="font-semibold text-slate-900 dark:text-white group-hover:text-blue-600">
                    {doc.title}
                  </h3>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {doc.description}
                </p>
                <div className="mt-4 text-blue-600 font-medium text-sm group-hover:text-blue-700">
                  Leer más →
                </div>
              </Link>
            );
          })}
        </div>

        {/* Contact Section */}
        <div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-8 text-center">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
            ¿Preguntas sobre privacidad o legal?
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            Contacta a nuestro equipo de privacidad para consultas
          </p>
          <a
            href="mailto:zriagnosis@gmail.com"
            className="inline-flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            📧 Enviar Email
          </a>
        </div>

        {/* Footer Note */}
        <div className="mt-12 pt-8 border-t border-slate-200 dark:border-slate-700">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Última actualización: 25 de julio de 2026 | Versión de documentos: 1.0
          </p>
        </div>
      </div>
    </div>
  );
}
