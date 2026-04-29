import type { AppState } from ".";
import type { Vec2 } from "./types";

export type AppDeps = {
  getState: () => AppState;
  getInputVector: () => Vec2;
  random: () => number;
};
