"use client";

import type { ComponentType } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { useSelector, useTransition } from "../store";
import { selectWidgetFeedEntry } from "../store/machines/widgetFeed";
import { getWidgetFeedId, type DemoContentType, type DemoWidgetConfig, type WidgetSeed } from "../store/ssr";

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
    <section className="flex flex-col gap-4 rounded-lg bg-canvas p-5 ring-1 ring-hairline">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-caption-strong text-primary">client widget · cache-like store</p>
          <h2 className="text-tagline text-ink">{widget.title}</h2>
        </div>
        <Badge variant="secondary" className="rounded-pill bg-canvas-parchment text-caption text-ink-muted-80">
          {getWidgetFeedId(seed.request)}
        </Badge>
      </div>

      <ul className="grid gap-3 md:grid-cols-2">
        {items.map((item) => (
          <li key={item.id} className="rounded-md border border-hairline bg-canvas-parchment p-3">
            <p className="text-body-strong text-ink">{item.title}</p>
            <p className="text-caption text-ink-muted-48">{item.subtitle}</p>
          </li>
        ))}
      </ul>

      <Button
        type="button"
        onClick={() => transition({ type: "FETCH_WIDGET_FEED", payload: seed.request })}
        disabled={status === "loading" || !hasNext}
        className="h-auto self-start rounded-pill bg-primary px-5 py-2 text-button-utility text-on-primary active:scale-[0.95]"
      >
        {status === "loading" ? "Загружаем…" : hasNext ? "Загрузить ещё" : "Больше страниц нет"}
      </Button>
    </section>
  );
}

const WIDGET_BY_CONTENT_TYPE: Record<DemoContentType, ComponentType<WidgetViewProps>> = {
  mock_feed: FeedWidget,
};

export function Widget(props: WidgetViewProps) {
  const Component = WIDGET_BY_CONTENT_TYPE[props.widget.contentType];
  return <Component {...props} />;
}
