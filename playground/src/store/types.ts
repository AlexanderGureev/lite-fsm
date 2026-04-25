import type { EntityListEvent } from "./machines/entityList";
import type { LampEvent } from "./machines/lamp";
import type { LikesEvent } from "./machines/likes";
import type { ProfileSessionEvent } from "./machines/profileSession";
import type { SSRDemo2GridEvent } from "./machines/ssrDemo2Grid";
import type { WidgetFeedEvent } from "./machines/widgetFeed";

export type AppEvents =
  | LampEvent
  | LikesEvent
  | ProfileSessionEvent
  | SSRDemo2GridEvent
  | EntityListEvent
  | WidgetFeedEvent;
