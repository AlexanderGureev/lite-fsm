"use client";

import type { ReactNode } from "react";

import { useManager } from "../store";
import { getWidgetFeedId, type WidgetSeed } from "../store/ssr";

export function WidgetInitialize({ seed, children }: { seed: WidgetSeed; children: ReactNode }) {
  const manager = useManager();
  const feedId = getWidgetFeedId(seed.request);

  if (!manager.getState().widgetFeed.context.feeds[feedId]) {
    manager.transition({ type: "INITIAL_WIDGET_FEED_DATA", payload: seed });
  }

  return children;
}
