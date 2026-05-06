import { createMachine as baseCreateMachine, MachineManager } from "@lite-fsm/core";
import type { FSMEvent, TypedCreateMachineFn } from "@lite-fsm/core";

type ActorEvt = FSMEvent<"STROKE_APPEND">;

type AppDeps = {
  getState: () => AppState;
};

const createMachine: TypedCreateMachineFn<ActorEvt, AppDeps> = baseCreateMachine;

const p1 = createMachine({
  config: {
    IDLE: {
      STROKE_APPEND: "READY",
    },
    READY: {},
  },

  initialState: "IDLE",
  initialContext: {},
  dehydrate: () => ({ test: 1 }),
  hydrate: (prev, snapshot) => {
    return {
      state: prev?.state || "IDLE",
      context: snapshot,
    };
  },
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
  initialState: "IDLE",
  initialContext: {},
  persistence: "snapshot",
  dehydrate: () => ({ test: 1 }),
  hydrate: (prev, snapshot) => {
    return {
      state: prev?.state || "IDLE",
      context: snapshot,
    };
  },
});

const p3 = createMachine({
  config: {
    __INIT: {
      STROKE_APPEND: "IDLE",
    },
    IDLE: {
      STROKE_APPEND: "IDLE",
    },
    READY: {},
  },
  initialState: "IDLE",
  initialContext: {},
  persistence: "snapshot",
  dehydrate: () => ({ test: 1 }),
  hydrate: (prev, snapshot) => {
    return {
      state: prev?.state || "IDLE",
      context: snapshot,
    };
  },
  effects: {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    READY: ({ getState }) => {
      // getState().p1;
    },
  },
});

const manager = MachineManager({
  p1,
  p2,
  p3,
});

manager.dehydrate({ machines: ["p1"] });

manager.hydrate({
  machines: {
    p1: { context: p1.initialContext, state: "IDLE" },
  },
});

const machines = {
  p1,
  p2,
  p3,
};

export type FSMConfigType = typeof machines;

export const makeStore = () => {
  const manager = MachineManager<FSMConfigType, ActorEvt>(machines, {
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
