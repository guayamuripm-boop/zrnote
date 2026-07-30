const priorityStyles: Record<string, string> = {
  alta: 'bg-rose-50 text-rose-700 border border-rose-200/60',
  media: 'bg-amber-50 text-amber-700 border border-amber-200/60',
  baja: 'bg-emerald-50 text-emerald-700 border border-emerald-200/60',
};

const darkPriorityStyles: Record<string, string> = {
  alta: 'dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800/40',
  media: 'dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800/40',
  baja: 'dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800/40',
};

const priorityIcons: Record<string, string> = {
  alta: '↑',
  media: '→',
  baja: '↓',
};

// `priority` comes from an LLM-populated column, so it can legitimately be null.
export function PriorityBadge({ priority }: { priority?: string | null }) {
  const value = priority || 'media';
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
        priorityStyles[value] || 'bg-gray-100 text-gray-600'
      } ${darkPriorityStyles[value] || 'dark:bg-gray-800 dark:text-gray-400'}`}
    >
      <span className="text-[10px]">{priorityIcons[value] || '·'}</span>
      {value}
    </span>
  );
}