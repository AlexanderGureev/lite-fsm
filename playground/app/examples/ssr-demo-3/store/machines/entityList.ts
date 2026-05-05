import type { FSMEvent, StateType } from "lite-fsm";

import { createMachine } from "../create-machine";
import {
  loadWidgetPage,
  type CursorPagination,
  type Item,
  type LoadedWidgetPage,
  type WidgetFeedRequest,
} from "../ssr";

export type ListRequest = WidgetFeedRequest;
export type ListType = ListRequest["type"];
export type EntityListStatus = "idle" | "loading" | "error";

export type EntityListPage = {
  data: Item[];
  pagination: CursorPagination;
  nextCursor?: string;
};

export type EntityListEntry = {
  listId: string;
  type: ListType;
  key: string;
  request?: ListRequest;
  pages: EntityListPage[];
  status: EntityListStatus;
  hasNext: boolean;
  error?: string;
};

export type EntityListContext = {
  lists: Record<string, EntityListEntry>;
};

export type EntityListEvent =
  | FSMEvent<"FETCH_ENTITY_LIST", ListRequest>
  | FSMEvent<"ENTITY_LIST_FETCH_RESOLVED", { request: ListRequest; page: LoadedWidgetPage }>
  | FSMEvent<"ENTITY_LIST_FETCH_REJECTED", { request: ListRequest; error: string }>;

type EntityListConfig = {
  READY: {
    FETCH_ENTITY_LIST: "READY";
    ENTITY_LIST_FETCH_RESOLVED: "READY";
    ENTITY_LIST_FETCH_REJECTED: "READY";
  };
};
type EntityListState = StateType<EntityListConfig, EntityListContext>;

const initialContext: EntityListContext = { lists: {} };

export const toListId = (type: ListType, key: string) => `${type}:${key}`;
export const getListKey = (request: ListRequest) => request.key;
export const getListId = (request: ListRequest) => toListId(request.type, getListKey(request));

export const createEntry = (request: ListRequest): EntityListEntry => ({
  listId: getListId(request),
  type: request.type,
  key: getListKey(request),
  request,
  pages: [],
  status: "idle",
  hasNext: true,
});

const createDefaultEntry = (type: ListType, key: string): EntityListEntry => ({
  listId: toListId(type, key),
  type,
  key,
  pages: [],
  status: "idle",
  hasNext: true,
});

export const applyLoadedPage = (entry: EntityListEntry, page: LoadedWidgetPage): EntityListEntry => ({
  ...entry,
  status: "idle",
  hasNext: page.hasNext,
  error: undefined,
  pages: page.data.length
    ? [...entry.pages, { data: page.data, pagination: page.pagination, nextCursor: page.nextCursor }]
    : entry.pages,
});

const hydrateEntityList = (prev: EntityListState, snapshot: EntityListState): EntityListState => {
  const snapshotEntries = Object.entries(snapshot.context.lists);
  const isApplied =
    prev.state === snapshot.state &&
    snapshotEntries.every(([listId, entry]) => prev.context.lists[listId] === entry);

  if (isApplied) return prev;

  return {
    state: snapshot.state,
    context: {
      ...prev.context,
      ...snapshot.context,
      lists: {
        ...prev.context.lists,
        ...snapshot.context.lists,
      },
    },
  };
};

const activeFetchesByStore = new WeakMap<() => unknown, Set<string>>();

const getActiveFetches = (getState: () => unknown) => {
  const activeFetches = activeFetchesByStore.get(getState) ?? new Set<string>();
  activeFetchesByStore.set(getState, activeFetches);
  return activeFetches;
};

export const entityList = createMachine({
  config: {
    READY: {
      FETCH_ENTITY_LIST: "READY",
      ENTITY_LIST_FETCH_RESOLVED: "READY",
      ENTITY_LIST_FETCH_REJECTED: "READY",
    },
  },
  initialState: "READY",
  initialContext,
  hydrate: hydrateEntityList,
  reducer: (state, action, { nextState }) => {
    state.state = nextState;

    switch (action.type) {
      case "FETCH_ENTITY_LIST": {
        const listId = getListId(action.payload);
        const entry = state.context.lists[listId] ?? createEntry(action.payload);

        if (entry.status === "loading" || !entry.hasNext) {
          state.context.lists[listId] = entry;
          return;
        }

        state.context.lists[listId] = { ...entry, request: action.payload, status: "loading", error: undefined };
        return;
      }
      case "ENTITY_LIST_FETCH_RESOLVED": {
        const { request, page } = action.payload;
        const entry = state.context.lists[getListId(request)];
        if (entry) state.context.lists[entry.listId] = applyLoadedPage(entry, page);
        return;
      }
      case "ENTITY_LIST_FETCH_REJECTED": {
        const { request, error } = action.payload;
        const entry = state.context.lists[getListId(request)] ?? createEntry(request);
        state.context.lists[entry.listId] = { ...entry, status: "error", error };
        return;
      }
    }
  },
  effects: {
    "*": async ({ action, getState, transition }) => {
      if (action.type !== "FETCH_ENTITY_LIST") return;

      const request = action.payload;
      const listId = getListId(request);
      const activeFetches = getActiveFetches(getState);
      if (activeFetches.has(listId)) return;

      const entry = getState().entityList.context.lists[listId];
      if (!entry || entry.status !== "loading" || !entry.hasNext) return;

      activeFetches.add(listId);

      try {
        const lastPage = entry.pages[entry.pages.length - 1];
        const page = await loadWidgetPage(request, lastPage?.nextCursor);
        transition({ type: "ENTITY_LIST_FETCH_RESOLVED", payload: { request, page } });
      } catch (error) {
        transition({
          type: "ENTITY_LIST_FETCH_REJECTED",
          payload: { request, error: error instanceof Error ? error.message : String(error) },
        });
      } finally {
        activeFetches.delete(listId);
      }
    },
  },
});

export const selectEntityListEntry =
  (request: ListRequest) => (state: { entityList: { context: EntityListContext } }) =>
    state.entityList.context.lists[getListId(request)] ?? createDefaultEntry(request.type, getListKey(request));
