export default function DashboardLoading() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-8 w-48 bg-slate-200 dark:bg-slate-700 rounded-lg" />
          <div className="h-4 w-32 bg-slate-100 dark:bg-slate-800 rounded mt-2" />
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="glass-strong rounded-2xl p-4 sm:p-5">
            <div className="w-10 h-10 bg-slate-200 dark:bg-slate-700 rounded-xl mb-3" />
            <div className="h-8 w-16 bg-slate-200 dark:bg-slate-700 rounded mb-1" />
            <div className="h-4 w-20 bg-slate-100 dark:bg-slate-800 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
