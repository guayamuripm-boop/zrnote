/**
 * Mensajes de error PARA LA PERSONA que usa la app.
 *
 * El motivo técnico de un fallo del procesamiento viene cargado de cosas que
 * no tienen por qué (ni deben) llegarle al cliente: el nombre del proveedor
 * ("Groq", "Gemini"), códigos de estado HTTP ("429", "413"), cuerpos crudos de
 * la API y hasta nombres de variables de entorno. Mostrarle eso asusta y no le
 * dice qué hacer.
 *
 * La regla es simple: al cliente, SOLO la acción que no salió y qué hacer; el
 * detalle técnico ("el error en código") es para NOSOTROS y se queda en los
 * logs (`logger`), nunca en pantalla. Por eso estas funciones no reciben el
 * motivo para mostrarlo recortado, sino para CLASIFICARLO y elegir el mensaje
 * tranquilo que corresponde. Quien las llama debe registrar el motivo real con
 * `logger` antes de convertirlo.
 */

export type ProcessingPhase = 'transcribe' | 'analyze';

/** Señales, en el texto técnico, de que el servicio está saturado o sin cupo. */
const BUSY_SIGNALS = /\b429\b|demasiad|rate.?limit|quota|resource_exhausted|limit:\s*0|too many|tokens per/i;
/** Señales de un corte de red o un tiempo de espera agotado. */
const NETWORK_SIGNALS = /\b(408|502|503|504)\b|network|timeout|timed? ?out|fetch failed|econn|aborted|gateway|socket/i;
/** Señales de que el servicio no está configurado (falta una clave en servidor). */
const CONFIG_SIGNALS = /no configurada|not configured|api[_ ]?key|missing key|unauthorized|\b401\b|\b403\b/i;

/**
 * El mensaje tranquilo que ve la persona cuando el procesamiento no sale.
 *
 * `technicalReason` solo se usa para decidir el TONO (ocupado / sin conexión /
 * genérico). No se incrusta en el texto: el detalle va a los logs, aquí no.
 */
export function userFacingProcessingError(
  phase: ProcessingPhase,
  technicalReason?: string,
): string {
  const reason = technicalReason || '';
  const accion = phase === 'transcribe' ? 'transcribir el audio' : 'generar la minuta';

  if (BUSY_SIGNALS.test(reason)) {
    return `El servicio está muy ocupado ahora mismo y no pudo ${accion}. Tu audio está guardado a salvo: vuelve a pulsar «Reintentar» en un par de minutos.`;
  }

  if (NETWORK_SIGNALS.test(reason)) {
    return `Se interrumpió la conexión mientras intentábamos ${accion}. Tu audio está guardado: vuelve a pulsar «Reintentar» cuando tengas buena señal.`;
  }

  if (CONFIG_SIGNALS.test(reason)) {
    // Nunca revelamos QUÉ falta configurar — eso es cosa nuestra.
    return `El servicio no está disponible en este momento. Tu audio está guardado: inténtalo de nuevo en unos minutos.`;
  }

  return `No se pudo ${accion} en este momento. Tu audio está guardado a salvo: vuelve a pulsar «Reintentar» en unos minutos.`;
}
