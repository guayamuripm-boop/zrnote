const priorityStyles: Record<string, string> = {
  alta: 'bg-indigo-800/10 text-indigo-800 border border-indigo-800/20',
  media: 'bg-indigo-100/50 text-indigo-700 border border-indigo-200/50',
  baja: 'bg-indigo-50 text-indigo-600 border border-indigo-200/50',
};

const priorityIcons: Record<string, string> = {
  alta: '↑',
  media: '→',
  baja: '↓',
};

export function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
        priorityStyles[priority] || 'bg-gray-50 text-gray-600 border border-gray-200/50'
      }`}
    >
      <span className="text-[10px]">{priorityIcons[priority] || '·'}</span>
      {priority}
    </span>
  );
}
