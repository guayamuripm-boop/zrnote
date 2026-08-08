// Convierte un bloque de texto en párrafos cortos.
//
// POR QUÉ EXISTE
// El resumen del acta se mostraba tal cual en cuatro sitios: la página de la
// reunión, el correo, la minuta pública y WhatsApp. Cuando el modelo devuelve
// las 3-5 frases en un solo bloque —que es lo que hacía antes— el resultado en
// un móvil es un muro de texto que cansa antes de empezarlo.
//
// El prompt ahora PIDE párrafos cortos, pero eso no basta por dos motivos:
//  1. Un modelo no garantiza el formato; a veces devuelve el bloque igual.
//  2. Las actas ya guardadas están en un solo bloque y también hay que
//     mostrarlas bien, sin regenerarlas.
//
// Por eso el corte se hace también al mostrar, no sólo al generar.

/** Frases por párrafo cuando hay que partir un bloque. */
const SENTENCES_PER_PARAGRAPH = 2;

/**
 * Parte un texto en frases.
 *
 * El corte busca un punto/interrogación/exclamación seguido de espacio y
 * mayúscula. Se exige la mayúscula a propósito: sin ella, abreviaturas como
 * "Sr.", "aprox." o "9 a.m." parten la frase por la mitad.
 */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Devuelve el texto como una lista de párrafos cortos.
 *
 * Si el texto YA trae saltos dobles (el modelo hizo caso al prompt) se
 * respetan tal cual: el modelo sabe mejor que nosotros dónde está el corte
 * natural entre ideas. Sólo se parte cuando llega en bloque.
 */
export function toParagraphs(text?: string | null, sentencesPerParagraph = SENTENCES_PER_PARAGRAPH): string[] {
  const clean = (text || '').trim();
  if (!clean) return [];

  const existing = clean
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  // Ya venía partido: respetar los cortes del modelo.
  if (existing.length > 1) return existing;

  const sentences = splitSentences(existing[0] ?? clean);
  if (sentences.length <= sentencesPerParagraph) return [existing[0] ?? clean];

  const paragraphs: string[] = [];
  for (let i = 0; i < sentences.length; i += sentencesPerParagraph) {
    paragraphs.push(sentences.slice(i, i + sentencesPerParagraph).join(' '));
  }

  // Un RESTO de una sola frase corta queda colgando al final: se pega al
  // párrafo anterior.
  //
  // La condición del resto (`% === 1`) importa: sin ella se fusionaba también
  // un último párrafo completo por el mero hecho de ser corto ("¡Quedó
  // cerrado! Se revisa el lunes." son 34 caracteres), y el texto acababa
  // volviendo a ser un solo bloque — justo lo contrario de lo que hace falta.
  const isLeftover = sentences.length % sentencesPerParagraph === 1;
  if (paragraphs.length > 1 && isLeftover) {
    const last = paragraphs[paragraphs.length - 1];
    if (last.length < 60) {
      paragraphs[paragraphs.length - 2] += ` ${last}`;
      paragraphs.pop();
    }
  }

  return paragraphs;
}
