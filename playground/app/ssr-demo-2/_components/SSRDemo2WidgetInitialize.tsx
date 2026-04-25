"use client";

import type { ReactNode } from "react";

import type { WidgetSeed } from "@/src/ssr-demo-2";
import { useManager } from "@/src/store";
import { getListId } from "@/src/store/machines/entityList";

export default function SSRDemo2WidgetInitialize({
  seed,
  children,
}: {
  seed: WidgetSeed;
  children: ReactNode;
}) {
  const manager = useManager();
  const listId = getListId(seed.request);

  if (!manager.getState().entityList.context.lists[listId]) {
    manager.transition({ type: "INITIAL_ENTITY_LIST_DATA", payload: seed });
  }

  return children;
}
