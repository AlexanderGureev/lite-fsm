import type { CliContext } from "../../cli/context.js";
import type { CreateProjectStepResult } from "../result.js";
import { writeProjectFiles } from "../write-files.js";

const storeFiles: Readonly<Record<string, string>> = {
  "src/store/create-machine.ts": `import type { TypedCreateMachineFn } from "@lite-fsm/core";
import { createMachine as createLiteFsmMachine } from "@lite-fsm/core";
import type { AppDeps } from "./deps";
import type { AppEvents } from "./types";

export const createMachine: TypedCreateMachineFn<AppEvents, AppDeps> = createLiteFsmMachine;
`,
  "src/store/types.ts": `import type { FSMEvent } from "@lite-fsm/core";

export type AppEvents = FSMEvent<"DO_INIT">;
`,
  "src/store/deps.ts": `import type { AppState } from ".";

export type AppDeps = {
  getState: () => AppState;
};
`,
  "src/store/hooks.ts": `import { useManager, useSelector, useTransition } from "@lite-fsm/react";
import type { AppMachines, AppState } from ".";
import type { AppEvents } from "./types";

export const useAppManager = () => useManager<AppMachines, AppEvents>();

export const useAppSelector = <R>(
  selector: (state: AppState) => R,
  equalityFn?: (oldValue: R, newValue: R) => boolean,
) => useSelector<AppMachines, R>(selector, equalityFn);

export const useAppTransition = () => useTransition<AppEvents>();
`,
  "src/store/index.ts": `import { MachineManager, type MachinesState } from "@lite-fsm/core";
import { immerMiddleware } from "@lite-fsm/middleware/immer";
import { app } from "./machines/app";
import type { AppEvents } from "./types";

export const machines = {
  app,
};

export type AppMachines = typeof machines;
export type AppState = MachinesState<AppMachines>;

export const makeStore = () => {
  const manager = MachineManager<AppMachines, AppEvents>(machines, {
    middleware: [immerMiddleware],
  });

  manager.setDependencies({
    getState: manager.getState,
  });

  return manager;
};

export type AppStore = ReturnType<typeof makeStore>;
export * from "./hooks";
export type { AppDeps } from "./deps";
export type { AppEvents } from "./types";
`,
  "src/store/machines/app.ts": `import { createMachine } from "../create-machine";

export const app = createMachine({
  config: {
    IDLE: { DO_INIT: "READY" },
    READY: {},
  },
  initialState: "IDLE",
  initialContext: {},
  effects: {
    READY: ({ getState }) => {
      const root = getState();
      if (root.app.state !== "READY") return;
    },
  },
});
`,
};

export const applyLiteFsmStoreOverlay = (
  context: CliContext,
  targetPath: string,
): CreateProjectStepResult => writeProjectFiles(context, targetPath, storeFiles);
