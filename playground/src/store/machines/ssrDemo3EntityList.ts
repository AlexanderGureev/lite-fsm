import type { FSMEvent, StateType } from "lite-fsm";

import {
  loadWidgetPage,
  type Demo2CursorPagination,
  type Demo2Item,
  type LoadedWidgetPage,
  type WidgetFeedRequest,
  type WidgetSeed,
} from "../../ssr-demo-2";
import { createMachine } from "../create-machine";

export type SSRDemo3ListRequest = WidgetFeedRequest;
export type SSRDemo3ListType = SSRDemo3ListRequest["type"];
export type SSRDemo3EntityListStatus = "idle" | "loading" | "error";

export type SSRDemo3EntityListPage = {
  data: Demo2Item[];
  pagination: Demo2CursorPagination;
  nextCursor?: string;
};

export type SSRDemo3EntityListEntry = {
  listId: string;
  type: SSRDemo3ListType;
  key: string;
  request?: SSRDemo3ListRequest;
  pages: SSRDemo3EntityListPage[];
  status: SSRDemo3EntityListStatus;
  hasNext: boolean;
  error?: string;
};

export type SSRDemo3EntityListContext = {
  lists: Record<string, SSRDemo3EntityListEntry>;
};

export type SSRDemo3EntityListEvent =
  | FSMEvent<"FETCH_DEMO3_ENTITY_LIST", SSRDemo3ListRequest>
  | FSMEvent<"DEMO3_ENTITY_LIST_FETCH_RESOLVED", { request: SSRDemo3ListRequest; page: LoadedWidgetPage }>
  | FSMEvent<"DEMO3_ENTITY_LIST_FETCH_REJECTED", { request: SSRDemo3ListRequest; error: string }>;

type SSRDemo3EntityListConfig = {
  READY: {
    FETCH_DEMO3_ENTITY_LIST: "READY";
    DEMO3_ENTITY_LIST_FETCH_RESOLVED: "READY";
    DEMO3_ENTITY_LIST_FETCH_REJECTED: "READY";
  };
};
type SSRDemo3EntityListState = StateType<SSRDemo3EntityListConfig, SSRDemo3EntityListContext>;

const initialContext: SSRDemo3EntityListContext = { lists: {} };

export const toDemo3ListId = (type: SSRDemo3ListType, key: string) => `${type}:${key}`;
export const getDemo3ListKey = (request: SSRDemo3ListRequest) => request.key;
export const getDemo3ListId = (request: SSRDemo3ListRequest) => toDemo3ListId(request.type, getDemo3ListKey(request));

export const createDemo3Entry = (request: SSRDemo3ListRequest): SSRDemo3EntityListEntry => ({
  listId: getDemo3ListId(request),
  type: request.type,
  key: getDemo3ListKey(request),
  request,
  pages: [],
  status: "idle",
  hasNext: true,
});

export const createDemo3DefaultEntry = (type: SSRDemo3ListType, key: string): SSRDemo3EntityListEntry => ({
  listId: toDemo3ListId(type, key),
  type,
  key,
  pages: [],
  status: "idle",
  hasNext: true,
});

export const applyDemo3LoadedPage = (
  entry: SSRDemo3EntityListEntry,
  page: LoadedWidgetPage,
): SSRDemo3EntityListEntry => ({
  ...entry,
  status: "idle",
  hasNext: page.hasNext,
  error: undefined,
  pages: page.data.length
    ? [...entry.pages, { data: page.data, pagination: page.pagination, nextCursor: page.nextCursor }]
    : entry.pages,
});

export const createDemo3EntryFromSeed = (seed: WidgetSeed) =>
  applyDemo3LoadedPage(createDemo3Entry(seed.request), seed);

const sameEntry = (a: SSRDemo3EntityListEntry | undefined, b: SSRDemo3EntityListEntry | undefined) => {
  if (a === b) return true;
  if (!a || !b) return false;

  const page = a.pages[a.pages.length - 1];
  const otherPage = b.pages[b.pages.length - 1];
  const item = page?.data[page.data.length - 1];
  const otherItem = otherPage?.data[otherPage.data.length - 1];

  return (
    a.listId === b.listId &&
    a.status === b.status &&
    a.hasNext === b.hasNext &&
    a.error === b.error &&
    a.pages.length === b.pages.length &&
    page?.nextCursor === otherPage?.nextCursor &&
    page?.data.length === otherPage?.data.length &&
    item?.id === otherItem?.id
  );
};

