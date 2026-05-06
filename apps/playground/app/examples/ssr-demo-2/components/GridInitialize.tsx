"use client";

import type { ReactNode } from "react";

import { useManager } from "../store";
import type { GridPage, ScreenId } from "../store/ssr";

export function GridInitialize({
  screenId,
  page,
  children,
}: {
  screenId: ScreenId;
  page: GridPage;
  children: ReactNode;
}) {
  const manager = useManager();

  if (!manager.getState().grid.context.screens[screenId]) {
    manager.transition({ type: "INITIAL_GRID_PAGE_DATA", payload: { screenId, page } });
  }

  return children;
}
