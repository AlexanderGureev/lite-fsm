"use client";

import type { ReactNode } from "react";

import type { Demo2ScreenId, GridPage } from "@/src/ssr-demo-2";
import { useManager } from "@/src/store";

export default function SSRDemo2GridInitialize({
  screenId,
  page,
  children,
}: {
  screenId: Demo2ScreenId;
  page: GridPage;
  children: ReactNode;
}) {
  const manager = useManager();

  if (!manager.getState().ssrDemo2Grid.context.screens[screenId]) {
    manager.transition({ type: "INITIAL_GRID_PAGE_DATA", payload: { screenId, page } });
  }

  return children;
}
