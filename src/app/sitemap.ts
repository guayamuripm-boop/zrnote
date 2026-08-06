import type { MetadataRoute } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://zrnote.vercel.app';

// Los slugs legales viven en la base de datos (`src/app/legal/[slug]`), pero
// estos cuatro son estables desde el lanzamiento — ver `docs/DOCUMENTS` en
// `src/app/legal/page.tsx`. Listarlos a mano es más simple y más fiable que
// consultar la base en tiempo de build para un sitemap de cuatro URLs.
const LEGAL_SLUGS = ['consentimiento', 'terminos', 'privacidad', 'cookies'];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    { url: siteUrl, lastModified: now, changeFrequency: 'monthly', priority: 1 },
    { url: `${siteUrl}/signup`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${siteUrl}/login`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${siteUrl}/legal`, lastModified: now, changeFrequency: 'yearly', priority: 0.4 },
    ...LEGAL_SLUGS.map((slug) => ({
      url: `${siteUrl}/legal/${slug}`,
      lastModified: now,
      changeFrequency: 'yearly' as const,
      priority: 0.3,
    })),
  ];
}
