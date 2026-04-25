import type { FSMEvent } from "lite-fsm";

import {
  loadWidgetPage,
  type Demo2CursorPagination,
  type Demo2Item,
  type LoadedWidgetPage,
  type WidgetFeedRequest,
  type WidgetSeed,
} from "../../ssr-demo-2";
import { createMachine } from "../create-machine";

export type ListRequest = WidgetFeedRequest;
export type ListType = ListRequest["type"];
export type EntityListStatus = "idle" | "loading" | "error";

export type EntityListPage = {
  data: Demo2Item[];
  pagination: Demo2CursorPagination;
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
  | FSMEvent<"INITIAL_ENTITY_LIST_DATA", WidgetSeed>
  | FSMEvent<"FETCH_ENTITY_LIST", ListRequest>
  | FSMEvent<"ENTITY_LIST_FETCH_RESOLVED", { request: ListRequest; page: LoadedWidgetPage }>
  | FSMEvent<"ENTITY_LIST_FETCH_REJECTED", { request: ListRequest; error: string }>;

type ResponseAdapter<TResponse> = (response: TResponse) => LoadedWidgetPage;

type ListDefinition = {
  strategy: "cursor";
  getKey: (request: ListRequest) => string;
  limit: number;
  adapter: ResponseAdapter<LoadedWidgetPage>;
};

type FetchStrategy = (params: {
  entry: EntityListEntry;
  definition: ListDefinition;
}) => Promise<LoadedWidgetPage>;

const ADAPTER_CURSOR_PAGE: ResponseAdapter<LoadedWidgetPage> = (response) => response;

export const LIST_DEFINITIONS = {
  WIDGET_FEED: {
    strategy: "cursor",
    getKey: (request) => request.key,
    limit: 3,
    adapter: ADAPTER_CURSOR_PAGE,
  },
} satisfies Record<ListType, ListDefinition>;

const FETCH_STRATEGIES = {
  cursor: async ({ entry, definition }: Parameters<FetchStrategy>[0]) => {
    if (!entry.request) throw new Error(`Missing request for ${entry.listId}`);

    const lastPage = entry.pages[entry.pages.length - 1];
    const response = await loadWidgetPage(entry.request, lastPage?.nextCursor);

    return definition.adapter(response);
  },
} satisfies Record<ListDefinition["strategy"], FetchStrategy>;

const initialContext: EntityListContext = { lists: {} };

export const toListId = (type: ListType, key: string) => `${type}:${key}`;

export const getListKey = (request: ListRequest) => LIST_DEFINITIONS[request.type].getKey(request);

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

export const createDefaultEntry = (type: ListType, key: string): EntityListEntry => ({
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

type EntityListHandler<TEvent extends EntityListEvent> = (context: EntityListContext, action: TEvent) => void;

const ENTITY_LIST_HANDLERS: {
  [Type in EntityListEvent["type"]]: EntityListHandler<Extract<EntityListEvent, { type: Type }>>;
} = {
  INITIAL_ENTITY_LIST_DATA: (context, action) => {
    const seed = action.payload;
    context.lists[getListId(seed.request)] = applyLoadedPage(createEntry(seed.request), seed);
  },
  FETCH_ENTITY_LIST: (context, action) => {
    const listId = getListId(action.payload);
    const entry = context.lists[listId] ?? createEntry(action.payload);

    if (entry.status === "loading" || !entry.hasNext) {
      context.lists[listId] = entry;
      return;
    }

    context.lists[listId] = { ...entry, request: action.payload, status: "loading", error: undefined };
  },
  ENTITY_LIST_FETCH_RESOLVED: (context, action) => {
    const { request, page } = action.payload;
    const entry = context.lists[getListId(request)];
    if (entry) context.lists[entry.listId] = applyLoadedPage(entry, page);
  },
  ENTITY_LIST_FETCH_REJECTED: (context, action) => {
    const { request, error } = action.payload;
    const entry = context.lists[getListId(request)] ?? createEntry(request);
    context.lists[entry.listId] = { ...entry, status: "error", error };
  },
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
      INITIAL_ENTITY_LIST_DATA: "READY",
      FETCH_ENTITY_LIST: "READY",
      ENTITY_LIST_FETCH_RESOLVED: "READY",
      ENTITY_LIST_FETCH_REJECTED: "READY",
    },
  },
  initialState: "READY",
  initialContext,
  reducer: (state, action, { nextState }) => {
    state.state = nextState;

    const handler = ENTITY_LIST_HANDLERS[action.type as EntityListEvent["type"]];
    handler?.(state.context, action as never);
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
        const definition = LIST_DEFINITIONS[request.type];
        const page = await FETCH_STRATEGIES[definition.strategy]({ entry, definition });
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

export const getEntityList =
  (type: ListType, key: string) => (state: { entityList: { context: EntityListContext } }) =>
    state.entityList.context.lists[toListId(type, key)] ?? createDefaultEntry(type, key);

export const selectEntityListEntry =
  (request: ListRequest) => (state: { entityList: { context: EntityListContext } }) =>
    state.entityList.context.lists[getListId(request)] ?? createDefaultEntry(request.type, getListKey(request));
