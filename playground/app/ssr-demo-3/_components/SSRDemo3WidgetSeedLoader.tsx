import { FSMHydrationBoundary } from "lite-fsm/react";

import { createDemo3EntityListSnapshot, loadWidgetSeed } from "@/src/ssr-demo-3";
import type { GridManifestItem } from "@/src/ssr-demo-2";

import SSRDemo3WidgetSlot from "./SSRDemo3WidgetSlot";

export default async function SSRDemo3WidgetSeedLoader({ item }: { item: GridManifestItem }) {
  const seed = await loadWidgetSeed(item);

  return (
    <FSMHydrationBoundary snapshot={createDemo3EntityListSnapshot(seed)}>
      <SSRDemo3WidgetSlot item={item} />
    </FSMHydrationBoundary>
  );
}
