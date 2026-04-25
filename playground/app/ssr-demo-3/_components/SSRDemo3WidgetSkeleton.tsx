export default function SSRDemo3WidgetSkeleton() {
  return (
    <section className="grid gap-4 rounded-[20px] border border-slate-400/15 bg-slate-950/50 p-5">
      <div className="h-4 w-44 animate-pulse rounded bg-slate-800" />
      <div className="grid gap-2 md:grid-cols-3">
        <div className="h-20 animate-pulse rounded-xl bg-slate-900/70" />
        <div className="h-20 animate-pulse rounded-xl bg-slate-900/70" />
        <div className="h-20 animate-pulse rounded-xl bg-slate-900/70" />
      </div>
    </section>
  );
}
