const priorityStyles: Record<string, string> = {
  alta: 'bg-rose-50 text-rose-600 border border-rose-200/50',
  media: 'bg-amber-50 text-amber-600 border border-amber-200/50',
  baja: 'bg-emerald-50 text-emerald-600 border border-emerald-200/50',
};

const priorityIcons: Record<string, string> = {
  alta: '↑',
  media: '→',
  baja: '↓',
};

export function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium font-poppins ${
        priorityStyles[priority] || 'bg-gray-50 text-gray-600 border border-gray-200/50'
      }`}
    >
      <span className="text-[10px]">{priorityIcons[priority] || '·'}</span>
      {priority}
    </span>
  );
}
