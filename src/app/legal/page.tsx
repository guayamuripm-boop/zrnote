import Link from 'next/link';

export const metadata = {
  title: 'Documentos legales — ZRNote',
};

const DOCUMENTS = [
  {
    slug: 'consentimiento',
    emoji: '🎙️',
    title: 'Consentimiento de grabación',
    description: 'Lo que tienes que decir y hacer antes de grabar. Empieza por aquí.',
    highlight: true,
  },
  {
    slug: 'terminos',
    emoji: '📄',
    title: 'Condiciones de uso',
    description: 'Qué puedes hacer con ZRNote, qué no, y de qué no nos hacemos responsables.',
  },
  {
    slug: 'privacidad',
    emoji: '🔒',
    title: 'Aviso de privacidad',
    description: 'Qué datos se guardan, quién los procesa y cuánto tiempo se conservan.',
  },
  {
    slug: 'cookies',
    emoji: '🍪',
    title: 'Política de cookies',
    description: 'Solo las estrictamente necesarias. Sin publicidad ni rastreadores.',
  },
];

export default function LegalPage() {
  return (
    <div className="min-h-screen gradient-mesh">
      <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200/60 dark:border-slate-700/60">
        <div className="max-w-3xl mx-auto px-4 py-8">
          <Link href="/" className="inline-flex items-center gap-2.5 mb-6">
            <div className="w-9 h-9 gradient-primary rounded-xl flex items-center justify-center shadow-lg">
              <span className="text-white font-bold text-sm">ZR</span>
            </div>
            <span className="text-slate-900 dark:text-slate-100 font-bold">ZRNote</span>
          </Link>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">
            Documentos legales
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            Escritos en lenguaje claro. Léelos una vez: son cortos.
          </p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12 space-y-8">
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700/50 rounded-2xl p-5 sm:p-6">
          <h2 className="font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-2">
            ⚠️ Lo único que de verdad tienes que recordar
          </h2>
          <p className="text-sm text-amber-800 dark:text-amber-300/90 mt-2 leading-relaxed">
            <strong>Avisa siempre, en voz alta, que estás grabando, y espera a que todos digan que
            sí.</strong> En Venezuela y en la mayoría de países, grabar una conversación sin el
            consentimiento de todos los participantes es un delito con pena de cárcel, no una
            formalidad. ZRNote no puede verificarlo: la responsabilidad es de quien graba.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {DOCUMENTS.map((doc) => (
            <Link
              key={doc.slug}
              href={`/legal/${doc.slug}`}
              className={`glass-strong rounded-2xl p-5 hover:shadow-elevated transition-all duration-300 hover:-translate-y-0.5 ${
                doc.highlight ? 'ring-1 ring-amber-300 dark:ring-amber-700/60 sm:col-span-2' : ''
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl leading-none">{doc.emoji}</span>
                <div className="min-w-0">
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100">{doc.title}</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{doc.description}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className="glass rounded-2xl p-5 text-center">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            ¿Preguntas sobre privacidad o quieres que borremos una grabación?
          </p>
          <a
            href="mailto:zr.coordinacion.tecnologia@gmail.com"
            className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
          >
            zr.coordinacion.tecnologia@gmail.com
          </a>
        </div>

        <p className="text-xs text-slate-400 dark:text-slate-500 text-center">
          ZRNote está en fase de prueba. Estos textos describen cómo funciona hoy y no sustituyen la
          asesoría de un abogado.
        </p>
      </div>
    </div>
  );
}
