import type { EntityListEvent } from "./machines/entityList";
import type { LampEvent } from "./machines/lamp";
import type { LikesEvent } from "./machines/likes";
import type { ProfileSessionEvent } from "./machines/profileSession";
import type { SSRDemo2GridEvent } from "./machines/ssrDemo2Grid";
import type { SSRDemo3EntityListEvent } from "./machines/ssrDemo3EntityList";
import type { SSRDemo3GridEvent } from "./machines/ssrDemo3Grid";
import type { WidgetFeedEvent } from "./machines/widgetFeed";

export type AppEvents =
  | LampEvent
  | LikesEvent
  | ProfileSessionEvent
  | SSRDemo2GridEvent
  | SSRDemo3GridEvent
  | SSRDemo3EntityListEvent
  | EntityListEvent
  | WidgetFeedEvent;
