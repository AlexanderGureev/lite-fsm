# Persistence

Persistence opt-in. Добавляй `@lite-fsm/persist`, когда состояние должно пережить reload/session break или быть восстановлено между сессиями.

Persist основан на `manager.dehydrate()` (собирает снимок выбранных machines) и `manager.hydrate(snapshot)` (применяет снимок без запуска effects). `persistManager` оборачивает их в save/restore loop поверх storage adapter.

## Persist manager

```ts
const persist = persistManager(manager, {
  storage,
  machines: ["chatThread"],
  throttleMs: 250,
  shouldSave: ({ action }) => action.type === "MESSAGE_SENT" || action.type === "HISTORY_CLEARED",
});
```

Rules:

- Сохраняй explicit list `machines`.
- Фильтруй технические события через `shouldSave`.
- Не сохраняй transient UI, timers, subscriptions и in-flight requests без restore plan.
- Runtime actors не сохраняются без `persistence: "snapshot"`.

## Lifecycle и React integration

Создание persist controller'а живет рядом с manager в `makeStore`. Так весь wiring остается в одной точке входа, а `Providers` не знает про список `machines`, storage key или migrations.

```ts
// src/store/index.ts
import { MachineManager, type MachinesState } from "@lite-fsm/core";
import { immerMiddleware } from "@lite-fsm/middleware/immer";
import { createJsonStorage, persistManager } from "@lite-fsm/persist";

import { chatThread } from "./machines/chat-thread";
import type { AppDeps } from "./deps";
import type { AppEvents } from "./types";

export const machines = { chatThread };
export type AppMachines = typeof machines;
export type AppState = MachinesState<AppMachines>;

export const makeStore = (deps: Omit<AppDeps, "getState">) => {
  const manager = MachineManager<AppMachines, AppEvents>(machines, {
    middleware: [immerMiddleware],
    onError: console.error,
  });

  manager.setDependencies({ ...deps, getState: manager.getState });

  const storage = createJsonStorage<AppMachines>({
    key: "app:state:v1",
    storage: () => window.localStorage,
  });
  const persist = [persistManager(manager, { storage, machines: ["chatThread"] })];

  return { manager, persist };
};

export type AppStore = ReturnType<typeof makeStore>;
```

`persist` — массив: при необходимости можно завести несколько controllers с разными storages для разных доменов (например, локальные настройки и shared session).

`Providers` остается тонким и не знает деталей persist setup. `FSMContextProvider` сам вызывает `start()` для каждого entry; вручную `start()` **не вызывай**, иначе дважды запустишь restore/subscriptions.

```tsx
"use client";

import type { PropsWithChildren } from "react";
import { useRef } from "react";
import { FSMContextProvider } from "@lite-fsm/react";

import { makeStore, type AppStore } from "@/store";

export function Providers({ children }: PropsWithChildren) {
  const storeRef = useRef<AppStore | null>(null);
  if (!storeRef.current) storeRef.current = makeStore(deps);

  return (
    <FSMContextProvider machineManager={storeRef.current.manager} persist={storeRef.current.persist}>
      {children}
    </FSMContextProvider>
  );
}
```

Статус restore читай через hooks из `@lite-fsm/persist/react`. Это нужно, когда UI должен скрыть данные до завершения первого restore:

```tsx
import { useIsPersistRestoring, usePersistStatuses } from "@lite-fsm/persist/react";

function AppShell() {
  const restoring = useIsPersistRestoring();
  if (restoring) return <Splash />;
  return <Routes />;
}
```

`usePersistStatuses()` возвращает массив в том же порядке, что `persist` prop; `useIsPersistRestoring()` — `true`, пока хотя бы один controller в фазе `"restoring"`.

Ручные методы controller'а нужны в редких сценариях:

- `controller.flush()` — немедленно записать pending throttled save (например, перед `window.unload`).
- `controller.clear()` — удалить запись из storage и сбросить status (logout).

`start()`, `restore()`, `save()`, `getStatus()`, `subscribeStatus()` — внутренние; вызывает provider или hooks.

## Storage adapter

`createJsonStorage` принимает lazy storage factory. Это удобно для browser-only storage в Next/client code.

```ts
const storage = createJsonStorage<AppMachines>({
  key: "app:state:v1",
  storage: () => window.localStorage,
});
```

Если нужны external/tab notifications, добавь `subscribe` через custom `PersistStorage`.

## Migrations и TTL

Когда меняется shape сохраняемых machines, поднимай `storageVersion` и описывай `migrate`, иначе старая запись будет удалена при restore.

```ts
const persist = persistManager(manager, {
  storage,
  machines: ["profile"],
  storageVersion: 2,
  maxAge: 1000 * 60 * 60 * 24 * 30,
  migrate: (record) => {
    if (record.version === 1) {
      return { ...record, version: 2, snapshot: migrateV1ToV2(record.snapshot) };
    }
    return record;
  },
  onRestoreSettled: (result) => {
    if (result.phase === "error") logger.error("[persist]", result.error);
  },
  onError: (err, phase) => logger.error("[persist]", phase, err),
});
```

- `storageVersion` — версия persist record. Mismatch без `migrate` удаляет запись; `undefined` vs число тоже считается mismatch.
- `maxAge` — TTL в миллисекундах; expired записи удаляются при restore.
- `migrate` — конвертация старого record в текущий `MachineManagerSnapshot`. Возвращай новый объект, не мутируй вход.
- `onRestoreSettled` срабатывает после restore (`{ phase: "ready" }` или `{ phase: "error" }`); `clear()` его не вызывает.
- `onError(err, phase)` — `phase` — `"restore" | "save" | "clear"`.

## Custom snapshot hooks

Default snapshot domain machine — `{ state, context }`.

Custom `dehydrate` нужен, когда transport shape должен отличаться от runtime context (например, сохранить только часть context). Custom `hydrate` должен быть идемпотентным, не выполнять side effects и возвращать `prev`, если snapshot не нужно применять.

```ts
import type { FSMEvent } from "@lite-fsm/core";
import { createMachine } from "../create-machine";

type User = { id: string; email: string };

export type Events = FSMEvent<"SET_USER", { user: User }>;

export const profile = createMachine({
  config: { READY: { SET_USER: null } },
  initialState: "READY",
  initialContext: { user: null as User | null, lastSeenAt: 0 },
  reducer: (state, action) => {
    if (action.type === "SET_USER") state.context.user = action.payload.user;
  },
  dehydrate: (slice) => slice.context.user,
  hydrate: (prev, user: User | null) => {
    if (prev.context.user?.id === user?.id) return prev;
    return { state: prev.state, context: { ...prev.context, user } };
  },
});
```

Идемпотентность важна: `hydrate` может вызваться повторно (StrictMode, restore + SSR overlay), и каждый вызов должен дать одинаковый результат для одного snapshot.

Не используй snapshot hooks как место бизнес-логики. Это transport boundary.
