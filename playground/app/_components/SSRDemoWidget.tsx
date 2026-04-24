"use client";

import type { ComponentType } from "react";

import { getWidgetFeedId, type DemoContentType, type DemoWidgetConfig, type WidgetSeed } from "@/src/ssr-demo";
import { useSelector, useTransition } from "@/src/store";
import { selectWidgetFeedEntry } from "@/src/store/machines/widgetFeed";

type WidgetViewProps = {
  widget: DemoWidgetConfig;
  seed: WidgetSeed;
};

function FeedWidget({ widget, seed }: WidgetViewProps) {
  const transition = useTransition();
  const entry = useSelector(selectWidgetFeedEntry(seed.request))!;

  const items = entry.pages.flatMap((page) => page.data);
  const { status, hasNext } = entry;

  return (
    <section className="grid gap-4 rounded-[20px] border border-slate-400/15 bg-slate-950/70 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-blue-300/80">client widget · cache-like store</p>
          <h2 className="text-xl font-semibold text-slate-50">{widget.title}</h2>
        </div>
        <code className="rounded bg-slate-900/60 px-2 py-1 text-xs text-slate-400">
          {getWidgetFeedId(seed.request)}
        </code>
      </div>

      <ul className="grid gap-2 md:grid-cols-2">
        {items.map((item) => (
          <li key={item.id} className="rounded-xl border border-slate-400/15 bg-slate-900/40 p-3">
            <p className="text-sm font-medium text-slate-50">{item.title}</p>
            <p className="text-xs text-slate-400">{item.subtitle}</p>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => transition({ type: "FETCH_WIDGET_FEED", payload: seed.request })}
        disabled={status === "loading" || !hasNext}
        className="self-start rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-blue-50 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
      >
        {status === "loading" ? "Загружаем..." : hasNext ? "Загрузить ещё" : "Больше страниц нет"}
      </button>
    </section>
  );
}

const WIDGET_BY_CONTENT_TYPE: Record<DemoContentType, ComponentType<WidgetViewProps>> = {
  mock_feed: FeedWidget,
};

export default function SSRDemoWidgetView(props: WidgetViewProps) {
  const Component = WIDGET_BY_CONTENT_TYPE[props.widget.contentType];
  return <Component {...props} />;
}
