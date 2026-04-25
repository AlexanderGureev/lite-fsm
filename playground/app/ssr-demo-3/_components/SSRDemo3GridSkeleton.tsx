import SSRDemo3WidgetSkeleton from "./SSRDemo3WidgetSkeleton";

export default function SSRDemo3GridSkeleton() {
  return (
    <section className="grid gap-6">
      <div className="grid gap-3 rounded-[20px] border border-slate-400/15 bg-slate-950/60 p-5">
        <div className="h-3 w-40 animate-pulse rounded bg-slate-800" />
        <div className="h-7 w-72 animate-pulse rounded bg-slate-800" />
        <div className="h-4 w-full max-w-xl animate-pulse rounded bg-slate-900" />
      </div>
      <SSRDemo3WidgetSkeleton />
      <SSRDemo3WidgetSkeleton />
    </section>
  );
}
