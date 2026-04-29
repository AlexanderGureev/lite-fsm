import type { EntityListEvent } from "./machines/entityList";
import type { GridEvent } from "./machines/grid";

export type AppEvents = GridEvent | EntityListEvent;
