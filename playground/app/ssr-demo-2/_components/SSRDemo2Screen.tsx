import { Suspense } from "react";

import { loadGridPage, type Demo2ScreenConfig } from "@/src/ssr-demo-2";

import SSRDemo2GridAppend from "./SSRDemo2GridAppend";
import SSRDemo2GridInitialize from "./SSRDemo2GridInitialize";
import SSRDemo2WidgetSeedLoader from "./SSRDemo2WidgetSeedLoader";
import SSRDemo2WidgetSkeleton from "./SSRDemo2WidgetSkeleton";

export default async function SSRDemo2Screen({ screen }: { screen: Demo2ScreenConfig }) {
  const page = await loadGridPage(screen.id);

  return (
    <section className="grid gap-6">
      <header className="grid gap-2 rounded-[20px] border border-slate-400/15 bg-slate-950/70 p-5">
        <p className="text-xs uppercase tracking-[0.24em] text-emerald-300/80">
          server grid manifest · independent widget streaming
        </p>
        <h1 className="text-2xl font-semibold text-slate-50">{screen.title}</h1>
        <p className="max-w-2xl text-sm text-slate-400">{screen.description}</p>
      </header>

      <SSRDemo2GridInitialize screenId={screen.id} page={page}>
        <div className="grid gap-6">
          {page.items.map((item) => (
            <Suspense key={item.slotId} fallback={<SSRDemo2WidgetSkeleton />}>
              <SSRDemo2WidgetSeedLoader item={item} />
            </Suspense>
          ))}

          <SSRDemo2GridAppend screenId={screen.id} initialItemCount={page.items.length} />
        </div>
      </SSRDemo2GridInitialize>
    </section>
  );
}
