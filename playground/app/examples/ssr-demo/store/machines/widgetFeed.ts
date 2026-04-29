import type { FSMEvent } from "lite-fsm";

import { createMachine } from "../create-machine";
import {
  PAGE_SIZE,
  fetchWidgetPage,
  getWidgetFeedId,
  type DemoItem,
  type DemoPagination,
  type LoadedWidgetPage,
  type WidgetFeedRequest,
  type WidgetSeed,
} from "../ssr";

export type FetchStatus = "idle" | "loading";

type WidgetFeedPage = { data: DemoItem[]; pagination: DemoPagination };

export type WidgetFeedEntry = {
  feedId: string;
  request: WidgetFeedRequest;
  pages: WidgetFeedPage[];
  status: FetchStatus;
  hasNext: boolean;
};

export type WidgetFeedContext = { feeds: Record<string, WidgetFeedEntry> };

export type WidgetFeedEvent =
  | FSMEvent<"INITIAL_WIDGET_FEED_DATA", WidgetSeed>
  | FSMEvent<"FETCH_WIDGET_FEED", WidgetFeedRequest>
  | FSMEvent<"WIDGET_FEED_FETCH_RESOLVED", { request: WidgetFeedRequest; page: LoadedWidgetPage }>;

const initialContext: WidgetFeedContext = { feeds: {} };

const createEntry = (request: WidgetFeedRequest): WidgetFeedEntry => ({
  feedId: getWidgetFeedId(request),
  request,
  pages: [],
  status: "idle",
  hasNext: true,
});

const applyPage = (entry: WidgetFeedEntry, page: LoadedWidgetPage): WidgetFeedEntry => ({
  ...entry,
  status: "idle",
  hasNext: page.hasNext,
  pages: page.data.length ? [...entry.pages, { data: page.data, pagination: page.pagination }] : entry.pages,
});

export const widgetFeed = createMachine({
  config: {
    "*": {
      INITIAL_WIDGET_FEED_DATA: "READY",
      FETCH_WIDGET_FEED: "LOADING",
      WIDGET_FEED_FETCH_RESOLVED: "READY",
    },
    READY: {},
    LOADING: {},
  },
  initialState: "READY",
  initialContext,
  reducer: (state, action, { nextState }) => {
    state.state = nextState;

    switch (action.type) {
      case "INITIAL_WIDGET_FEED_DATA": {
        const seed = action.payload;
        state.context.feeds[getWidgetFeedId(seed.request)] = applyPage(createEntry(seed.request), seed);
        return;
      }

      case "FETCH_WIDGET_FEED": {
        const feedId = getWidgetFeedId(action.payload);
        const entry = state.context.feeds[feedId] ?? createEntry(action.payload);
        state.context.feeds[feedId] = { ...entry, status: "loading" };
        return;
      }

      case "WIDGET_FEED_FETCH_RESOLVED": {
        const { request, page } = action.payload;
        const entry = state.context.feeds[getWidgetFeedId(request)];
        if (entry) state.context.feeds[entry.feedId] = applyPage(entry, page);
        return;
      }
    }
  },
  effects: {
    LOADING: async ({ action, getState, transition }) => {
      const request = action.payload;
      const entry = getState().widgetFeed.context.feeds[getWidgetFeedId(request)];
      const lastPage = entry?.pages[entry.pages.length - 1];
      const nextOffset = lastPage ? lastPage.pagination.offset + lastPage.pagination.limit : 0;

      const page = await fetchWidgetPage(request, { limit: PAGE_SIZE, offset: nextOffset });

      transition({
        type: "WIDGET_FEED_FETCH_RESOLVED",
        payload: { request, page },
      });
    },
  },
});

export const selectWidgetFeedEntry =
  (request: WidgetFeedRequest) => (state: { widgetFeed: { context: WidgetFeedContext } }) =>
    state.widgetFeed.context.feeds[getWidgetFeedId(request)];
