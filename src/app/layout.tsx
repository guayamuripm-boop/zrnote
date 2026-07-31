import type { Metadata, Viewport } from 'next';
import { Poppins } from 'next/font/google';
import './globals.css';
import ServiceWorkerRegistrar from '@/components/ServiceWorkerRegistrar';

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-poppins',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Zoom stays enabled: blocking it breaks the app for anyone who needs larger
  // text, and it is not needed to prevent the iOS focus-zoom (the inputs
  // already use a 16px base size).
  themeColor: '#2563eb',
};

export const metadata: Metadata = {
  title: 'ZRNote — Minutas Inteligentes | ZR Mecacademy',
  description: 'Sistema de minutas automáticas para ZR Mecacademy. Graba, transcribe, genera minutas y envía action items.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'ZRNote',
    statusBarStyle: 'default',
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
    <html lang="es" suppressHydrationWarning>
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
      <body className={`${poppins.variable} font-sans`}>
        <ServiceWorkerRegistrar />
        {children}
      </body>
    </html>
  );
}
