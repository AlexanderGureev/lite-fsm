import type { FSMEvent } from "lite-fsm";

import { loadGridPage, type Demo2ScreenId, type GridManifestItem, type GridPage } from "../../ssr-demo-2";
import { createMachine } from "../create-machine";

export type GridStatus = "idle" | "loading" | "error";

export type SSRDemo2GridScreen = {
  screenId: Demo2ScreenId;
  items: GridManifestItem[];
  nextCursor?: string;
  hasNext: boolean;
  status: GridStatus;
  error?: string;
};

export type SSRDemo2GridContext = {
  screens: Record<Demo2ScreenId, SSRDemo2GridScreen | undefined>;
};

export type SSRDemo2GridEvent =
  | FSMEvent<"INITIAL_GRID_PAGE_DATA", { screenId: Demo2ScreenId; page: GridPage }>
  | FSMEvent<"FETCH_GRID_PAGE", { screenId: Demo2ScreenId }>
  | FSMEvent<"GRID_PAGE_RESOLVED", { screenId: Demo2ScreenId; page: GridPage }>
  | FSMEvent<"GRID_PAGE_REJECTED", { screenId: Demo2ScreenId; error: string }>;

const initialContext: SSRDemo2GridContext = { screens: { featured: undefined, night: undefined } };

const createScreen = (screenId: Demo2ScreenId, page?: GridPage): SSRDemo2GridScreen => ({
  screenId,
  items: page?.items ?? [],
  nextCursor: page?.nextCursor,
  hasNext: page?.hasNext ?? true,
  status: "idle",
});

const mergePage = (screen: SSRDemo2GridScreen, page: GridPage): SSRDemo2GridScreen => {
  const knownSlotIds = new Set(screen.items.map((item) => item.slotId));
  const nextItems = [...screen.items, ...page.items.filter((item) => !knownSlotIds.has(item.slotId))];

  return {
    ...screen,
    items: nextItems,
    nextCursor: page.nextCursor,
    hasNext: page.hasNext,
    status: "idle",
    error: undefined,
  };
};

export const ssrDemo2Grid = createMachine({
  config: {
    READY: {
      INITIAL_GRID_PAGE_DATA: "READY",
      FETCH_GRID_PAGE: "LOADING",
      GRID_PAGE_RESOLVED: "READY",
      GRID_PAGE_REJECTED: "READY",
    },
    LOADING: {
      FETCH_GRID_PAGE: "LOADING",
      GRID_PAGE_RESOLVED: "READY",
      GRID_PAGE_REJECTED: "READY",
    },
  },
  initialState: "READY",
  initialContext,
  reducer: (state, action, { nextState }) => {
    state.state = nextState;

    switch (action.type) {
      case "INITIAL_GRID_PAGE_DATA": {
        const { screenId, page } = action.payload;
        if (!state.context.screens[screenId]) {
          state.context.screens[screenId] = createScreen(screenId, page);
        }
        return;
      }

      case "FETCH_GRID_PAGE": {
        const { screenId } = action.payload;
        const screen = state.context.screens[screenId] ?? createScreen(screenId);

        if (screen.status === "loading") {
          state.context.screens[screenId] = screen;
          return;
        }

        if (!screen.hasNext) {
          state.state = "READY";
          state.context.screens[screenId] = screen;
          return;
        }

        state.context.screens[screenId] = { ...screen, status: "loading", error: undefined };
        return;
      }

      case "GRID_PAGE_RESOLVED": {
        const { screenId, page } = action.payload;
        const screen = state.context.screens[screenId] ?? createScreen(screenId);
        state.context.screens[screenId] = mergePage(screen, page);
        return;
      }

      case "GRID_PAGE_REJECTED": {
        const { screenId, error } = action.payload;
        const screen = state.context.screens[screenId] ?? createScreen(screenId);
        state.context.screens[screenId] = { ...screen, status: "error", error };
        return;
      }
    }
  },
  effects: {
    LOADING: async ({ action, getState, transition }) => {
      if (action.type !== "FETCH_GRID_PAGE") return;

      const { screenId } = action.payload;
      const screen = getState().ssrDemo2Grid.context.screens[screenId];
      if (!screen || screen.status !== "loading") return;

      try {
        const page = await loadGridPage(screenId, screen.nextCursor);
        transition({ type: "GRID_PAGE_RESOLVED", payload: { screenId, page } });
      } catch (error) {
        transition({
          type: "GRID_PAGE_REJECTED",
          payload: { screenId, error: error instanceof Error ? error.message : String(error) },
        });
      }
    },
  },
});

export const getDefaultSSRDemo2GridScreen = (screenId: Demo2ScreenId): SSRDemo2GridScreen => createScreen(screenId);

export const selectSSRDemo2GridState =
  (screenId: Demo2ScreenId) => (state: { ssrDemo2Grid: { context: SSRDemo2GridContext } }) =>
    state.ssrDemo2Grid.context.screens[screenId] ?? getDefaultSSRDemo2GridScreen(screenId);
