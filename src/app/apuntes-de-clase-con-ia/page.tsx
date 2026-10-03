import type { Metadata } from 'next';
import SeoLanding from '@/components/landing/SeoLanding';

const path = '/apuntes-de-clase-con-ia';

export const metadata: Metadata = {
  title: 'Apuntes de clase con IA: graba, transcribe y estudia',
  description:
    'ZRNote (ZR Note) convierte la grabación de una clase en apuntes: temario, conceptos, fórmulas, ejemplos resueltos, preguntas de repaso y tarjetas. En español y compartible por WhatsApp o NotebookLM.',
  alternates: { canonical: path },
  openGraph: { url: path, title: 'Apuntes de clase con IA · ZRNote' },
};

export default function Page() {
  return (
    <SeoLanding
      path={path}
      h1="Apuntes de clase con IA: graba la clase y estudia con ella"
      intro="Graba la clase desde el móvil y ZRNote la convierte en apuntes con los que puedes estudiar sin haber tomado una sola nota: temario, conceptos, fórmulas, ejemplos resueltos, preguntas de repaso y tarjetas de memoria."
      ctaLabel="Crear apuntes de mi clase"
      sections={[
        {
          title: 'Modo Clase',
          text: 'Elige el estilo «Clase» al crear la reunión. En lugar de un acta de reunión, obtienes material de estudio.',
          bullets: [
            'Temario completo en el orden en que se explicó',
            'Glosario de conceptos con las palabras del profesor',
            'Fórmulas y datos clave, con cuándo usarlos',
            'Ejemplos resueltos paso a paso',
            'Preguntas de repaso y tarjetas (con repaso espaciado)',
            'Lo que el docente dijo sobre el examen y los errores frecuentes',
          ],
        },
        {
          title: 'Solo lo que se dijo en clase',
          text: 'Los apuntes salen de la transcripción, no de conocimiento inventado: lo que estudias es lo que explicó tu profesor.',
        },
        {
          title: 'Compártelos completos',
          text: 'Manda los apuntes enteros a tus compañeros por WhatsApp o correo, o añade la minuta como fuente en NotebookLM para preguntarle dudas.',
        },
      ]}
      faqs={[
        { question: '¿Puedo subir una grabación que ya tengo?', answer: 'Sí. Sube el audio y se divide y sube automáticamente, incluso si dura horas.' },
        { question: '¿Sirve para clases largas?', answer: 'Sí. Una clase de una hora produce un temario completo con decenas de conceptos y tarjetas.' },
        { question: '¿Puedo pasar los apuntes a mis compañeros?', answer: 'Sí, completos, por WhatsApp, correo o con un enlace que no requiere cuenta.' },
        { question: '¿Es gratis?', answer: 'Sí, durante la fase beta.' },
      ]}
    />
  );
}
