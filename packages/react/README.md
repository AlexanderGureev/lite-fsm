# @lite-fsm/react

React bindings for `lite-fsm`: a context provider, selector and transition hooks, hydration helpers, and a standalone `defineMachine` hook API.

The package is marked with `"use client"`. It can be imported from SSR/RSC code, but hooks and providers must run in the client React tree.

## Install

```bash
npm install @lite-fsm/core @lite-fsm/react
```

For mutable Immer-style reducers, add:

```bash
npm install @lite-fsm/middleware immer
```

## Quick Example

```tsx
import { MachineManager, createMachine, type FSMEvent } from "@lite-fsm/core";
import { FSMContextProvider, useSelector, useTransition } from "@lite-fsm/react";

type CounterEvent = FSMEvent<"INCREMENT"> | FSMEvent<"DECREMENT"> | FSMEvent<"RESET">;

const counter = createMachine<CounterEvent>({
  config: {
    IDLE: {
      INCREMENT: null,
      DECREMENT: null,
      RESET: null,
    },
  },
  initialState: "IDLE",
  initialContext: { count: 0 },
  reducer: (slice, event) => {
    switch (event.type) {
      case "INCREMENT":
        return { ...slice, context: { count: slice.context.count + 1 } };
      case "DECREMENT":
        return { ...slice, context: { count: slice.context.count - 1 } };
      case "RESET":
        return { ...slice, context: { count: 0 } };
    }
  },
});

const manager = MachineManager({ counter });

export function App() {
  return (
    <FSMContextProvider machineManager={manager}>
      <Counter />
    </FSMContextProvider>
  );
}

function Counter() {
  const count = useSelector((state) => state.counter.context.count);
  const transition = useTransition<CounterEvent>();

  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => transition({ type: "INCREMENT" })}>+</button>
      <button onClick={() => transition({ type: "DECREMENT" })}>-</button>
      <button onClick={() => transition({ type: "RESET" })}>Reset</button>
    </div>
  );
}
```

## Main Exports

- `FSMContextProvider` - provides a `MachineManager` to React hooks.
- `useSelector` - subscribes to a selected part of manager state.
- `useTransition` - returns `manager.transition`.
- `useManager` - returns the current manager from context.
- `FSMHydrationBoundary` and `useHydrateSnapshot` - React hydration helpers for snapshots.
- `defineMachine` - creates a standalone shared machine hook.

## Documentation

- [Full documentation](https://alexandergureev.github.io/lite-fsm/)
- [React package guide](https://alexandergureev.github.io/lite-fsm/packages/react)
- [React API reference](https://alexandergureev.github.io/lite-fsm/api/react)
