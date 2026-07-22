// ZRNote — Utilidad centralizada para escapar HTML en emails
// Previene XSS via contenido del LLM (transcripciones, action items, etc.)

/**
 * Escapa caracteres HTML peligrosos para inserción segura en HTML strings.
 * Equivalente a lodash.escape pero sin dependencias.
 */
export function escapeHtml(unsafe: unknown): string {
  if (unsafe === null || unsafe === undefined) return '';
  let safe: string;
  if (typeof unsafe !== 'string') {
    safe = String(unsafe);
  } else {
    safe = unsafe;
  }
  return safe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Versión "safe" — devuelve string vacío si el input es null/undefined/empty-string;
 * útil para campos opcionales en emails.
 */
export function escapeHtmlOrEmpty(unsafe: unknown): string {
  if (unsafe === null || unsafe === undefined) return '';
  return escapeHtml(unsafe);
}
