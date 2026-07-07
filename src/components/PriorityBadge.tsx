const priorityStyles: Record<string, string> = {
  alta: 'bg-red-100 text-red-700',
  media: 'bg-amber-100 text-amber-700',
  baja: 'bg-emerald-100 text-emerald-700',
};

export function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span
      className={`px-2.5 py-1 rounded-full text-xs font-medium ${
        priorityStyles[priority] || 'bg-gray-100 text-gray-700'
      }`}
    >
      {priority}
    </span>
  );
}
