import { loadWidgetSeed, type GridManifestItem } from "@/src/ssr-demo-2";

import SSRDemo2WidgetInitialize from "./SSRDemo2WidgetInitialize";
import SSRDemo2WidgetSlot from "./SSRDemo2WidgetSlot";

export default async function SSRDemo2WidgetSeedLoader({ item }: { item: GridManifestItem }) {
  const seed = await loadWidgetSeed(item);

  return (
    <SSRDemo2WidgetInitialize seed={seed}>
      <SSRDemo2WidgetSlot item={item} />
    </SSRDemo2WidgetInitialize>
  );
}
