import { loadWidgetSeed, type GridManifestItem } from "../store/ssr";

import { WidgetInitialize } from "./WidgetInitialize";
import { WidgetSlot } from "./WidgetSlot";

export async function WidgetSeedLoader({ item }: { item: GridManifestItem }) {
  const seed = await loadWidgetSeed(item);

  return (
    <WidgetInitialize seed={seed}>
      <WidgetSlot item={item} />
    </WidgetInitialize>
  );
}
