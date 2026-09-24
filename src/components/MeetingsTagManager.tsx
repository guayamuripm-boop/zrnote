'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import TagManager from '@/components/TagManager';
import type { Tag } from '@/components/TagPill';

export default function MeetingsTagManager({ initialTags }: { initialTags: Tag[] }) {
  const router = useRouter();
  const [tags, setTags] = useState<Tag[]>(initialTags);

  return (
    <TagManager
      tags={tags}
      onCreated={(tag) => {
        setTags((prev) => [...prev, tag].sort((a, b) => a.name.localeCompare(b.name)));
        router.refresh();
      }}
      onDeleted={(tagId) => {
        setTags((prev) => prev.filter((t) => t.id !== tagId));
        router.refresh();
      }}
    />
  );
}
