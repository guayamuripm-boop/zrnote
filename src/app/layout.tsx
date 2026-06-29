import type { Metadata, Viewport } from 'next';
import './globals.css';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: 'ZRNote — Minutas Inteligentes | ZR Mecacademy',
  description: 'Sistema de minutas automáticas para ZR Mecacademy. Graba, transcribe, genera minutas y envía action items.',
  manifest: '/manifest.json',
  themeColor: '#21284F',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
