import { describe, expect, test } from "tstyche";
import { MachineManager } from "lite-fsm";
import type {
  AnyEvent,
  MachineDependencies,
  MachineEvents,
  MachineStore,
  ManagerAction,
  ManagerCommitAction,
  Middleware,
} from "lite-fsm";

import type {
  AppMachines,
  AppState,
  LargeConfig,
  MachineContext,
  MachineKey,
  PerfDeps,
  PerfEvent,
  PerfState,
  PerfStep,
} from "./_performance-fixtures";
import { machines } from "./_performance-fixtures";

type DependencyPerfMachines = {
  [K in MachineKey]: {
    config: LargeConfig<K>;
    initialState: PerfState<K, "idle">;
    initialContext: MachineContext<K>;
    effects: {
      [S in PerfState<K, "ready">]: (deps: PerfDeps) => void;
    };
  };
};

describe("type performance manager callbacks для большой карты machines", () => {
  test("MachineEvents и MachineDependencies обходят 1000 machines", () => {
    expect<MachineEvents<AppMachines>>().type.toBe<PerfEvent>();
    expect<MachineDependencies<DependencyPerfMachines>>().type.toBe<PerfDeps>();
  });

  test("onTransition раскрывает prev/current state и commit action", () => {
    const manager = MachineManager<AppMachines, PerfEvent>(machines);

    manager.onTransition((prevState, currentState, action) => {
      expect(prevState).type.toBe<AppState>();
      expect(currentState).type.toBe<AppState>();
      expect(action).type.toBe<ManagerCommitAction<AppMachines, ManagerAction<PerfEvent>>>();
      expect(currentState.machine000.state).type.toBe<PerfState<"machine000", PerfStep>>();
      expect(currentState.machine999.context.payload.title).type.toBe<"title:machine999">();
    });
  });

  test("replaceReducer и middleware API раскрывают большой AppState", () => {
    const middleware: Middleware<AppState, PerfEvent> = (api) => (next) => (action) => {
      const state = api.getState();

      expect(state).type.toBe<AppState>();
      expect(state.machine125.context.storageKey).type.toBe<"storage:machine125">();
      expect(action).type.toBe<ManagerAction<PerfEvent>>();
      expect(next(action)).type.toBe<ManagerAction<PerfEvent>>();

      api.onTransition((prevState, currentState, committed) => {
        expect(prevState).type.toBe<AppState>();
        expect(currentState.machine875.state).type.toBe<PerfState<"machine875", PerfStep>>();
        expect(committed).type.toBe<ManagerCommitAction<MachineStore, AnyEvent>>();
      });

      return next(action);
    };
    const manager = MachineManager<AppMachines, PerfEvent>(machines, { middleware: [middleware] });

    manager.replaceReducer((original) => (state, action) => {
      expect(state).type.toBe<AppState>();
      expect(action).type.toBe<ManagerAction<PerfEvent>>();
      expect(state.machine999.context.id).type.toBe<"machine999">();
      return original(state, action);
    });

    manager.setDependencies({
      getState: manager.getState,
    });
  });
});
