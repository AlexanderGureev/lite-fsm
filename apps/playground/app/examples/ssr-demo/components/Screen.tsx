import { Suspense } from "react";

import type { DemoScreenConfig } from "../store/ssr";

import { WidgetLoader } from "./WidgetLoader";
import { WidgetSkeleton } from "./Skeleton";

export function Screen({ screen }: { screen: DemoScreenConfig }) {
  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2 rounded-lg bg-canvas p-5 ring-1 ring-hairline">
        <p className="text-caption-strong text-primary">server page · cache-like widget store</p>
        <h2 className="text-tagline text-ink">{screen.title}</h2>
        <p className="text-body text-ink-muted-80">{screen.description}</p>
      </header>

      <div className="flex flex-col gap-6">
        {screen.widgets.map((widget) => (
          <Suspense key={widget.contentId} fallback={<WidgetSkeleton />}>
            <WidgetLoader widget={widget} />
          </Suspense>
        ))}
      </div>
    </section>
  );
}
