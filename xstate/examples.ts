import { createMachine as baseCreateMachine, MachineManager } from "@lite-fsm/core";
import type { FSMEvent, TypedCreateMachineFn } from "@lite-fsm/core";

type Events =
  | FSMEvent<"STROKE_APPEND">
  | FSMEvent<"SUBSCRIPTION_FETCH_RESOLVE", { type: "premium" | "free" }>
  | FSMEvent<"LOGOUT">
  | FSMEvent<"DO_INIT">
  | FSMEvent<"GO_B">
  | FSMEvent<"SEND_TO_ANALYTICS">;

type AppDeps = {
  getState: () => AppState;
};

const createMachine: TypedCreateMachineFn<Events, AppDeps> = baseCreateMachine;

const p1 = createMachine({
  config: {
    IDLE: {
      STROKE_APPEND: "READY",
    },
    READY: {},
  },

  initialState: "IDLE",
  initialContext: {},
});

const p2 = createMachine({
  config: {
    __INIT: {
      STROKE_APPEND: "IDLE",
    },
    IDLE: {
      STROKE_APPEND: "IDLE",
    },
    READY: {},
  },
  initialState: "__INIT",
  initialContext: {},
});

const p3 = createMachine({
  config: {
    "*": {
      LOGOUT: "IDLE",
    },
    IDLE: {
      SUBSCRIPTION_FETCH_RESOLVE: null,
    },
    PREMIUM: {},
    FREE: {},
  },
  initialState: "IDLE",
  initialContext: {},
  reducer: (s, action) => {
    switch (action.type) {
      case "SUBSCRIPTION_FETCH_RESOLVE":
        s.state = action.payload.type === "premium" ? "PREMIUM" : "FREE";
        break;
    }

    // могут быть if условия вместо switch
  },
});

const p4 = createMachine({
  config: {
    "*": {
      LOGOUT: "IDLE",
    },
    IDLE: {
      SUBSCRIPTION_FETCH_RESOLVE: null,
    },
    PREMIUM: {},
    FREE: {},
  },
  initialState: "IDLE",
  initialContext: {},
  reducer: (s, action) => {
    switch (action.type) {
      case "SUBSCRIPTION_FETCH_RESOLVE":
        s.state = action.payload.type === "premium" ? "PREMIUM" : "FREE";
        break;
    }

    // могут быть if условия вместо switch
  },
  effects: {
    PREMIUM: ({ transition }) => {
      transition({ type: "SEND_TO_ANALYTICS" });

      //также могут быть условия для transition
      //transition может быть передан как аргумент в другие функции / сервисы
    },
  },
});

const machines = {
  p1,
  p2,
  p3,
  p4,
};

export type FSMConfigType = typeof machines;

export const makeStore = () => {
  const manager = MachineManager<FSMConfigType, Events>(machines, {
    onError: console.error,
    middleware: [],
    schemaVersion: 1,
  });

  manager.setDependencies({
    getState: manager.getState,
  });

  manager.onTransition((prevState, currentState, action) => {
    if (typeof window === "undefined") return;

    console.log("[lite-fsm playground]", {
      action,
      prevState,
      currentState,
    });
  });

  return manager;
};

export type AppStore = ReturnType<typeof makeStore>;
export type AppState = ReturnType<AppStore["getState"]>;
