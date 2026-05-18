# lite-fsm

[![Build Status](https://github.com/AlexanderGureev/lite-fsm/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/AlexanderGureev/lite-fsm/actions)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/@lite-fsm/core)](https://bundlephobia.com/package/@lite-fsm/core)
[![npm version](https://img.shields.io/npm/v/@lite-fsm/core.svg)](https://www.npmjs.com/package/@lite-fsm/core)
[![npm downloads](https://img.shields.io/npm/dm/@lite-fsm/core.svg)](https://www.npmjs.com/package/@lite-fsm/core)
[![Coverage Status](https://coveralls.io/repos/github/AlexanderGureev/lite-fsm/badge.svg)](https://coveralls.io/github/AlexanderGureev/lite-fsm)

`lite-fsm` is a lightweight, strongly typed TypeScript toolkit for finite state machines.

The core runtime stays framework-agnostic and dependency-free. React bindings, middleware, persistence, graph analysis, CLI project scaffolding, exports, and visual tooling are shipped as opt-in packages.

## Links

- [Documentation](https://alexandergureev.github.io/lite-fsm/)
- [Playground](https://alexandergureev.github.io/lite-fsm/playground/)
- [Visualizer](https://alexandergureev.github.io/lite-fsm/visualizer/)

## Packages

| Package                | Purpose                                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| `@lite-fsm/core`       | Framework-agnostic FSM runtime, `createMachine`, `MachineManager`, effects, actors, snapshots, and core types. |
| `@lite-fsm/react`      | React provider and hooks for subscribing to manager state.                                                     |
| `@lite-fsm/middleware` | Optional middleware integrations, including Immer and Redux DevTools.                                          |
| `@lite-fsm/persist`    | Persistence helpers, storage adapters, restore status, and React status hooks.                                 |
| `@lite-fsm/graph`      | Alpha graph compiler, analyzer, simulator, and view-model helpers.                                             |
| `@lite-fsm/cli`        | Alpha CLI for creating starter projects, adding machines, exporting graphs, and running the local visualizer.  |

## Features

- Small [`@lite-fsm/core`](https://bundlephobia.com/package/@lite-fsm/core) package with no runtime dependencies.
- Typed machine configs, events, context, reducers, effects, and dependencies.
- A manager store for coordinating multiple machines with subscriptions and guarded transitions.
- Actor templates, grouped actors, snapshots, hydration, and effect cancellation helpers.
- Optional React bindings, Immer reducers, Redux DevTools, and persistence.
- Static graph tooling for analysis, simulation, CLI export, and visualization.

## Install

```bash
npm install @lite-fsm/core
```

Add integrations only when you need them:

```bash
npm install @lite-fsm/react @lite-fsm/middleware @lite-fsm/persist
```

## Quickstart

```ts
import { MachineManager, createMachine, type FSMEvent } from "@lite-fsm/core";

type ToggleEvent = FSMEvent<"TOGGLE">;

const toggle = createMachine<ToggleEvent>({
  config: {
    OFF: { TOGGLE: "ON" },
    ON: { TOGGLE: "OFF" },
  },
  initialState: "OFF",
  initialContext: { count: 0 },
  reducer: (slice, event, { nextState }) => {
    return {
      state: nextState,
      context: {
        count: event.type === "TOGGLE" ? slice.context.count + 1 : slice.context.count,
      },
    };
  },
});

const manager = MachineManager({ toggle });

manager.transition({ type: "TOGGLE" });

manager.getState().toggle;
// { state: "ON", context: { count: 1 } }
```

For Immer-style reducers that mutate `slice` directly, add `@lite-fsm/middleware` and pass `immerMiddleware` to `MachineManager`.

## Examples

- [Live playground](https://alexandergureev.github.io/lite-fsm/playground/) with interactive demos.
- [Live visualizer](https://alexandergureev.github.io/lite-fsm/visualizer/) for graph exports and generated playground IR.
- [React source example](./examples/react.tsx)
- [Basic TypeScript source example](./examples/basic.ts)
