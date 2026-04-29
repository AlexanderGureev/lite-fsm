import type { LikesEvent } from "./machines/likes";

export type AppEvents = LikesEvent;

export type AppDeps = Record<string, never>;
