"use client";

import { useEffect } from "react";

import type { GridManifestItem } from "@/src/ssr-demo-2";
import { useSelector, useTransition } from "@/src/store";
import {
  getDemo3ListId,
  selectSSRDemo3EntityListEntry,
} from "@/src/store/machines/ssrDemo3EntityList";

import SSRDemo3WidgetSkeleton from "./SSRDemo3WidgetSkeleton";

export default function SSRDemo3WidgetSlot({ item }: { item: GridManifestItem }) {
  const transition = useTransition();
  const request = item.widgetRequest;
  const listId = getDemo3ListId(request);
  const entry = useSelector(selectSSRDemo3EntityListEntry(request));
  const items = entry.pages.flatMap((page) => page.data);
  const isEmpty = items.length === 0;

  useEffect(() => {
    if (isEmpty && entry.status === "idle") {
      transition({ type: "FETCH_DEMO3_ENTITY_LIST", payload: request });
    }
  }, [entry.status, isEmpty, request, transition]);

  if (entry.status === "error") {
    return (
      <section className="grid gap-4 rounded-[20px] border border-red-400/25 bg-red-950/20 p-5">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-red-300/80">demo3 widget fetch failed</p>
          <h2 className="text-xl font-semibold text-slate-50">{item.title}</h2>
          <p className="mt-1 text-sm text-red-200/80">{entry.error}</p>
        </div>
        <button
          type="button"
          onClick={() => transition({ type: "FETCH_DEMO3_ENTITY_LIST", payload: request })}
          className="self-start rounded-xl bg-red-500 px-4 py-2 text-sm font-medium text-red-50"
        >
          Retry widget
        </button>
      </section>
    );
  }

  if (isEmpty) return <SSRDemo3WidgetSkeleton />;

  return (
    <section className="grid gap-4 rounded-[20px] border border-slate-400/15 bg-slate-950/70 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-violet-300/80">snapshot · entity list</p>
          <h2 className="text-xl font-semibold text-slate-50">{item.title}</h2>
        </div>
        <code className="rounded bg-slate-900/60 px-2 py-1 text-xs text-slate-400">{listId}</code>
      </div>

      <ul className="grid gap-2 md:grid-cols-3">
        {items.map((feedItem) => (
          <li key={feedItem.id} className="rounded-xl border border-slate-400/15 bg-slate-900/40 p-3">
            <p className="text-sm font-medium text-slate-50">{feedItem.title}</p>
            <p className="text-xs text-slate-400">{feedItem.subtitle}</p>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => transition({ type: "FETCH_DEMO3_ENTITY_LIST", payload: request })}
        disabled={entry.status === "loading" || !entry.hasNext}
        className="self-start rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-violet-50 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
      >
        {entry.status === "loading" ? "Загружаем widget..." : entry.hasNext ? "Load more widget" : "Widget complete"}
      </button>
    </section>
  );
}
