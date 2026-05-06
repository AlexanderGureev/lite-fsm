import type { AppState } from ".";

export type AppDeps = {
  getState: () => AppState;
  random: () => number;
};
