# @lite-fsm/entities и entity actor runtime — ТЗ

## 1. Цель

Реализовать пакет `@lite-fsm/entities` для массовых игровых сущностей через entity actor runtime, internal columnar storage, typed spawn composition и scoped entity lifecycle. Основная модель разработки остается `createMachine`, `config`, `reducer`, `effects` и `MachineManager.transition`; entity runtime добавляет batch storage и composition поверх этой модели, не превращая core в ECS.

## 2. Предусловия и зависимости

- Plugin system из [`tz-plugin-system.md`](./tz-plugin-system.md) должна быть реализована первой.
- `@lite-fsm/entities` подключается как plugin к `MachineManager`.
- `@lite-fsm/entities` регистрирует `storage: "entity"` через plugin system.
- `@lite-fsm/core` не содержит реализацию entity runtime и не импортирует `@lite-fsm/entities`.
- Public API использует термин `entity`, а не `columnar`.

## 3. Термины

### Entity

Игровая сущность с публичным `entityId` и внутренним `entityIndex`.

```ts
type EntityRef = string & { readonly __brand: "EntityRef" };
type EntityIndex = number & { readonly __brand: "EntityIndex" };
```

`entityId` используется во внешнем API, snapshot, routing и devtools. `entityIndex` используется как индекс columnar arrays.

### Actor template

`createMachine(...)`, описывающий behavior slice сущности: movement, sprite sync, health, enemy AI, projectile lifetime, status effect, audio, animation.

Требования к гранулярности:

- Actor template является единицей поведения, а не data-only компонентом.
- Отдельный actor template создается для самостоятельного lifecycle, state machine, event handling, reducer logic, reaction или effect.
- Данные без собственного поведения хранятся в `contextSchema` ближайшего actor template.
- Поле, которое всегда изменяется вместе с другим поведением, остается в том же actor template.
- `dx/dy` velocity хранится в `movementActor`, если velocity не имеет собственного lifecycle/events.
- `spriteId` хранится в `spriteSyncActor`, а не в отдельном data-only actor.
- Projectile `ticksLeft` и `damage` могут жить в одном `projectileActor`, если lifetime и payload являются одним behavior slice.
- Новый actor template не создается только ради группировки колонок.
- Новый actor template создается, если его можно независимо добавить или убрать из entity через spawn recipe.
- Actor template может читать другой actor через `entities.get(...)`/`entities.maybe(...)`, но не должен становиться копией ECS system/component пары без state machine смысла.

### Actor row

Наличие конкретного actor template у конкретной entity.

```text
entity projectile/arrow-1
  movementActor row exists
  spriteSyncActor row exists
  projectileActor row exists
  healthActor row does not exist
```

### Spawn config и spawn recipe

`spawnConfig` задает typed declaration public spawn events and payload types. `spawn recipe` по payload public spawn event возвращает entity spec с набором actor templates и actor-specific spawn payload.

## 4. Область работ

- Пакет `@lite-fsm/entities`.
- Entity plugin `entitiesPlugin(...)`.
- `EntityMachineExtension` для `TypedCreateMachineFn`.
- `storage: "entity"` runtime поверх internal columnar storage.
- `defineSpawnConfig`, `spawn<T>()`, `SpawnEventsFrom<TSpawnConfig>`.
- `defineSpawnRecipes<typeof machines, typeof spawnConfig>()`.
- Public spawn events через `manager.transition(...)`.
- Low-level `manager.spawn(...)` и `manager.despawn(...)`.
- Scoped `transition.despawn(...)`, `transition.unscoped(...)`, `transition.entity(...)`, `transition.actor(...)`, `transition.tag(...)` внутри entity effects.
- `manager.entities` и typed `EntityAccess<AppState>`.
- `ENTITY_SPAWNED` и `ENTITY_DESPAWNED` как system lifecycle events только внутри entity runtime.
- Batch reducers, effects and reactions over `self.indices`.
- Snapshot/hydrate для entity storage.
- `@lite-fsm/entities/react` read hooks.
- Graph/devtools metadata для composition graph, actor lifecycle graph, event log и runtime actor access graph.
- Benchmarks против hand-written SoA ECS baseline.

## 5. Вне области работ

- Nested object columns.
- Array columns.
- `Map`/`Set` columns.
- Wildcard `*` effects в entity mode.
- `condition()` в entity effects.
- Per-row `bag`.
- `createEffect("latest")` для entity effects.
- Multi-thread storage.
- `SharedArrayBuffer`.
- Spatial indexes in core.
- Dense per-template storage.
- Top-level `requires`.
- Compile-time verification that every spawn recipe satisfies every `entities.get(...)` call.
- Editor prefab system in core.
- Automatic inclusion of `SpawnEvents` into user `AppEvents`.

## 6. Публичный API

### 6.1. Spawn config и модель событий

Разработчик объявляет обычные события приложения вручную.

```ts
type RegularEvents = { type: "TICK" } | { type: "RESET_ROOM" };
```

Spawn events объявляются в `spawnConfig`.

```ts
const spawnConfig = defineSpawnConfig({
  SPAWN_UNIT: spawn<UnitSpawn>(),
  SPAWN_PROJECTILE: spawn<ProjectileSpawn>(),
});

type SpawnEvents = SpawnEventsFrom<typeof spawnConfig>;
```

`spawnConfig` является источником истины для spawn event names, spawn event payload types, `manager.transition(...)` typing, spawn recipe keys и graph/devtools spawn intent metadata.

Если machines не должны обрабатывать spawn intent events:

```ts
type AppEvents = RegularEvents;
```

Если machines должны обрабатывать spawn intent events:

```ts
type AppEvents = RegularEvents | SpawnEvents;
```

```ts
type ManagerTransitionEvents<AppEvents, SpawnConfig> =
  | AppEvents
  | SpawnEventsFrom<SpawnConfig>;
```

Требования:

- `defineSpawnConfig(...)` возвращает typed config value.
- `spawn<T>()` задает payload type для spawn event.
- Ключи config являются event `type`.
- `SpawnEventsFrom<typeof spawnConfig>` выводит discriminated union.
- Payload type должен сохраняться в `manager.transition`, `spawnRecipes`, graph/devtools metadata.
- Библиотека не должна автоматически подмешивать `SpawnEvents` в `createMachine<AppEvents>`.
- Разработчик не обязан добавлять `SpawnEventsFrom<typeof spawnConfig>` в `AppEvents`, чтобы отправлять spawn events через `manager.transition(...)`.

### 6.2. Системные entity lifecycle events

```ts
type LiteFsmEntityLifecycleEvents =
  | { type: "ENTITY_SPAWNED" }
  | { type: "ENTITY_DESPAWNED" };

type EntityMachineEvents<AppEvents> = AppEvents | LiteFsmEntityLifecycleEvents;
```

Требования:

- `ENTITY_SPAWNED` и `ENTITY_DESPAWNED` не входят в пользовательский `AppEvents`.
- `ENTITY_SPAWNED` и `ENTITY_DESPAWNED` не доступны как keys в `spawnConfig` и `spawnRecipes`.
- Public `manager.transition({ type: "ENTITY_SPAWNED" })` и `manager.transition({ type: "ENTITY_DESPAWNED" })` запрещены.
- Entity `createMachine<AppEvents>` internally расширяет допустимые config/reducer events через `EntityMachineExtension` для `TypedCreateMachineFn`.
- `@lite-fsm/core` не хардкодит `LiteFsmEntityLifecycleEvents`.
- `@lite-fsm/entities` экспортирует `LiteFsmEntityLifecycleEvents` и `EntityMachineExtension`.
- Lifecycle events доступны только в `storage: "entity"` config/reducer/reactions.
- Lifecycle events не расширяют public `manager.transition(...)`.

