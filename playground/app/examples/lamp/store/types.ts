import type { LampEvent } from "./machines/lamp";

export type AppEvents = LampEvent;

export type AppDeps = Record<string, never>;
