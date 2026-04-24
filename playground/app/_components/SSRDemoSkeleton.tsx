export function SSRDemoWidgetSkeleton() {
  return (
    <section className="grid gap-4 rounded-[20px] border border-slate-400/15 bg-slate-950/70 p-5">
      <div className="space-y-2">
        <div className="h-3 w-28 animate-pulse rounded bg-slate-800" />
        <div className="h-6 w-48 animate-pulse rounded bg-slate-800" />
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-xl border border-slate-400/15 bg-slate-900/40 p-3">
            <div className="h-4 w-32 animate-pulse rounded bg-slate-800" />
            <div className="mt-2 h-3 w-24 animate-pulse rounded bg-slate-900" />
          </div>
        ))}
      </div>

      <div className="h-9 w-40 animate-pulse rounded-xl bg-slate-800" />
    </section>
  );
}
