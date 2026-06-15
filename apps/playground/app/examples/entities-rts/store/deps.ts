import type { EntityAccess } from "@lite-fsm/entities";

import type { AppMachines, AppState } from ".";
import type { MetricsAdapter } from "./metrics";

export type RendererAdapter = {
  reset(): void;
};

export type AppDeps = {
  getState: () => AppState;
  entities: () => EntityAccess<AppMachines>;
  renderer: RendererAdapter;
  metrics: MetricsAdapter;
  random: () => number;
};

export type RuntimeDeps = Omit<AppDeps, "getState" | "entities">;

export type { MetricsAdapter } from "./metrics";
