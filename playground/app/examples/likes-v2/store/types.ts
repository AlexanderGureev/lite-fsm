import type { LikeSyncEvent } from "./machines/likeSync";
import type { LikesV2Event } from "./machines/likesV2";

export type AppEvents = LikesV2Event | LikeSyncEvent;

export type AppDeps = Record<string, never>;
