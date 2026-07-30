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

const ALLOWED_TAGS = new Set([
  'h1','h2','h3','h4','h5','h6','p','br','hr','ul','ol','li','a','strong',
  'b','em','i','u','s','del','ins','blockquote','pre','code','table','thead',
  'tbody','tr','th','td','caption','div','span','section','article','header',
  'footer','nav','main','dl','dt','dd','sub','sup','small','mark','abbr',
]);

const ALLOWED_ATTRS = new Set([
  'href','target','rel','class','id','style','colspan','rowspan','scope',
  'title','alt','width','height',
]);

/**
 * Sanitize HTML: strip tags not in whitelist, remove dangerous attributes
 * (event handlers, javascript: URLs). Keeps structural/formatting tags safe
 * for rendering legal documents with dangerouslySetInnerHTML.
 */
export function sanitizeHtml(html: string): string {
  return html
    .replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (match, tag, attrs) => {
      const lower = tag.toLowerCase();
      if (!ALLOWED_TAGS.has(lower)) return '';
      const isClosing = match.startsWith('</');
      if (isClosing) return `</${lower}>`;
      const cleanAttrs = (attrs as string)
        .replace(/\s([a-zA-Z-]+)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/g, (_m: string, name: string, val: string) => {
          const lowerName = name.toLowerCase();
          if (lowerName.startsWith('on')) return '';
          if (!ALLOWED_ATTRS.has(lowerName)) return '';
          const unquoted = val.replace(/^["']|["']$/g, '');
          if (lowerName === 'href' && /^\s*javascript:/i.test(unquoted)) return '';
          return ` ${lowerName}=${val}`;
        })
        .trim();
      return `<${lower}${cleanAttrs ? ' ' + cleanAttrs : ''}>`;
    })
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}
