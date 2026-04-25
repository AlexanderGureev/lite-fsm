export const DEMO2_GRID_PAGE_SIZE = 2;
export const DEMO2_WIDGET_PAGE_SIZE = 3;

export type Demo2ContentType = "mock_feed";
export type Demo2ScreenId = "featured" | "night";
export type Demo2WidgetId =
  | "featured-new"
  | "featured-slow"
  | "featured-editors"
  | "featured-late"
  | "night-openers"
  | "night-slow"
  | "night-deep"
  | "night-after";

export type Demo2Item = { id: string; title: string; subtitle: string };
export type Demo2CursorPagination = { cursor?: string; limit: number };

export type Demo2ScreenConfig = {
  id: Demo2ScreenId;
  title: string;
  description: string;
};

export type WidgetFeedRequest = {
  type: "WIDGET_FEED";
  key: string;
  widgetId: Demo2WidgetId;
  title: string;
  limit: number;
};

export type LoadedWidgetPage = {
  data: Demo2Item[];
  pagination: Demo2CursorPagination;
  nextCursor?: string;
  hasNext: boolean;
};

export type WidgetSeed = LoadedWidgetPage & { request: WidgetFeedRequest };

export type GridManifestItem = {
  slotId: string;
  contentType: Demo2ContentType;
  title: string;
  widgetRequest: WidgetFeedRequest;
};

export type GridPage = {
  items: GridManifestItem[];
  nextCursor?: string;
  hasNext: boolean;
};

const wait = (ms: number) => new Promise<void>((resolve) => globalThis.setTimeout(resolve, ms));

const screens: Record<Demo2ScreenId, Demo2ScreenConfig> = {
  featured: {
    id: "featured",
    title: "Demo 2 · Featured grid",
    description: "Manifest первой grid-страницы приходит с сервера, а каждый widget stream-ится независимо.",
  },
  night: {
    id: "night",
    title: "Demo 2 · Night grid",
    description: "Та же manifest-first схема с отдельными курсорами grid и каждого widget.",
  },
};

const widgetItems: Record<Demo2WidgetId, Demo2Item[]> = {
  "featured-new": [
    { id: "fn-1", title: "Atlas Bloom", subtitle: "SSR page #1" },
    { id: "fn-2", title: "Echo Layer", subtitle: "SSR page #1" },
    { id: "fn-3", title: "Soft Signal", subtitle: "SSR page #1" },
    { id: "fn-4", title: "Paper Skies", subtitle: "Client page #2" },
    { id: "fn-5", title: "Tiny Cinema", subtitle: "Client page #2" },
  ],
  "featured-slow": [
    { id: "fs-1", title: "Slow Violet", subtitle: "SSR page #1 · intentionally slow" },
    { id: "fs-2", title: "Deep Compile", subtitle: "SSR page #1 · intentionally slow" },
    { id: "fs-3", title: "Remote Habit", subtitle: "SSR page #1 · intentionally slow" },
    { id: "fs-4", title: "Branch Delay", subtitle: "Client page #2" },
  ],
  "featured-editors": [
    { id: "fe-1", title: "Courier Club", subtitle: "Client appended widget" },
    { id: "fe-2", title: "Metric Fields", subtitle: "Client appended widget" },
    { id: "fe-3", title: "White Noise", subtitle: "Client appended widget" },
    { id: "fe-4", title: "Golden Thread", subtitle: "Widget page #2" },
  ],
  "featured-late": [
    { id: "fl-1", title: "Late Runner", subtitle: "Client appended widget" },
    { id: "fl-2", title: "Next Harbor", subtitle: "Client appended widget" },
    { id: "fl-3", title: "Trace Radio", subtitle: "Client appended widget" },
  ],
  "night-openers": [
    { id: "no-1", title: "Night Parcel", subtitle: "SSR page #1" },
    { id: "no-2", title: "Silver Grid", subtitle: "SSR page #1" },
    { id: "no-3", title: "Low Orbit", subtitle: "SSR page #1" },
    { id: "no-4", title: "Half Awake", subtitle: "Client page #2" },
  ],
  "night-slow": [
    { id: "ns-1", title: "Moon Cache", subtitle: "SSR page #1 · intentionally slow" },
    { id: "ns-2", title: "Static Rain", subtitle: "SSR page #1 · intentionally slow" },
    { id: "ns-3", title: "Long Promise", subtitle: "SSR page #1 · intentionally slow" },
    { id: "ns-4", title: "Late Beam", subtitle: "Client page #2" },
  ],
  "night-deep": [
    { id: "nd-1", title: "Deep Cut", subtitle: "Client appended widget" },
    { id: "nd-2", title: "Midnight Shell", subtitle: "Client appended widget" },
    { id: "nd-3", title: "Black Box", subtitle: "Client appended widget" },
  ],
  "night-after": [
    { id: "na-1", title: "After Light", subtitle: "Client appended widget" },
    { id: "na-2", title: "Blue Exit", subtitle: "Client appended widget" },
    { id: "na-3", title: "Last Request", subtitle: "Client appended widget" },
  ],
};

