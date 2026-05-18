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
    storage: window.localStorage,
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
import type { PersistController } from "@lite-fsm/persist";

function PersistStatusView({ controller }: { controller: PersistController }) {
  const status = usePersistStatus(controller);
  return <span>{status.phase}</span>;
}
```

## Documentation

- [Full documentation](https://alexandergureev.github.io/lite-fsm/)
- [Persist package guide](https://alexandergureev.github.io/lite-fsm/packages/persist)
- [Persist API reference](https://alexandergureev.github.io/lite-fsm/api/persist)
