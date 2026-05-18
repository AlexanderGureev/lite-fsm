# @lite-fsm/middleware

Optional middleware integrations for `lite-fsm`. The package includes Immer support, Redux DevTools support, and the public pattern for writing custom `MachineManager` middleware.

## Install

```bash
npm install @lite-fsm/middleware
```

Install `immer` too when using `immerMiddleware`:

```bash
npm install @lite-fsm/middleware immer
```

## Entry Points

```ts
import { devToolsMiddleware, immerMiddleware } from "@lite-fsm/middleware";

import { devToolsMiddleware } from "@lite-fsm/middleware/devTools";
import { immerMiddleware } from "@lite-fsm/middleware/immer";
```

## Immer Example

```ts
import { MachineManager, createMachine, type FSMEvent } from "@lite-fsm/core";
import { immerMiddleware } from "@lite-fsm/middleware/immer";

type TodoEvent = FSMEvent<"ADD_TODO", { id: string; text: string }> | FSMEvent<"TOGGLE_TODO", { id: string }>;

const todos = createMachine<TodoEvent>({
  config: {
    READY: {
      ADD_TODO: null,
      TOGGLE_TODO: null,
    },
  },
  initialState: "READY",
  initialContext: {
    items: [] as Array<{ id: string; text: string; completed: boolean }>,
  },
  reducer: (slice, event) => {
    switch (event.type) {
      case "ADD_TODO":
        slice.context.items.push({ ...event.payload, completed: false });
        return;
      case "TOGGLE_TODO": {
        const item = slice.context.items.find((todo) => todo.id === event.payload.id);
        if (item) item.completed = !item.completed;
        return;
      }
    }
  },
});

const manager = MachineManager({ todos }, { middleware: [immerMiddleware] });

manager.transition({ type: "ADD_TODO", payload: { id: "1", text: "Ship README" } });
manager.transition({ type: "TOGGLE_TODO", payload: { id: "1" } });
```

## Redux DevTools Example

```ts
import { MachineManager } from "@lite-fsm/core";
import { devToolsMiddleware } from "@lite-fsm/middleware/devTools";

const manager = MachineManager(
  { todos },
  {
    middleware: [
      devToolsMiddleware({
        blacklistActions: ["TIMER_TICK", "AUTO_SAVE"],
      }),
    ],
  },
);
```

## Documentation

- [Full documentation](https://alexandergureev.github.io/lite-fsm/)
- [Middleware package guide](https://alexandergureev.github.io/lite-fsm/packages/middleware)
- [Middleware API reference](https://alexandergureev.github.io/lite-fsm/api/middleware)
