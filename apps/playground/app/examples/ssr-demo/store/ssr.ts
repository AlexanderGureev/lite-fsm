import type { MachineManagerSnapshot } from "@lite-fsm/core";

import type { FSMConfigType } from ".";

export const PAGE_SIZE = 4;

export type DemoContentType = "mock_feed";
export type DemoWidgetId = "featured-artists" | "night-wave";
export type DemoScreenId = "featured" | "night";

export type DemoItem = { id: string; title: string; subtitle: string };
export type DemoPagination = { limit: number; offset: number };
export type DemoProfile = { id: string; displayName: string; handle: string };

export type WidgetFeedRequest = {
  type: "WIDGET_FEED";
  contentId: string;
  widgetId: DemoWidgetId;
};

export type LoadedWidgetPage = {
  data: DemoItem[];
  pagination: DemoPagination;
  hasNext: boolean;
};

export type WidgetSeed = LoadedWidgetPage & { request: WidgetFeedRequest };

export type DemoWidgetConfig = {
  contentType: DemoContentType;
  contentId: string;
  widgetId: DemoWidgetId;
  title: string;
};

export type DemoScreenConfig = {
  id: DemoScreenId;
  title: string;
  description: string;
  widgets: DemoWidgetConfig[];
};

const wait = (ms: number) => new Promise<void>((resolve) => globalThis.setTimeout(resolve, ms));

const widgetItems: Record<DemoWidgetId, DemoItem[]> = {
  "featured-artists": [
    { id: "featured-1", title: "The Echo Lines", subtitle: "SSR seed" },
    { id: "featured-2", title: "Northern Lights", subtitle: "SSR seed" },
    { id: "featured-3", title: "Velvet Hills", subtitle: "SSR seed" },
    { id: "featured-4", title: "Static Bloom", subtitle: "SSR seed" },
    { id: "featured-5", title: "Blue Arcade", subtitle: "Client page #2" },
    { id: "featured-6", title: "City Tape", subtitle: "Client page #2" },
  ],
  "night-wave": [
    { id: "night-1", title: "Afterglow FM", subtitle: "SSR seed" },
    { id: "night-2", title: "Glass Islands", subtitle: "SSR seed" },
    { id: "night-3", title: "Midnight Typo", subtitle: "SSR seed" },
    { id: "night-4", title: "Electric Harbour", subtitle: "SSR seed" },
    { id: "night-5", title: "Low Tide", subtitle: "Client page #2" },
    { id: "night-6", title: "Orbit Motel", subtitle: "Client page #2" },
  ],
};

const screens: Record<DemoScreenId, DemoScreenConfig> = {
  featured: {
    id: "featured",
    title: "Страница A · Featured artists",
    description: "Server page готовит seed первой страницы, client widget догружает остальные.",
    widgets: [
      {
        contentType: "mock_feed",
        contentId: "featured-artists",
        widgetId: "featured-artists",
        title: "Featured artists",
      },
    ],
  },
  night: {
    id: "night",
    title: "Страница B · Night wave",
    description: "Тот же pipeline с другим contentId — отдельный key в cache-like store.",
    widgets: [
      {
        contentType: "mock_feed",
        contentId: "night-wave",
        widgetId: "night-wave",
        title: "Night wave",
      },
    ],
  },
};

export const demoScreens = [screens.featured, screens.night];

export const getDemoScreen = (id: DemoScreenId) => screens[id];

export const getWidgetRequest = (widget: DemoWidgetConfig): WidgetFeedRequest => ({
  type: "WIDGET_FEED",
  contentId: widget.contentId,
  widgetId: widget.widgetId,
});

export const getWidgetFeedId = (request: WidgetFeedRequest) => `${request.type}:${request.contentId}`;

export const fetchWidgetPage = async (
  request: WidgetFeedRequest,
  pagination: DemoPagination = { limit: PAGE_SIZE, offset: 0 },
): Promise<LoadedWidgetPage> => {
  await wait(450);

  const items = widgetItems[request.widgetId] ?? [];
  const data = items.slice(pagination.offset, pagination.offset + pagination.limit);

  return {
    data,
    pagination,
    hasNext: pagination.offset + pagination.limit < items.length,
  };
};

export const loadWidgetSeed = async (widget: DemoWidgetConfig): Promise<WidgetSeed> => {
  const request = getWidgetRequest(widget);
  const page = await fetchWidgetPage(request);
  return { request, ...page };
};

export const loadDemoProfile = async (): Promise<DemoProfile> => {
  await wait(260);
  return {
    id: "profile_demo_001",
    displayName: "Ada Prototype",
    handle: "@ada.prototype",
  };
};

export const createWidgetFeedSnapshot = (seed: WidgetSeed): MachineManagerSnapshot<FSMConfigType> => {
  const feedId = getWidgetFeedId(seed.request);

  return {
    machines: {
      widgetFeed: {
        state: "READY",
        context: {
          feeds: {
            [feedId]: {
              feedId,
              request: seed.request,
              pages: seed.data.length ? [{ data: seed.data, pagination: seed.pagination }] : [],
              status: "idle",
              hasNext: seed.hasNext,
            },
          },
        },
      },
    },
  };
};
