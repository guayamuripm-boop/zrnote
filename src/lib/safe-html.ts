import DOMPurify from 'isomorphic-dompurify';

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

const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    'h1','h2','h3','h4','h5','h6','p','br','hr','ul','ol','li','a','strong',
    'b','em','i','u','s','del','ins','blockquote','pre','code','table','thead',
    'tbody','tr','th','td','caption','div','span','section','article','header',
    'footer','nav','main','dl','dt','dd','sub','sup','small','mark','abbr',
  ],
  ALLOWED_ATTR: [
    'href','target','rel','class','id','colspan','rowspan','scope',
    'title','alt','width','height',
  ],
  ALLOW_DATA_ATTR: false,
};

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, PURIFY_CONFIG) as unknown as string;
}
