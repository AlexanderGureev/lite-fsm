"use client";

import type { Demo3ScreenId } from "@/src/ssr-demo-3";
import { useSelector, useTransition } from "@/src/store";
import { selectSSRDemo3GridState } from "@/src/store/machines/ssrDemo3Grid";

import SSRDemo3WidgetSlot from "./SSRDemo3WidgetSlot";

export default function SSRDemo3GridAppend({
  screenId,
  initialItemCount,
}: {
  screenId: Demo3ScreenId;
  initialItemCount: number;
}) {
  const transition = useTransition();
  const grid = useSelector(selectSSRDemo3GridState(screenId));
  const appendedItems = grid.items.slice(initialItemCount);
  const isDisabled = grid.status === "loading" || !grid.hasNext;

  return (
    <>
      {appendedItems.map((item) => (
        <SSRDemo3WidgetSlot key={item.slotId} item={item} />
      ))}

      {grid.status === "error" ? <p className="text-sm text-red-200">Grid page failed: {grid.error}</p> : null}

      <button
        type="button"
        onClick={() => transition({ type: "FETCH_DEMO3_GRID_PAGE", payload: { screenId } })}
        disabled={isDisabled}
        className="self-start rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-violet-50 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
      >
        {grid.status === "loading" ? "Loading grid page..." : grid.hasNext ? "Load more grid" : "Grid complete"}
      </button>
    </>
  );
}
