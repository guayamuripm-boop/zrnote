import Link from 'next/link';
import ZRLogo from '@/components/ZRLogo';

export interface SeoLandingProps {
  path: string;
  h1: string;
  intro: string;
  sections: { title: string; text: string; bullets?: string[] }[];
  faqs: { question: string; answer: string }[];
  ctaLabel: string;
}

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://zrnote.vercel.app';

/**
 * Plantilla de las páginas de aterrizaje orientadas a búsquedas concretas
 * («minutas de reunión con IA», «apuntes de clase con IA»). Una página por
 * intención de búsqueda posiciona mejor que una landing que intenta cubrirlo
 * todo. Servidor puro: HTML estático e indexable, con FAQ en JSON-LD.
 */
export default function SeoLanding({ path, h1, intro, sections, faqs, ctaLabel }: SeoLandingProps) {
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqs.map((f) => ({
        '@type': 'Question',
        name: f.question,
        acceptedAnswer: { '@type': 'Answer', text: f.answer },
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'ZRNote', item: siteUrl },
        { '@type': 'ListItem', position: 2, name: h1, item: `${siteUrl}${path}` },
      ],
    },
  ];

  return (
    <div className="min-h-screen gradient-mesh">
      {jsonLd.map((s) => (
        <script key={s['@type']} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(s) }} />
      ))}
      <header className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200/50 dark:border-slate-700/50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <ZRLogo className="w-8 h-8 rounded-lg shadow" />
            <span className="font-bold text-slate-900 dark:text-slate-100">ZRNote</span>
          </Link>
          <Link href="/signup" className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">
            Crear cuenta gratis
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-10">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-slate-100 leading-tight">{h1}</h1>
          <p className="mt-4 text-lg text-slate-600 dark:text-slate-300 leading-relaxed">{intro}</p>
          <Link
            href="/signup"
            className="inline-block mt-6 gradient-primary text-white px-6 py-3 rounded-xl font-medium hover:shadow-lg transition"
          >
            {ctaLabel}
          </Link>
        </div>

        {sections.map((s) => (
          <section key={s.title}>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2">{s.title}</h2>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">{s.text}</p>
            {s.bullets && (
              <ul className="mt-3 space-y-1.5 text-slate-600 dark:text-slate-300">
                {s.bullets.map((b) => (
                  <li key={b} className="pl-4 relative before:content-['•'] before:absolute before:left-0">
                    {b}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}

        <section>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-4">Preguntas frecuentes</h2>
          <div className="space-y-4">
            {faqs.map((f) => (
              <div key={f.question}>
                <h3 className="font-medium text-slate-900 dark:text-slate-100">{f.question}</h3>
                <p className="text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">{f.answer}</p>
              </div>
            ))}
          </div>
        </section>

        <footer className="pt-6 border-t border-slate-200 dark:border-slate-700 text-sm text-slate-400 flex flex-wrap gap-4">
          <Link href="/" className="hover:text-blue-600">Inicio</Link>
          <Link href="/minutas-de-reunion-con-ia" className="hover:text-blue-600">Minutas con IA</Link>
          <Link href="/apuntes-de-clase-con-ia" className="hover:text-blue-600">Apuntes de clase con IA</Link>
          <Link href="/legal" className="hover:text-blue-600">Legal</Link>
        </footer>
      </main>
    </div>
  );
}
