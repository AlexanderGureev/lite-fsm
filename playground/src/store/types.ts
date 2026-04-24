import type { LampEvent } from "./machines/lamp";
import type { LikesEvent } from "./machines/likes";
import type { ProfileSessionEvent } from "./machines/profileSession";
import type { WidgetFeedEvent } from "./machines/widgetFeed";

export type AppEvents = LampEvent | LikesEvent | ProfileSessionEvent | WidgetFeedEvent;
