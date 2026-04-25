import { describe, expect, it, vi } from "vitest";

import type { GridManifestItem, GridPage, WidgetFeedRequest, WidgetSeed } from "../../playground/src/ssr-demo-2";
import { MachineManager } from "../../src/core/MachineManager";
import {
  createDemo3EntityListSnapshot,
  createDemo3GridSnapshot,
} from "../../playground/src/ssr-demo-3";
import {
  getDemo3ListId,
  ssrDemo3EntityList,
} from "../../playground/src/store/machines/ssrDemo3EntityList";
import { ssrDemo3Grid } from "../../playground/src/store/machines/ssrDemo3Grid";

const createRequest = (key: string): WidgetFeedRequest => ({
  type: "WIDGET_FEED",
  key,
  widgetId: "featured-new",
  title: key,
  limit: 3,
});

const createItem = (slotId: string): GridManifestItem => ({
  slotId,
  contentType: "mock_feed",
  title: slotId,
  widgetRequest: createRequest(slotId),
});

describe("snapshot-хранилище ssr-demo-3", () => {
  it("гидратирует grid snapshots, мержит частичные screens и делает noop для тех же данных", () => {
    const manager = MachineManager({ ssrDemo3Grid });
    const sub = vi.fn();
    const firstPage: GridPage = { items: [createItem("a"), createItem("b")], nextCursor: "2", hasNext: true };
    const nightPage: GridPage = { items: [createItem("n")], hasNext: false };

    manager.hydrate(createDemo3GridSnapshot("featured", firstPage) as never);
    manager.onTransition(sub);

    const before = manager.getState();
    manager.hydrate(createDemo3GridSnapshot("featured", firstPage) as never);
    expect(manager.getState()).toBe(before);
    expect(sub).not.toHaveBeenCalled();

    manager.hydrate(createDemo3GridSnapshot("night", nightPage) as never);

    expect(manager.getState().ssrDemo3Grid.context.screens.featured?.items.map((item) => item.slotId)).toEqual([
      "a",
      "b",
    ]);
    expect(manager.getState().ssrDemo3Grid.context.screens.night?.items.map((item) => item.slotId)).toEqual(["n"]);
  });

  it("гидратирует snapshots списков независимо и делает noop для тех же данных", () => {
    const manager = MachineManager({ ssrDemo3EntityList });
    const request = createRequest("seed");
    const seed: WidgetSeed = {
      request,
      data: [{ id: "1", title: "One", subtitle: "seed" }],
      pagination: { limit: 3 },
      nextCursor: "3",
      hasNext: true,
    };

    manager.hydrate(createDemo3EntityListSnapshot(seed) as never);
    const before = manager.getState();
    manager.hydrate(createDemo3EntityListSnapshot(seed) as never);

    const entry = manager.getState().ssrDemo3EntityList.context.lists[getDemo3ListId(request)];
    expect(manager.getState()).toBe(before);
    expect(entry.pages).toHaveLength(1);
    expect(entry.pages[0]?.data[0]?.title).toBe("One");
  });
});
