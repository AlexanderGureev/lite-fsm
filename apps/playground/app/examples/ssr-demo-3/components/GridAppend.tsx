"use client";

import { Button } from "@/components/ui/button";

import { useSelector, useTransition } from "../store";
import { selectGridState } from "../store/machines/grid";
import type { ScreenId } from "../store/ssr";
import { WidgetSlot } from "./WidgetSlot";

export function GridAppend({ screenId, initialItemCount }: { screenId: ScreenId; initialItemCount: number }) {
  const transition = useTransition();
  const gridState = useSelector(selectGridState(screenId));
  const appendedItems = gridState.items.slice(initialItemCount);
  const isDisabled = gridState.status === "loading" || !gridState.hasNext;

  return (
    <>
      {appendedItems.map((item) => (
        <WidgetSlot key={item.slotId} item={item} />
      ))}

      {gridState.status === "error" ? (
        <p className="text-caption text-destructive">Не удалось загрузить grid: {gridState.error}</p>
      ) : null}

      <Button
        type="button"
        onClick={() => transition({ type: "FETCH_GRID_PAGE", payload: { screenId } })}
        disabled={isDisabled}
        className="h-auto self-start rounded-pill bg-primary px-4 py-2 text-button-utility text-on-primary active:scale-[0.95]"
      >
        {gridState.status === "loading"
          ? "Загружаем grid-страницу…"
          : gridState.hasNext
            ? "Подгрузить grid-страницу"
            : "Grid собран"}
      </Button>
    </>
  );
}
