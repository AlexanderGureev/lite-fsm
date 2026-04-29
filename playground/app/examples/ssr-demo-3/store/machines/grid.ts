import type { FSMEvent, StateType } from "lite-fsm";

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
  | FSMEvent<"FETCH_GRID_PAGE", { screenId: ScreenId }>
  | FSMEvent<"GRID_PAGE_RESOLVED", { screenId: ScreenId; page: GridPage }>
  | FSMEvent<"GRID_PAGE_REJECTED", { screenId: ScreenId; error: string }>;

type GridConfig = {
  READY: {
    FETCH_GRID_PAGE: "LOADING";
    GRID_PAGE_RESOLVED: "READY";
    GRID_PAGE_REJECTED: "READY";
  };
  LOADING: {
    FETCH_GRID_PAGE: "LOADING";
    GRID_PAGE_RESOLVED: "READY";
    GRID_PAGE_REJECTED: "READY";
  };
};
type GridState = StateType<GridConfig, GridContext>;

const initialContext: GridContext = { screens: { featured: undefined, night: undefined } };

export const createGridScreen = (screenId: ScreenId, page?: GridPage): GridScreen => ({
  screenId,
  items: page?.items ?? [],
  nextCursor: page?.nextCursor,
  hasNext: page?.hasNext ?? true,
  status: "idle",
});

const mergePage = (screen: GridScreen, page: GridPage): GridScreen => {
  const knownSlotIds = new Set(screen.items.map((item) => item.slotId));

  return {
    ...screen,
    items: [...screen.items, ...page.items.filter((item) => !knownSlotIds.has(item.slotId))],
    nextCursor: page.nextCursor,
    hasNext: page.hasNext,
    status: "idle",
    error: undefined,
  };
};

const sameScreen = (a: GridScreen | undefined, b: GridScreen | undefined) => {
  if (a === b) return true;
  if (!a || !b) return false;
  if (
    a.screenId !== b.screenId ||
    a.nextCursor !== b.nextCursor ||
    a.hasNext !== b.hasNext ||
    a.status !== b.status ||
    a.error !== b.error ||
    a.items.length !== b.items.length
  ) {
    return false;
  }

  return a.items.every((item, index) => item.slotId === b.items[index]?.slotId);
};

const hydrateGrid = (prev: GridState, snapshot: GridState): GridState => {
  let changed = prev.state !== snapshot.state;
  const screens = { ...prev.context.screens };

  for (const screenId of Object.keys(snapshot.context.screens) as ScreenId[]) {
    const nextScreen = snapshot.context.screens[screenId];
    if (!nextScreen) continue;
    if (sameScreen(screens[screenId], nextScreen)) continue;
    screens[screenId] = nextScreen;
    changed = true;
  }

  return changed ? { state: snapshot.state, context: { screens } } : prev;
};

export const grid = createMachine({
  config: {
    READY: {
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
  hydrate: hydrateGrid,
  reducer: (state, action, { nextState }) => {
    state.state = nextState;

    switch (action.type) {
      case "FETCH_GRID_PAGE": {
        const { screenId } = action.payload;
        const screen = state.context.screens[screenId] ?? createGridScreen(screenId);

        if (screen.status === "loading" || !screen.hasNext) {
          state.state = "READY";
          state.context.screens[screenId] = screen;
          return;
        }

        state.context.screens[screenId] = { ...screen, status: "loading", error: undefined };
        return;
      }
      case "GRID_PAGE_RESOLVED": {
        const { screenId, page } = action.payload;
        const screen = state.context.screens[screenId] ?? createGridScreen(screenId);
        state.context.screens[screenId] = mergePage(screen, page);
        return;
      }
      case "GRID_PAGE_REJECTED": {
        const { screenId, error } = action.payload;
        const screen = state.context.screens[screenId] ?? createGridScreen(screenId);
        state.context.screens[screenId] = { ...screen, status: "error", error };
        return;
      }
    }
  },
  effects: {
    "*": async ({ action, getState, transition }) => {
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

export const selectGridState =
  (screenId: ScreenId) => (state: { grid: { context: GridContext } }) =>
    state.grid.context.screens[screenId] ?? createGridScreen(screenId);
