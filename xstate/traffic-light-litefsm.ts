import { createEffect as baseCreateEffect, createMachine as baseCreateMachine, MachineManager } from "@lite-fsm/core";
import type { FSMEvent, MachinesState, TypedCreateMachineFn, TypedCreateEffectFn } from "@lite-fsm/core";
import { immerMiddleware } from "@lite-fsm/middleware/immer";

type TrafficLightState =
  | "BOOTING"
  | "GREEN"
  | "YELLOW"
  | "RED_WAITING"
  | "RED_PEDESTRIAN_CROSSING"
  | "RED_TURN_ARROW"
  | "RED_CLEARANCE"
  | "RED_FLASH";

export type TrafficLightContext = {};

type TrafficLightSlice = {
  state: TrafficLightState;
  context: TrafficLightContext;
};

export type TrafficLightPublicEvent =
  | FSMEvent<"NEXT">
  | FSMEvent<"PEDESTRIAN_REQUEST">
  | FSMEvent<"EMERGENCY">
  | FSMEvent<"RESET">;

type TrafficLightInternalEvent = FSMEvent<"TRAFFIC_LIGHT_START"> | FSMEvent<"TRAFFIC_LIGHT_AFTER">;

export type AppEvents = TrafficLightPublicEvent | TrafficLightInternalEvent;

type AppDeps = {
  getState: () => { trafficLight: TrafficLightSlice };
};

const createMachine: TypedCreateMachineFn<AppEvents, AppDeps> = baseCreateMachine;
const createEffect: TypedCreateEffectFn<AppEvents, AppDeps> = baseCreateEffect;

const wait = (ms: number) => new Promise<void>((resolve) => globalThis.setTimeout(resolve, ms));

export const trafficLight = createMachine({
  config: {
    BOOTING: {
      TRAFFIC_LIGHT_START: "GREEN",
    },
    GREEN: {
      NEXT: "YELLOW",
      EMERGENCY: "RED_FLASH",
      TRAFFIC_LIGHT_AFTER: "YELLOW",
    },
    YELLOW: {
      NEXT: "RED_WAITING",
      EMERGENCY: "RED_FLASH",
      TRAFFIC_LIGHT_AFTER: "RED_WAITING",
    },
    RED_WAITING: {
      PEDESTRIAN_REQUEST: "RED_PEDESTRIAN_CROSSING",
      EMERGENCY: "RED_FLASH",
      TRAFFIC_LIGHT_AFTER: "RED_TURN_ARROW",
    },
    RED_PEDESTRIAN_CROSSING: {
      EMERGENCY: "RED_FLASH",
      TRAFFIC_LIGHT_AFTER: "RED_TURN_ARROW",
    },
    RED_TURN_ARROW: {
      EMERGENCY: "RED_FLASH",
      TRAFFIC_LIGHT_AFTER: "RED_CLEARANCE",
    },
    RED_CLEARANCE: {
      EMERGENCY: "RED_FLASH",
      TRAFFIC_LIGHT_AFTER: "GREEN",
    },
    RED_FLASH: {
      EMERGENCY: null,
      RESET: "GREEN",
    },
  },
  // Domain effects run after a transition, so BOOTING gives initial GREEN the same entry path as later returns.
  initialState: "BOOTING",
  initialContext: {},
  reducer: (state, action, { nextState }) => {
    switch (action.type) {
      case "TRAFFIC_LIGHT_START":
      case "TRAFFIC_LIGHT_AFTER":
      case "NEXT":
      case "PEDESTRIAN_REQUEST":
      case "EMERGENCY":
      case "RESET": {
        state.state = nextState;
        return;
      }
    }
  },
  effects: {
    "*": createEffect({
      type: "latest",
      effect: async ({ getState, transition }) => {
        let delay: number;

        switch (getState().trafficLight.state) {
          case "GREEN":
            delay = 5000;
            break;
          case "YELLOW":
            delay = 2000;
            break;
          case "RED_WAITING":
            delay = 3000;
            break;
          case "RED_PEDESTRIAN_CROSSING":
            delay = 4000;
            break;
          case "RED_TURN_ARROW":
            delay = 3000;
            break;
          case "RED_CLEARANCE":
            delay = 1000;
            break;
          case "BOOTING":
          case "RED_FLASH":
            return;
        }

        await wait(delay);

        transition({ type: "TRAFFIC_LIGHT_AFTER" });
      },
    }),
  },
});

const machines = {
  trafficLight,
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

  manager.transition({ type: "TRAFFIC_LIGHT_START" });

  return manager;
};

export type AppStore = ReturnType<typeof makeStore>;
