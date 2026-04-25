"use client";

import type { Demo2ScreenId } from "@/src/ssr-demo-2";
import { useSelector, useTransition } from "@/src/store";
import { selectSSRDemo2GridState } from "@/src/store/machines/ssrDemo2Grid";

import SSRDemo2WidgetSlot from "./SSRDemo2WidgetSlot";

export default function SSRDemo2GridAppend({
  screenId,
  initialItemCount,
}: {
  screenId: Demo2ScreenId;
  initialItemCount: number;
}) {
  const transition = useTransition();
  const grid = useSelector(selectSSRDemo2GridState(screenId));
  const appendedItems = grid.items.slice(initialItemCount);
  const isDisabled = grid.status === "loading" || !grid.hasNext;

  return (
    <>
      {appendedItems.map((item) => (
        <SSRDemo2WidgetSlot key={item.slotId} item={item} />
      ))}

      {grid.status === "error" ? (
        <p className="text-sm text-red-200">Grid page failed: {grid.error}</p>
      ) : null}

      <button
        type="button"
        onClick={() => transition({ type: "FETCH_GRID_PAGE", payload: { screenId } })}
        disabled={isDisabled}
        className="self-start rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-emerald-50 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
      >
        {grid.status === "loading" ? "Loading grid page..." : grid.hasNext ? "Load more grid" : "Grid complete"}
      </button>
    </>
  );
}
