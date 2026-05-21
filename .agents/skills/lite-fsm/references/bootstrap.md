# Bootstrap

Читай этот файл, когда создаешь `src/store` с нуля, подключаешь React provider, typed wrappers/hooks или wiring зависимостей.

## Зависимости

Базовые зависимости приложения:

- `@lite-fsm/core`;
- `@lite-fsm/middleware`;
- `immer`;
- `@lite-fsm/react` для React;
- `@lite-fsm/persist` только когда нужен restore/save snapshot.

Добавляй зависимости package manager-ом проекта (`pnpm`, `npm`, `yarn`, `bun`). Не меняй package manager.

## Структура

```text
src/store/
├── create-machine.ts
├── deps.ts
├── hooks.ts
├── index.ts
├── types.ts
├── machines/
│   ├── app.ts
│   └── complex-owner/
│       └── index.ts
└── selectors/
    └── index.ts
```

Имена файлов и папок для machines и selectors — `kebab-case`. Имена экспортов — `camelCase`. Для простого machine используй один файл; для сложного owner — папку с `index.ts` как entry point и локальными файлами рядом.

## `src/store/create-machine.ts`

```ts
import type {
  TypedCreateConfigFn,
  TypedCreateEffectFn,
  TypedCreateMachineFn,
  TypedCreateReducerFn,
} from "@lite-fsm/core";
import {
  createConfig as createLiteFsmConfig,
  createEffect as createLiteFsmEffect,
  createMachine as createLiteFsmMachine,
  createReducer as createLiteFsmReducer,
} from "@lite-fsm/core";

import type { AppDeps } from "./deps";
import type { AppEvents } from "./types";

export const createMachine: TypedCreateMachineFn<AppEvents, AppDeps> = createLiteFsmMachine;
export const createConfig: TypedCreateConfigFn<AppEvents> = createLiteFsmConfig;
export const createReducer: TypedCreateReducerFn<AppEvents> = createLiteFsmReducer;
export const createEffect: TypedCreateEffectFn<AppEvents, AppDeps> = createLiteFsmEffect;
```

## `src/store/types.ts`

Каждый machine file экспортирует `Events`. Собирай app union через namespace imports.

```ts
import type * as app from "./machines/app";
import type * as profile from "./machines/profile";

export type AppEvents = app.Events | profile.Events;
```

## `src/store/deps.ts`

```ts
import type { AppState } from ".";

export type AppDeps = {
  getState: () => AppState;
  api: {
    loadProfile(id: string): Promise<{ id: string; name: string }>;
  };
  browser: {
    visibilityState(): "visible" | "hidden";
    onVisibilityChange(listener: () => void): void;
  };
};
```

Группируй deps по адаптерам: `api`, `browser`, `analytics`, `clock`, `random`, `storage`.

## `src/store/index.ts`

```ts
import { MachineManager, type MachinesState } from "@lite-fsm/core";
import { immerMiddleware } from "@lite-fsm/middleware/immer";

import { app } from "./machines/app";
import type { AppDeps } from "./deps";
import type { AppEvents } from "./types";

export const machines = {
  app,
};

export type AppMachines = typeof machines;
export type AppState = MachinesState<AppMachines>;
export type RuntimeDeps = Omit<AppDeps, "getState">;

export const makeStore = (deps: RuntimeDeps) => {
  const manager = MachineManager<AppMachines, AppEvents>(machines, {
    middleware: [immerMiddleware],
    onError: console.error,
  });

  manager.setDependencies({
    ...deps,
    getState: manager.getState,
  });

  return manager;
};

export type AppStore = ReturnType<typeof makeStore>;
export * from "./hooks";
export * from "./selectors";
export type { AppDeps } from "./deps";
export type { AppEvents } from "./types";
```

Если `AppDeps` содержит только `getState`, допустим `makeStore()` без параметров.

Когда нужен persist, `makeStore` расширяется: создает `persistManager` рядом с manager и возвращает `{ manager, persist }`. Образец — в `persistence.md` "Lifecycle и React integration".

## `src/store/hooks.ts`

```ts
import type { TypedUseManagerHook, TypedUseSelectorHook, TypedUseTransitionHook } from "@lite-fsm/react";
import {
  useManager as useLiteFsmManager,
  useSelector as useLiteFsmSelector,
  useTransition as useLiteFsmTransition,
} from "@lite-fsm/react";

import type { AppMachines } from ".";
import type { AppEvents } from "./types";

export const useAppManager: TypedUseManagerHook<AppMachines, AppEvents> = useLiteFsmManager;
export const useAppSelector: TypedUseSelectorHook<AppMachines> = useLiteFsmSelector;
export const useAppTransition: TypedUseTransitionHook<AppEvents> = useLiteFsmTransition;
```

Components импортируют app hooks из `@/store`, а не generic hooks напрямую.

## Vite/SPA provider

Создай manager возле root render и оберни app в `FSMContextProvider`.

```tsx
import { FSMContextProvider } from "@lite-fsm/react";
import { makeStore } from "@/store";

const manager = makeStore(deps);

root.render(
  <FSMContextProvider machineManager={manager}>
    <App />
  </FSMContextProvider>,
);
```

## Next App Router provider

Provider должен быть client component. Используй `useRef`, чтобы manager не создавался заново на каждый render.

```tsx
"use client";

import type { PropsWithChildren } from "react";
import { useRef } from "react";
import { FSMContextProvider } from "@lite-fsm/react";
import { makeStore, type AppStore } from "@/store";

export function Providers({ children }: PropsWithChildren) {
  const storeRef = useRef<AppStore | null>(null);
  const manager = storeRef.current ?? makeStore(deps);
  storeRef.current = manager;

  return <FSMContextProvider machineManager={manager}>{children}</FSMContextProvider>;
}
```

Machines не импортируют React. React wiring живет на boundary приложения.
