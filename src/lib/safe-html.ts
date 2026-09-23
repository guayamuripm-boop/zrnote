import DOMPurify from 'isomorphic-dompurify';

export { escapeHtml, escapeHtmlOrEmpty } from '@/lib/escape-html';

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
