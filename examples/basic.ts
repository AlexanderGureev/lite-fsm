// @ts-nocheck
import { FSMEvent, MachineManager, TypedCreateMachineFn, createMachine as _createMachine } from "lite-fsm";

interface IPlayerService {
  play(): void;
  pause(): void;
}

type CustomDeps = {
  services: {
    playerService: IPlayerService;
  };
};

const createMachine: TypedCreateMachineFn<PlaybackEvents, CustomDeps> = _createMachine;

type PlaybackEvents =
  | FSMEvent<"DO_INIT">
  | FSMEvent<"DO_PLAY">
  | FSMEvent<"DO_PAUSE">
  | FSMEvent<
      "TIME_UPDATE",
      {
        currentTime: number;
        duration: number;
        remainingTime: number;
      }
    >;

type Context = {
  currentTime: null | number;
  duration: null | number;
  remainingTime: null | number;
};

const initialContext: Context = {
  currentTime: null,
  duration: null,
  remainingTime: null,
};

const playback = createMachine({
  config: {
    IDLE: {
      DO_INIT: "PAUSED",
    },
    PAUSED: {
      DO_PLAY: "PLAYING",
    },
    PLAYING: {
      DO_PAUSE: "PAUSED",
      TIME_UPDATE: null,
    },
    END: {},
  },
  initialState: "IDLE",
  initialContext,
  reducer: ({ state, context }, { type, payload }, config) => {
    return {
      state: config[state]?.[type] || state,
      context: { ...context, ...payload },
    };
  },
  effects: {
    PLAYING: async ({ services }) => {
      services.playerService.play();
    },
    PAUSED: async ({ services }) => {
      services.playerService.pause();
    },
  },
});

const config = { playback };
const manager = MachineManager<typeof config, PlaybackEvents>(config);
manager.setDependencies<CustomDeps>({
  services: {
    playerService: {
      play: () => true,
      pause: () => true,
    },
  },
});

manager.onTransition((prevState, nextState) => {
  console.log("[onTransition]", { prevState, nextState });
});

manager.transition({ type: "DO_INIT" });
manager.transition({ type: "DO_PLAY" });
manager.transition({
  type: "TIME_UPDATE",
  payload: { currentTime: 0, duration: 60, remainingTime: 60 },
});

console.log(manager.getState().playback);
