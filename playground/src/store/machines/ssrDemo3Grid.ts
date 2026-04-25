import type { FSMEvent, StateType } from "lite-fsm";

import { loadGridPage, type Demo2ScreenId, type GridManifestItem, type GridPage } from "../../ssr-demo-2";
import { createMachine } from "../create-machine";

export type SSRDemo3GridStatus = "idle" | "loading" | "error";

export type SSRDemo3GridScreen = {
  screenId: Demo2ScreenId;
  items: GridManifestItem[];
  nextCursor?: string;
  hasNext: boolean;
  status: SSRDemo3GridStatus;
  error?: string;
};

export type SSRDemo3GridContext = {
  screens: Record<Demo2ScreenId, SSRDemo3GridScreen | undefined>;
};

export type SSRDemo3GridEvent =
  | FSMEvent<"FETCH_DEMO3_GRID_PAGE", { screenId: Demo2ScreenId }>
  | FSMEvent<"DEMO3_GRID_PAGE_RESOLVED", { screenId: Demo2ScreenId; page: GridPage }>
  | FSMEvent<"DEMO3_GRID_PAGE_REJECTED", { screenId: Demo2ScreenId; error: string }>;

type SSRDemo3GridConfig = {
  READY: {
    FETCH_DEMO3_GRID_PAGE: "LOADING";
    DEMO3_GRID_PAGE_RESOLVED: "READY";
    DEMO3_GRID_PAGE_REJECTED: "READY";
  };
  LOADING: {
    FETCH_DEMO3_GRID_PAGE: "LOADING";
    DEMO3_GRID_PAGE_RESOLVED: "READY";
    DEMO3_GRID_PAGE_REJECTED: "READY";
  };
};
type SSRDemo3GridState = StateType<SSRDemo3GridConfig, SSRDemo3GridContext>;

const initialContext: SSRDemo3GridContext = { screens: { featured: undefined, night: undefined } };

export const createDemo3GridScreen = (screenId: Demo2ScreenId, page?: GridPage): SSRDemo3GridScreen => ({
  screenId,
  items: page?.items ?? [],
  nextCursor: page?.nextCursor,
  hasNext: page?.hasNext ?? true,
  status: "idle",
});

const mergePage = (screen: SSRDemo3GridScreen, page: GridPage): SSRDemo3GridScreen => {
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

const sameScreen = (a: SSRDemo3GridScreen | undefined, b: SSRDemo3GridScreen | undefined) => {
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

const hydrateGrid = (prev: SSRDemo3GridState, snapshot: SSRDemo3GridState): SSRDemo3GridState => {
  let changed = prev.state !== snapshot.state;
  const screens = { ...prev.context.screens };

  for (const screenId of Object.keys(snapshot.context.screens) as Demo2ScreenId[]) {
    const nextScreen = snapshot.context.screens[screenId];
    if (!nextScreen) continue;
    if (sameScreen(screens[screenId], nextScreen)) continue;
    screens[screenId] = nextScreen;
    changed = true;
  }

  return changed ? { state: snapshot.state, context: { screens } } : prev;
};

export const ssrDemo3Grid = createMachine({
  config: {
    READY: {
      FETCH_DEMO3_GRID_PAGE: "LOADING",
      DEMO3_GRID_PAGE_RESOLVED: "READY",
      DEMO3_GRID_PAGE_REJECTED: "READY",
    },
    LOADING: {
      FETCH_DEMO3_GRID_PAGE: "LOADING",
      DEMO3_GRID_PAGE_RESOLVED: "READY",
      DEMO3_GRID_PAGE_REJECTED: "READY",
    },
  },
  initialState: "READY",
  initialContext,
  hydrate: hydrateGrid,
  reducer: (state, action, { nextState }) => {
    state.state = nextState;

    switch (action.type) {
      case "FETCH_DEMO3_GRID_PAGE": {
        const { screenId } = action.payload;
        const screen = state.context.screens[screenId] ?? createDemo3GridScreen(screenId);

        if (screen.status === "loading" || !screen.hasNext) {
          state.state = "READY";
          state.context.screens[screenId] = screen;
          return;
        }

        state.context.screens[screenId] = { ...screen, status: "loading", error: undefined };
        return;
      }

      case "DEMO3_GRID_PAGE_RESOLVED": {
        const { screenId, page } = action.payload;
        const screen = state.context.screens[screenId] ?? createDemo3GridScreen(screenId);
        state.context.screens[screenId] = mergePage(screen, page);
        return;
      }

      case "DEMO3_GRID_PAGE_REJECTED": {
        const { screenId, error } = action.payload;
        const screen = state.context.screens[screenId] ?? createDemo3GridScreen(screenId);
        state.context.screens[screenId] = { ...screen, status: "error", error };
        return;
      }
    }
  },
  effects: {
    "*": async ({ action, getState, transition }) => {
      if (action.type !== "FETCH_DEMO3_GRID_PAGE") return;

      const { screenId } = action.payload;
      const screen = getState().ssrDemo3Grid.context.screens[screenId];
      if (!screen || screen.status !== "loading") return;

      try {
        const page = await loadGridPage(screenId, screen.nextCursor);
        transition({ type: "DEMO3_GRID_PAGE_RESOLVED", payload: { screenId, page } });
      } catch (error) {
        transition({
          type: "DEMO3_GRID_PAGE_REJECTED",
          payload: { screenId, error: error instanceof Error ? error.message : String(error) },
        });
      }
    },
  },
});

export const selectSSRDemo3GridState =
  (screenId: Demo2ScreenId) => (state: { ssrDemo3Grid: { context: SSRDemo3GridContext } }) =>
    state.ssrDemo3Grid.context.screens[screenId] ?? createDemo3GridScreen(screenId);
