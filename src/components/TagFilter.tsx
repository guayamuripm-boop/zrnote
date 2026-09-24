'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import type { Tag } from '@/components/TagPill';

export default function TagFilter({ tags }: { tags: Tag[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTag = searchParams.get('tag');

  if (!tags.length) return null;

  const setTag = (tagId: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (tagId) {
      params.set('tag', tagId);
    } else {
      params.delete('tag');
    }
    router.push(`/dashboard/meetings?${params.toString()}`);
  };

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
      <button
        onClick={() => setTag(null)}
        className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-full transition-all ${
          !activeTag
            ? 'gradient-primary text-white shadow-sm'
            : 'glass border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-white/80 dark:hover:bg-white/5'
        }`}
      >
        Todas
      </button>
      {tags.map((tag) => (
        <button
          key={tag.id}
          onClick={() => setTag(tag.id)}
          className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-full transition-all ${
            activeTag === tag.id
              ? 'text-white shadow-sm'
              : 'glass border text-slate-600 dark:text-slate-300 hover:bg-white/80 dark:hover:bg-white/5'
          }`}
          style={activeTag === tag.id
            ? { backgroundColor: tag.color }
            : { borderColor: `${tag.color}40` }
          }
        >
          <span
            className="inline-block w-2 h-2 rounded-full mr-1.5"
            style={{ backgroundColor: tag.color }}
          />
          {tag.name}
        </button>
      ))}
    </div>
  );
}
