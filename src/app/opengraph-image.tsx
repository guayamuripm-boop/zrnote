import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Generada en el momento de la petición con next/og — sin ningún archivo de
// imagen que mantener sincronizado con la marca. Los colores son los mismos
// del gradiente del isotipo (ZRLogo.tsx / public/icon.svg): #1E4D96 → #3869B1.
export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '80px',
          backgroundColor: '#0f172a',
          backgroundImage:
            'radial-gradient(circle at 15% 15%, rgba(56,105,177,0.55), transparent 45%), radial-gradient(circle at 85% 85%, rgba(30,77,150,0.6), transparent 50%)',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div
            style={{
              width: 84,
              height: 84,
              borderRadius: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundImage: 'linear-gradient(135deg, #1E4D96, #3869B1)',
              boxShadow: '0 20px 60px rgba(30,77,150,0.5)',
            }}
          >
            <span style={{ fontSize: 44, fontWeight: 800, color: '#fff' }}>ZR</span>
          </div>
          <span style={{ fontSize: 44, fontWeight: 700, color: '#f1f5f9' }}>ZRNote</span>
        </div>

        <div style={{ display: 'flex', marginTop: 56 }}>
          <span style={{ fontSize: 60, fontWeight: 800, color: '#ffffff', lineHeight: 1.15, maxWidth: 980 }}>
            Minutas y compromisos, listos solos
          </span>
        </div>

        <div style={{ display: 'flex', marginTop: 28 }}>
          <span style={{ fontSize: 30, color: '#93c5fd', maxWidth: 900, lineHeight: 1.4 }}>
            Graba la reunión. La IA transcribe, redacta el acta y envía a cada persona sus compromisos.
          </span>
        </div>
      </div>
    ),
    { ...size },
  );
}
