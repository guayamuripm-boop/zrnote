'use client';

import { useState, useRef } from 'react';

interface Source {
  index: number;
  meeting_id: string;
  section: string;
  similarity: number;
  preview: string;
}

export default function MeetingSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState('');
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError('');
    setAnswer('');
    setSources([]);

    try {
      const res = await fetch('/api/agent/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim(), topK: 8 }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Error en la búsqueda');
        return;
      }

      setAnswer(data.answer || '');
      setSources(data.sources || []);
    } catch {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 100); }}
        className="glass border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:border-blue-300 dark:hover:border-blue-600 transition-all flex items-center gap-2 w-full sm:w-auto"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        Buscar en reuniones...
      </button>
    );
  }

  return (
    <div className="glass-strong rounded-2xl p-5 shadow-elevated space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Pregunta algo sobre tus reuniones..."
            className="w-full pl-10 pr-4 py-2.5 glass rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={loading || !query.trim()}
          className="gradient-primary text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:shadow-lg transition-all disabled:opacity-50 shrink-0"
        >
          {loading ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            'Buscar'
          )}
        </button>
        <button
          onClick={() => { setOpen(false); setQuery(''); setAnswer(''); setSources([]); setError(''); }}
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition p-1"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {error && (
        <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
      )}

      {answer && (
        <div className="space-y-3">
          <div className="glass rounded-xl p-4">
            <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">{answer}</p>
          </div>
          {sources.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide">Fuentes</p>
              {sources.slice(0, 4).map((s) => (
                <a
                  key={s.index}
                  href={`/dashboard/meetings/${s.meeting_id}`}
                  className="block glass rounded-lg p-3 hover:shadow-md transition text-xs"
                >
                  <span className="text-blue-600 dark:text-blue-400 font-medium">[{s.index}] {s.section}</span>
                  <p className="text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{s.preview}</p>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
