import type { Metadata } from 'next';
import SeoLanding from '@/components/landing/SeoLanding';

const path = '/minutas-de-reunion-con-ia';

export const metadata: Metadata = {
  title: 'Minutas de reunión con IA en español',
  description:
    'ZRNote (ZR Note) graba tu reunión, presencial o virtual, y genera la minuta con los compromisos de cada persona. Gratis, en español y sin que los invitados necesiten cuenta.',
  alternates: { canonical: path },
  openGraph: { url: path, title: 'Minutas de reunión con IA en español · ZRNote' },
};

export default function Page() {
  return (
    <SeoLanding
      path={path}
      h1="Minutas de reunión con IA, en español y sin tomar notas"
      intro="ZRNote graba tu reunión —en la sala o por videollamada—, la transcribe y redacta una minuta formal con decisiones, bloqueos y los compromisos de cada persona. Cada participante recibe por correo lo que le toca, sin crear cuenta."
      ctaLabel="Probar ZRNote gratis"
      sections={[
        {
          title: 'Qué contiene cada minuta',
          text: 'No es un resumen suelto: es un acta con la estructura de una reunión de trabajo.',
          bullets: [
            'Resumen, temas discutidos y decisiones',
            'Compromisos con responsable, prioridad y fecha límite',
            'Bloqueos, estado de proyectos y próximos pasos',
            'Archivo de calendario (.ics) con las tareas de cada persona',
          ],
        },
        {
          title: 'Funciona en reuniones presenciales',
          text: 'La mayoría de herramientas solo se integran en Zoom, Meet o Teams. ZRNote graba desde el navegador o el móvil, así que sirve también para comités, consejos, visitas de obra y reuniones de sala.',
        },
        {
          title: 'Comparte el acta completa',
          text: 'Copia la minuta entera, envíala por WhatsApp o pásala a NotebookLM. Los invitados la abren con un enlace, sin registrarse.',
        },
      ]}
      faqs={[
        { question: '¿ZRNote es gratis?', answer: 'Sí, durante la fase beta se puede usar sin coste.' },
        { question: '¿Necesitan cuenta los invitados?', answer: 'No. Reciben su parte por correo y ven la minuta con un enlace personal.' },
        { question: '¿Funciona en español?', answer: 'Sí. La transcripción y el acta están pensadas para español, no traducidas del inglés.' },
        { question: '¿Sirve para reuniones presenciales?', answer: 'Sí. Se graba desde el móvil o el navegador, no hace falta una videollamada.' },
      ]}
    />
  );
}