### 6.3. Actor templates

Typed wrapper для приложения:

```ts
import {
  createMachine as createLiteFsmMachine,
  type TypedCreateMachineFn,
} from "@lite-fsm/core";
import type { EntityMachineExtension } from "@lite-fsm/entities";

export const createMachine: TypedCreateMachineFn<
  AppEvents,
  AppDeps,
  EntityMachineExtension
> = createLiteFsmMachine;
```

Пример entity actor template:

```ts
export const movementActor = createMachine({
  storage: "entity",
  groupTag: "entity",

  config: {
    __INIT: {
      ENTITY_SPAWNED: "ACTIVE",
    },
    ACTIVE: {
      TICK: null,
      ENTITY_DESPAWNED: "__RESOLVED",
      RESET_ROOM: "__CANCELLED",
    },
  },

  spawnSchema: {
    x: f32(),
    y: f32(),
    dx: f32(),
    dy: f32(),
  },

  contextSchema: {
    x: f32({ default: 0 }),
    y: f32({ default: 0 }),
    dx: f32({ default: 0 }),
    dy: f32({ default: 0 }),
  },

  reducer: (self, action, { payloadFor }) => {
    switch (action.type) {
      case "ENTITY_SPAWNED":
        for (const entity of self.indices) {
          const spawn = payloadFor(entity);
          self.x[entity] = spawn.x;
          self.y[entity] = spawn.y;
          self.dx[entity] = spawn.dx;
          self.dy[entity] = spawn.dy;
        }
        return;

      case "TICK":
        for (const entity of self.indices) {
          self.x[entity] += self.dx[entity];
          self.y[entity] += self.dy[entity];
        }
        return;
    }
  },
});
```

Требования:

- `storage: "entity"` включает entity actor runtime из `@lite-fsm/entities`.
- `storage: "entity"` типизируется через `EntityMachineExtension`.
- `EntityMachineExtension` добавляет поля `storage: "entity"`, `spawnSchema`, `contextSchema`, `despawnOn` и `reactions`.
- `EntityMachineExtension` добавляет `LiteFsmEntityLifecycleEvents` только в entity machine config/reducer/reactions.
- `EntityMachineExtension` добавляет entity-specific reducer context, включая `payloadFor`.
- `spawnSchema` задает actor-specific payload для `ENTITY_SPAWNED`.
- `contextSchema` задает columnar storage layout.
- `storage: "entity"` actor template должен явно задавать `spawnSchema`; пустой spawn payload задается как `spawnSchema: {}`.
- `storage: "entity"` actor template должен явно задавать `contextSchema`; actor без columns задает `contextSchema: {}`.
- Reducer получает `self`, `action` и runtime context.
- `ENTITY_SPAWNED` и `ENTITY_DESPAWNED` доступны в config/reducer без добавления в `AppEvents`.

### 6.4. Entity `__INIT`

Разрешенный `__INIT` edge:

```ts
config: {
  __INIT: {
    ENTITY_SPAWNED: "ACTIVE",
  },
}
```

Запрещенный `__INIT` edge:

```ts
config: {
  __INIT: {
    SPAWN_PROJECTILE: "ACTIVE",
  },
}
```

Требования:

- Entity actor row создается только через `spawnRecipes`, low-level `manager.spawn(...)` или hydrate.
- `__INIT` в entity template может содержать только `ENTITY_SPAWNED`.
- Custom events в `__INIT` entity template запрещены.
- `IS_DEV` должен выдавать ошибку при custom `__INIT` edge в entity template.
- TypeScript должен запрещать custom `__INIT` edge в entity template, если это возможно без ухудшения inference.
- `storage: "instance"` сохраняет текущую поддержку custom `__INIT` events.

### 6.5. Spawn recipes

```ts
const machines = {
  movementActor,
  spriteSyncActor,
  projectileActor,
} as const;

const spawnRecipes = defineSpawnRecipes<typeof machines, typeof spawnConfig>()({
  SPAWN_UNIT: (payload) => ({
    id: `unit/${payload.id}`,
    tags: ["unit"],
    actors: {
      movementActor: {
        x: payload.x,
        y: payload.y,
        dx: payload.dx,
        dy: payload.dy,
      },
      spriteSyncActor: {
        spriteId: payload.spriteId,
      },
    },
  }),

  SPAWN_PROJECTILE: (payload) => ({
    id: `projectile/${payload.id}`,
    tags: ["projectile"],
    actors: {
      movementActor: {
        x: payload.x,
        y: payload.y,
        dx: payload.dx,
        dy: payload.dy,
      },
      spriteSyncActor: {
        spriteId: payload.spriteId,
      },
      projectileActor: {
        ticksLeft: payload.ticksLeft,
        damage: payload.damage,
      },
    },
  }),
});
```

Требования:

- Ключи `machines` используются для typing `spawnRecipes`.
- Recipe keys должны совпадать с keys `spawnConfig`.
- Recipe callback payload выводится из `spawnConfig`.
- `actors` keys должны быть subset keys `machines`.
- Actor payload должен проверяться по actor `spawnSchema`.
- Unknown recipe key, unknown actor key, лишнее поле в actor payload и отсутствующее required поле actor payload должны быть TypeScript error.
- Recipe может вернуть один `EntitySpawnSpec` или массив `EntitySpawnSpec[]`.

### 6.6. Manager API

```ts
import { entitiesPlugin } from "@lite-fsm/entities";

const manager = MachineManager(machines, {
  plugins: [
    entitiesPlugin({
      spawnConfig,
      spawnRecipes,
    }),
  ],
});
```

```ts
manager.transition({
  type: "SPAWN_PROJECTILE",
  payload: {
    id: "arrow-1",
    x: 14,
    y: 20,
    dx: 3,
    dy: 0,
    spriteId: "arrow-sprite-1",
    ticksLeft: 40,
    damage: 10,
  },
});

manager.transition({ type: "TICK" });
```

```ts
manager.spawn({
  id: "projectile/arrow-1",
  tags: ["projectile"],
  actors: {
    movementActor: { x: 14, y: 20, dx: 3, dy: 0 },
    spriteSyncActor: { spriteId: "arrow-sprite-1" },
    projectileActor: { ticksLeft: 40, damage: 10 },
  },
});
```

Требования:

- `entitiesPlugin(...)` принимает `spawnConfig` и `spawnRecipes`.
- `entitiesPlugin(...)` регистрирует `storage: "entity"`.
- `entitiesPlugin(...)` расширяет manager через `manager.entities`, `manager.spawn(...)`, `manager.despawn(...)`.
- `entitiesPlugin(...)` расширяет `manager.transition(...)` type через `SpawnEventsFrom<typeof spawnConfig>`.
- `entitiesPlugin(...)` регистрирует action interceptor для public spawn events.
- Spawn event interceptor создает spawn transaction и продолжает обычную delivery public spawn event в machines.
- Spawn event interceptor не возвращает `handled: true`, если public spawn event должен быть видим machines из `AppEvents`.
- `entitiesPlugin(...)` регистрирует route resolver для `meta.entityId`.
- `entitiesPlugin(...)` регистрирует scoped deps/transition extensions для entity effects/reactions.
- `manager.transition` принимает `AppEvents | SpawnEventsFrom<typeof spawnConfig>`.
- `manager.transition` не принимает `LiteFsmEntityLifecycleEvents`.
- `SPAWN_PROJECTILE` payload проверяется по `spawnConfig`; `TICK` проверяется по `AppEvents`.
- `spawnRecipes` исполняются только при `manager.transition(spawnEvent)`.
- `manager.spawn(...)` принимает готовый `EntitySpawnSpec`, использует те же typing rules, создает internal spawn transaction и не вызывает `spawnRecipes`.
- Hydrate восстанавливает snapshot и не вызывает `spawnRecipes`.
- Devtools/replay должны отличать public spawn event от low-level spawn operation.

