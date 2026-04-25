"use client";

import type { ReactNode } from "react";

import { getWidgetFeedId, type WidgetSeed } from "@/src/ssr-demo";
import { useManager } from "@/src/store";

export default function SSRDemoWidgetInitialize({
  seed,
  children,
}: {
  seed: WidgetSeed;
  children: ReactNode;
}) {
  const manager = useManager();
  const feedId = getWidgetFeedId(seed.request);

  if (!manager.getState().widgetFeed.context.feeds[feedId]) {
    manager.transition({ type: "INITIAL_WIDGET_FEED_DATA", payload: seed });
  }

  return children;
}
