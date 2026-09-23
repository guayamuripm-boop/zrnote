'use client';

import { useMemo } from 'react';
import DOMPurify from 'dompurify';
import { PURIFY_CONFIG } from '@/lib/safe-html';

export default function SafeHtmlContent({
  html,
  className,
}: {
  html: string;
  className?: string;
}) {
  const clean = useMemo(() => DOMPurify.sanitize(html, PURIFY_CONFIG), [html]);
  return <div className={className} dangerouslySetInnerHTML={{ __html: clean }} />;
}