### 6.7. App deps и `entities`

```ts
import type { MachinesState } from "@lite-fsm/core";
import { entitiesPlugin, type EntityAccess } from "@lite-fsm/entities";

const machines = {
  movementActor,
  spriteSyncActor,
  projectileActor,
} as const;

type AppState = MachinesState<typeof machines>;

type AppDeps = {
  getState: () => AppState;
  entities: EntityAccess<AppState>;
  sprites: SpriteService;
};

const manager = MachineManager(machines, {
  plugins: [
    entitiesPlugin({
      spawnConfig,
      spawnRecipes,
    }),
  ],
});

manager.setDependencies({
  getState: manager.getState,
  entities: manager.entities,
  sprites: new SpriteService(),
});
```

Требования:

- `manager.entities` создает runtime-owned accessor к entity actor stores.
- Разработчик не создает `entities` вручную.
- `EntityAccess<AppState>` выводит доступные keys из `MachinesState<typeof machines>` и включает только `storage: "entity"` actor templates.
- Обычные domain/process machines читаются через `getState()`.
- Для `entities` не требуется ручной `AppActorRegistry` или codegen.
- Top-level `requires` не вводится в MVP.
- `entities` доступен в effects и reactions как typed dependency.
- `entities` является reserved dependency key, если установлен `entitiesPlugin(...)`.
- `manager.setDependencies({ entities })` должен получать `manager.entities`.
- Если user deps содержит `entities`, не равный `manager.entities`, `IS_DEV` бросает clear error.
- Runtime передает в entity effect/reaction scope-bound `entities` view с текущими `self.indices`, source actor template и event type.
- Разработчик передает `entities: manager.entities`, но не вызывает `.scope(...)` вручную.
- Перед вызовом entity effect/reaction plugin scoped deps extension заменяет root `manager.entities` на scope-bound view.
- Domain/process machines продолжают видеть root `manager.entities`, если они явно типизированы на `EntityAccess<AppState>`.
- Effect invocation получает captured scope-bound `entities`, доступный до и после `await`.
- Reaction invocation может получать reusable scope-bound `entities`, потому что reactions sync-only.
- Reducer не получает user dependencies и мутирует только `self`.

### 6.8. Exports пакета

Подпуть export:

```ts
@lite-fsm/entities
```

Обязательные exports:

```ts
entitiesPlugin
defineSpawnConfig
defineSpawnRecipes
spawn
type SpawnEventsFrom
f32
i16
i32
u8
string
optional
type EntityAccess
type LiteFsmEntityLifecycleEvents
type EntityMachineExtension
```

Требования:

- `@lite-fsm/entities` depends on plugin system from [`tz-plugin-system.md`](./tz-plugin-system.md).
- `@lite-fsm/entities` exports `LiteFsmEntityLifecycleEvents` as a type-only public contract.
- `@lite-fsm/entities` exports `EntityMachineExtension` for `TypedCreateMachineFn`.
- Internal storage layout remains columnar.

## 7. Runtime-поведение

### 7.1. Columnar data model runtime

Entity runtime storage is manager-owned runtime state, not object-per-actor records in public `MachinesState`.

Требования:

- Entity actor columns are read through `manager.entities` or scoped `entities`.
- `manager.getState()` не является source of truth для per-row entity columns.
- `MachinesState<typeof machines>` сохраняет type metadata для `EntityAccess<AppState>`.
- Public state slice for `storage: "entity"` may be an opaque/lightweight read model with `version`/counts, but not full column data.

```ts
type EntityStore = {
  count: number;
  capacity: number;
  ids: string[];
  indexById: Record<string, EntityIndex>;
  alive: Uint8Array;
  generation: Uint32Array;
  tagsByIndex: Array<readonly string[]>;
  freeList: EntityIndex[];
  version: number;
};
```

Требования к `EntityStore`:

- `ids[entityIndex]` возвращает `entityId`.
- `indexById[entityId]` возвращает `entityIndex`.
- `alive[entityIndex]` показывает наличие entity.
- `generation[entityIndex]` инкрементируется при повторном использовании slot.
- `tagsByIndex[entityIndex]` хранит tags из spawn spec.
- `freeList` хранит свободные slots для повторного использования.
- Captured effect/reaction scopes сохраняют `entityIndex` и `generation`.
- Capacity растет автоматически.

```ts
type ColumnarActorStore<Schema> = {
  templateKey: string;
  capacity: number;
  presence: Uint8Array;
  stateCode: Uint8Array;
  rowVersion: Uint32Array;
  stateBuckets: StateBucket[];
  statePosition: Int32Array;
  acceptedScratch: Uint32Array;
  enteredScratchByState: Uint32Array[];
  columns: { [K in keyof Schema]: ColumnArrayOf<Schema[K]> };
};

type StateBucket = {
  count: number;
  indices: Uint32Array;
};
```

Требования к `ColumnarActorStore`:

- Actor store индексируется global `entityIndex`.
- Данные в колонках валидны только при `presence[entityIndex] === 1`.
- `rowVersion[entityIndex]` инкрементируется при create/despawn row и при reducer mutation.
- `stateBuckets[stateCode]` хранит dense list entity indices для rows в конкретном state.
- `statePosition[entityIndex]` хранит позицию entity внутри текущего `stateBuckets[stateCode]`.
- Переход state обновляет `stateBuckets` через swap-remove.
- `acceptedScratch` и `enteredScratchByState` переиспользуются между dispatch и не создают allocations in hot path.
- Actor store view предоставляет `has(entity)`.
- Scoped actor store view `has(entity)` проверяет `presence`, current entity generation и captured generation.
- Public API предоставляет `self.has(entity)` и `entities.get("actorKey").has(entity)`.
- Разработчик не обязан читать `presence` напрямую.

### 7.2. Schema descriptors

Поддерживаемые descriptors MVP:

```ts
f32(opts?)
i16(opts?)
i32(opts?)
u8(opts?)
string(opts?)
optional(inner)
```

