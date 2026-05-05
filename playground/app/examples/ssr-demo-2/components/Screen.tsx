import { Suspense } from "react";
import { FSMHydrationBoundary } from "lite-fsm/react";

import { createGridSnapshot, loadGridPage, type ScreenConfig } from "../store/ssr";

import { GridAppend } from "./GridAppend";
import { WidgetSeedLoader } from "./WidgetSeedLoader";
import { WidgetSkeleton } from "./Skeleton";

export async function Screen({ screen }: { screen: ScreenConfig }) {
  const page = await loadGridPage(screen.id);

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2 rounded-lg bg-canvas p-5 ring-1 ring-hairline">
        <p className="text-caption-strong text-primary">server grid manifest · independent widget streaming</p>
        <h2 className="text-tagline text-ink">{screen.title}</h2>
        <p className="text-body text-ink-muted-80">{screen.description}</p>
      </header>

      <FSMHydrationBoundary snapshot={createGridSnapshot(screen.id, page)}>
        <div className="flex flex-col gap-6">
          {page.items.map((item) => (
            <Suspense key={item.slotId} fallback={<WidgetSkeleton />}>
              <WidgetSeedLoader item={item} />
            </Suspense>
          ))}

          <GridAppend screenId={screen.id} initialItemCount={page.items.length} />
        </div>
      </FSMHydrationBoundary>
    </section>
  );
}
