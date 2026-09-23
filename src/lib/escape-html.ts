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

export function escapeHtmlOrEmpty(unsafe: unknown): string {
  if (unsafe === null || unsafe === undefined) return '';
  return escapeHtml(unsafe);
}
