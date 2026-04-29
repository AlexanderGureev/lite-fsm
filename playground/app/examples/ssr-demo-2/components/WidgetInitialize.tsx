"use client";

import type { ReactNode } from "react";

import { useManager } from "../store";
import { getListId } from "../store/machines/entityList";
import type { WidgetSeed } from "../store/ssr";

export function WidgetInitialize({ seed, children }: { seed: WidgetSeed; children: ReactNode }) {
  const manager = useManager();
  const listId = getListId(seed.request);

  if (!manager.getState().entityList.context.lists[listId]) {
    manager.transition({ type: "INITIAL_ENTITY_LIST_DATA", payload: seed });
  }

  return children;
}
