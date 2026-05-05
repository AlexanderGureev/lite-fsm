import { FSMHydrationBoundary } from "lite-fsm/react";

import { createEntityListSnapshot, loadWidgetSeed, type GridManifestItem } from "../store/ssr";

import { WidgetSlot } from "./WidgetSlot";

export async function WidgetSeedLoader({ item }: { item: GridManifestItem }) {
  const seed = await loadWidgetSeed(item);

  return (
    <FSMHydrationBoundary snapshot={createEntityListSnapshot(seed)}>
      <WidgetSlot item={item} />
    </FSMHydrationBoundary>
  );
}