const hydrateEntityList = (
  prev: SSRDemo3EntityListState,
  snapshot: SSRDemo3EntityListState,
): SSRDemo3EntityListState => {
  let changed = prev.state !== snapshot.state;
  const lists = { ...prev.context.lists };

  for (const listId of Object.keys(snapshot.context.lists)) {
    const nextEntry = snapshot.context.lists[listId];
    if (sameEntry(lists[listId], nextEntry)) continue;
    lists[listId] = nextEntry;
    changed = true;
  }

  return changed ? { state: snapshot.state, context: { lists } } : prev;
};

const activeFetchesByStore = new WeakMap<() => unknown, Set<string>>();

const getActiveFetches = (getState: () => unknown) => {
  const activeFetches = activeFetchesByStore.get(getState) ?? new Set<string>();
  activeFetchesByStore.set(getState, activeFetches);
  return activeFetches;
};

export const ssrDemo3EntityList = createMachine({
  config: {
    READY: {
      FETCH_DEMO3_ENTITY_LIST: "READY",
      DEMO3_ENTITY_LIST_FETCH_RESOLVED: "READY",
      DEMO3_ENTITY_LIST_FETCH_REJECTED: "READY",
    },
  },
  initialState: "READY",
  initialContext,
  hydrate: hydrateEntityList,
  reducer: (state, action, { nextState }) => {
    state.state = nextState;

    switch (action.type) {
      case "FETCH_DEMO3_ENTITY_LIST": {
        const listId = getDemo3ListId(action.payload);
        const entry = state.context.lists[listId] ?? createDemo3Entry(action.payload);

        if (entry.status === "loading" || !entry.hasNext) {
          state.context.lists[listId] = entry;
          return;
        }

        state.context.lists[listId] = { ...entry, request: action.payload, status: "loading", error: undefined };
        return;
      }

      case "DEMO3_ENTITY_LIST_FETCH_RESOLVED": {
        const { request, page } = action.payload;
        const entry = state.context.lists[getDemo3ListId(request)];
        if (entry) state.context.lists[entry.listId] = applyDemo3LoadedPage(entry, page);
        return;
      }

      case "DEMO3_ENTITY_LIST_FETCH_REJECTED": {
        const { request, error } = action.payload;
        const entry = state.context.lists[getDemo3ListId(request)] ?? createDemo3Entry(request);
        state.context.lists[entry.listId] = { ...entry, status: "error", error };
        return;
      }
    }
  },
  effects: {
    "*": async ({ action, getState, transition }) => {
      if (action.type !== "FETCH_DEMO3_ENTITY_LIST") return;

      const request = action.payload;
      const listId = getDemo3ListId(request);
      const activeFetches = getActiveFetches(getState);
      if (activeFetches.has(listId)) return;

      const entry = getState().ssrDemo3EntityList.context.lists[listId];
      if (!entry || entry.status !== "loading" || !entry.hasNext) return;

      activeFetches.add(listId);

      try {
        const lastPage = entry.pages[entry.pages.length - 1];
        const page = await loadWidgetPage(request, lastPage?.nextCursor);
        transition({ type: "DEMO3_ENTITY_LIST_FETCH_RESOLVED", payload: { request, page } });
      } catch (error) {
        transition({
          type: "DEMO3_ENTITY_LIST_FETCH_REJECTED",
          payload: { request, error: error instanceof Error ? error.message : String(error) },
        });
      } finally {
        activeFetches.delete(listId);
      }
    },
  },
});

export const selectSSRDemo3EntityListEntry =
  (request: SSRDemo3ListRequest) => (state: { ssrDemo3EntityList: { context: SSRDemo3EntityListContext } }) =>
    state.ssrDemo3EntityList.context.lists[getDemo3ListId(request)] ??
    createDemo3DefaultEntry(request.type, getDemo3ListKey(request));
