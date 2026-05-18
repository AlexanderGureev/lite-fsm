# @lite-fsm/core

Framework-agnostic runtime for `lite-fsm`: typed machine configs, `MachineManager`, effects, actor templates, snapshots, hydration, middleware contracts, and core TypeScript types.

Use this package when you want the FSM runtime without React or any UI dependency.

## Install

```bash
npm install @lite-fsm/core
```

For Immer-style reducers that mutate draft state, also install middleware:

```bash
npm install @lite-fsm/middleware immer
```

## Quick Example

```ts
import { MachineManager, createMachine, type FSMEvent } from "@lite-fsm/core";

type ToggleEvent = FSMEvent<"TOGGLE"> | FSMEvent<"RESET">;

const toggle = createMachine<ToggleEvent>({
  config: {
    OFF: { TOGGLE: "ON", RESET: "OFF" },
    ON: { TOGGLE: "OFF", RESET: "OFF" },
  },
  initialState: "OFF",
  initialContext: { count: 0 },
  reducer: (slice, event, { nextState }) => ({
    state: nextState,
    context: {
      count: event.type === "RESET" ? 0 : slice.context.count + 1,
    },
  }),
});

const manager = MachineManager({ toggle });

manager.transition({ type: "TOGGLE" });

console.log(manager.getState().toggle);
// { state: "ON", context: { count: 1 } }
```

## Main Exports

- `createMachine` - typed machine config factory.
- `MachineManager` - runtime store for coordinating multiple machines.
- `createEffect` - effect wrapper with `every` or `latest` semantics.
- `createConfig` and `createReducer` - helpers for reusable typed config and reducer definitions.
- `Machine` and `defineMachine` - standalone machine APIs.
- Snapshot and hydration types for `dehydrate()` / `hydrate()` workflows.
- Middleware, actor, event, state, and manager types.

## Documentation

- [Full documentation](https://alexandergureev.github.io/lite-fsm/)
- [Core package guide](https://alexandergureev.github.io/lite-fsm/packages/core)
- [Core API reference](https://alexandergureev.github.io/lite-fsm/api/core)
