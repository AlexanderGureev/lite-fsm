import { createMachine as baseCreateMachine, MachineManager } from "../src/core";
import type { FSMEvent, MachinesState, TypedCreateMachineFn } from "../src/core";
import { immerMiddleware } from "../src/middleware/immer";

export type VendingContext = {};

export type AppEvents =
  | FSMEvent<"INSERT_COIN">
  | FSMEvent<"SELECT_SNACK">
  | FSMEvent<"PRESS_RETURN">
  | FSMEvent<"SNACK_DROPPED">
  | FSMEvent<"TAKE_SNACK">
  | FSMEvent<"COINS_RETURNED">;

type AppDeps = {
  getState: () => AppState;
};

const createMachine: TypedCreateMachineFn<AppEvents, AppDeps> = baseCreateMachine;

export const vendingMachine = createMachine({
  config: {
    IDLE: {
      INSERT_COIN: "HAS_CREDIT",
    },
    HAS_CREDIT: {
      INSERT_COIN: null,
      SELECT_SNACK: "DISPENSING",
      PRESS_RETURN: "RETURNING_CHANGE",
    },
    DISPENSING: {
      SNACK_DROPPED: "COLLECT",
    },
    COLLECT: {
      TAKE_SNACK: "IDLE",
    },
    RETURNING_CHANGE: {
      COINS_RETURNED: "IDLE",
    },
  },
  initialState: "IDLE",
  initialContext: {},
  reducer: (state, action, { nextState }) => {
    switch (action.type) {
      case "INSERT_COIN":
      case "SELECT_SNACK":
      case "PRESS_RETURN":
      case "SNACK_DROPPED":
      case "TAKE_SNACK":
      case "COINS_RETURNED": {
        state.state = nextState;
        return;
      }
    }
  },
});

const machines = {
  vendingMachine,
};

export type FSMConfigType = typeof machines;
export type AppState = MachinesState<FSMConfigType>;

export const makeStore = () => {
  const manager = MachineManager<FSMConfigType, AppEvents>(machines, {
    onError: console.error,
    middleware: [immerMiddleware],
    schemaVersion: 1,
  });

  manager.setDependencies({
    getState: manager.getState,
  });

  manager.onTransition((prevState, currentState, action) => {
    if (typeof window === "undefined") return;

    console.log("[lite-fsm] onTransition", {
      action,
      prevState,
      currentState,
    });
  });

  return manager;
};

export type AppStore = ReturnType<typeof makeStore>;
