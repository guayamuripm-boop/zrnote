import type { MetadataRoute } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://zrnote.vercel.app';

// Los slugs legales viven en la base de datos (`src/app/legal/[slug]`), pero
// estos cuatro son estables desde el lanzamiento — ver `docs/DOCUMENTS` en
// `src/app/legal/page.tsx`. Listarlos a mano es más simple y más fiable que
// consultar la base en tiempo de build para un sitemap corto.
const LEGAL_SLUGS = ['consentimiento', 'terminos', 'privacidad', 'cookies'];

// Fechas FIJAS, a propósito. Con `new Date()` el `lastmod` cambiaba en cada
// petición y los buscadores aprenden a ignorarlo. Actualiza estas fechas
// cuando cambie el contenido de la página correspondiente.
const CONTENT_UPDATED = new Date('2026-10-02');
const LEGAL_UPDATED = new Date('2026-09-01');

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: siteUrl, lastModified: CONTENT_UPDATED, changeFrequency: 'weekly', priority: 1 },
    { url: `${siteUrl}/minutas-de-reunion-con-ia`, lastModified: CONTENT_UPDATED, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${siteUrl}/apuntes-de-clase-con-ia`, lastModified: CONTENT_UPDATED, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${siteUrl}/signup`, lastModified: CONTENT_UPDATED, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${siteUrl}/login`, lastModified: CONTENT_UPDATED, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${siteUrl}/legal`, lastModified: LEGAL_UPDATED, changeFrequency: 'yearly', priority: 0.4 },
    ...LEGAL_SLUGS.map((slug) => ({
      url: `${siteUrl}/legal/${slug}`,
      lastModified: LEGAL_UPDATED,
      changeFrequency: 'yearly' as const,
      priority: 0.3,
    })),
  ];
}
