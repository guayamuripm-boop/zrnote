import type { Metadata, Viewport } from 'next';
import { Poppins, Sora } from 'next/font/google';
import './globals.css';
import ServiceWorkerRegistrar from '@/components/ServiceWorkerRegistrar';

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-poppins',
});

// Sólo para los titulares grandes de la landing pública — el resto de la app
// sigue en Poppins. Autohospedada por next/font, así que no añade ningún
// dominio nuevo a la CSP.
const sora = Sora({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  display: 'swap',
  variable: '--font-sora',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Zoom stays enabled: blocking it breaks the app for anyone who needs larger
  // text, and it is not needed to prevent the iOS focus-zoom (the inputs
  // already use a 16px base size).
  themeColor: '#2563eb',
};

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://zrnote.vercel.app';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'ZRNote — Minutas y compromisos automáticos de cada reunión',
    template: '%s · ZRNote',
  },
  description:
    'Graba cualquier reunión, presencial o virtual, y recibe el acta con los compromisos de cada persona por correo, sin que nadie tenga que tomar notas. En español, sin cuenta para los invitados.',
  manifest: '/manifest.json',
  authors: [{ name: 'Pedro Mejías' }],
  creator: 'Pedro Mejías',
  publisher: 'ZR Tech Solutions',
  applicationName: 'ZRNote',
  keywords: [
    'minutas de reunión con IA',
    'acta de reunión automática',
    'transcripción de reuniones en español',
    'grabar reunión presencial',
    'seguimiento de compromisos y tareas',
    'software de actas para juntas directivas',
    'ZRNote',
  ],
  icons: {
    // The .ico carries 16/32/48 for browsers and Windows that still want it;
    // the SVG is what modern browsers pick and stays crisp at any zoom.
    icon: [
      { url: '/favicon.ico', sizes: '16x16 32x32 48x48' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
  appleWebApp: {
    capable: true,
    title: 'ZRNote',
    statusBarStyle: 'default',
  },
  openGraph: {
    type: 'website',
    locale: 'es_ES',
    url: siteUrl,
    siteName: 'ZRNote',
    title: 'ZRNote — Minutas y compromisos automáticos de cada reunión',
    description:
      'Graba cualquier reunión, presencial o virtual. La IA transcribe, redacta el acta y envía a cada persona sus compromisos por correo.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ZRNote — Minutas y compromisos automáticos de cada reunión',
    description:
      'Graba cualquier reunión, presencial o virtual. La IA transcribe, redacta el acta y envía a cada persona sus compromisos por correo.',
  },
  other: {
    // Next's appleWebApp only emits the (deprecated) apple- prefixed tag.
    // Chrome/Android wants this standard one too.
    'mobile-web-app-capable': 'yes',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning className="scroll-smooth">
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            try {
              var theme = localStorage.getItem('theme');
              if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                document.documentElement.classList.add('dark');
              }
            } catch(e) {}
          })()
        ` }} />
      </head>
      <body className={`${poppins.variable} ${sora.variable} font-sans`}>
        <ServiceWorkerRegistrar />
        {children}
      </body>
    </html>
  );
}
