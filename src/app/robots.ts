import type { MetadataRoute } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://zrnote.vercel.app';

// Sólo la landing y los documentos legales son indexables. Todo lo demás es
// privado por naturaleza (dashboard, API) o inútil de indexar (una minuta
// pública concreta, una página de baja): esas dos NO son secretas — llevan su
// propia comprobación de firma — pero indexarlas no aporta nada a nadie que
// busque en Google y sí puede filtrar el título de una reunión ajena en los
// resultados de búsqueda.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/legal', '/legal/', '/login', '/signup'],
      disallow: ['/dashboard', '/api', '/minuta', '/baja'],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
