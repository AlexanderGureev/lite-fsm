# @lite-fsm/persist

Persistence helpers for `MachineManager`. The package saves manager snapshots to a storage adapter, restores them with `manager.hydrate()`, tracks restore status, and can integrate with React through a small status hook entry point.

Use it for browser session persistence, tab synchronization, custom storage backends, or explicit snapshot save/restore flows.

## Install

```bash
npm install @lite-fsm/persist
```

For React status hooks:

```bash
npm install @lite-fsm/react @lite-fsm/persist
```

## Entry Points

```ts
import { createJsonStorage, persistManager } from "@lite-fsm/persist";
import type { PersistController, PersistStorage, PersistStatus } from "@lite-fsm/persist";

import { useIsPersistRestoring, usePersistStatus } from "@lite-fsm/persist/react";
```

## Quick Example

```ts
import { MachineManager, createMachine, type FSMEvent } from "@lite-fsm/core";
import { createJsonStorage, persistManager } from "@lite-fsm/persist";

type CounterEvent = FSMEvent<"INCREMENT"> | FSMEvent<"RESET">;

const counter = createMachine<CounterEvent>({
  config: {
    READY: {
      INCREMENT: null,
      RESET: null,
    },
  },
  initialState: "READY",
  initialContext: { count: 0 },
  reducer: (slice, event) => ({
    state: slice.state,
    context: {
      count: event.type === "RESET" ? 0 : slice.context.count + 1,
    },
  }),
});

const machines = { counter };
const manager = MachineManager<typeof machines>(machines, { schemaVersion: 1 });

const persist = persistManager(manager, {
  storage: createJsonStorage<typeof machines>({
    key: "app:state:v1",
    storage: () => window.localStorage,
  }),
  storageVersion: 1,
  machines: ["counter"],
  throttleMs: 500,
  onError: console.error,
});

const stop = persist.start();

manager.transition({ type: "INCREMENT" });
await persist.flush();

stop();
```

`createJsonStorage` expects a lazy `storage` factory. The factory is not called when the adapter is created; it is called again for every `get`, `set`, and `remove`. `persistManager` does not check whether it runs in a browser or on a server, so Next.js stores can reference `window.localStorage` inside the factory without a manual `typeof window` guard. Add `subscribe` manually by extending the returned `PersistStorage` when you need tab or external storage notifications.

## React Integration

`FSMContextProvider` can start and stop a persist controller for you:

```tsx
import { FSMContextProvider } from "@lite-fsm/react";

export function App() {
  return (
    <FSMContextProvider machineManager={manager} persist={persist}>
      <Page />
    </FSMContextProvider>
  );
}
```

Read restore status from React with `@lite-fsm/persist/react`:

```tsx
import { usePersistStatus } from "@lite-fsm/persist/react";

function PersistStatusView() {
  const status = usePersistStatus();
  return <span>{status.phase}</span>;
}
```

You can still pass a controller explicitly when the component is outside
`FSMContextProvider` or when several persist controllers are active.
`useIsPersistRestoring()` is exactly `usePersistStatus().phase === "restoring"`;
blocking UI until the first restore settles should also treat the `"idle"`
phase as loading.

## Documentation

- [Full documentation](https://alexandergureev.github.io/lite-fsm/)
- [Persist package guide](https://alexandergureev.github.io/lite-fsm/packages/persist)
- [Persist API reference](https://alexandergureev.github.io/lite-fsm/api/persist)
