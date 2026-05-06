"use client";

import { useEffect } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { useSelector, useTransition } from "../store";
import { getListId, selectEntityListEntry } from "../store/machines/entityList";
import type { GridManifestItem } from "../store/ssr";
import { WidgetSkeleton } from "./Skeleton";

export function WidgetSlot({ item }: { item: GridManifestItem }) {
  const transition = useTransition();
  const request = item.widgetRequest;
  const listId = getListId(request);
  const entry = useSelector(selectEntityListEntry(request));
  const items = entry.pages.flatMap((page) => page.data);
  const isEmpty = items.length === 0;

  useEffect(() => {
    if (isEmpty && entry.status === "idle") {
      transition({ type: "FETCH_ENTITY_LIST", payload: request });
    }
  }, [entry.status, isEmpty, request, transition]);

  if (entry.status === "error") {
    return (
      <Alert className="flex flex-col gap-3 rounded-lg border-destructive/30 bg-destructive/5 p-5">
        <div>
          <p className="text-caption-strong text-destructive">виджет не загрузился</p>
          <h3 className="text-tagline text-ink">{item.title}</h3>
          <p className="text-caption text-destructive">{entry.error}</p>
        </div>
        <Button
          type="button"
          onClick={() => transition({ type: "FETCH_ENTITY_LIST", payload: request })}
          className="h-auto self-start rounded-pill bg-primary px-4 py-2 text-button-utility text-on-primary active:scale-[0.95]"
        >
          Повторить
        </Button>
      </Alert>
    );
  }

  if (isEmpty) return <WidgetSkeleton />;

  return (
    <section className="flex flex-col gap-4 rounded-lg bg-canvas p-5 ring-1 ring-hairline">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-caption-strong text-primary">entityList · cursor widget</p>
          <h2 className="text-tagline text-ink">{item.title}</h2>
        </div>
        <Badge variant="secondary" className="rounded-pill bg-canvas-parchment text-caption text-ink-muted-80">
          {listId}
        </Badge>
      </div>

      <ul className="grid gap-3 md:grid-cols-3">
        {items.map((feedItem) => (
          <li key={feedItem.id} className="rounded-md border border-hairline bg-canvas-parchment p-3">
            <p className="text-body-strong text-ink">{feedItem.title}</p>
            <p className="text-caption text-ink-muted-48">{feedItem.subtitle}</p>
          </li>
        ))}
      </ul>

      <Button
        type="button"
        onClick={() => transition({ type: "FETCH_ENTITY_LIST", payload: request })}
        disabled={entry.status === "loading" || !entry.hasNext}
        className="h-auto self-start rounded-pill bg-primary px-4 py-2 text-button-utility text-on-primary active:scale-[0.95]"
      >
        {entry.status === "loading" ? "Загружаем виджет…" : entry.hasNext ? "Загрузить ещё" : "Виджет собран"}
      </Button>
    </section>
  );
}
