// @ts-nocheck
import { FSMEvent, MachineManager, TypedCreateMachineFn, createMachine as _createMachine } from "lite-fsm";
import { immerMiddleware, devToolsMiddleware } from "lite-fsm/middleware";
import {
  FSMContextProvider,
  TypedUseSelectorHook,
  TypedUseTransitionHook,
  useSelector as _useSelector,
  useTransition as _useTransition,
} from "lite-fsm/react";

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
const manager = MachineManager<typeof config, PlaybackEvents>(config, {
  onError: console.error,
  middleware: [devToolsMiddleware, immerMiddleware],
});

manager.setDependencies<CustomDeps>({
  services: {
    playerService: {
      play: () => true,
      pause: () => true,
    },
  },
});

type AppState = ReturnType<typeof manager.getState>;
const useTransition: TypedUseTransitionHook<PlaybackEvents> = _useTransition;
const useSelector: TypedUseSelectorHook<AppState> = _useSelector;

const Playback = () => {
  const transition = useTransition();
  const { state, context } = useSelector((s) => s.playback);

  return (
    <div>
      {JSON.stringify({ context }, null, 2)}

      {state === "PAUSED" && (
        <button
          onClick={() => {
            transition({ type: "DO_PLAY" });
          }}
        >
          play
        </button>
      )}
      {state === "PLAYING" && (
        <button
          onClick={() => {
            transition({ type: "DO_PAUSE" });
          }}
        >
          pause
        </button>
      )}
    </div>
  );
};

manager.transition({ type: "DO_INIT" });

export function App() {
  return (
    <FSMContextProvider machineManager={manager}>
      <Playback />
    </FSMContextProvider>
  );
}
