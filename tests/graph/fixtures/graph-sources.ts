export const fullAssemblerFilename = "tests/graph/fixtures/full-assembler-source.ts";

export const fullAssemblerSource = `// @ts-nocheck

// Fixture для будущего graph compiler-а.
// Файл специально не обязан компилироваться или запускаться как приложение.
// Здесь собраны формы createMachine/MachineManager, которые parser должен уметь
// находить и частично вычислять из одной строки исходника без project mode.

import {
  createConfig,
  createEffect,
  createEffect as renamedCreateEffect,
  createMachine,
  createMachine as renamedCreateMachine,
  createReducer,
  MachineManager,
  MachineManager as RenamedMachineManager,
} from "@lite-fsm/core";

const READY = "READY";
const DONE = "DONE";
const CANCELLED = "__CANCELLED";
const EFFECT_READY = "EFFECT_READY";
const EFFECT_FAILURE = "EFFECT_FAILURE";
const WILDCARD_EFFECT_KEY = "*";
const COMPUTED_EFFECT_STATE = "WATCHING";

const sharedResetEdges = {
  RESET: "IDLE",
} as const;

const sharedTerminalEdges = {
  CANCEL: CANCELLED,
} as const;

const sharedIdleConfig = {
  IDLE: {
    START: "WORKING",
    ...sharedResetEdges,
  },
} as const;

export const directObjectMachine = createMachine({
  config: {
    IDLE: {
      START: READY,
      PATCH: null,
    },
    READY: {
      FINISH: DONE,
    },
    DONE: {},
  },
  initialState: "IDLE",
  initialContext: {},
});

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

const localConstConfig = {
  ...sharedIdleConfig,
  WORKING: {
    SUCCESS: "DONE",
    FAIL: "FAILED",
  },
  FAILED: {
    RETRY: "WORKING",
    ...sharedResetEdges,
  },
  DONE: {},
} as const;

export const localConstConfigMachine = createMachine({
  config: localConstConfig,
  initialState: "IDLE",
  initialContext: {},
});

const helperConfig = createConfig({
  IDLE: {
    START_HELPER: "WORKING",
  },
  WORKING: {
    COMPLETE_HELPER: "DONE",
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

const computedEvent = "OPEN";
const computedState = "CLOSED";

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

const satisfiesConfig = {
  IDLE: {
    LOAD: "LOADING",
  },
  LOADING: {
    RESOLVE: "READY",
    REJECT: "FAILED",
  },
  READY: {},
  FAILED: {
    RETRY: "LOADING",
  },
} as const satisfies Record<string, Record<string, string | null>>;

export const satisfiesMachine = createMachine({
  config: satisfiesConfig,
  initialState: "IDLE",
  initialContext: {},
});

export const wildcardMachine = createMachine({
  config: {
    "*": {
      RESET: "IDLE",
      LOGOUT: "SIGNED_OUT",
    },
    IDLE: {
      LOGIN: "SIGNED_IN",
    },
    SIGNED_IN: {
      REFRESH: null,
    },
    SIGNED_OUT: {},
  },
  initialState: "IDLE",
  initialContext: {},
});

export const switchReducerMachine = createMachine({
  config: {
    IDLE: {
      SUBMIT: null,
      RESET: "IDLE",
    },
    VALID: {},
    INVALID: {},
  },
  initialState: "IDLE",
  initialContext: { value: "" },
  reducer: (state, action, { nextState }) => {
    switch (action.type) {
      case "SUBMIT":
        state.state = action.payload.value.length > 0 ? "VALID" : "INVALID";
        return;
      case "RESET":
        state.state = nextState;
        state.context.value = "";
        return;
    }
  },
});

export const ifReducerMachine = createMachine({
  config: {
    IDLE: {
      FETCH_RESOLVE: null,
      RESET: "IDLE",
    },
    PREMIUM: {},
    FREE: {},
  },
  initialState: "IDLE",
  initialContext: {},
  reducer: (s, action) => {
    if (action.type === "FETCH_RESOLVE" && action.payload.plan === "premium") {
      s.state = "PREMIUM";
      return;
    }

    if (action.type === "FETCH_RESOLVE") {
      s.state = "FREE";
      return;
    }

    if (action.type === "RESET") {
      s.state = "IDLE";
    }
  },
});

export const chainedIfReducerMachine = createMachine({
  config: {
    IDLE: {
      DECIDE: null,
      RESET: "IDLE",
    },
    HIGH: {},
    MEDIUM: {},
    LOW: {},
  },
  initialState: "IDLE",
  initialContext: {},
  reducer: (state, action) => {
    if (action.type === "DECIDE" && action.payload.score > 80) {
      state.state = "HIGH";
    } else if (action.type === "DECIDE" && action.payload.score > 40) {
      state.state = "MEDIUM";
    } else if (action.type === "DECIDE") {
      state.state = "LOW";
    } else {
      state.state = "IDLE";
    }
  },
});

export const returnObjectReducerMachine = createMachine({
  config: {
    IDLE: {
      GO: "READY",
    },
    READY: {},
  },
  initialState: "IDLE",
  initialContext: { count: 0 },
  reducer: (state, action, { nextState }) => {
    if (action.type === "GO") {
      return {
        state: nextState,
        context: {
          count: state.context.count + 1,
        },
      };
    }

    return state;
  },
});

export const plainEffectsMachine = createMachine({
  config: {
    IDLE: {
      START: "LOADING",
    },
    LOADING: {
      RESOLVE: "SUCCESS",
      REJECT: "FAILURE",
    },
    SUCCESS: {},
    FAILURE: {
      RETRY: "LOADING",
    },
  },
  initialState: "IDLE",
  initialContext: {},
  effects: {
    LOADING: async ({ transition }) => {
      transition({ type: "RESOLVE" });
      transition({ type: "REJECT" });
    },
  },
});

export const createEffectMachine = createMachine({
  config: {
    IDLE: {
      START: "PENDING",
    },
    PENDING: {
      DONE: "DONE",
      CANCEL: "IDLE",
    },
    DONE: {},
  },
  initialState: "IDLE",
  initialContext: {},
  effects: {
    PENDING: createEffect({
      type: "latest",
      effect: ({ transition }) => {
        transition({ type: "DONE" });
      },
    }),
  },
});

export const renamedCreateEffectMachine = createMachine({
  config: {
    IDLE: {
      START: "PENDING",
    },
    PENDING: {
      DONE: "DONE",
    },
    DONE: {},
  },
  initialState: "IDLE",
  initialContext: {},
  effects: {
    PENDING: renamedCreateEffect({
      type: "latest",
      effect: ({ transition }) => {
        transition({ type: "DONE" });
      },
    }),
  },
});

const localPlainEffect = ({ action, transition }) => {
  if (action.type === "ENABLE_WATCH") {
    transition({ type: "WATCH_TICK" });
    return;
  }

  if (action.type === "WATCH_TICK") {
    transition({ type: "WATCH_DONE" });
  }
};

const localCreateEffect = createEffect({
  type: "latest",
  effect: ({ action, transition }) => {
    switch (action.type) {
      case "START_LOCAL_EFFECT":
        transition({ type: EFFECT_READY });
        return;
      case "RETRY_LOCAL_EFFECT":
        transition({ type: EFFECT_FAILURE });
        return;
    }
  },
  cancelFn: () => {
    // cancelFn существует в API createEffect, но graph parser должен игнорировать его.
  },
});

export const localEffectsMachine = createMachine({
  config: {
    IDLE: {
      ENABLE_WATCH: "WATCHING",
      START_LOCAL_EFFECT: "LOCAL_PENDING",
    },
    WATCHING: {
      WATCH_TICK: null,
      WATCH_DONE: "IDLE",
    },
    LOCAL_PENDING: {
      RETRY_LOCAL_EFFECT: null,
      EFFECT_READY: "IDLE",
      EFFECT_FAILURE: "IDLE",
    },
  },
  initialState: "IDLE",
  initialContext: {},
  effects: {
    [COMPUTED_EFFECT_STATE]: localPlainEffect,
    LOCAL_PENDING: localCreateEffect,
  },
});

const localEffectsObject = {
  REVIEW: ({ action, transition }) => {
    if (action.type === "SUBMIT_REVIEW" && action.payload.approved) {
      transition({ type: "APPROVE_REVIEW" });
      return;
    }

    transition({ type: "REJECT_REVIEW" });
  },
} as const;

export const localEffectsObjectMachine = createMachine({
  config: {
    IDLE: {
      SUBMIT_REVIEW: "REVIEW",
    },
    REVIEW: {
      APPROVE_REVIEW: "APPROVED",
      REJECT_REVIEW: "REJECTED",
    },
    APPROVED: {},
    REJECTED: {},
  },
  initialState: "IDLE",
  initialContext: {},
  effects: localEffectsObject,
});

export const ifEffectMachine = createMachine({
  config: {
    IDLE: {
      START_CHECK: "CHECKING",
    },
    CHECKING: {
      CHECK_RESOLVE: "READY",
      CHECK_REJECT: "FAILED",
      CHECK_TIMEOUT: "FAILED",
    },
    READY: {},
    FAILED: {},
  },
  initialState: "IDLE",
  initialContext: {},
  effects: {
    CHECKING: ({ action, transition }) => {
      if (action.type === "START_CHECK" && action.payload.cached) {
        transition({ type: "CHECK_RESOLVE" });
        return;
      }

      if (action.type === "START_CHECK" && action.payload.offline) {
        transition({ type: "CHECK_REJECT" });
        return;
      }

      transition({ type: "CHECK_TIMEOUT" });
    },
  },
});

export const switchEffectMachine = createMachine({
  config: {
    IDLE: {
      BEGIN_FLOW: "FLOW",
    },
    FLOW: {
      FLOW_STEP: null,
      FLOW_DONE: "DONE",
      FLOW_FAIL: "FAILED",
    },
    DONE: {},
    FAILED: {},
  },
  initialState: "IDLE",
  initialContext: {},
  effects: {
    FLOW: ({ action, transition }) => {
      switch (action.type) {
        case "BEGIN_FLOW":
          transition({ type: "FLOW_STEP" });
          return;
        case "FLOW_STEP":
          transition({ type: "FLOW_DONE" });
          return;
        default:
          transition({ type: "FLOW_FAIL" });
      }
    },
  },
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
    "*": ({ action, transition }) => {
      if (action.type === "PING") {
        transition({ type: "PONG" });
        return;
      }

      if (action.type === "RESET") {
        transition({ type: "AUDIT_RESET" });
      }
    },
  },
});

export const computedWildcardCreateEffectMachine = createMachine({
  config: {
    IDLE: {
      START_TIMER: "ARMED",
    },
    ARMED: {
      TIMER_READY: "READY",
      TIMER_CANCEL: "IDLE",
    },
    READY: {},
  },
  initialState: "IDLE",
  initialContext: {},
  effects: {
    [WILDCARD_EFFECT_KEY]: createEffect({
      type: "latest",
      effect: ({ action, transition }) => {
        if (action.type === "START_TIMER") {
          transition({ type: "TIMER_READY" });
        }
      },
    }),
  },
});

export const domainWithMetaTransitionMachine = createMachine({
  config: {
    IDLE: {
      START: "ACTIVE",
    },
    ACTIVE: {
      LOCAL_DONE: "IDLE",
      GROUP_DONE: null,
      GROUP_ARRAY_DONE: null,
      TAG_DONE: null,
      TAG_ARRAY_DONE: null,
      ACTOR_DONE: null,
    },
  },
  initialState: "IDLE",
  initialContext: {},
  effects: {
    ACTIVE: ({ transition }) => {
      transition({ type: "LOCAL_DONE" });
      transition({ type: "ACTOR_DONE", meta: { actorId: "actor-1" } });
      transition({ type: "GROUP_DONE", meta: { groupId: "group-1" } });
      transition({ type: "GROUP_ARRAY_DONE", meta: { groupId: ["group-1", "group-2"] } });
      transition({ type: "TAG_DONE", meta: { groupTag: "workers" } });
      transition({ type: "TAG_ARRAY_DONE", meta: { groupTag: ["workers", "admins"] } });
    },
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

export const actorWildcardEffectTemplate = createMachine({
  groupTag: "actorWildcard",
  config: {
    __INIT: {
      SPAWN_TASK: "ACTIVE",
    },
    ACTIVE: {
      HEARTBEAT: null,
      COMPLETE: "__RESOLVED",
      FAIL: "__REJECTED",
    },
    "*": {
      ABORT_TASK: "__CANCELLED",
    },
  },
  initialState: "__INIT",
  initialContext: {
    taskId: "",
  },
  reducer: (state, action, { nextState }) => {
    if (action.type === "SPAWN_TASK") {
      state.state = nextState;
      state.context.taskId = action.payload.taskId;
      return;
    }

    state.state = nextState;
  },
  effects: {
    "*": createEffect({
      type: "latest",
      effect: ({ action, transition, self }) => {
        switch (action.type) {
          case "SPAWN_TASK":
            transition({ type: "HEARTBEAT" });
            return;
          case "HEARTBEAT":
            transition.actor(self.actorId, { type: "COMPLETE" });
            return;
          default:
            transition.tag(self.groupTag, { type: "ABORT_TASK" });
        }
      },
    }),
  },
});

const managerMachines = {
  directObjectMachine,
  renamedImportMachine,
  localConstConfigMachine,
  helperWrappedMachine,
  computedKeysMachine,
  satisfiesMachine,
  wildcardMachine,
  switchReducerMachine,
  ifReducerMachine,
  chainedIfReducerMachine,
  returnObjectReducerMachine,
  plainEffectsMachine,
  createEffectMachine,
  renamedCreateEffectMachine,
  localEffectsMachine,
  localEffectsObjectMachine,
  ifEffectMachine,
  switchEffectMachine,
  wildcardEffectMachine,
  computedWildcardCreateEffectMachine,
  domainWithMetaTransitionMachine,
  actorTemplate,
  actorWildcardEffectTemplate,
};

export const manager = MachineManager(managerMachines, {
  onError: console.error,
  middleware: [],
  schemaVersion: 1,
});

export const renamedManager = RenamedMachineManager(
  {
    actorTemplate,
    actorWildcardEffectTemplate,
    renamedImportMachine,
  },
  {
    onError: console.error,
    middleware: [],
    schemaVersion: 1,
  },
);

export const inlineManager = MachineManager(
  {
    inlineCreated: createMachine({
      config: {
        IDLE: {
          INLINE_START: "READY",
        },
        READY: {
          INLINE_RESET: "IDLE",
        },
      },
      initialState: "IDLE",
      initialContext: {},
    }),
    referenced: directObjectMachine,
  },
  {
    onError: console.error,
    middleware: [],
    schemaVersion: 1,
  },
);

export default createMachine({
  config: {
    IDLE: {
      DEFAULT_START: "READY",
    },
    READY: {
      DEFAULT_RESET: "IDLE",
    },
  },
  initialState: "IDLE",
  initialContext: {},
});

// Ниже намеренно оставлены формы, которые должны давать diagnostics, а не падение parser-а.

const importedLikeConfig = externalConfigFromAnotherFile;

export const unresolvedConfigMachine = createMachine({
  config: importedLikeConfig,
  initialState: "IDLE",
  initialContext: {},
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
`;
