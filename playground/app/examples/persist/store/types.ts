import type { Event } from "./machines/profile";
import type { FSMEvent } from "lite-fsm";

export type AppEvents = Event | FSMEvent<"DO_INIT">;

export type AppDeps = Record<string, never>;
