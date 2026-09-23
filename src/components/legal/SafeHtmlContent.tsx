'use client';

import { useEffect, useState } from 'react';
import { PURIFY_CONFIG } from '@/lib/safe-html';

export default function SafeHtmlContent({
  html,
  className,
}: {
  html: string;
  className?: string;
}) {
  const [clean, setClean] = useState('');

  useEffect(() => {
    import('dompurify').then((mod) => {
      const DOMPurify = mod.default;
      setClean(DOMPurify.sanitize(html, PURIFY_CONFIG));
    });
  }, [html]);

  if (!clean) {
    return <div className={className} aria-busy="true" />;
  }

  return <div className={className} dangerouslySetInnerHTML={{ __html: clean }} />;
}
