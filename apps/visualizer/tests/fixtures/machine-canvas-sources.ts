export const machineCanvasOnboardingSource = `import { createMachine } from "@lite-fsm/core";

export const onboarding = createMachine({
  config: {
    "*": {
      SUBSCRIPTION_HYDRATED: "CHECK_ONBOARDING",
      PROFILE_REHYDRATED: "CHECK_ONBOARDING",
      RESET: "IDLE",
    },
    IDLE: {
      OPEN: "CHECK_ONBOARDING",
    },
    CHECK_ONBOARDING: {
      CHECK_ONBOARDING_RESOLVE: "VISIBLE",
      CHECK_ONBOARDING_REJECT: "DISABLED",
      PING: null,
    },
    VISIBLE: {
      RESET: "IDLE",
    },
    DISABLED: {},
  },
  initialState: "IDLE",
  initialContext: {
    checks: 0,
  },
  reducer: (state, event, { nextState }) => {
    state.state = nextState;
    if (event.type === "SUBSCRIPTION_HYDRATED") state.context.checks += 1;
  },
  effects: {
    CHECK_ONBOARDING: ({ getState, transition }) => {
      if (getState().profile?.context?.subscription?.id === "premium") {
        transition({ type: "CHECK_ONBOARDING_RESOLVE" });
        return;
      }

      transition({ type: "CHECK_ONBOARDING_REJECT" });
    },
    "*": ({ transition }) => {
      transition({ type: "ONBOARDING_TRACE" });
    },
  },
});
`;

export const machineCanvasXstateSource = `// @ts-nocheck

import {
  createConfig,
  createEffect,
  createMachine,
  createMachine as renamedCreateMachine,
  createReducer,
  MachineManager,
} from "@lite-fsm/core";

const DONE = "DONE";
const computedEvent = "OPEN";
const computedState = "CLOSED";
const WILDCARD_EFFECT_KEY = "*";

const sharedTerminalEdges = {
  CANCEL: "__CANCELLED",
} as const;

export const renamedImportMachine = renamedCreateMachine({
  config: {
    IDLE: {
      GO: "ACTIVE",
    },
    ACTIVE: {
      STOP: "IDLE",
    },
  },
  initialState: "IDLE",
  initialContext: {},
});

const helperConfig = createConfig({
  IDLE: {
    START_HELPER: "WORKING",
  },
  WORKING: {
    COMPLETE_HELPER: DONE,
    RESET_HELPER: "IDLE",
  },
  DONE: {},
} as const);

const helperReducer = createReducer((state, action, { nextState }) => {
  if (action.type === "COMPLETE_HELPER") {
    return {
      state: nextState,
      context: {
        completed: true,
      },
    };
  }

  state.state = nextState;
});

export const helperWrappedMachine = createMachine({
  config: helperConfig,
  initialState: "IDLE",
  initialContext: {
    completed: false,
  },
  reducer: helperReducer,
});

export const computedKeysMachine = createMachine({
  config: {
    CLOSED: {
      [computedEvent]: "OPENED",
    },
    OPENED: {
      CLOSE: computedState,
    },
  },
  initialState: computedState,
  initialContext: {},
});

export const wildcardEffectMachine = createMachine({
  config: {
    IDLE: {
      AUDIT_RESET: null,
      PING: null,
      PONG: "READY",
    },
    READY: {
      RESET: "IDLE",
      AUDIT_RESET: null,
    },
  },
  initialState: "IDLE",
  initialContext: {},
  effects: {
    [WILDCARD_EFFECT_KEY]: createEffect({
      type: "latest",
      effect: ({ action, transition }) => {
        if (action.type === "PING") {
          transition({ type: "PONG" });
          return;
        }

        if (action.type === "RESET") {
          transition({ type: "AUDIT_RESET" });
          return;
        }

        transition({ type: "AUDIT_LOG" });
      },
    }),
  },
});

export const actorTemplate = createMachine({
  groupTag: "jobs",
  persistence: "snapshot",
  config: {
    __INIT: {
      SPAWN_JOB: "RUNNING",
    },
    RUNNING: {
      TICK: null,
      COMPLETE: "__RESOLVED",
      FAIL: "__REJECTED",
      ...sharedTerminalEdges,
    },
    "*": {
      FORCE_CANCEL: "__CANCELLED",
    },
  },
  initialState: "__INIT",
  initialContext: {
    id: "",
    progress: 0,
  },
  reducer: (state, action, { nextState }) => {
    if (action.type === "SPAWN_JOB") {
      state.state = nextState;
      state.context.id = action.payload.id;
      return;
    }

    if (action.type === "TICK") {
      state.context.progress = action.payload.progress;
      state.state = action.payload.progress >= 100 ? "__RESOLVED" : nextState;
      return;
    }

    state.state = nextState;
  },
  effects: {
    RUNNING: ({ transition, self }) => {
      transition({ type: "TICK", payload: { progress: 100 } });
      transition.unscoped({ type: "FORCE_CANCEL" });
      transition.actor("job-1", { type: "COMPLETE" });
      transition.actor([self.actorId], { type: "COMPLETE" });
      transition.group(self.groupId, { type: "COMPLETE" });
      transition.group([self.groupId], { type: "FAIL" });
      transition.tag(self.groupTag, { type: "FORCE_CANCEL" });
      transition.tag(["jobs", "urgent"], { type: "FORCE_CANCEL" });
      transition({ type: "JOB_TRACE" });
    },
  },
  dehydrate: (slice) => ({
    state: slice.state,
    context: slice.context,
  }),
  hydrate: (_prev, snapshot) => ({
    state: snapshot.state,
    context: snapshot.context,
  }),
});

export const dynamicTargetMachine = createMachine({
  config: {
    IDLE: {
      GO: getRuntimeTarget(),
    },
  },
  initialState: "IDLE",
  initialContext: {},
});

export const escapedTransitionMachine = createMachine({
  config: {
    IDLE: {
      START: "WORKING",
    },
    WORKING: {
      DONE: "IDLE",
    },
  },
  initialState: "IDLE",
  initialContext: {},
  effects: {
    WORKING: ({ transition }) => {
      runExternalService(transition);
    },
  },
});

export const manager = MachineManager(
  {
    renamedImportMachine,
    helperWrappedMachine,
    computedKeysMachine,
    wildcardEffectMachine,
    actorTemplate,
    dynamicTargetMachine,
    escapedTransitionMachine,
  },
  {
    onError: console.error,
    middleware: [],
    schemaVersion: 1,
  },
);
`;