```ts
type EntityFieldDescriptor<Value, Column, SpawnValue = Value> = {
  readonly __value?: Value;
  readonly __column?: Column;
  readonly __spawnValue?: SpawnValue;
};

type EntitySchema = Record<string, EntityFieldDescriptor<any, any, any>>;

type EntitySpawnPayload<Schema extends EntitySchema> = {
  [Key in keyof Schema]: Schema[Key] extends EntityFieldDescriptor<
    any,
    any,
    infer SpawnValue
  >
    ? SpawnValue
    : never;
};

type EntityColumns<Schema extends EntitySchema> = {
  [Key in keyof Schema]: Schema[Key] extends EntityFieldDescriptor<
    any,
    infer Column,
    any
  >
    ? Column
    : never;
};

type SchemaValue<Schema extends EntitySchema> = {
  [Key in keyof Schema]: Schema[Key] extends EntityFieldDescriptor<
    infer Value,
    any,
    any
  >
    ? Value
    : never;
};

declare function f32(
  opts?: FieldOptions<number>,
): EntityFieldDescriptor<number, Float32Array>;
declare function i16(
  opts?: FieldOptions<number>,
): EntityFieldDescriptor<number, Int16Array>;
declare function i32(
  opts?: FieldOptions<number>,
): EntityFieldDescriptor<number, Int32Array>;
declare function u8(
  opts?: FieldOptions<number>,
): EntityFieldDescriptor<number, Uint8Array>;
declare function string(
  opts?: FieldOptions<string>,
): EntityFieldDescriptor<string, string[]>;
declare function optional<D extends EntityFieldDescriptor<any, any, any>>(
  inner: D,
): EntityFieldDescriptor<
  DescriptorValue<D> | null,
  DescriptorColumn<D>,
  DescriptorSpawnValue<D> | null
>;
```

Требования:

- Numeric descriptors используют typed arrays.
- `string()` использует string array.
- `optional(...)` поддерживает nullable values.
- `opts.default` задает default value.
- Отсутствие default означает `0` для numeric, `""` для string, `null` для optional.
- Descriptors несут phantom types для value type, column type и spawn payload type.
- `spawnSchema` выводится в `EntitySpawnPayload<typeof spawnSchema>`.
- `contextSchema` выводится в `EntityColumns<typeof contextSchema>` для `self`/`entities` store views.
- `contextSchema` также выводится в serializable `SchemaValue<typeof contextSchema>` для snapshot/read API.
- Nested objects, arrays, `Map` и `Set` запрещены.
- Reserved column names запрещены: `count`, `capacity`, `ids`, `indexById`, `alive`, `generation`, `freeList`, `stateCode`, `version`, `columns`, `presence`, `rowVersion`, `indices`, `states`.

### 7.3. Compiled metadata и performance

```ts
type CompiledTemplate = {
  templateKey: string;
  eventAcceptMask: Uint8Array;
  transitionTable: Int16Array;
  templatesByEventCode: Uint16Array[];
  acceptStateBucketsByEventCode: Uint16Array[][];
  reactionsByEventCode: Array<ReactionFn | undefined>;
  effectsByStateCode: Array<EffectFn | undefined>;
  despawnStateMask: Uint8Array;
};
```

Требования:

- Event `type` переводится в `eventCode` один раз на входе `manager.transition`.
- State names переводятся в `stateCode` при init manager.
- Transition lookup в dispatch выполняется по numeric `eventCode/stateCode`.
- Runtime не сравнивает строки внутри per-entity loops.
- Runtime не сканирует все templates на каждый event.
- `templatesByEventCode[eventCode]` содержит только templates, которые принимают event в `config`.
- `acceptStateBucketsByEventCode[eventCode]` содержит state buckets, которые принимают event.
- `despawnOn` компилируется в `despawnStateMask`.

Требования hot path:

- Один reducer call на actor template per event.
- Один reaction call на actor template per accepted event.
- Per-row actor objects, reducer/effect/reaction calls, `Map.get`, string comparisons и allocations на `TICK` запрещены.
- `self.indices` ссылается на state bucket или reusable scratch buffer.
- `entities.get("templateKey").<column>[entity]` является прямым indexed access после получения store view.
- `entities.get(...)` и `entities.maybe(...)` вызываются вне per-entity loops.
- Scope-bound `self/entities` не копируют column data для async effects.
- Dev-only Proxy/validation отключены в production build.
- Entity reducer loops работают по typed arrays и numeric entity indices.
- Routing by `entityId` делает lookup до hot loop.
- Bulk operations используют contiguous/reused buffers.

Минимальная целевая сложность:

- Broadcast `TICK`: `O(sum accepted alive rows by accepted templates)`.
- Entity-routed event: `O(actor rows attached to routed entities)`.
- Spawn N entities: `O(N * actor templates per entity)`.
- Despawn N entities: `O(N * actor rows per entity)`.
- State transition for row: `O(1)` bucket update.

Критерии benchmark:

- Добавить benchmark `composition-lite-fsm-entities` против hand-written SoA ECS baseline.
- Benchmark должен измерять movement update, projectile lifetime update, `despawnOn` cleanup и sprite sync reaction отдельно.
- Production build не должен делать heap allocations на steady-state `TICK`.
- Reducer-only `TICK` должен быть не медленнее `1.5x` hand-written SoA ECS baseline на 10k/50k rows.
- Full pipeline без внешних renderer calls должен быть не медленнее `2x` hand-written SoA ECS baseline на 10k/50k rows.
- Benchmark должен запускаться в Node.js и в браузерном профиле через headless browser.

### 7.4. Reducer API

```ts
type EntitySelf<Schema, States> = {
  readonly indices: ReadonlyArray<EntityIndex>;
  readonly states: Record<States, number>;
  readonly prevStateCode: Readonly<Uint8Array>;

  readonly presence: Uint8Array;
  stateCode: Uint8Array;
  rowVersion: Uint32Array;

  has(entity: EntityIndex): boolean;
  entityId(entity: EntityIndex): EntityRef;

  // schema columns are exposed as direct fields
};
```

Требования:

- `self.indices` содержит только rows, подходящие по presence, state, event и routing.
- Reducer не проверяет `self.has(entity)` для `entity` из `self.indices`.
- Reducer может мутировать только `self`.
- Reducer не мутирует foreign actor stores.
- Mutations foreign actor stores выполняются через events.

```ts
type EntityAccess<AppState> = {
  get<K extends EntityActorKey<AppState>>(
    key: K,
  ): EntityActorStoreViewFor<AppState, K>;

  maybe<K extends EntityActorKey<AppState>>(
    key: K,
  ): EntityActorStoreViewFor<AppState, K>;
};
```

Требования к `entities`:

- `entities.get("actorKey")` является required access.
- `entities.maybe("actorKey")` является optional access.
- `actorKey` типизируется по entity actor keys из `AppState`.
- Unknown `actorKey` должен быть TypeScript error.
- Return type выводится из `contextSchema` actor template.
- `createMachine` result для `storage: "entity"` несет phantom metadata по `contextSchema`, `spawnSchema` и allowed lifecycle events.
- `MachinesState<typeof machines>` сохраняет enough metadata для `EntityAccess<AppState>`.
- `EntityAccess<AppState>` строит key union только из machines с `storage: "entity"`.
- `manager.entities` является dependency value, а effect/reaction получает scope-bound view этого accessor.
- `entities.get(...)` в `IS_DEV` валидирует, что каждая entity из текущего `self.indices` имеет requested actor row.
- `entities.get(...)` бросает clear error с source actor, event type, requested actor key и entity id.
- `entities.get(...)` validation учитывает captured `entityIndex + generation`, чтобы stale async scope не прочитал новую entity в переиспользованном slot.
- `entities.maybe(...)` не валидирует наличие actor row.
- Optional access требует проверки `store.has(entity)` перед чтением actor columns.
- `entities.get(...)` и `entities.maybe(...)` возвращают read-only store views в effects/reactions.
- `self` остается единственным mutable store view в reducer.
- `entities` не является `entities.<templateKey>` object shape.
- `entities` не гарантирует compile-time наличие actor row в каждом spawn recipe.
- Отсутствие required actor row обнаруживается runtime validation в `IS_DEV`.

Для `ENTITY_SPAWNED`:

