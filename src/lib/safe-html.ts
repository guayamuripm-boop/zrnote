// ZRNote — Utilidad centralizada para escapar HTML en emails
// Previene XSS via contenido del LLM (transcripciones, action items, etc.)

/**
 * Escapa caracteres HTML peligrosos para inserción segura en HTML strings.
 * Equivalente a lodash.escape pero sin dependencias.
 */
export function escapeHtml(unsafe: unknown): string {
  if (unsafe === null || unsafe === undefined) return '';
  if (typeof unsafe !== 'string') {
    unsafe = String(unsafe);
  }
  return unsafe
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
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
