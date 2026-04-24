import { Suspense } from "react";

import type { DemoScreenConfig } from "@/src/ssr-demo";

import { SSRDemoWidgetSkeleton } from "./SSRDemoSkeleton";
import SSRDemoWidgetLoader from "./SSRDemoWidgetLoader";

export default function SSRDemoScreen({ screen }: { screen: DemoScreenConfig }) {
  return (
    <section className="grid gap-6">
      <header className="grid gap-2 rounded-[20px] border border-slate-400/15 bg-slate-950/70 p-5">
        <p className="text-xs uppercase tracking-[0.24em] text-blue-300/80">server page · cache-like widget store</p>
        <h1 className="text-2xl font-semibold text-slate-50">{screen.title}</h1>
        <p className="text-sm text-slate-400">{screen.description}</p>
      </header>

      <div className="grid gap-6">
        {screen.widgets.map((widget) => (
          <Suspense key={widget.contentId} fallback={<SSRDemoWidgetSkeleton />}>
            <SSRDemoWidgetLoader widget={widget} />
          </Suspense>
        ))}
      </div>
    </section>
  );
}
