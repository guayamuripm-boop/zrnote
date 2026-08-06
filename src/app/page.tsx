import Link from 'next/link';
import type { Metadata } from 'next';
import ZRLogo from '@/components/ZRLogo';
import ThemeToggle from '@/components/ThemeToggle';
import RevealOnScroll from '@/components/landing/RevealOnScroll';
import LiveDemo from '@/components/landing/LiveDemo';
import AudienceTabs, { type Audience } from '@/components/landing/AudienceTabs';
import FaqAccordion, { type FaqItem } from '@/components/landing/FaqAccordion';

export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://zrnote.vercel.app';

const DIFFERENTIATORS = [
  {
    emoji: '🏢',
    title: 'Presencial y virtual',
    text: 'No dependes de que la reunión pase por una videollamada. Grabas desde el móvil en la sala, el comité o la obra igual que en un Meet.',
  },
  {
    emoji: '🇪🇸',
    title: 'Español, no traducido',
    text: 'El acta sigue la estructura de un acta formal en español — resumen, decisiones, compromisos — no un resumen en inglés con viñetas.',
  },
  {
    emoji: '✅',
    title: 'Compromisos, no solo notas',
    text: 'Cada tarea sale con responsable, prioridad y fecha, o se marca con claridad como "sin fecha acordada". No es un resumen bonito: es lo que hay que hacer.',
  },
  {
    emoji: '📧',
    title: 'Sin licencia por invitado',
    text: 'Los participantes no crean cuenta ni ocupan un asiento pagado. Reciben su parte de la reunión por correo y listo.',
  },
  {
    emoji: '🔍',
    title: 'Busca en tus reuniones pasadas',
    text: 'Pregunta en lenguaje natural qué se decidió hace tres meses sobre un tema, sin tener que abrir acta por acta.',
  },
  {
    emoji: '🔒',
    title: 'Tú controlas los datos',
    text: 'El audio se borra automáticamente a los 30 días. Puedes exportar o borrar toda tu información cuando quieras.',
  },
];

const STEPS = [
  {
    n: '1',
    title: 'Graba',
    text: 'Desde el navegador o el móvil, en una reunión presencial o por videollamada. También hay una extensión de Chrome para Meet, Zoom o Teams.',
  },
  {
    n: '2',
    title: 'Transcribe',
    text: 'Reconocimiento de voz optimizado para español, con nombres propios y vocabulario de tu organización.',
  },
  {
    n: '3',
    title: 'Redacta el acta',
    text: 'La IA separa resumen, decisiones, compromisos con responsable y fecha, bloqueos y próximos pasos — y deja vacío lo que no aplicó, en vez de inventarlo.',
  },
  {
    n: '4',
    title: 'Envía y da seguimiento',
    text: 'Cada participante recibe SUS compromisos por correo, sin crear cuenta. Un recordatorio llega un día antes de que venza cada uno.',
  },
];

const AUDIENCES: Audience[] = [
  {
    label: 'Comités y juntas',
    emoji: '🏛️',
    title: 'Comités y juntas directivas',
    description:
      'Actas con la estructura que ya conoces — decisiones, responsables, seguimiento — sin que alguien tenga que redactarlas a mano después.',
    points: [
      'Acta formal en español',
      'Compromisos con responsable y fecha',
      'Exporta a PDF para el archivo',
      'Recordatorio antes del vencimiento',
    ],
  },
  {
    label: 'Educación',
    emoji: '🎓',
    title: 'Centros educativos y academias',
    description:
      'Claustros, consejos técnicos, reuniones de coordinación: se deciden en la sala, no en una videollamada.',
    points: [
      'Grabación desde el móvil, sin equipo extra',
      'Un acta por reunión, lista para archivar',
      'Cada docente recibe solo lo suyo',
      'Búsqueda entre reuniones anteriores',
    ],
  },
  {
    label: 'Equipos',
    emoji: '📋',
    title: 'Direcciones y coordinaciones de equipo',
    description:
      'Reuniones semanales de seguimiento donde lo único que importa es qué quedó pendiente y quién lo tiene.',
    points: [
      'Compromisos con prioridad y fecha',
      'Recordatorio un día antes de vencer',
      'Bloqueos y estados de proyecto aparte',
      'Comparte el acta por WhatsApp',
    ],
  },
  {
    label: 'Campo y obra',
    emoji: '🦺',
    title: 'Equipos de campo y obra',
    description:
      'Visitas de obra y reuniones en sitio, donde nadie se va a sentar a redactar un acta después.',
    points: [
      'Graba desde el móvil, incluso con mala señal',
      'Compromisos con responsable claro',
      'Enlace directo a Google Calendar por tarea',
      'El acta llega por correo antes de irte del sitio',
    ],
  },
];

