import { Suspense } from "react";
import { FSMHydrationBoundary } from "lite-fsm/react";

import { createDemo3GridSnapshot, loadGridPage, type Demo3ScreenConfig } from "@/src/ssr-demo-3";

import SSRDemo3GridAppend from "./SSRDemo3GridAppend";
import SSRDemo3WidgetSeedLoader from "./SSRDemo3WidgetSeedLoader";
import SSRDemo3WidgetSkeleton from "./SSRDemo3WidgetSkeleton";

export default async function SSRDemo3Screen({ screen }: { screen: Demo3ScreenConfig }) {
  const page = await loadGridPage(screen.id);

  return (
    <section className="grid gap-6">
      <header className="grid gap-2 rounded-[20px] border border-slate-400/15 bg-slate-950/70 p-5">
        <p className="text-xs uppercase tracking-[0.24em] text-violet-300/80">
          server snapshots · FSMHydrationBoundary
        </p>
        <h1 className="text-2xl font-semibold text-slate-50">{screen.title}</h1>
        <p className="max-w-2xl text-sm text-slate-400">{screen.description}</p>
      </header>

      <FSMHydrationBoundary snapshot={createDemo3GridSnapshot(screen.id, page)}>
        <div className="grid gap-6">
          {page.items.map((item) => (
            <Suspense key={item.slotId} fallback={<SSRDemo3WidgetSkeleton />}>
              <SSRDemo3WidgetSeedLoader item={item} />
            </Suspense>
          ))}

          <SSRDemo3GridAppend screenId={screen.id} initialItemCount={page.items.length} />
        </div>
      </FSMHydrationBoundary>
    </section>
  );
}