```ts
const spawn = payloadFor(entity);
```

Требования к `payloadFor`:

- `payloadFor(entity)` возвращает actor-specific payload из spawn recipe.
- Return type выводится из actor `spawnSchema`.
- Для обычных non-bulk events `payloadFor` может отсутствовать.
- Для bulk events `payloadFor` может возвращать item payload по `entityIndex`.

### 7.5. Default transition policy

Entity mode использует `config-default` transition policy.

Порядок обработки:

1. Runtime определяет matching rows.
2. Runtime вычисляет default next state по `config`.
3. Runtime применяет default state transition до reducer.
4. Reducer мутирует context columns.
5. Reducer может override state через `self.stateCode[entity]`.
6. Effects запускаются по финальному state после reducer.

```ts
case "TICK":
  for (const entity of self.indices) {
    self.ticksLeft[entity] -= 1;
    if (self.ticksLeft[entity] <= 0) {
      self.stateCode[entity] = self.states.EXPIRED;
    }
  }
  return;
```

Отмена default transition:

```ts
self.stateCode[entity] = self.prevStateCode[entity];
```

Требования:

- `storage: "instance"` сохраняет текущую reducer-authoritative семантику.
- `storage: "entity"` использует `config-default`.
- Записанный `stateCode` должен быть валидным state code текущего template.
- `IS_DEV` валидирует `stateCode` после reducer.

### 7.6. Effects API

```ts
effects: {
  LOAD_ASSET_PENDING: async ({ self, assets, transition }) => {
    await assets.loadFor(self.indices);
    transition({ type: "ASSET_LOADED" });
  },
}
```

Требования:

- Effect вызывается один раз на batch rows, вошедших в state после dispatch.
- Effect не вызывается при `self.indices.length === 0`.
- Effect привязан к enter-state.
- Effect может быть sync или async.
- `self` и `entities` read-only в effect.
- `self` и `entities` в async effect являются live views, bound к captured invocation scope.
- `self.indices` является stable captured list для effect invocation.
- `self.has(entity)` после `await` проверяет current presence и captured generation.
- `entities.get(...)` и `entities.maybe(...)` доступны в effect через scoped deps extension поверх `AppDeps` до и после `await`.
- After `await` access читает current committed store для captured scope.
- Если entity/actor row из captured scope удалена или slot переиспользован до resume effect, `entities.get(...)` в `IS_DEV` бросает stale scope/missing row error.
- `entities.maybe(...)` после `await` возвращает view, где `store.has(entity)` отражает current presence.
- Production build не обязан выполнять full required-access validation для `entities.get(...)`.
- Async effect, который читает columns после `await`, должен проверять `self.has(entity)` / `store.has(entity)`, если entity могла быть удалена.
- `entities.get(...)` и `entities.maybe(...)` должны вызываться вне per-entity loops.
- Mutation из effect запрещена.
- Effect выполняет mutation только через `transition(...)`.
- `transition(action)` внутри entity effect сохраняет current scope `self.indices`.
- `transition.despawn(...)` доступен в entity effect через plugin-provided transition extension.
- `transition.unscoped(action)` снимает current scope.
- `transition.entity(entityId, action)` доставляет action actor rows указанной entity.
- `transition.actor(actorId, action)` доставляет action конкретному actor.
- `transition.tag(groupTag, action)` доставляет action по groupTag.
- Wildcard `*` effects, `condition()`, per-row `bag` и `createEffect("latest")` в entity MVP не поддерживаются.

### 7.7. Reactions API

`reactions` — синхронный post-reducer слой для интеграции committed entity actor state с внешними runtime dependencies.

```ts
export const spriteSyncActor = createMachine({
  storage: "entity",
  config: {
    __INIT: {
      ENTITY_SPAWNED: "READY",
    },
    READY: {
      TICK: null,
      ENTITY_DESPAWNED: "__RESOLVED",
    },
  },
  spawnSchema: {
    spriteId: string(),
  },
  contextSchema: {
    spriteId: string({ default: "" }),
  },
  reducer: (self, action, { payloadFor }) => {
    switch (action.type) {
      case "ENTITY_SPAWNED":
        for (const entity of self.indices) {
          self.spriteId[entity] = payloadFor(entity).spriteId;
        }
        return;
    }
  },
  reactions: {
    TICK: ({ self, entities, sprites }) => {
      const movement = entities.get("movementActor");

      for (const entity of self.indices) {
        sprites.setPosition(self.spriteId[entity], {
          x: movement.x[entity],
          y: movement.y[entity],
        });
      }
    },

    ENTITY_DESPAWNED: ({ self, sprites }) => {
      for (const entity of self.indices) {
        sprites.remove(self.spriteId[entity]);
      }
    },
  },
});
```

Требования:

- `reactions` доступны только для `storage: "entity"` в MVP.
- Reaction привязан к accepted event, а не к enter-state.
- Reaction вызывается один раз на actor template per accepted event.
- Reaction получает `self.indices` rows, которые приняли event по `config` и routing.
- Reaction выполняется синхронно; Promise return в `IS_DEV` вызывает ошибку.
- `self` и `entities` read-only в reaction.
- `entities.get(...)` и `entities.maybe(...)` доступны в reaction через scoped deps extension поверх `AppDeps`.
- `entities.get(...)` и `entities.maybe(...)` должны вызываться вне per-entity loops.
- State mutation из reaction запрещена.
- `transition(...)` и `transition.despawn(...)` из reaction запрещены в MVP.
- Reaction может читать user deps и вызывать sync methods внешних deps.
- Reaction не создает transition edge в actor lifecycle graph.
- Reaction отображается в graph/devtools как event reaction.
- Reactions для `ENTITY_DESPAWNED` выполняются до удаления actor rows из storage.
- Runtime ловит ошибку каждой reaction и передает ее в `onError`.
- Ошибка reaction не откатывает reducer result.
- Ошибка reaction `ENTITY_DESPAWNED` не отменяет collapse/despawn cleanup.
- После ошибки одной reaction runtime продолжает обязательные lifecycle cleanup phases.

Фазовый контракт:

- Reducers выполняются раньше reactions.
- `despawnOn` lifecycle processing выполняется раньше reactions исходного event.
- Reactions internal `ENTITY_DESPAWNED` выполняются до collapse удаляемых rows.
- Subscribers вызываются после sync reactions.
- Enter-state effects вызываются после subscribers.

### 7.8. Despawn

```ts
transition.despawn(self.indices);
manager.despawn("projectile/arrow-1");
```

Требования:

- `transition.despawn(...)` принимает entity indices или entity ids.
- `manager.despawn(...)` принимает entity id или entity ids.
- Despawn operation находит все actor rows attached к entity.
- Runtime доставляет scoped `ENTITY_DESPAWNED` всем attached actor rows.
- Actor config обрабатывает `ENTITY_DESPAWNED`.
- Terminal actor rows удаляются после commit.
- Entity удаляется из `EntityStore`, когда у нее не остается actor rows.

```ts
export const projectileActor = createMachine({
  storage: "entity",
  groupTag: "entity",
  despawnOn: "EXPIRED",
  config: {
    __INIT: {
      ENTITY_SPAWNED: "ACTIVE",
    },
    ACTIVE: {
      TICK: null,
      ENTITY_DESPAWNED: "__RESOLVED",
    },
    EXPIRED: {},
  },
  reducer: (self, action) => {
    switch (action.type) {
      case "TICK":
        for (const entity of self.indices) {
          self.ticksLeft[entity] -= 1;
          if (self.ticksLeft[entity] <= 0) {
            self.stateCode[entity] = self.states.EXPIRED;
          }
        }
        return;
    }
  },
});
```

