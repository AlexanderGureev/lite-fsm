import { FSMHydrationBoundary } from "lite-fsm/react";

import {
  createWidgetFeedSnapshot,
  loadWidgetSeed,
  type DemoContentType,
  type DemoWidgetConfig,
  type WidgetSeed,
} from "../store/ssr";

import { Widget } from "./Widget";

const fetchWidget: Record<DemoContentType, (widget: DemoWidgetConfig) => Promise<WidgetSeed>> = {
  mock_feed: loadWidgetSeed,
};

export async function WidgetLoader({ widget }: { widget: DemoWidgetConfig }) {
  const seed = await fetchWidget[widget.contentType](widget);

  return (
    <FSMHydrationBoundary snapshot={createWidgetFeedSnapshot(seed)}>
      <Widget widget={widget} seed={seed} />
    </FSMHydrationBoundary>
  );
}
