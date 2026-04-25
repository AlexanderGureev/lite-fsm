import { produce } from "immer";
import { describe, expect, it } from "vitest";

import type { Demo2ScreenId, GridManifestItem, GridPage, WidgetFeedRequest } from "../../playground/src/ssr-demo-2";
import {
  applyLoadedPage,
  createEntry,
  entityList,
  getListId,
  type EntityListContext,
  type EntityListEvent,
} from "../../playground/src/store/machines/entityList";
import {
  ssrDemo2Grid,
  type SSRDemo2GridContext,
  type SSRDemo2GridEvent,
} from "../../playground/src/store/machines/ssrDemo2Grid";

type MachineState<TContext> = {
  state: string;
  context: TContext;
};

type ReducerMachine<TContext> = {
  initialState: string;
  initialContext: TContext;
  config: object;
  reducer?: (state: MachineState<TContext>, action: unknown, meta: { nextState: string; config: object }) => void;
};

const getInitialState = <TContext>(machine: unknown): MachineState<TContext> => {
  const typedMachine = machine as ReducerMachine<TContext>;

  return {
    state: typedMachine.initialState,
    context: structuredClone(typedMachine.initialContext),
  };
};

const reduce = <TContext>(
  machine: unknown,
  state: MachineState<TContext>,
  action: unknown,
  nextState = "READY",
) =>
  produce(state, (draft) => {
    const typedMachine = machine as ReducerMachine<TContext>;
    typedMachine.reducer?.(draft as MachineState<TContext>, action, { nextState, config: typedMachine.config });
  });

const createItem = (slotId: string): GridManifestItem => ({
  slotId,
  contentType: "mock_feed",
  title: slotId,
  widgetRequest: createRequest(slotId),
});

const createRequest = (key: string): WidgetFeedRequest => ({
  type: "WIDGET_FEED",
  key,
  widgetId: "featured-new",
  title: key,
  limit: 3,
});

describe("хранилище playground ssr-demo-2", () => {
  describe("ssrDemo2Grid", () => {
    it("гидратирует manifest, мержит append-страницы без дублей и хранит status loading/error", () => {
      let state = getInitialState<SSRDemo2GridContext>(ssrDemo2Grid);
      const firstPage: GridPage = { items: [createItem("a"), createItem("b")], nextCursor: "2", hasNext: true };
      const secondPage: GridPage = { items: [createItem("b"), createItem("c")], hasNext: false };

      state = reduce(ssrDemo2Grid, state, {
        type: "INITIAL_GRID_PAGE_DATA",
        payload: { screenId: "featured" satisfies Demo2ScreenId, page: firstPage },
      } satisfies SSRDemo2GridEvent);

      expect(state.context.screens.featured?.items.map((item) => item.slotId)).toEqual(["a", "b"]);

      state = reduce(
        ssrDemo2Grid,
        state,
        { type: "FETCH_GRID_PAGE", payload: { screenId: "featured" } } satisfies SSRDemo2GridEvent,
        "LOADING",
      );

      expect(state.context.screens.featured?.status).toBe("loading");

      state = reduce(ssrDemo2Grid, state, {
        type: "GRID_PAGE_RESOLVED",
        payload: { screenId: "featured", page: secondPage },
      } satisfies SSRDemo2GridEvent);

      expect(state.context.screens.featured?.items.map((item) => item.slotId)).toEqual(["a", "b", "c"]);
      expect(state.context.screens.featured?.hasNext).toBe(false);

      state = reduce(ssrDemo2Grid, state, {
        type: "GRID_PAGE_REJECTED",
        payload: { screenId: "featured", error: "boom" },
      } satisfies SSRDemo2GridEvent);

      expect(state.context.screens.featured?.status).toBe("error");
      expect(state.context.screens.featured?.error).toBe("boom");
    });
  });

  describe("entityList", () => {
    it("гидратирует seed-данные, добавляет cursor-страницы и изолирует загрузки списков", () => {
      let state = getInitialState<EntityListContext>(entityList);
      const firstRequest = createRequest("first");
      const secondRequest = createRequest("second");

      state = reduce(entityList, state, {
        type: "INITIAL_ENTITY_LIST_DATA",
        payload: {
          request: firstRequest,
          data: [{ id: "1", title: "One", subtitle: "seed" }],
          pagination: { limit: 3 },
          nextCursor: "3",
          hasNext: true,
        },
      } satisfies EntityListEvent);

      expect(state.context.lists[getListId(firstRequest)].pages).toHaveLength(1);

      state = reduce(entityList, state, {
        type: "FETCH_ENTITY_LIST",
        payload: secondRequest,
      } satisfies EntityListEvent);

      expect(state.context.lists[getListId(secondRequest)].status).toBe("loading");
      expect(state.context.lists[getListId(firstRequest)].status).toBe("idle");

      state = reduce(entityList, state, {
        type: "ENTITY_LIST_FETCH_RESOLVED",
        payload: {
          request: secondRequest,
          page: {
            data: [{ id: "2", title: "Two", subtitle: "page" }],
            pagination: { limit: 3 },
            hasNext: false,
          },
        },
      } satisfies EntityListEvent);

      expect(state.context.lists[getListId(secondRequest)].status).toBe("idle");
      expect(state.context.lists[getListId(secondRequest)].hasNext).toBe(false);

      state = reduce(entityList, state, {
        type: "ENTITY_LIST_FETCH_REJECTED",
        payload: { request: firstRequest, error: "failed" },
      } satisfies EntityListEvent);

      expect(state.context.lists[getListId(firstRequest)].status).toBe("error");
      expect(state.context.lists[getListId(secondRequest)].status).toBe("idle");
    });

    it("applyLoadedPage добавляет непустые страницы, а пустые оставляет no-op", () => {
      const request = createRequest("append");
      const entry = createEntry(request);
      const withData = applyLoadedPage(entry, {
        data: [{ id: "1", title: "One", subtitle: "page" }],
        pagination: { limit: 3 },
        nextCursor: "3",
        hasNext: true,
      });

      const unchanged = applyLoadedPage(withData, {
        data: [],
        pagination: { cursor: "3", limit: 3 },
        hasNext: false,
      });

      expect(withData.pages).toHaveLength(1);
      expect(withData.pages[0]?.nextCursor).toBe("3");
      expect(unchanged.pages).toHaveLength(1);
      expect(unchanged.hasNext).toBe(false);
    });
  });
});