const createWidgetRequest = (widgetId: Demo2WidgetId, title: string): WidgetFeedRequest => ({
  type: "WIDGET_FEED",
  key: widgetId,
  widgetId,
  title,
  limit: DEMO2_WIDGET_PAGE_SIZE,
});

const createManifestItem = (screenId: Demo2ScreenId, widgetId: Demo2WidgetId, title: string): GridManifestItem => ({
  slotId: `${screenId}:${widgetId}`,
  contentType: "mock_feed",
  title,
  widgetRequest: createWidgetRequest(widgetId, title),
});

const gridItems: Record<Demo2ScreenId, GridManifestItem[]> = {
  featured: [
    createManifestItem("featured", "featured-new", "Fresh arrivals"),
    createManifestItem("featured", "featured-slow", "Slow streaming widget"),
    createManifestItem("featured", "featured-editors", "Editors pick"),
    createManifestItem("featured", "featured-late", "Late additions"),
  ],
  night: [
    createManifestItem("night", "night-openers", "Night openers"),
    createManifestItem("night", "night-slow", "Slow night widget"),
    createManifestItem("night", "night-deep", "Deep focus"),
    createManifestItem("night", "night-after", "After hours"),
  ],
};

const cursorToOffset = (cursor?: string) => (cursor ? Number.parseInt(cursor, 10) : 0);
const offsetToCursor = (offset: number, total: number) => (offset < total ? String(offset) : undefined);

export const demo2Screens = [screens.featured, screens.night];

export const getDemo2Screen = (id: Demo2ScreenId) => screens[id];

export const getDemo2ScreenPath = (id: Demo2ScreenId) => `/ssr-demo-2/${id}`;

export const loadGridPage = async (screenId: Demo2ScreenId, cursor?: string): Promise<GridPage> => {
  await wait(cursor ? 650 : 160);

  const items = gridItems[screenId];
  const offset = cursorToOffset(cursor);
  const nextOffset = offset + DEMO2_GRID_PAGE_SIZE;

  return {
    items: items.slice(offset, nextOffset),
    nextCursor: offsetToCursor(nextOffset, items.length),
    hasNext: nextOffset < items.length,
  };
};

export const loadWidgetPage = async (
  request: WidgetFeedRequest,
  cursor?: string,
): Promise<LoadedWidgetPage> => {
  await wait(request.widgetId.includes("slow") ? 1250 : 380);

  const items = widgetItems[request.widgetId];
  const offset = cursorToOffset(cursor);
  const limit = request.limit;
  const nextOffset = offset + limit;

  return {
    data: items.slice(offset, nextOffset),
    pagination: { cursor, limit },
    nextCursor: offsetToCursor(nextOffset, items.length),
    hasNext: nextOffset < items.length,
  };
};

export const loadWidgetSeed = async (manifestItem: GridManifestItem): Promise<WidgetSeed> => {
  const page = await loadWidgetPage(manifestItem.widgetRequest);
  return { request: manifestItem.widgetRequest, ...page };
};
