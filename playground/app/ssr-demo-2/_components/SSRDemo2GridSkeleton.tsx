export default function SSRDemo2GridSkeleton() {
  return (
    <section className="grid gap-6">
      {Array.from({ length: 2 }).map((_, index) => (
        <div key={index} className="grid gap-4 rounded-[20px] border border-slate-400/15 bg-slate-950/70 p-5">
          <div className="space-y-2">
            <div className="h-3 w-36 animate-pulse rounded bg-slate-800" />
            <div className="h-6 w-56 animate-pulse rounded bg-slate-800" />
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, itemIndex) => (
              <div key={itemIndex} className="h-16 rounded-xl border border-slate-400/15 bg-slate-900/40" />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
