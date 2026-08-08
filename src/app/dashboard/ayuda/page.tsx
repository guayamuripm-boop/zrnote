import Link from 'next/link';
import InstallAppButton from '@/components/InstallAppButton';

export const metadata = {
  title: 'Cómo usar ZRNote',
};

interface Topic {
  id: string;
  emoji: string;
  title: string;
  intro: string;
  items: { q: string; a: string }[];
}

const TOPICS: Topic[] = [
  {
    id: 'grabar',
    emoji: '🎙️',
    title: 'Grabar una reunión',
    intro: 'Dos formas de empezar, desde "Reuniones → Nueva".',
    items: [
      {
        q: '«Grabar ahora»',
        a: 'Un toque y empieza a grabar de inmediato, sin formulario. El título lo pone la IA sola al terminar, a partir de lo que se habló.',
      },
      {
        q: 'Reunión programada',
        a: 'Rellenas el título, la coordinación y los participantes antes de grabar. Útil si ya sabes quién asistirá y quieres que reciban el acta.',
      },
      {
        q: 'Presencial o virtual',
        a: 'Para presencial, graba desde el móvil en la sala. Para videollamada, también existe una extensión de Chrome que graba Meet, Zoom o Teams directamente — pregunta si la quieres instalar, todavía no tiene un botón público.',
      },
      {
        q: 'Antes de grabar',
        a: 'Avisa en voz alta que vas a grabar y espera a que todos den su consentimiento. Es obligatorio por ley en la mayoría de países, no una formalidad de la app.',
      },
    ],
  },
  {
    id: 'acta',
    emoji: '📝',
    title: 'Tu acta (la minuta)',
    intro: 'Se genera sola al terminar de grabar. Se ve dentro de cada reunión.',
    items: [
      {
        q: 'Qué contiene',
        a: 'Resumen en párrafos cortos, decisiones tomadas, compromisos con responsable, bloqueos y próximos pasos. Si algo no se dijo, esa sección queda vacía en vez de inventarse.',
      },
      {
        q: 'Si no se oye nada',
        a: 'Cuando el micrófono estuvo silenciado o muy lejos, la app lo detecta y no genera un acta falsa: te avisa para que revises el audio y vuelvas a intentarlo.',
      },
      {
        q: 'Reintentar',
        a: 'Si el procesamiento falla, el botón "Reintentar" retoma desde donde quedó — no hay que grabar de nuevo.',
      },
    ],
  },
  {
    id: 'compromisos',
    emoji: '✅',
    title: 'Compromisos',
    intro: 'Las tareas que salen de una reunión. Viven en "Tareas" y dentro de cada reunión.',
    items: [
      {
        q: 'Qué llevan',
        a: 'Responsable, prioridad (alta / media / baja) y fecha límite si se acordó una en la reunión.',
      },
      {
        q: 'Marcar como hecho',
        a: 'Desde la reunión o desde "Tareas", con un toque en el estado de cada compromiso.',
      },
      {
        q: 'Recordatorio',
        a: 'Un correo automático llega un día antes de que venza un compromiso, sólo a quien lo tiene asignado.',
      },
      {
        q: 'Reasignar',
        a: 'Si la IA no identificó bien al responsable, se puede asignar a mano desde la reunión.',
      },
    ],
  },
  {
    id: 'correos',
    emoji: '📧',
    title: 'Correos automáticos',
    intro: 'Salen solos al terminar de procesar la reunión.',
    items: [
      {
        q: 'Quién recibe qué',
        a: 'Cada participante recibe un correo con SUS compromisos primero y el resto de la reunión después. Quien organizó recibe el acta completa con todas las tareas.',
      },
      {
        q: 'Sin necesidad de cuenta',
        a: 'Los invitados abren el acta completa con un enlace personal desde su correo, sin crear cuenta ni iniciar sesión.',
      },
      {
        q: 'Si algo falló',
        a: 'El botón "Enviar correos" dentro de la reunión los reenvía a todos, aunque ya se hubieran mandado antes.',
      },
      {
        q: 'Dejar de recibir correos',
        a: 'Cualquier destinatario puede darse de baja con un enlace al final de cada correo, sin tener que pedírselo a nadie.',
      },
    ],
  },
  {
    id: 'buscar',
    emoji: '🔍',
    title: 'Buscar en reuniones pasadas',
    intro: 'El buscador está arriba, en el inicio del dashboard.',
    items: [
      {
        q: 'Cómo se usa',
        a: 'Pregunta en lenguaje natural, como "¿qué quedó pendiente del presupuesto de marketing?", y la IA busca en todas tus reuniones anteriores y responde con las fuentes.',
      },
    ],
  },
  {
    id: 'compartir',
    emoji: '📤',
    title: 'Compartir y exportar',
    intro: 'Los botones están arriba de cada acta, junto al título "Minuta".',
    items: [
      {
        q: 'WhatsApp',
        a: 'Manda un resumen corto con los compromisos y un enlace al acta completa — no el documento entero, para que sea rápido de leer en el chat.',
      },
      {
        q: 'PDF',
        a: 'Descarga el acta completa en un documento, lista para archivar o imprimir.',
      },
      {
        q: 'Google Calendar',
        a: 'Cada compromiso tiene su propio enlace para añadirlo directamente a tu calendario, con la fecha ya puesta si se acordó una.',
      },
    ],
  },
  {
    id: 'instalar',
    emoji: '📲',
    title: 'Instalar la app',
    intro: 'Desde el perfil o el botón de instalar en la barra superior.',
    items: [
      {
        q: 'Para qué sirve',
        a: 'Queda como un icono en tu escritorio o pantalla de inicio, se abre sin la barra del navegador, y graba con más fiabilidad en segundo plano mientras la pantalla está apagada.',
      },
      {
        q: 'En iPhone',
        a: 'Safari no deja instalar con un botón: hay que usar Compartir → «Añadir a pantalla de inicio». El botón de instalar te muestra estos pasos.',
      },
    ],
  },
  {
    id: 'privacidad',
    emoji: '🔒',
    title: 'Privacidad y tus datos',
    intro: 'Todo esto está en tu perfil.',
    items: [
      {
        q: 'El audio',
        a: 'Se borra automáticamente a los 30 días. El acta y los compromisos se conservan para que puedas consultarlos.',
      },
      {
        q: 'Descargar tus datos',
        a: 'Desde "Mi Perfil → Descargar todos mis datos" se genera un archivo con todas tus reuniones, actas y compromisos.',
      },
      {
        q: 'Borrar tu cuenta',
        a: 'También desde el perfil, al final. Es permanente: borra reuniones, audio y compromisos.',
      },
    ],
  },
];