Требования к `despawnOn`:

- `despawnOn` доступен только для `storage: "entity"` в MVP.
- `despawnOn` принимает state name или readonly array state names.
- State из `despawnOn` должен существовать в `config`.
- `despawnOn` не может ссылаться на `__INIT`, `__RESOLVED`, `__CANCELLED`, `__REJECTED`.
- Если actor row после reducer/default transition находится в state из `despawnOn`, runtime schedules despawn всей entity.
- Owner actor row в state из `despawnOn` не обязан иметь `ENTITY_DESPAWNED` edge в этом state.
- Owner actor row удаляется вместе с entity despawn.
- Если несколько actor rows одной entity одновременно попали в `despawnOn`, runtime дедуплицирует entity.
- Enter-state effects для states из `despawnOn` не запускаются.
- `despawnOn` processing выполняется синхронно в том же dispatch.
- Переход одного actor row в `__RESOLVED` не вызывает entity despawn автоматически.
- Entity despawn вызывается через `despawnOn`, `transition.despawn(...)`, `manager.despawn(...)` или hydrate/reconcile.

### 7.9. Пайплайн dispatch runtime

Для обычного `manager.transition(action)` runtime выполняет:

1. Переводит `action.type` в `eventCode`.
2. Получает templates из `templatesByEventCode[eventCode]`.
3. Для каждого template получает accepted state buckets.
4. Формирует `self.indices` из bucket или reusable scratch buffer.
5. Применяет default transitions.
6. Вызывает reducer один раз на template.
7. Обновляет `stateBuckets`, `statePosition`, `rowVersion`.
8. Собирает rows, вошедшие в states из `despawnOn`.
9. Выполняет internal despawn processing для собранных entity.
10. Выполняет reactions для internal `ENTITY_DESPAWNED`.
11. Выполняет collapse terminal rows.
12. Коммитит staged entity storage changes.
13. Выполняет reactions исходного event для rows, оставшихся alive/present.
14. Уведомляет subscribers.
15. Запускает enter-state effects.

Требования:

- Per-template reducer/reaction order соответствует registration order `machines`.
- Rows, удаленные через `despawnOn`, не попадают в reactions исходного event.
- Reactions `ENTITY_DESPAWNED` видят columns до удаления rows.
- Effects не запускаются для rows, удаленных через `despawnOn` до effect phase.
- Event pipeline не создает allocations на `TICK`.

Entity runtime использует plugin system phases так:

- Spawn event interceptor runs in `actions.intercept(...)` before template target selection.
- Spawn event interceptor queues internal spawn transaction in dispatch context.
- Queued spawn transaction runs in `dispatch.beforeReduce(...)` before public spawn event delivery.
- Entity storage runtime handles `storage: "entity"` template reduce.
- `despawnOn` collection runs during entity storage reduce.
- Internal despawn processing runs in `dispatch.afterReduce(...)`.
- Internal `ENTITY_DESPAWNED` reactions run in `dispatch.beforeCommit(...)`.
- Collapse of terminal/despawned rows runs in `dispatch.beforeCommit(...)` after internal despawn reactions.
- Source event reactions run in `dispatch.beforeSubscribers(...)` after commit and before subscribers.
- Entity enter-state effects run through storage runtime effect target resolution before core effect invocation.

Требования:

- Subscribers do not observe partially spawned entities.
- Subscribers do not observe rows scheduled for despawn through `despawnOn`.
- Reactions that need deleted row columns run before collapse.
- Source event reactions see committed state after lifecycle processing.

### 7.10. Spawn event pipeline

При `manager.transition({ type: "SPAWN_PROJECTILE", payload })` runtime выполняет:

1. Принимает public spawn event.
2. Переводит `action.type` в `eventCode`.
3. Находит payload type по `spawnConfig`.
4. Находит recipe по `spawnRecipes`.
5. Вызывает recipe.
6. Выделяет `entityIndex`.
7. Регистрирует `entityId`, tags и alive flag.
8. Создает actor rows из `EntitySpawnSpec.actors`.
9. Выставляет `presence[entityIndex] = 1` для каждого actor store.
10. Выставляет `stateCode[entityIndex] = code("__INIT")`.
11. Добавляет row в `stateBuckets[__INIT]`.
12. Сохраняет actor-specific spawn payload.
13. Создает sidecar runtime records.
14. Доставляет scoped internal `ENTITY_SPAWNED` созданным actor rows.
15. Применяет default `__INIT -> target` transition.
16. Вызывает reducers созданных actor templates.
17. Обновляет state buckets.
18. Обрабатывает public spawn event остальными machines, если они принимают этот event.
19. Коммитит spawned entity storage changes.
20. Выполняет reactions для internal `ENTITY_SPAWNED`.
21. Уведомляет subscribers.
22. Запускает enter-state effects.

Требования:

- Фазы создания entity и actor rows выполняются transactionally.
- Subscribers и effects не видят частично созданную entity.
- Internal `ENTITY_SPAWNED` не выходит в public `transition`.
- Public spawn event остается в devtools/event log.

### 7.11. Routing и sidecar

Существующие route fields сохраняются:

```ts
meta: {
  actorId?: string | string[];
  groupId?: string | string[];
  groupTag?: string | string[];
}
```

Добавляется entity route:

```ts
meta: {
  entityId?: EntityRef | readonly EntityRef[];
}
```

Требования:

- `meta.entityId` типизируется через `entitiesPlugin` action meta extension.
- `meta.entityId` runtime behavior реализуется через plugin route resolver.
- `entityId` route доставляет event всем actor rows указанной entity.
- Доставляются только rows, чей current state принимает event.
- `actorId` route имеет больший приоритет, чем `entityId`.
- Unknown `entityId` не создает actor rows.

```ts
type ActorRuntime =
  | {
      kind: "instance";
      templateKey: string;
      meta: ActorMeta;
      bag: Map<symbol, () => void>;
    }
  | {
      kind: "entity";
      templateKey: string;
      meta: ActorMeta;
      entityIndex: EntityIndex;
    };
```

Требования:

- `actorById` хранит `ActorRuntime`.
- Entity actor runtime не имеет `bag`.
- Hydrate пересобирает sidecar.
- Despawn/collapse обновляет sidecar.

## 8. TypeScript-типизация

```ts
type EntityMachineExtension<
  ContextSchema extends EntitySchema = EntitySchema,
  SpawnSchema extends EntitySchema = EntitySchema,
> = {
  storage: "entity";
  internalEvents: LiteFsmEntityLifecycleEvents;
  configFields: {
    spawnSchema: SpawnSchema;
    contextSchema: ContextSchema;
    despawnOn?: string | readonly string[];
    reactions?: EntityReactions<ContextSchema>;
  };
  reducerContext: {
    payloadFor?: <TEntity extends EntityIndex>(
      entity: TEntity,
    ) => EntitySpawnPayload<SpawnSchema>;
  };
  resultMetadata: {
    entityContextSchema: ContextSchema;
    entitySpawnSchema: SpawnSchema;
  };
};
```

Требования:

- `EntityMachineExtension` подключается только через typed wrapper `TypedCreateMachineFn<AppEvents, AppDeps, EntityMachineExtension>`.
- `EntityMachineExtension` не меняет global `createMachine` typing.
- `EntityMachineExtension` не добавляет lifecycle events в public `AppEvents`.
- `EntityMachineExtension` сохраняет `contextSchema` и `spawnSchema` как phantom metadata в result type каждого entity actor template.
- Extension metadata используется `MachinesState<typeof machines>` и `EntityAccess<AppState>`.
- `storage: "entity"` actor template типизируется только при подключенной extension.
- `manager.entities` доступен только если установлен `entitiesPlugin(...)`.
- `manager.spawn(...)` и `manager.despawn(...)` доступны только если установлен `entitiesPlugin(...)`.
- `manager.transition(...)` принимает spawn events только из `spawnConfig`, переданного текущему `entitiesPlugin(...)`.
- `manager.transition(...)` не принимает lifecycle events.
- `spawnRecipes` проверяют keys, payloads и required fields на уровне TypeScript.

## 9. Snapshot, hydrate и совместимость

```ts
type EntitySnapshot = {
  entities: {
    ids: string[];
    alive: number[];
    generation: number[];
    tagsByIndex: string[][];
    freeList: number[];
    version: number;
  };
  actors: {
    [templateKey: string]: {
      presence: number[];
      stateCode: number[];
      rowVersion: number[];
      columns: Record<string, number[] | string[] | (string | null)[]>;
    };
  };
};
```

Требования:

- Snapshot serializes `EntityStore`, `generation`, `freeList`, entity `version`, every entity actor store и `rowVersion`.
- Typed arrays convert to plain arrays.
- Hydrate restores `EntityStore` and actor stores.
- Hydrate validates `ids`, `alive`, `generation`, `tagsByIndex` and `freeList` length consistency in `IS_DEV`.
- Hydrate rebuilds `indexById` and sidecar.
- Hydrate validates schema compatibility in `IS_DEV`.
- Hydrate with old snapshot missing `generation` must initialize `generation` to `0` for alive rows and rebuild `freeList` from `alive`.
- Hydrate with old snapshot missing actor `rowVersion` must rebuild row versions from current manager version.
- Hydrate replace invalidates all restored rows by assigning fresh `rowVersion` values.
- Hydrate merge invalidates changed rows by incrementing `rowVersion`.
- Snapshot `rowVersion` can be used as debug/import metadata, but React cache correctness relies on hydrate invalidation policy, not trusting remote `rowVersion`.
- JSON round-trip must restore equivalent state.
- Routing by `entityId` and `actorId` must work after hydrate.
- Regular `@lite-fsm/core` snapshot/hydrate remains compatible and does not require `@lite-fsm/entities`.

### 9.1. React-слой чтения

Подпуть export:

```ts
@lite-fsm/entities/react
```

Обязательные hooks:

```ts
useEntitySnapshot(templateKey, entityId);
useEntityCount(templateKey);
useEntityList(templateKey, filter?);
```

Требования:

- Hooks use `useSyncExternalStore`.
- `useEntitySnapshot` subscribes to one entity row.
- `rowVersion` provides stable snapshot caching.
- Hydrate must bump/invalidate row versions according to section 9 before hooks publish snapshots.
- Update одного row не должен rerender unrelated row consumers.
- Regular `@lite-fsm/react` не импортирует entity hooks.

### 9.2. Graph/devtools

#### 9.2.1. Composition graph

Graph package reads `spawnConfig` and `spawnRecipes`.

```text
SPAWN_PROJECTILE
  creates entity kind: projectile
  attaches:
    movementActor
    spriteSyncActor
    projectileActor
```

#### 9.2.2. Actor lifecycle graph

Graph package reads `createMachine.config`.

```text
projectileActor
  __INIT --ENTITY_SPAWNED--> ACTIVE
  ACTIVE --TICK--> ACTIVE
  ACTIVE --override--> EXPIRED
  EXPIRED --despawnOn--> ENTITY_DESPAWNED
  ACTIVE --ENTITY_DESPAWNED--> __RESOLVED
```

#### 9.2.3. Event log

Категории devtools event log:

- Public app events.
- Public spawn events.
- Internal lifecycle events.
- Internal spawn/despawn operations.

Internal events are nested under the public event or runtime operation that caused them.

#### 9.2.4. Runtime actor access graph

Devtools records `entities.get("actorKey")` and `entities.maybe("actorKey")` calls during effects/reactions.

Требования:

- Recorded edge includes source actor template, event type, access kind `get | maybe` and requested actor key.
- Recorded access edges do not change spawn composition.
- Graph package may statically detect literal `entities.get("actorKey")` calls as optional metadata.
- Graph package must treat dynamic actor keys as unknown access.

## 10. Этапы реализации

### Этап 1 — Пакет entities и entity runtime

Цель этапа: создать `@lite-fsm/entities`, подключить `storage: "entity"` через plugin system и реализовать batch columnar runtime без lifecycle/spawn public API.

**Область работ.**

- Add `@lite-fsm/entities`.
- Add `entitiesPlugin(...)`.
- Add `EntityMachineExtension`.
- Register `storage: "entity"` through plugin system.
- Register entity action meta and route resolver.
- Register entity scoped deps and transition extensions.
- Implement schema descriptors and type-level `EntitySchema -> EntitySpawnPayload/EntityColumns/SchemaValue` mapping.
- Implement `EntityStore`, `ColumnarActorStore`, compiled event/state/transition tables, `templatesByEventCode`, `stateBuckets`, `statePosition`, reusable scratch buffers and `self.indices`.
- Implement `manager.entities`, `entities.get("actorKey")`, `entities.maybe("actorKey")`, `self.has(entity)`, `self.entityId(entity)`.
- Implement state/routing/presence filtering via buckets.
- Implement `config-default` transition policy.
- Implement read-only effects.

**Вне области работ.**

- System lifecycle events.
- Public spawn config and recipes.
- Reactions.
- Snapshot/hydrate.
- React hooks.
- Examples.

**Критерии приемки.**

- `@lite-fsm/core` bundle does not include `@lite-fsm/entities`.
- `storage: "entity"` without `entitiesPlugin(...)` throws clear init error through plugin system.
- `storage: "entity"` is typed only when wrapper uses `EntityMachineExtension`.
- `contextSchema` and `spawnSchema` metadata are preserved in `MachinesState<typeof machines>`.
- `payloadFor(entity)` return type is inferred from actor `spawnSchema`.
- `self` and `entities.get("actorKey")` column views are inferred from actor `contextSchema`.
- Bulk spawn 10000 entities works through internal API.
- `TICK` updates rows in one reducer call per template.
- Cross-actor read by same `entityIndex` works through `entities.get("actorKey")`.
- `entities.get("unknownActor")` is a TypeScript error.
- `entities.get("actorKey")` throws in `IS_DEV` when current scope contains an entity without requested actor row.
- `entities.maybe("actorKey")` allows optional actor row access through `store.has(entity)`.
- Dispatch uses numeric event/state codes in hot path.
- `TICK` does not scan templates that do not accept `TICK`.
- `TICK` does not allocate per frame.
- State transition updates buckets in `O(1)`.
- Benchmark acceptance from section 7.3 passes in production build.
- Effect mutation of `self`/`entities` throws in `IS_DEV`.
- Scoped `transition(...)` from entity effect preserves `self.indices`.

### Этап 2 — System lifecycle events

Цель этапа: подключить scoped lifecycle events и despawn behavior без расширения public `AppEvents`.

**Область работ.**