const FAQS: FaqItem[] = [
  {
    question: '¿Necesito instalar algo para grabar una reunión?',
    answer:
      'No. Funciona desde el navegador, en el móvil o en la computadora. Si prefieres capturar videollamadas de Meet, Zoom o Teams directamente, también hay una extensión de Chrome.',
  },
  {
    question: '¿Funciona en reuniones presenciales, no solo en videollamadas?',
    answer:
      'Sí, y de hecho es el caso principal: grabas desde el móvil en la sala, el comité o la obra, y el resto del proceso —transcripción, acta, correos— es igual que con una videollamada.',
  },
  {
    question: '¿Los participantes necesitan crear una cuenta?',
    answer:
      'No. Cada participante recibe un correo con sus compromisos y puede abrir el acta con un enlace personal, sin registrarse ni pagar por un asiento.',
  },
  {
    question: '¿En qué idioma funciona?',
    answer:
      'Está pensado para español desde el diseño del acta: no es la traducción de un resumen en inglés con viñetas genéricas.',
  },
  {
    question: '¿Qué pasa si la reunión no tuvo compromisos claros, solo fue informativa?',
    answer:
      'El acta lo refleja tal cual. Si no hubo compromisos ni decisiones, esos apartados quedan vacíos en vez de inventar contenido para que el documento "se vea completo".',
  },
  {
    question: '¿Qué pasa con la privacidad del audio y la transcripción?',
    answer:
      'El audio se borra automáticamente a los 30 días. El acta y los compromisos se conservan para que puedas consultarlos, y puedes exportar o borrar toda tu información cuando quieras desde tu perfil.',
  },
  {
    question: '¿Cuánto cuesta?',
    answer:
      'Hoy es gratis: ZRNote está en fase de prueba y no pedimos tarjeta ni cobramos nada por usarlo.',
  },
];

