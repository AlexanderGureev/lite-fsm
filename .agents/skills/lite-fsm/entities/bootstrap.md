# Bootstrap

Конкретный wiring приложения на entities: typed-фабрики, сборка store с плагином, deps, точка входа scene и read-слой. Принципы — в `architecture.md`.

## Зависимости

- `@lite-fsm/core`, `@lite-fsm/entities`;
- `@lite-fsm/middleware` + `immer` (baseline);
- `@lite-fsm/react` и `@lite-fsm/entities/react` для React.

Добавляй зависимости package manager-ом проекта.

## `store/create-machine.ts`

Typed-обёртки знают про `storage: "entity"` через `EntitiesPlugin`.

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
import type { EntitiesPlugin } from "@lite-fsm/entities";

import type { AppDeps } from "./deps";
import type { AppEvents } from "./types";

export const createMachine: TypedCreateMachineFn<AppEvents, AppDeps, EntitiesPlugin<AppDeps>> = createLiteFsmMachine;
export const createConfig: TypedCreateConfigFn<AppEvents> = createLiteFsmConfig;
export const createReducer: TypedCreateReducerFn<AppEvents> = createLiteFsmReducer;
export const createEffect: TypedCreateEffectFn<AppEvents, AppDeps> = createLiteFsmEffect;
```

## `store/types.ts`

События — доменные намерения, lifecycle и tick. Spawn-события объявляются отдельно (`spawn-events.ts`) и переиспользуются в union.

```ts
import type { FSMEvent } from "@lite-fsm/core";

export type AppEvents =
  | FSMEvent<"GAME_START", GameConfig>
  | FSMEvent<"GAME_RESTART">
  | FSMEvent<"TICK", { now: number; deltaMs: number }>
  | FSMEvent<"SPAWN_TICK", { now: number; deltaMs: number }>
  | FSMEvent<"ISSUE_MOVE", Point>
  | FSMEvent<"COMMAND_ASSIGNED", CommandBatchPayload>
  | FSMEvent<"UNIT_DEAD">
  | FSMEvent<"HERO_DEAD">;
```

## `store/deps.ts`

`entities` и `getState` обязательны для reducer-типизации, effects и reactions. Внешний мир — через тонкие adapters.

```ts
import type { EntityAccess } from "@lite-fsm/entities";
import type { AppMachines, AppState } from ".";

export type AppDeps = {
  getState: () => AppState;
  entities: () => EntityAccess<AppMachines>;
  metrics: MetricsAdapter;
  random: () => number;
};

// Передаётся в makeStore извне; getState/entities подставляет сам manager.
export type RuntimeDeps = Omit<AppDeps, "getState" | "entities">;
```

## `store/spawn-events.ts`

```ts
import { defineSpawnEvents, spawnEvent } from "@lite-fsm/entities";

export const spawnEvents = defineSpawnEvents({
  GAME_START: spawnEvent<GameConfig>(),
  SPAWN_ENEMY_BATCH: spawnEvent<SpawnBatchPayload>(),
});
```

## `store/index.ts`

Реестр `machines` задаёт simulation contract (`simulation.md`): обычные machines, затем entity-системы в порядке расписания.

```ts
import { MachineManager, type MachinesState } from "@lite-fsm/core";
import { defineEntitySpawn, entitiesPlugin } from "@lite-fsm/entities";
import { immerMiddleware } from "@lite-fsm/middleware/immer";

import type { RuntimeDeps } from "./deps";
import { spawnEvents } from "./spawn-events";
import { gameSession } from "./machines/game-session";
import { identity } from "./machines/identity";
import { spatialIndex } from "./machines/spatial-index";
import { combat } from "./machines/combat";
import { projectiles } from "./machines/projectiles";
import { health } from "./machines/health";
import { command } from "./machines/command";
import { enemyAi } from "./machines/enemy-ai";
import { movement } from "./machines/movement";
import { selection } from "./machines/selection";
import { planUnits, toEntitySpec } from "./spawn/placement";
import type { AppEvents } from "./types";

// Entity-системы в порядке расписания симуляции. Порядок ключей — это контракт
// фаз (см. simulation.md), поэтому он вынесен в отдельный объект и покрыт тестом.
export const entitySystems = { spatialIndex, combat, projectiles, health, command, enemyAi, movement };

export const machines = {
  // gameSession — обычная machine; identity и selection — entity-акторы без
  // per-TICK фазы, поэтому они вне entitySystems и их порядок не важен.
  gameSession,
  identity,
  selection,
  ...entitySystems,
};

export type AppMachines = typeof machines;
export type AppState = MachinesState<AppMachines>;

export const spawn = defineEntitySpawn(machines, spawnEvents)({
  GAME_START: (config) => [
    ...planUnits(config).map(toEntitySpec),
    { id: "system/spatial-index", groupTag: "system", actors: { spatialIndex: {} } },
    { id: "system/projectiles", groupTag: "system", actors: { projectiles: {} } },
  ],
});

