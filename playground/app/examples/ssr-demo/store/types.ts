import type { ProfileSessionEvent } from "./machines/profileSession";
import type { WidgetFeedEvent } from "./machines/widgetFeed";

export type AppEvents = ProfileSessionEvent | WidgetFeedEvent;
