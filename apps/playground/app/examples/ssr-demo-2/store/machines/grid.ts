import type { FSMEvent } from "@lite-fsm/core";

import { createMachine } from "../create-machine";
import { loadGridPage, type GridManifestItem, type GridPage, type ScreenId } from "../ssr";

export type GridStatus = "idle" | "loading" | "error";

export type GridScreen = {
  screenId: ScreenId;
  items: GridManifestItem[];
  nextCursor?: string;
  hasNext: boolean;
  status: GridStatus;
  error?: string;
};

export type GridContext = {
  screens: Record<ScreenId, GridScreen | undefined>;
};

export type GridEvent =
  | FSMEvent<"INITIAL_GRID_PAGE_DATA", { screenId: ScreenId; page: GridPage }>
  | FSMEvent<"FETCH_GRID_PAGE", { screenId: ScreenId }>
  | FSMEvent<"GRID_PAGE_RESOLVED", { screenId: ScreenId; page: GridPage }>
  | FSMEvent<"GRID_PAGE_REJECTED", { screenId: ScreenId; error: string }>;

const initialContext: GridContext = { screens: { featured: undefined, night: undefined } };

const createScreen = (screenId: ScreenId, page?: GridPage): GridScreen => ({
  screenId,
  items: page?.items ?? [],
  nextCursor: page?.nextCursor,
  hasNext: page?.hasNext ?? true,
  status: "idle",
});

const mergePage = (screen: GridScreen, page: GridPage): GridScreen => {
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

export const grid = createMachine({
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
      const screen = getState().grid.context.screens[screenId];
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

export const getDefaultGridScreen = (screenId: ScreenId): GridScreen => createScreen(screenId);

export const selectGridState =
  (screenId: ScreenId) => (state: { grid: { context: GridContext } }) =>
    state.grid.context.screens[screenId] ?? getDefaultGridScreen(screenId);
