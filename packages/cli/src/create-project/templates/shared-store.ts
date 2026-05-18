import type { CliContext } from "../../cli/context.js";
import type { CreateProjectStepResult } from "../result.js";
import { writeProjectFiles } from "../write-files.js";

const storeFiles: Readonly<Record<string, string>> = {
  "src/store/create-machine.ts": `import type { TypedCreateMachineFn } from "@lite-fsm/core";
import { createMachine as createLiteFsmMachine } from "@lite-fsm/core";
import type { AppDeps, AppEvents } from "./types";

export const createMachine: TypedCreateMachineFn<AppEvents, AppDeps> = createLiteFsmMachine;
`,
  "src/store/types.ts": `export type AppEvents = never;
export type AppDeps = Record<string, never>;
`,
  "src/store/hooks.ts": `import type { MachinesState } from "@lite-fsm/core";
import { useManager, useSelector, useTransition } from "@lite-fsm/react";
import type { app } from "./machines/app";
import type { AppEvents } from "./types";

export type AppMachines = {
  app: typeof app;
};

export type AppState = MachinesState<AppMachines>;

export const useAppManager = () => useManager<AppMachines, AppEvents>();

export const useAppSelector = <R>(
  selector: (state: AppState) => R,
  equalityFn?: (oldValue: R, newValue: R) => boolean,
) => useSelector<AppMachines, R>(selector, equalityFn);

export const useAppTransition = () => useTransition<AppEvents>();
`,
  "src/store/index.ts": `import { MachineManager } from "@lite-fsm/core";
import { app } from "./machines/app";

export const machines = {
  app,
};

export const manager = MachineManager(machines);

export type AppStore = typeof manager;
export * from "./hooks";
export type { AppDeps, AppEvents } from "./types";
`,
  "src/store/machines/app.ts": `import { createMachine } from "../create-machine";

export const app = createMachine({
  config: {
    idle: {},
  },
  initialState: "idle",
  initialContext: {},
});
`,
};

export const applyLiteFsmStoreOverlay = (
  context: CliContext,
  targetPath: string,
): CreateProjectStepResult => writeProjectFiles(context, targetPath, storeFiles);