export default function AyudaPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition mb-4"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Inicio
        </Link>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100">Cómo usar ZRNote</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">
          Dónde está cada cosa y para qué sirve, en corto.
        </p>
      </div>

      {/* Chips de salto rápido — misma idea que la landing pública, aquí sólo
          entre secciones de una única página. */}
      <div className="flex flex-wrap gap-2">
        {TOPICS.map((t) => (
          <a
            key={t.id}
            href={`#${t.id}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium glass text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition"
          >
            <span aria-hidden="true">{t.emoji}</span>
            {t.title}
          </a>
        ))}
      </div>

      <div className="space-y-5">
        {TOPICS.map((topic) => (
          <section key={topic.id} id={topic.id} className="glass-strong rounded-2xl p-5 sm:p-6 shadow-elevated scroll-mt-20">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-3">
              <span className="w-9 h-9 gradient-primary rounded-xl flex items-center justify-center text-lg shrink-0" aria-hidden="true">
                {topic.emoji}
              </span>
              {topic.title}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 ml-12">{topic.intro}</p>

            <div className="mt-4 ml-12 space-y-3">
              {topic.items.map((item) => (
                <div key={item.q} className="glass rounded-xl p-3.5">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{item.q}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{item.a}</p>
                </div>
              ))}
            </div>

            {topic.id === 'instalar' && (
              <div className="mt-4 ml-12">
                <InstallAppButton />
              </div>
            )}
          </section>
        ))}
      </div>

      <div className="glass-strong rounded-2xl p-5 text-center">
        <p className="text-sm text-slate-600 dark:text-slate-300">¿Algo no funcionó como esperabas?</p>
        <Link
          href="/dashboard/diagnostico"
          className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
        >
          Revisa el diagnóstico del sistema
        </Link>
      </div>
    </div>
  );
}
