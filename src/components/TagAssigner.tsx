'use client';

import { useEffect, useState } from 'react';
import TagPill from '@/components/TagPill';
import type { Tag } from '@/components/TagPill';

export default function TagAssigner({ meetingId }: { meetingId: string }) {
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch('/api/tags').then((r) => r.json()),
      fetch(`/api/meetings/${meetingId}/tags`).then((r) => r.json()),
    ]).then(([tagsRes, meetingTagsRes]) => {
      setAllTags(tagsRes.tags || []);
      setAssignedIds(new Set((meetingTagsRes.tags || []).map((t: Tag) => t.id)));
      setLoaded(true);
    });
  }, [meetingId]);

  const toggle = async (tagId: string) => {
    const isAssigned = assignedIds.has(tagId);
    const next = new Set(assignedIds);

    if (isAssigned) {
      next.delete(tagId);
      setAssignedIds(next);
      await fetch(`/api/meetings/${meetingId}/tags`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagId }),
      });
    } else {
      next.add(tagId);
      setAssignedIds(next);
      await fetch(`/api/meetings/${meetingId}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagId }),
      });
    }
  };

  if (!loaded) return null;

  const assignedTags = allTags.filter((t) => assignedIds.has(t.id));

  return (
    <div className="relative inline-flex items-center gap-1.5 flex-wrap">
      {assignedTags.map((tag) => (
        <TagPill key={tag.id} tag={tag} onRemove={() => toggle(tag.id)} />
      ))}
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition px-1.5 py-0.5 rounded-full border border-dashed border-slate-300 dark:border-slate-600 hover:border-blue-400 dark:hover:border-blue-500"
        aria-label="Asignar etiqueta"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        {assignedTags.length === 0 && 'Etiqueta'}
      </button>

      {open && allTags.length > 0 && (
        <>
          <div className="fixed inset-0 z-[50]" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-[51] glass-strong rounded-xl shadow-float p-2 min-w-[180px]">
            {allTags.map((tag) => (
              <button
                key={tag.id}
                onClick={() => toggle(tag.id)}
                className="flex items-center gap-2 w-full text-left px-3 py-1.5 rounded-lg text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50 transition"
              >
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                <span className="flex-1 text-slate-700 dark:text-slate-200">{tag.name}</span>
                {assignedIds.has(tag.id) && (
                  <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </>
      )}

      {open && allTags.length === 0 && (
        <>
          <div className="fixed inset-0 z-[50]" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-[51] glass-strong rounded-xl shadow-float p-3 min-w-[180px]">
            <p className="text-xs text-slate-400 dark:text-slate-500">
              No hay etiquetas. Crea una desde la lista de reuniones.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