export const makeStore = (deps: RuntimeDeps) => {
  const plugins = [entitiesPlugin({ spawn })];
  const manager = MachineManager<AppMachines, AppEvents, typeof plugins>(machines, {
    plugins,
    middleware: [immerMiddleware],
    onError: console.error,
  });

  manager.setDependencies({
    ...deps,
    entities: manager.entities,
    getState: manager.getState,
  });

  return manager;
};

export type AppStore = ReturnType<typeof makeStore>;
export { useSelector, useTransition } from "./hooks";
```

`manager.entities` обязательно передаётся в deps: это включает scoped-доступ `entities()` в effects и reactions.

## `store/selectors.ts` — read-слой для scene и UI

Колонки индексируются по `EntityIndex`. Read-view скрывает capacity, поэтому число слотов берётся из длины колонки. Собирай узкие views, чтобы scene не лазила в backing store.

```ts
import type { EntityIndex } from "@lite-fsm/entities";
import type { AppStore } from ".";

export const readUnitViews = (manager: AppStore) => {
  const e = manager.entities();
  const movement = e.get("movement");
  return {
    capacity: movement.x.length,
    movement,
    identity: e.get("identity"),
    health: e.get("health"),
    selection: e.get("selection"),
  };
};

export const readProjectileView = (manager: AppStore) => manager.entities().get("projectiles").pool;
```

## Точка входа scene

Scene — точка входа рендера и драйвер симуляции. Она накапливает время кадра, гонит фиксированный шаг `TICK`, читает committed state через selectors и шлёт доменные события на ввод. Рендер-подсистемы — отдельные модули, которые scene собирает.

```ts
export const createScene = (Engine, store: AppStore, metrics: MetricsAdapter) =>
  class GameScene extends Engine.Scene {
    private unitRenderer?: UnitRenderer;
    private accumulatorMs = 0;

    create() {
      this.unitRenderer = new UnitRenderer(this, store); // подсистема-модуль
      this.bindInput();
    }

    update(_time: number, deltaMs: number) {
      this.accumulatorMs += Math.min(MAX_FRAME_DELTA_MS, deltaMs);

      let steps = 0;
      while (this.accumulatorMs >= FIXED_STEP_MS && steps < MAX_STEPS_PER_FRAME) {
        this.accumulatorMs -= FIXED_STEP_MS;
        store.transition({ type: "TICK", payload: { now: performance.now(), deltaMs: FIXED_STEP_MS } });
        steps += 1;
      }

      // чтение committed state + оптимизации рендера живут в scene/подсистемах
      this.unitRenderer?.sync();
      this.unitRenderer?.project(this.accumulatorMs); // интерполяция между тиками
    }

    private bindInput() {
      this.input.on("pointerup", (p) => {
        store.transition({ type: "ISSUE_MOVE", payload: this.worldPoint(p) });
      });
    }
  };
```

Фиксированный шаг с аккумулятором делает симуляцию детерминированной и независимой от FPS, а экстраполяция по остатку аккумулятора даёт плавный рендер между тиками.

## Composition root

Единственное место сборки приложения. UI вызывает его один раз.

```ts
// app.ts
export function createGameApp({ autoStart = false }: CreateGameAppOptions = {}): GameApp {
  const metrics = createMetricsAdapter(() => performance.now());
  const store = makeStore({ metrics, random: Math.random });

  if (autoStart) store.transition({ type: "GAME_START", payload: defaultConfig });

  const mountScene = (container: HTMLElement) => {
    let disposed = false;
    let game: GameLike | undefined;
    void (async () => {
      const Engine = await import("phaser");
      if (disposed) return;
      game = new Engine.Game({ parent: container, scene: createScene(Engine, store, metrics) });
    })();
    return () => {
      disposed = true;
      game?.destroy(true);
    };
  };

  return { store, metrics, mountScene };
}
```

## React provider и хуки

```ts
// store/hooks.ts
import type { TypedUseSelectorHook, TypedUseTransitionHook } from "@lite-fsm/react";
import { useSelector as base, useTransition as baseTransition } from "@lite-fsm/react";
import type { AppMachines } from ".";
import type { AppEvents } from "./types";

export const useSelector: TypedUseSelectorHook<AppMachines> = base;
export const useTransition: TypedUseTransitionHook<AppEvents> = baseTransition;
```

```tsx
"use client";
import { useRef } from "react";
import { FSMContextProvider } from "@lite-fsm/react";
import { createGameApp, type GameApp } from "../app";

export function Game() {
  const appRef = useRef<GameApp | null>(null);
  if (!appRef.current) appRef.current = createGameApp();
  const app = appRef.current;

  return (
    <FSMContextProvider machineManager={app.store}>
      <GameShell app={app} />
    </FSMContextProvider>
  );
}
```

UI монтирует scene в контейнер через `app.mountScene(container)` в `useEffect` и читает session/HUD через `useSelector`. Для построчного чтения в React-списках используй `useEntitySnapshot`, `useEntityCount`, `useEntityList` из `@lite-fsm/entities/react`; для тысяч строк, обновляемых каждый кадр, рендерь их в scene, а не в React.
