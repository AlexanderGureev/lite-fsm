# lite-fsm

lite-fsm is a lightweight finite state machine library


### Features

- Simple and clear API
- Provides application architecture out of the box (global store, effects, service layer)
- Support redux middleware
- [Small size](https://bundlephobia.com/package/lite-fsm) and no [dependencies](./package.json)

### Install

    npm install lite-fsm

## Examples

- React [Source](./examples/react.tsx) | [Sandbox]()
- Basic typescript [Source](./examples/basic.ts) | [Sandbox]()

### Quickstart (basic example)

```ts
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
  initialContext: {
    currentTime: null,
    duration: null,
    remainingTime: null,
  },
  effects: {
    PLAYING: ({ services }) => services.playerService.play(),
    PAUSED: ({ services }) => services.playerService.pause(),
  },
});

const manager = MachineManager({ playback });
manager.setDependencies({
  services: {
    playerService: {
      play: () => Promise.resolve(),
      pause: () => Promise.resolve(),
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

const { state, context } = manager.getState().playback;

```
