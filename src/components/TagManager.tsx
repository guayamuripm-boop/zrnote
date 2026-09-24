'use client';

import { useState } from 'react';
import type { Tag } from '@/components/TagPill';

const TAG_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#f43f5e',
  '#8b5cf6', '#06b6d4', '#f97316', '#64748b',
];

export default function TagManager({
  tags,
  onCreated,
  onDeleted,
}: {
  tags: Tag[];
  onCreated: (tag: Tag) => void;
  onDeleted: (tagId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState(TAG_COLORS[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const create = async () => {
    if (!name.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), color }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Error al crear');
        return;
      }
      const { tag } = await res.json();
      onCreated(tag);
      setName('');
      setColor(TAG_COLORS[0]);
    } finally {
      setLoading(false);
    }
  };

  const remove = async (tagId: string) => {
    const res = await fetch(`/api/tags?id=${tagId}`, { method: 'DELETE' });
    if (res.ok) onDeleted(tagId);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
        </svg>
        Etiquetas
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => setOpen(false)}>
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
      <div
        className="relative glass-strong rounded-2xl p-6 shadow-float w-full max-w-sm space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-semibold text-slate-900 dark:text-slate-100">Administrar etiquetas</h3>

        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nueva etiqueta..."
              maxLength={30}
              className="flex-1 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-white/80 dark:bg-white/5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              onKeyDown={(e) => e.key === 'Enter' && create()}
            />
            <button
              onClick={create}
              disabled={loading || !name.trim()}
              className="gradient-primary text-white px-3 py-2 rounded-xl text-sm font-medium disabled:opacity-50 transition"
            >
              Crear
            </button>
          </div>
          <div className="flex gap-1.5">
            {TAG_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-6 h-6 rounded-full transition-all ${
                  color === c ? 'ring-2 ring-offset-2 ring-blue-500 dark:ring-offset-slate-800' : ''
                }`}
                style={{ backgroundColor: c }}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>
          {error && <p className="text-xs text-rose-500">{error}</p>}
        </div>

        {tags.length > 0 && (
          <ul className="space-y-1 max-h-48 overflow-y-auto">
            {tags.map((tag) => (
              <li key={tag.id} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 group">
                <span className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: tag.color }} />
                  {tag.name}
                </span>
                <button
                  onClick={() => remove(tag.id)}
                  className="text-slate-300 dark:text-slate-600 hover:text-rose-500 dark:hover:text-rose-400 opacity-0 group-hover:opacity-100 transition"
                  aria-label={`Eliminar ${tag.name}`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}

        <button
          onClick={() => setOpen(false)}
          className="w-full text-center text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}
