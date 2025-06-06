# lite-fsm

[![Build Status](https://github.com/AlexanderGureev/lite-fsm/actions/workflows/deploy-docs.yml/badge.svg)](https://github.com/AlexanderGureev/lite-fsm/actions)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/lite-fsm)](https://bundlephobia.com/package/lite-fsm)
[![npm version](https://img.shields.io/npm/v/lite-fsm.svg)](https://www.npmjs.com/package/lite-fsm)
[![npm downloads](https://img.shields.io/npm/dm/lite-fsm.svg)](https://www.npmjs.com/package/lite-fsm)
[![Coverage Status](https://coveralls.io/repos/github/AlexanderGureev/lite-fsm/badge.svg)](https://coveralls.io/github/AlexanderGureev/lite-fsm)

lite-fsm is a lightweight finite state machine library

### Features

- Simple and clear API
- Provides application architecture out of the box (global store, effects, service layer)
- Support redux middleware
- [Small size](https://bundlephobia.com/package/lite-fsm) and no [dependencies](./package.json)

### Install

    npm install lite-fsm

## Documentation

The full documentation is available at [https://alexandergureev.github.io/lite-fsm/](https://alexandergureev.github.io/lite-fsm/)

## Examples

- React [Source](./examples/react.tsx) | [Sandbox](https://codesandbox.io/p/sandbox/holy-framework-rx2hwn)
- Basic typescript [Source](./examples/basic.ts)

### Quickstart (basic example)

```ts
import { createMachine, MachineManager } from "lite-fsm";

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
