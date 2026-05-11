export const SAMPLE_SOURCE = `import { createMachine } from "@lite-fsm/core";

export const playerMachine = createMachine({
  initialState: "idle",
  initialContext: { trackId: "intro" },
  config: {
    idle: {
      PLAY: "playing",
    },
    playing: {
      PAUSE: "paused",
      STOP: "idle",
    },
    paused: {
      PLAY: "playing",
      STOP: "idle",
    },
  },
});
`;

export const MUSIC_APP_SAMPLE_SOURCE = `import { createMachine, MachineManager } from "@lite-fsm/core";

const activeTrackId = "track-1";
const queueHasNextTrack = true;

// 1. Simple domain machine: minimal config, no guarded branches, no effects.
export const appShell = createMachine({
  config: {
    BOOTING: { APP_READY: "READY" },
    READY: { APP_RESET: "BOOTING", THEME_TOGGLE: null },
  },
  initialState: "BOOTING",
  initialContext: { theme: "dark" },
  reducer: (state, action, { nextState }) => {
    state.state = nextState;

    if (action.type === "THEME_TOGGLE") {
      state.context.theme = state.context.theme === "dark" ? "light" : "dark";
    }
  },
});

// 2. Domain machine with reducer guards on AUTH_RESPONSE.
export const auth = createMachine({
  config: {
    LOGGED_OUT: { LOGIN_REQUEST: "AUTHENTICATING" },
    AUTHENTICATING: {
      AUTH_RESPONSE: "LOGGED_IN",
      CANCEL_LOGIN: "LOGGED_OUT",
    },
    LOGGED_IN: { LOGOUT: "LOGGED_OUT" },
  },
  initialState: "LOGGED_OUT",
  initialContext: { userId: null, error: null },
  reducer: (state, action, { nextState }) => {
    if (action.type === "AUTH_RESPONSE" && action.payload.success) {
      state.state = "LOGGED_IN";
      return;
    }

    if (action.type === "AUTH_RESPONSE" && action.payload.reason === "invalid_credentials") {
      state.state = "LOGGED_OUT";
      return;
    }

    if (action.type === "AUTH_RESPONSE" && action.payload.reason === "network_error") {
      state.state = "LOGGED_OUT";
      return;
    }

    state.state = nextState;
  },
});

// 3. Domain machine with effect emissions, effect branches and actor routing.
export const player = createMachine({
  config: {
    IDLE: { PLAY: "PLAYING" },
    PLAYING: {
      TRACK_END: "CHECKING_NEXT",
      PAUSE: "PAUSED",
      STOP: "STOPPED",
      LOGOUT: "STOPPED",
    },
    PAUSED: {
      RESUME: "PLAYING",
      STOP: "STOPPED",
      LOGOUT: "STOPPED",
    },
    CHECKING_NEXT: {
      NEXT_TRACK: "PLAYING",
      QUEUE_EMPTY: "STOPPED",
      STOP: "STOPPED",
    },
    STOPPED: { PLAY: "PLAYING" },
  },
  initialState: "IDLE",
  initialContext: { queue: [], currentTrackId: null },
  reducer: (state, _action, { nextState }) => {
    state.state = nextState;
  },
  effects: {
    PLAYING: ({ transition }) => {
      transition({
        type: "TRACK_LOAD",
        payload: { trackId: activeTrackId },
        meta: { actorId: activeTrackId },
      });
    },
    CHECKING_NEXT: ({ transition }) => {
      if (queueHasNextTrack) {
        transition({ type: "NEXT_TRACK" });
      } else {
        transition({ type: "QUEUE_EMPTY" });
      }
    },
  },
});

// 4. Actor template with spawn, per-actor events and terminal lifecycle states.
export const trackInstance = createMachine({
  groupTag: "track",
  config: {
    __INIT: { TRACK_LOAD: "BUFFERING" },
    BUFFERING: {
      BUFFER_DONE: "PLAYING",
      BUFFER_ERROR: "__RESOLVED",
      DISCARD: "__RESOLVED",
    },
    PLAYING: {
      TRACK_END: "__RESOLVED",
      PAUSE: "PAUSED",
      DISCARD: "__RESOLVED",
    },
    PAUSED: {
      RESUME: "PLAYING",
      DISCARD: "__RESOLVED",
    },
  },
  initialState: "__INIT",
  initialContext: { trackId: "", url: "", buffered: 0, position: 0 },
  reducer: (state, action, { nextState }) => {
    state.state = nextState;

    if (action.type === "TRACK_LOAD") {
      state.context.trackId = action.payload.trackId;
    }
  },
  effects: {
    BUFFERING: ({ transition, self }) => {
      transition({ type: "BUFFER_DONE", meta: { actorId: self.actorId } });
    },
    PLAYING: ({ transition, self }) => {
      transition({ type: "TRACK_END", meta: { actorId: self.actorId } });
    },
  },
});

export const manager = MachineManager(
  {
    appShell,
    auth,
    player,
    trackInstance,
  },
  {},
);
`;