- Add and export `LiteFsmEntityLifecycleEvents` from `@lite-fsm/entities`.
- Wire `LiteFsmEntityLifecycleEvents` into `EntityMachineExtension`.
- Allow `ENTITY_SPAWNED` in entity `__INIT`.
- Allow `ENTITY_DESPAWNED` in entity active states.
- Forbid public transition of lifecycle events.
- Forbid custom `__INIT` events in entity templates.
- Implement `despawnOn`.
- Implement `transition.despawn(...)`.
- Implement `manager.despawn(...)`.

**Вне области работ.**

- Public spawn config and recipes.
- Reactions.
- Snapshot/hydrate.
- React hooks.

**Критерии приемки.**

- Entity actor template starts only through `ENTITY_SPAWNED`.
- `ENTITY_SPAWNED` and `ENTITY_DESPAWNED` are typed in entity machine config/reducer/reactions without adding them to `AppEvents`.
- Custom `__INIT` event in entity template fails validation.
- `despawnOn: "EXPIRED"` despawns whole entity in the same dispatch.
- Owner actor state listed in `despawnOn` does not require `ENTITY_DESPAWNED` edge.
- Enter-state effects for `despawnOn` states are not called.
- Despawn one entity sends scoped `ENTITY_DESPAWNED` to its actor rows.
- Global broadcast `ENTITY_DESPAWNED` is not possible via public transition.

### Этап 3 — Spawn config и recipes

Цель этапа: добавить public spawn events, typed recipes и transition typing поверх `entitiesPlugin(...)`.

**Область работ.**

- Add `defineSpawnConfig`.
- Add `spawn<T>()`.
- Add `SpawnEventsFrom<TSpawnConfig>`.
- Add `defineSpawnRecipes<typeof machines, typeof spawnConfig>()`.
- Add `entitiesPlugin({ spawnConfig, spawnRecipes })`.
- Type `manager.transition` as `AppEvents | SpawnEventsFrom<typeof spawnConfig>`.

**Вне области работ.**

- Reactions.
- Snapshot/hydrate.
- React hooks.
- Examples beyond minimal fixtures.

**Критерии приемки.**

- Spawn event payload types are inferred from `spawnConfig`.
- Recipe keys are restricted to `spawnConfig` keys.
- Recipe actor keys are restricted to `machines` keys.
- Recipe actor payload is checked against `spawnSchema`.
- Public spawn event creates entity transaction before public event delivery.
- Machines see spawn events only when developer includes `SpawnEvents` in `AppEvents`.
- `manager.transition` accepts spawn events even if `AppEvents` does not include them.

### Этап 4 — Reactions

Цель этапа: добавить sync reaction layer для entity actors без создания дополнительных public events.

**Область работ.**

- Add entity-runtime-only `reactions`.
- Compile reactions by `eventCode`.
- Run reactions after reducers and lifecycle processing.
- Run `ENTITY_DESPAWNED` reactions before collapse.
- Support `entities.get(...)` and `entities.maybe(...)` inside reactions through scoped deps extension.
- Enforce sync-only reactions.
- Enforce read-only `self/entities` in reactions.
- Forbid `transition(...)` from reactions in MVP.

**Вне области работ.**

- Async reactions.
- Reactions for `storage: "instance"`.
- Public event emission from reactions.
- Snapshot/hydrate.

**Критерии приемки.**

- `spriteSyncActor.reactions.TICK` can sync sprites through `entities.get("movementActor")` without `SYNC_PENDING`.
- Reaction returning Promise throws in `IS_DEV`.
- Reaction mutation of `self/entities` throws in `IS_DEV`.
- `ENTITY_DESPAWNED` reaction can read columns before row deletion.
- Reaction error is reported through `onError` and does not block despawn collapse.
- Reactions do not create public events.

### Этап 5 — Snapshot/hydrate

Цель этапа: добавить serializable entity storage snapshot и hydrate policy, совместимую с rowVersion-based read layer.

**Область работ.**

- Implement entity snapshot format.
- Serialize `generation`, `freeList`, `version` and actor `rowVersion`.
- Implement hydrate replace strategy.
- Implement hydrate rowVersion invalidation policy.
- Rebuild sidecar on hydrate.
- Validate schema in `IS_DEV`.
- Support JSON round-trip.

**Вне области работ.**

- React hooks implementation.
- Devtools UI.
- Snapshot formats outside entity slice.

**Критерии приемки.**

- `dehydrate -> JSON.stringify -> JSON.parse -> hydrate` restores entities and actor rows.
- Routing by `entityId` works after hydrate.
- Routing by `actorId` works after hydrate.
- Column values are restored.
- Entity generation/freeList are restored or rebuilt from legacy snapshot.
- React row caches are invalidated for restored/changed rows.

### Этап 6 — React entity hooks

Цель этапа: добавить granular React read layer для entity rows без rerender unrelated consumers.

**Область работ.**

- Add `@lite-fsm/entities/react`.
- Implement `useEntitySnapshot`.
- Implement `useEntityCount`.
- Implement `useEntityList`.
- Implement rowVersion cache.

**Вне области работ.**

- Importing entity hooks from regular `@lite-fsm/react`.
- Editor prefab UI.
- Renderer-specific integrations.

**Критерии приемки.**

- Row consumer rerenders only when its row changes.
- Count consumer rerenders when count changes.
- List consumer rerenders according to list/filter changes.
- Regular `@lite-fsm/react` does not import entity hooks.

### Этап 7 — Examples

Цель этапа: обновить examples так, чтобы они демонстрировали финальную composition model, spawn recipes, lifecycle и reactions.

**Область работ.**

- Update ECS comparison examples.
- Add final lite-fsm composition example.
- Add projectile despawn example.
- Add enemy variants example.
- Add machine that opts into `SpawnEvents` explicitly.

**Вне области работ.**

- New runtime features beyond this ТЗ.
- Visual editor/prefab examples.

**Критерии приемки.**

- Examples use `spawnConfig`.
- Examples use `spawnRecipes`.
- Examples use `reactions` for sprite sync.
- Examples use `entities.get("actorKey")` for cross-actor entity reads.
- Entity actor templates use `ENTITY_SPAWNED`.
- Entity actor templates do not use custom spawn events in `__INIT`.
- Projectile lifetime uses `despawnOn: "EXPIRED"`.
- `AppEvents = RegularEvents | SpawnEvents` appears only in examples where a machine handles spawn intent events.

## 11. Тестовые ожидания

- Для чистой логики и модулей с контрактами без side effects требуется 100% coverage по statements/branches/functions/lines.
- Type tests покрывают spawn config inference, recipe key/payload validation, `EntityMachineExtension`, forbidden lifecycle public transition, forbidden custom entity `__INIT`, `EntityAccess<AppState>` и reserved dependency key `entities`.
- Runtime tests покрывают spawn transaction, low-level `manager.spawn(...)`, `manager.despawn(...)`, `transition.despawn(...)`, entity routing, `despawnOn`, bucket updates, stale scope validation, read-only effects/reactions и reaction error handling.
- Snapshot tests покрывают JSON round-trip, legacy snapshot without `generation`/`rowVersion`, hydrate replace/merge invalidation, sidecar rebuild и routing after hydrate.
- React tests покрывают granular rerenders for row/count/list consumers.
- Benchmark tests покрывают movement update, projectile lifetime update, `despawnOn` cleanup и sprite sync reaction на 10k/50k rows.
- Названия новых `describe`/`it`/`test` в проекте должны быть на русском; API-термины остаются на английском.

## 12. Открытые вопросы

Нет.