export default function LandingPage() {
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'ZR Tech Solutions',
      url: siteUrl,
      logo: `${siteUrl}/icon.svg`,
      founder: { '@type': 'Person', name: 'Pedro Mejías' },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'ZRNote',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      url: siteUrl,
      description:
        'Graba cualquier reunión, presencial o virtual. ZRNote transcribe, redacta el acta en español y envía a cada participante sus compromisos por correo, sin que necesiten cuenta.',
      inLanguage: 'es',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      creator: { '@type': 'Organization', name: 'ZR Tech Solutions' },
      author: { '@type': 'Person', name: 'Pedro Mejías' },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: FAQS.map((f) => ({
        '@type': 'Question',
        name: f.question,
        acceptedAnswer: { '@type': 'Answer', text: f.answer },
      })),
    },
  ];

  return (
    <div className="min-h-screen gradient-mesh overflow-x-hidden">
      {jsonLd.map((schema) => (
        <script
          key={schema['@type']}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
          suppressHydrationWarning
        />
      ))}

      {/* Nav */}
      <header className="sticky top-0 z-50 bg-white/70 dark:bg-slate-900/70 backdrop-blur-xl border-b border-slate-200/50 dark:border-slate-700/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <ZRLogo className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl shadow-lg" />
            <span className="font-bold text-slate-900 dark:text-slate-100 tracking-tight">ZRNote</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            <a href="#como-funciona" className="px-3 py-2 rounded-lg text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-white/60 dark:hover:bg-white/5 transition-all">
              Cómo funciona
            </a>
            <a href="#diferencias" className="px-3 py-2 rounded-lg text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-white/60 dark:hover:bg-white/5 transition-all">
              Diferencias
            </a>
            <a href="#para-quien" className="px-3 py-2 rounded-lg text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-white/60 dark:hover:bg-white/5 transition-all">
              Para quién
            </a>
            <a href="#preguntas" className="px-3 py-2 rounded-lg text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-white/60 dark:hover:bg-white/5 transition-all">
              Preguntas
            </a>
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle />
            <Link href="/login" className="hidden sm:inline-block px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 transition">
              Iniciar sesión
            </Link>
            <Link
              href="/signup"
              className="gradient-primary text-white px-4 py-2 rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-blue-500/25 transition-all duration-300 hover:-translate-y-0.5"
            >
              Crear cuenta
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative bg-zr-pattern">
        <div className="absolute top-10 left-[5%] w-72 h-72 bg-blue-400/20 rounded-full blur-3xl animate-float" />
        <div className="absolute bottom-0 right-[5%] w-96 h-96 bg-blue-300/15 rounded-full blur-3xl animate-float" style={{ animationDelay: '1s' }} />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-14 pb-20 sm:pt-20 sm:pb-28">
          <div className="grid lg:grid-cols-[1.1fr_1fr] gap-12 lg:gap-10 items-center">
            <div>
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/15 backdrop-blur-sm border border-white/25 text-white text-xs font-medium mb-6">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-300" />
                Presencial y virtual · en español
              </span>

              <h1
                className="font-sora text-4xl sm:text-5xl lg:text-[3.4rem] font-extrabold text-white leading-[1.08] tracking-tight"
              >
                El acta y los compromisos de tu reunión, listos solos
              </h1>

              <p className="mt-6 text-lg text-blue-50/90 leading-relaxed max-w-xl">
                Graba desde el móvil o el navegador — presencial o por videollamada. ZRNote transcribe,
                redacta el acta en español y le manda a cada persona sus propios compromisos por correo.
                Nadie tiene que tomar notas.
              </p>

              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <Link
                  href="/signup"
                  className="inline-flex items-center justify-center gap-2 bg-white text-blue-700 px-6 py-3.5 rounded-xl font-semibold hover:shadow-2xl hover:shadow-black/20 transition-all duration-300 hover:-translate-y-0.5"
                >
                  Crear cuenta gratis
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </Link>
                <a
                  href="#como-funciona"
                  className="inline-flex items-center justify-center gap-2 bg-white/10 text-white border border-white/25 backdrop-blur-sm px-6 py-3.5 rounded-xl font-medium hover:bg-white/15 transition-all duration-300"
                >
                  Ver cómo funciona
                </a>
              </div>

              <p className="mt-5 text-sm text-blue-100/70">
                Gratis mientras estamos en fase de prueba · No necesitas tarjeta
              </p>
            </div>

            <RevealOnScroll delayMs={150}>
              <LiveDemo />
            </RevealOnScroll>
          </div>
        </div>
      </section>

      {/* El problema */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
        <RevealOnScroll>
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="font-sora text-3xl sm:text-4xl font-bold text-slate-900 dark:text-slate-100">
              Lo que se decide en una reunión suele quedarse en la reunión
            </h2>
          </div>
        </RevealOnScroll>

        <div className="grid sm:grid-cols-3 gap-5">
          {[
            {
              icon: '🏢',
              title: 'Las reuniones presenciales no las graba nadie',
              text: 'Comités, consejos, visitas de obra: se decide todo y no queda más registro que lo que alguien alcance a escribir a mano.',
            },
            {
              icon: '💬',
              title: 'Los compromisos se pierden en la memoria',
              text: 'Se dice "yo me encargo" y ahí se queda — sin dueño, sin fecha, sin nadie que lo recuerde la semana siguiente.',
            },
            {
              icon: '🖥️',
              title: 'Las notas de IA solo viven en la videollamada',
              text: 'Las herramientas conectadas a Zoom o Meet no sirven cuando la reunión que de verdad importa no pasa por una pantalla.',
            },
          ].map((item, i) => (
            <RevealOnScroll key={item.title} delayMs={i * 100}>
              <div className="glass-strong rounded-2xl p-6 h-full">
                <span className="text-3xl" aria-hidden="true">{item.icon}</span>
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 mt-4">{item.title}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">{item.text}</p>
              </div>
            </RevealOnScroll>
          ))}
        </div>
      </section>

      {/* Cómo funciona */}
      <section id="como-funciona" className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28 scroll-mt-20">
        <RevealOnScroll>
          <div className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="font-sora text-3xl sm:text-4xl font-bold text-slate-900 dark:text-slate-100">
              Cómo funciona
            </h2>
            <p className="text-slate-500 dark:text-slate-400 mt-3">
              Cuatro pasos, y ninguno lo haces tú.
            </p>
          </div>
        </RevealOnScroll>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {STEPS.map((step, i) => (
            <RevealOnScroll key={step.n} delayMs={i * 100}>
              <div className="relative glass-strong rounded-2xl p-6 h-full">
                <span className="text-5xl font-sora font-extrabold text-gradient-brand opacity-80">
                  {step.n}
                </span>
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 mt-3">{step.title}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">{step.text}</p>
              </div>
            </RevealOnScroll>
          ))}
        </div>
      </section>

      {/* Diferenciadores */}
      <section id="diferencias" className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28 scroll-mt-20">
        <RevealOnScroll>
          <div className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="font-sora text-3xl sm:text-4xl font-bold text-slate-900 dark:text-slate-100">
              No es un notetaker más
            </h2>
            <p className="text-slate-500 dark:text-slate-400 mt-3">
              La mayoría de herramientas de notas con IA asumen que tu reunión ya está dentro de una
              videollamada, y que un resumen en inglés traducido basta. ZRNote parte de otro punto.
            </p>
          </div>
        </RevealOnScroll>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {DIFFERENTIATORS.map((item, i) => (
            <RevealOnScroll key={item.title} delayMs={(i % 3) * 100}>
              <div className="glass-strong rounded-2xl p-6 h-full hover:shadow-elevated transition-all duration-300 hover:-translate-y-0.5">
                <span className="text-3xl" aria-hidden="true">{item.emoji}</span>
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 mt-4">{item.title}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">{item.text}</p>
              </div>
            </RevealOnScroll>
          ))}
        </div>
      </section>

      {/* Para quién */}
      <section id="para-quien" className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28 scroll-mt-20">
        <RevealOnScroll>
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="font-sora text-3xl sm:text-4xl font-bold text-slate-900 dark:text-slate-100">
              Para quién es
            </h2>
            <p className="text-slate-500 dark:text-slate-400 mt-3">
              Cualquier grupo que se reúne y necesita que quede registro de lo acordado.
            </p>
          </div>
        </RevealOnScroll>
        <RevealOnScroll>
          <AudienceTabs audiences={AUDIENCES} />
        </RevealOnScroll>
      </section>

      {/* FAQ */}
      <section id="preguntas" className="max-w-3xl mx-auto px-4 sm:px-6 py-20 sm:py-28 scroll-mt-20">
        <RevealOnScroll>
          <div className="text-center mb-12">
            <h2 className="font-sora text-3xl sm:text-4xl font-bold text-slate-900 dark:text-slate-100">
              Preguntas frecuentes
            </h2>
          </div>
        </RevealOnScroll>
        <RevealOnScroll>
          <FaqAccordion items={FAQS} />
        </RevealOnScroll>
      </section>

      {/* CTA final */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-20 sm:pb-28">
        <RevealOnScroll>
          <div className="relative overflow-hidden rounded-3xl bg-zr-pattern p-10 sm:p-16 text-center">
            <div className="relative">
              <h2 className="font-sora text-3xl sm:text-4xl font-bold text-white">
                Graba tu próxima reunión con ZRNote
              </h2>
              <p className="text-blue-50/90 mt-3 max-w-lg mx-auto">
                Crea tu cuenta y prueba con una reunión real. Es gratis mientras estamos en fase de prueba.
              </p>
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 bg-white text-blue-700 px-7 py-3.5 rounded-xl font-semibold mt-7 hover:shadow-2xl hover:shadow-black/20 transition-all duration-300 hover:-translate-y-0.5"
              >
                Crear cuenta gratis
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
            </div>
          </div>
        </RevealOnScroll>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200/60 dark:border-slate-700/60">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <Link href="/" className="flex items-center gap-2.5">
              <ZRLogo className="w-7 h-7 rounded-lg shadow" />
              <span className="font-bold text-slate-900 dark:text-slate-100 text-sm">ZRNote</span>
            </Link>

            <div className="flex items-center gap-4 text-sm">
              <Link href="/legal/terminos" className="text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition">
                Condiciones
              </Link>
              <Link href="/legal/privacidad" className="text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition">
                Privacidad
              </Link>
              <Link href="/legal" className="text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition">
                Legal
              </Link>
              <a href="mailto:zr.coordinacion.tecnologia@gmail.com" className="text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition">
                Contacto
              </a>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-200/60 dark:border-slate-700/60 text-center">
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Un producto de <span className="font-medium text-slate-500 dark:text-slate-400">ZR Tech Solutions</span>
              {' '}· Desarrollado por <span className="font-medium text-slate-500 dark:text-slate-400">Pedro Mejías</span>
            </p>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2">
              Las minutas las genera una IA y pueden contener errores: revísalas antes de compartirlas.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
