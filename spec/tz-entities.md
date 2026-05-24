# @lite-fsm/entities и entity actor runtime — ТЗ

## 1. Цель

Реализовать пакет `@lite-fsm/entities` для массовых игровых сущностей через entity actor runtime, внутреннее columnar storage, типизированную spawn composition и scoped entity lifecycle. Основная модель разработки остается `createMachine`, `config`, `reducer`, `effects` и `MachineManager.transition`; entity runtime добавляет batch storage и composition поверх этой модели, не превращая core в ECS.

## 2. Предусловия и зависимости

- Plugin system из [`tz-plugin-system.md`](./tz-plugin-system.md) должна быть реализована первой.
- `@lite-fsm/entities` подключается как plugin к `MachineManager`.
- `@lite-fsm/entities` регистрирует `storage: "entity"` через plugin system.
- `@lite-fsm/core` не содержит реализацию entity runtime и не импортирует `@lite-fsm/entities`.
- Public API использует термин `entity`, а не `columnar`.
- `@lite-fsm/entities` добавляется как публичный package в `packages/entities` с alpha status в README/docs.
- `@lite-fsm/entities` не является dependency пакета `@lite-fsm/core`.

## 3. Термины

### Entity

Игровая сущность с публичным `entityId` и внутренним `entityIndex`.

```ts
type EntityId = string;
type EntityIndex = number & { readonly __brand: "EntityIndex" };
```

Требования:

- `entityId` является обычной строкой во внешнем API, spawn recipes, snapshot, routing и React hooks.
- `entityIndex` используется только внутри runtime и batch API как индекс columnar arrays.
- Public branded `EntityRef` в MVP не вводится.
- Runtime хранит `indexById: Record<string, EntityIndex>` и переводит `entityId` в `entityIndex` до hot path.

### Actor template

`createMachine(...)`, описывающий behavior slice сущности: movement, sprite sync, health, enemy AI, projectile lifetime, status effect, audio, animation.

Требования к гранулярности:

- Actor template является единицей поведения, а не data-only компонентом.
- Отдельный actor template создается для самостоятельного lifecycle, state machine, event handling, reducer logic, reaction или effect.
- Данные без собственного поведения хранятся в `initialContext` schema ближайшего actor template.
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

### Entity groupTag

`groupTag` — публичная группа entity instance. Она задается в `EntitySpawnSpec`, а не на actor template.

```ts
{
  id: "projectile/arrow-1",
  groupTag: "projectile",
  actors: { ... }
}
```

Требования:

- `EntitySpawnSpec.id` обязателен.
- `EntitySpawnSpec.groupTag` обязателен.
- `groupTag` является свободной строкой и не выводится из recipe key.
- `generateActorId` и `generateGroupId` из `MachineManagerOptions` не применяются к `storage: "entity"`.
- Если нужен генератор entity id, он должен быть отдельной API-опцией и не входит в MVP.

### Spawn events и entity spawn

`spawnEvents` задает типизированные public spawn events и их payload types. `spawn recipe` по payload public spawn event возвращает entity spec с набором actor templates и actor-specific spawn payload.

## 4. Область работ

- Пакет `@lite-fsm/entities`.
- Entity plugin `entitiesPlugin(...)`.
- `EntityMachineExtension` для `TypedCreateMachineFn`.
- `storage: "entity"` runtime поверх internal columnar storage.
- Entity storage runtime реализует `StorageRuntimeBase` и capability blocks `effects`, `snapshot`, `identity`, `reactions` из [`tz-plugin-system.md`](./tz-plugin-system.md).
- `defineSpawnEvents`, `spawnEvent<T>()`, `SpawnEventsFrom<TSpawnEvents>`.
- `defineEntitySpawn(machines, spawnEvents)`.
- Public spawn events через `manager.transition(...)`.
- `manager.entities` и typed `EntityAccess<AppState>`.
- Scoped `transition.despawn(...)`, `transition.entity(...)`, `transition.actor(...)`, `transition.tag(...)` внутри entity effects.
- `ENTITY_SPAWNED` и `ENTITY_DESPAWNED` как system lifecycle events только внутри entity runtime.
- Batch reducers, effects и reactions поверх `self.indices`.
- Snapshot/hydrate для entity storage через top-level `snapshot.storage.entity`.
- `@lite-fsm/entities/react` read hooks.
- Benchmarks против hand-written SoA ECS baseline.

## 5. Вне области работ

- Public `manager.spawn(...)` и `manager.despawn(...)`.
- Public low-level storage handlers.
- Nested object columns.
- Array columns.
- `Map`/`Set` columns.
- Nullable columns в `initialContext`.
- Proxy-based runtime protection для read-only views.
- Wildcard `*` effects в entity mode.
- `condition()` в entity effects.
- Per-row `bag`.
- `createEffect("latest")` для entity effects.
- Multi-thread storage.
- `SharedArrayBuffer`.
- Spatial indexes в core.
- Dense per-template storage.
- Top-level `requires`.
- Compile-time проверка, что каждый spawn recipe удовлетворяет каждому вызову `entities.get(...)`.
- Editor prefab system in core.
- Automatic inclusion of `SpawnEvents` into user `AppEvents`.
- Public routing по `actorId` к entity actor rows.
- Multi-tags for one entity.
- Partial export/import of entity storage.
- Batch mapping public event payload через `payloadFor`.
- Graph/devtools provider API, graph UI и devtools UI. Entity graph/devtools integration должна быть отдельным ТЗ после runtime MVP.

## 6. Публичный API

### 6.1. Spawn events и модель событий

Разработчик объявляет обычные события приложения вручную.

```ts
type RegularEvents = { type: "TICK" } | { type: "RESET_ROOM" };
```

Spawn events объявляются в `spawnEvents`.

```ts
const spawnEvents = defineSpawnEvents({
  SPAWN_UNIT: spawnEvent<UnitSpawn>(),
  SPAWN_PROJECTILE: spawnEvent<ProjectileSpawn>(),
});

type SpawnEvents = SpawnEventsFrom<typeof spawnEvents>;
```

`spawnEvents` является источником истины для spawn event names, spawn event payload types, `manager.transition(...)` typing и spawn recipe keys.

Если machines не должны обрабатывать spawn intent events:

```ts
type AppEvents = RegularEvents;
```

Если machines должны обрабатывать spawn intent events:

```ts
type AppEvents = RegularEvents | SpawnEvents;
```

Требования:

- `defineSpawnEvents(...)` возвращает typed config value.
- `spawnEvent<T>()` задает payload type для spawn event.
- Ключи config являются event `type`.
- `SpawnEventsFrom<typeof spawnEvents>` выводит discriminated union.
- Payload type должен сохраняться в `manager.transition` и `defineEntitySpawn(...)`.
- Библиотека не должна автоматически подмешивать `SpawnEvents` в `createMachine<AppEvents>`.
- Разработчик не обязан добавлять `SpawnEventsFrom<typeof spawnEvents>` в `AppEvents`, чтобы отправлять spawn events через `manager.transition(...)`.
- Machines, включая `storage: "entity"` templates, могут обработать public spawn event только если разработчик явно включил `SpawnEvents` в `AppEvents`.

### 6.2. Системные entity lifecycle events

```ts
type LiteFsmEntityLifecycleEvents = { type: "ENTITY_SPAWNED" } | { type: "ENTITY_DESPAWNED" };
```

Требования:

- `ENTITY_SPAWNED` и `ENTITY_DESPAWNED` не входят в пользовательский `AppEvents`.
- `ENTITY_SPAWNED` и `ENTITY_DESPAWNED` не доступны как keys в `spawnEvents` и recipe object, переданном в `defineEntitySpawn(...)`.
- Public `manager.transition({ type: "ENTITY_SPAWNED" })` и `manager.transition({ type: "ENTITY_DESPAWNED" })` запрещены.
- Если пользователь ошибочно добавил lifecycle event names в `AppEvents`, `entitiesPlugin(...)` runtime все равно reject-ит public dispatch.
- TypeScript best-effort исключает `LiteFsmEntityLifecycleEvents` из public `manager.transition(...)`.
- Entity `createMachine<AppEvents>` internally расширяет допустимые config/reducer/reactions events через `EntityMachineExtension`.
- `@lite-fsm/core` не хардкодит `LiteFsmEntityLifecycleEvents`.
- `@lite-fsm/entities` экспортирует `LiteFsmEntityLifecycleEvents` и `EntityMachineExtension`.
- Lifecycle events доступны только в `storage: "entity"` config/reducer/reactions.
- Lifecycle events остаются внутренними событиями entity storage runtime.
- Lifecycle events не проходят через public `transition`, middleware, generic action interceptors, subscribers или committed public action stream как отдельные committed actions.

### 6.3. Actor templates

Typed wrapper для приложения:

```ts
import { createMachine as createLiteFsmMachine, type TypedCreateMachineFn } from "@lite-fsm/core";
import type { EntityMachineExtension } from "@lite-fsm/entities";

export const createMachine: TypedCreateMachineFn<AppEvents, AppDeps, EntityMachineExtension> = createLiteFsmMachine;
```

Пример entity actor template:

```ts
export const movementActor = createMachine({
  storage: "entity",
  initialState: "__INIT",

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

  initialContext: {
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
- `initialState` обязателен и для entity actor template должен быть `"__INIT"`.
- `initialContext` обязателен и для `storage: "entity"` является schema descriptor object, а не готовым runtime context object.
- `initialContext` задает columnar storage layout, default values, `self` columns, `EntityAccess` columns, snapshot value shape и phantom metadata.
- Actor без columns задает `initialContext: {}`.
- `spawnSchema` задает actor-specific payload для `ENTITY_SPAWNED`.
- `storage: "entity"` actor template должен явно задавать `spawnSchema`; пустой spawn payload задается как `spawnSchema: {}`.
- Runtime не заполняет columns автоматически из spawn payload.
- Reducer получает `self`, `action` и runtime context.
- `payloadFor(entity)` всегда присутствует в reducer context.
- `payloadFor(entity)` возвращает actor-specific spawn payload только во время `ENTITY_SPAWNED`.
- Вызов `payloadFor(entity)` на любом другом event бросает clear error.
- `ENTITY_SPAWNED` и `ENTITY_DESPAWNED` доступны в config/reducer/reactions без добавления в `AppEvents`.
- `groupTag` не задается на `storage: "entity"` actor template.

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

- Entity actor row создается только через spawn recipes, internal spawn transaction или hydrate.
- `__INIT` в entity template может содержать только `ENTITY_SPAWNED`.
- Custom events в `__INIT` entity template запрещены.
- Runtime validation должна выдавать ошибку при custom `__INIT` edge в entity template.
- TypeScript должен запрещать custom `__INIT` edge в entity template, если это возможно без ухудшения inference.
- `storage: "instance"` сохраняет текущую поддержку custom `__INIT` events.

### 6.5. Entity spawn

```ts
const machines = {
  movementActor,
  spriteSyncActor,
  projectileActor,
} as const;

const spawn = defineEntitySpawn(machines, spawnEvents)({
  SPAWN_UNIT: (payload) => ({
    id: `unit/${payload.id}`,
    groupTag: "unit",
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
    groupTag: "projectile",
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

- Ключи `machines` используются для typing `defineEntitySpawn(...)`.
- Recipe keys должны совпадать с keys `spawnEvents`.
- Recipe callback payload выводится из `spawnEvents`.
- `defineEntitySpawn(...)` возвращает единый spawn descriptor для `entitiesPlugin({ spawn })`.
- Recipe может вернуть один `EntitySpawnSpec` или массив `EntitySpawnSpec[]`.
- Пустой массив specs разрешен и означает no-op spawn event.
- `EntitySpawnSpec.id` обязателен.
- `EntitySpawnSpec.groupTag` обязателен и типизируется как `string`.
- `EntitySpawnSpec.actors` должен содержать хотя бы один actor row.
- `actors` keys должны быть subset entity actor keys из `machines`.
- `actors` не может ссылаться на domain machine или `storage: "instance"` actor template.
- Actor payload должен проверяться по actor `spawnSchema`.
- Unknown recipe key, unknown actor key, лишнее поле в actor payload и отсутствующее required поле actor payload должны быть TypeScript error.
- Runtime валидирует recipe output до применения spawn transaction: id, groupTag, actor keys, actor payload shape, duplicate ids.
- Duplicate `EntitySpawnSpec.id` против live entity или внутри одного recipe result является ошибкой.
- Spawn transaction атомарна: если один spec невалиден, state не меняется, subscribers/reactions/effects не запускаются.

### 6.6. Manager API

```ts
import { entitiesPlugin } from "@lite-fsm/entities";

const manager = MachineManager(machines, {
  plugins: [
    entitiesPlugin({
      spawn,
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

manager.transition({
  type: "DAMAGE",
  payload: { amount: 10 },
  meta: { entityId: "unit/42" },
});

manager.transition({
  type: "FREEZE",
  meta: { groupTag: "enemy" },
});
```

Требования:

- `entitiesPlugin(...)` принимает `spawn`, созданный через `defineEntitySpawn(machines, spawnEvents)`.
- `entitiesPlugin(...)` является generic factory; plugin capabilities выводятся из `spawnEvents`, сохраненного в `spawn`.
- `entitiesPlugin(...)` регистрирует `storage: "entity"` через `ctx.storage.register(...)`.
- Registered entity storage runtime реализует `StorageRuntimeBase` и capability blocks `effects`, `snapshot`, `identity`, `reactions`.
- `entitiesPlugin(...)` расширяет manager через `manager.entities`.
- `entitiesPlugin(...)` расширяет `manager.transition(...)` type через `SpawnEventsFrom<typeof spawnEvents>`, где `spawnEvents` связан со `spawn`.
- `entitiesPlugin(...)` регистрирует action interceptor для public spawn events.
- Spawn event interceptor создает spawn transaction и продолжает обычную delivery public spawn event в machines.
- Spawn transaction выполняется до public spawn event delivery.
- Spawn event interceptor не возвращает `skipDelivery: true`, если public spawn event должен быть видим machines из `AppEvents`.
- Spawn transaction инициализирует actor rows только через internal `ENTITY_SPAWNED`.
- Public spawn event не является способом заполнения columns из spawn payload.
- `entitiesPlugin(...)` регистрирует route resolver для `meta.entityId`.
- `meta.entityId` принимает `string | readonly string[]`.
- `manager.transition` принимает `AppEvents | SpawnEventsFrom<typeof spawnEvents>`.
- `manager.transition` не принимает `LiteFsmEntityLifecycleEvents`.
- `SPAWN_PROJECTILE` payload проверяется по `spawnEvents`; `TICK` проверяется по `AppEvents`.
- Spawn recipes исполняются только при `manager.transition(spawnEvent)`.
- Hydrate восстанавливает snapshot и не вызывает spawn recipes.

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
      spawn,
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
- `entities` явно входит в `AppDeps`, потому что `TypedCreateMachineFn<AppEvents, AppDeps, EntityMachineExtension>` не знает будущий `MachineManager(machines, ...)`.
- `manager.setDependencies({ entities })` должен получать именно `manager.entities`.
- Если user deps содержит `entities`, не равный `manager.entities`, `entitiesPlugin(...)` бросает clear error через deps extension.
- Core plugin system не хардкодит key `entities`.
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

Package exports:

- `"."` — runtime и type exports.
- `"./react"` — React hooks.
- `"./package.json"` — package metadata.

Обязательные exports:

```ts
entitiesPlugin
defineSpawnEvents
defineEntitySpawn
spawnEvent
type SpawnEventsFrom
f32
i16
i32
u8
string
optional
type EntityId
type EntityIndex
type EntityAccess
type LiteFsmEntityLifecycleEvents
type EntityMachineExtension
```

Требования:

- `@lite-fsm/entities` зависит от plugin system из [`tz-plugin-system.md`](./tz-plugin-system.md).
- `@lite-fsm/entities` экспортирует `LiteFsmEntityLifecycleEvents` как type-only public contract.
- `@lite-fsm/entities` экспортирует `EntityMachineExtension` для `TypedCreateMachineFn`.
- Внутренний storage layout остается columnar.

## 7. Runtime-поведение

### 7.1. Внутренняя архитектура `entitiesPlugin`

`entitiesPlugin(...)` использует plugin system как внешний manager/runtime каркас, но внутри `@lite-fsm/entities` должен иметь собственную storage runtime architecture. Core manager не знает про entity store, columnar layout, generation, spawn recipes, buckets, lifecycle и reactions.

Рекомендуемая структура модулей:

```text
packages/entities/src/
  index.ts
  plugin.ts
  schema.ts
  spawn.ts
  machine-extension.ts

  runtime/
    storage.ts
    compile.ts
    state.ts
    transaction.ts
    routing.ts
    identity.ts
    reduce.ts
    lifecycle.ts
    reactions.ts
    effects.ts
    access.ts
    snapshot.ts

  react/
    index.ts
```

Владельцы:

- `plugin.ts` связывает `entitiesPlugin(...)` с core plugin system: `storage.register("entity", ...)`, `routing.registerMetaKey("entityId", ...)`, spawn action interceptor, scoped deps/transition extensions и `manager.entities`.
- `schema.ts` владеет descriptors и runtime/type-level schema validation.
- `spawn.ts` владеет `defineSpawnEvents`, `spawnEvent`, `SpawnEventsFrom`, `defineEntitySpawn` и recipe typing.
- `machine-extension.ts` владеет `EntityMachineExtension` для `TypedCreateMachineFn`.
- `runtime/storage.ts` собирает `StorageRuntimeBase` и capability blocks `effects`, `snapshot`, `identity`, `reactions` для `storage: "entity"`.
- `runtime/compile.ts` валидирует entity templates и компилирует event/state codes, transition tables, buckets metadata, reactions/effects metadata и `despawnOn`.
- `runtime/state.ts` владеет `EntityStore`, `ColumnarActorStore`, capacity growth, buckets и public lightweight state.
- `runtime/transaction.ts` владеет staged operations одного dispatch: spawn, reduce touches, state transitions, despawn, cleanup и version bumps.
- `runtime/routing.ts` переводит core route constraints в entity indices и reusable batch buffers.
- `runtime/identity.ts` реализует `StorageIdentityRuntime` для entity identity lookup без public `actorId`.
- `runtime/reduce.ts` выполняет default transition, reducer batch invocation и post-reducer validation.
- `runtime/lifecycle.ts` выполняет internal `ENTITY_SPAWNED`, `ENTITY_DESPAWNED`, `despawnOn` и `transition.despawn(...)`.
- `runtime/reactions.ts` реализует `StorageReactionRuntime.run(...)`, выполняет sync reactions и передает non-fatal errors через dispatch `reportError(...)`.
- `runtime/effects.ts` реализует `StorageEffectsRuntime.resolveInvocations(...)` и `StorageEffectsRuntime.invoke(...)` для core-managed effect phase.
- `runtime/access.ts` создает root и scope-bound `EntityAccess`/store views.
- `runtime/snapshot.ts` реализует `StorageSnapshotRuntime.dehydrate(...)` и `StorageSnapshotRuntime.hydrate(...)` для `snapshot.storage.entity`.

Внутренний pipeline entity storage runtime:

1. **Compile.** Валидирует `storage: "entity"` config, `spawnSchema`, `initialContext`, `__INIT`, `despawnOn`, reactions/effects и компилирует numeric metadata.
2. **Transaction prepare.** На каждый public dispatch создает entity transaction в `DispatchContext`; spawn interceptor stage-ит spawn operations, но не мутирует live runtime state.
3. **Route and batch.** По normalized route constraints выбирает entity indices и actor rows, формирует `self.indices` из state buckets или reusable scratch buffers.
4. **Reduce.** Для каждого accepted actor template применяет default transition, вызывает reducer один раз на batch, валидирует `stateCode` и собирает touched rows.
5. **Lifecycle.** Выполняет staged spawn через internal `ENTITY_SPAWNED`, explicit despawn, `despawnOn` и internal `ENTITY_DESPAWNED`; lifecycle events не выходят в public dispatch pipeline.
6. **Commit.** Применяет staged column/state/presence changes, обновляет buckets, `rowVersion`, actor `version` и public lightweight slices.
7. **Reactions.** `StorageReactionRuntime.run(...)` выполняет sync reactions после reducer/lifecycle processing и до subscribers; `ENTITY_DESPAWNED` reactions видят columns до окончательного cleanup.
8. **Effects.** `StorageEffectsRuntime.resolveInvocations(...)` создает captured invocations с `entityIndex + generation`; core вызывает `StorageEffectsRuntime.invoke(...)` в общей effect phase после subscribers и middleware post-`next`.

Требования:

- Core plugin system задает только внешний lifecycle, routing meta, storage runtime base/capability contracts, commit/subscribers/effects boundary и deps extension pipeline.
- Entity runtime не реализует middleware, subscribers или committed public action stream API.
- Entity lifecycle events остаются внутри `runtime/lifecycle.ts` и storage-specific reducer/reaction/effect invocation context.
- Internal modules не должны обращаться к public `MachinesState` как source of truth для columns.
- Hot path не должен идти через `plugin.ts`; он работает через compiled runtime metadata и storage-owned runtime state.
- Реализация не должна складываться в один монолитный orchestrator; validate, transform и mutate остаются отдельными владельцами.

### 7.2. Columnar data model runtime

Entity runtime storage является manager-owned runtime state, а не набором object-per-actor records в public `MachinesState`.

Требования:

- Entity actor columns читаются через `manager.entities` или scoped `entities`.
- `manager.getState()` не является source of truth для per-row entity columns.
- `MachinesState<typeof machines>` сохраняет type metadata для `EntityAccess<AppState>`.
- Public state slice for `storage: "entity"` is a lightweight read model, not full column data.

```ts
type EntityMachineState<Metadata> = {
  storage: "entity";
  version: number;
  count: number;
  capacity: number;
};
```

Требования к public state:

- Каждый entity actor template имеет собственный public slice.
- `version` увеличивается при committed изменениях actor store: row create, row despawn/collapse, state change, accepted reducer rows, hydrate invalidation.
- `count` равен количеству present rows для этого actor template.
- `capacity` отражает текущую capacity actor store.
- Runtime state columns не попадают в `manager.getState()`.

```ts
type EntityStore = {
  count: number;
  capacity: number;
  ids: string[];
  indexById: Record<string, EntityIndex>;
  alive: Uint8Array;
  generation: Uint32Array;
  groupTagByIndex: string[];
  freeList: EntityIndex[];
  version: number;
};
```

Требования к `EntityStore`:

- `ids[entityIndex]` возвращает `entityId`.
- `indexById[entityId]` возвращает `entityIndex`.
- `alive[entityIndex]` показывает наличие entity.
- `generation[entityIndex]` инкрементируется при повторном использовании slot.
- `groupTagByIndex[entityIndex]` хранит `groupTag` из spawn spec.
- `freeList` хранит свободные slots для повторного использования.
- Captured effect/reaction scopes сохраняют `entityIndex` и `generation`.
- Capacity растет автоматически.

```ts
type ColumnarActorStore<Schema> = {
  templateKey: string;
  capacity: number;
  count: number;
  version: number;
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
- `rowVersion[entityIndex]` инкрементируется при create/despawn row и при accepted reducer rows.
- После каждого accepted reducer call runtime считает все `self.indices` измененными.
- `version` actor store увеличивается, если `self.indices.length > 0` или lifecycle operation изменила store.
- `stateBuckets[stateCode]` хранит dense list entity indices для rows в конкретном state.
- `statePosition[entityIndex]` хранит позицию entity внутри текущего `stateBuckets[stateCode]`.
- Переход state обновляет `stateBuckets` через swap-remove.
- `acceptedScratch` и `enteredScratchByState` переиспользуются между dispatch и не создают allocations in hot path.
- Actor store view предоставляет `has(entity)`.
- Scoped actor store view `has(entity)` проверяет `presence`, current entity generation и captured generation.
- Public API предоставляет `self.has(entity)` и `entities.get("actorKey").has(entity)`.
- Разработчик не обязан читать `presence` напрямую.

### 7.3. Schema descriptors

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
  [Key in keyof Schema]: Schema[Key] extends EntityFieldDescriptor<any, any, infer SpawnValue> ? SpawnValue : never;
};

type EntityColumns<Schema extends EntitySchema> = {
  [Key in keyof Schema]: Schema[Key] extends EntityFieldDescriptor<any, infer Column, any> ? Column : never;
};

type SchemaValue<Schema extends EntitySchema> = {
  [Key in keyof Schema]: Schema[Key] extends EntityFieldDescriptor<infer Value, any, any> ? Value : never;
};
```

Требования:

- Numeric descriptors используют typed arrays.
- `string()` использует string array.
- `optional(...)` поддерживает nullable values только в `spawnSchema`.
- `optional(...)` запрещен в entity `initialContext`.
- `initialContext` descriptors всегда non-nullable.
- `opts.default` задает default value только для `initialContext`.
- Отсутствие default означает `0` для numeric и `""` для string.
- Все поля `spawnSchema` обязательны по ключу.
- Defaults в `spawnSchema` запрещены как invalid config, чтобы не создавать ожидание runtime defaulting.
- Если nullable spawn payload нужен, используется `optional(inner)`; ключ payload остается required, value type становится `T | null`.
- Descriptors несут phantom types для value type, column type и spawn payload type.
- `spawnSchema` выводится в `EntitySpawnPayload<typeof spawnSchema>`.
- `initialContext` выводится в `EntityColumns<typeof initialContext>` для `self`/`entities` store views.
- `initialContext` также выводится в serializable `SchemaValue<typeof initialContext>` для snapshot/read API.
- Nested objects, arrays, `Map` и `Set` запрещены.
- Reserved column names запрещены: `count`, `capacity`, `ids`, `indexById`, `alive`, `generation`, `freeList`, `stateCode`, `version`, `columns`, `presence`, `rowVersion`, `indices`, `states`.

### 7.4. Compiled metadata и performance

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
- Proxy-based view wrappers не используются в MVP.
- Runtime diagnostics, если включены, выполняются на scope/view boundary, а не на каждом column access.
- Entity reducer loops работают по typed arrays и numeric entity indices.
- Routing по `entityId` делает lookup до hot loop.
- Routing по `groupTag` использует indexes по entity groupTag.
- Bulk operations используют contiguous/reused buffers.

Минимальная целевая сложность:

- Broadcast `TICK`: `O(sum accepted alive rows by accepted templates)`.
- Entity-routed event: `O(actor rows attached to routed entities)`.
- GroupTag-routed event: `O(actor rows attached to routed entities in target groups)`.
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

### 7.5. Reducer API

```ts
type EntitySelf<Schema, States> = {
  readonly indices: ReadonlyArray<EntityIndex>;
  readonly states: Record<States, number>;
  readonly prevStateCode: Readonly<Uint8Array>;

  readonly presence: Uint8Array;
  stateCode: Uint8Array;
  rowVersion: Uint32Array;

  has(entity: EntityIndex): boolean;
  entityId(entity: EntityIndex): string;

  // schema columns are exposed as direct fields
};
```

Требования:

- `self.indices` содержит только rows, подходящие по presence, state, event и routing.
- Reducer не проверяет `self.has(entity)` для `entity` из `self.indices`.
- Reducer может мутировать только `self`.
- Reducer не мутирует foreign actor stores.
- Mutations foreign actor stores выполняются через events.
- После reducer runtime bump-ит `rowVersion` для всех `self.indices`.

```ts
type EntityReducerContext<SpawnSchema extends EntitySchema> = {
  payloadFor(entity: EntityIndex): EntitySpawnPayload<SpawnSchema>;
};
```

Требования к `payloadFor`:

- `payloadFor(entity)` всегда есть в reducer context.
- `payloadFor(entity)` возвращает actor-specific payload из spawn recipe только на `ENTITY_SPAWNED`.
- Для обычных public events `payloadFor(entity)` бросает clear error.
- `payloadFor` не используется для batch public event payload mapping в MVP.
- Return type выводится из actor `spawnSchema`.

```ts
type EntityAccess<AppState> = {
  get<K extends EntityActorKey<AppState>>(key: K): EntityActorStoreViewFor<AppState, K>;

  maybe<K extends EntityActorKey<AppState>>(key: K): EntityActorStoreViewFor<AppState, K>;
};
```

Требования к `entities`:

- `entities.get("actorKey")` является required access.
- `entities.maybe("actorKey")` является optional access.
- `actorKey` типизируется по entity actor keys из `AppState`.
- Unknown `actorKey` должен быть TypeScript error.
- Return type выводится из `initialContext` actor template.
- `createMachine` result для `storage: "entity"` несет phantom metadata по `initialContext`, `spawnSchema` и allowed lifecycle events.
- `MachinesState<typeof machines>` сохраняет enough metadata для `EntityAccess<AppState>`.
- `EntityAccess<AppState>` строит key union только из machines с `storage: "entity"`.
- `manager.entities` является dependency value, а effect/reaction получает scope-bound view этого accessor.
- `entities.get(...)` валидирует required access при вызове `get(...)` для текущего captured scope, если включены runtime diagnostics.
- Validation проверяет, что каждая entity из текущего `self.indices` имеет requested actor row.
- Validation error содержит source actor, event type, requested actor key и entity id.
- `entities.get(...)` validation учитывает captured `entityIndex + generation`, чтобы stale async scope не прочитал новую entity в переиспользованном slot.
- `entities.maybe(...)` не валидирует наличие actor row.
- Optional access требует проверки `store.has(entity)` перед чтением actor columns.
- `entities.get(...)` и `entities.maybe(...)` возвращают read-only typed store views в effects/reactions.
- Runtime не реализует Proxy-based protection для чтения колонок или защиты от мутаций в MVP.
- `self` остается единственным mutable store view в reducer.
- `entities` не является `entities.<templateKey>` object shape.
- `entities` не гарантирует compile-time наличие actor row в каждом spawn recipe.
- Отсутствие required actor row обнаруживается runtime validation, когда diagnostics включены.

### 7.6. Default transition policy

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

### 7.7. Effects API

```ts
effects: {
  LOAD_ASSET_PENDING: async ({ self, assets, transition }) => {
    await assets.loadFor(self.indices);
    transition.entity(self.entityId(self.indices[0]), { type: "ASSET_LOADED" });
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
- После `await` доступ читает current committed store для captured scope.
- Если entity/actor row из captured scope удалена или slot переиспользован до resume effect, `entities.get(...)` в `IS_DEV` бросает stale scope/missing row error.
- `entities.maybe(...)` после `await` возвращает view, где `store.has(entity)` отражает current presence.
- Production build не обязан выполнять full required-access validation для `entities.get(...)`.
- Async effect, который читает columns после `await`, должен проверять `self.has(entity)` / `store.has(entity)`, если entity могла быть удалена.
- `entities.get(...)` и `entities.maybe(...)` должны вызываться вне per-entity loops.
- Mutation из effect запрещена.
- Effect выполняет mutation только через `transition(...)`.
- `transition(action)` внутри entity effect является unscoped by default.
- `transition.entity(entityId | readonly entityId[], action)` доставляет action actor rows указанной entity или entities.
- `transition.tag(groupTag | readonly groupTag[], action)` доставляет action entity rows указанной entity groupTag.
- `transition.actor(actorId | readonly actorId[], action)` является escape hatch для существующих `storage: "instance"` actors и не адресует entity actor rows.
- `transition.despawn(...)` доступен в entity effect через plugin-provided transition extension.
- В entity effect `transition.despawn(...)` принимает entity ids или entity indices из captured scope.
- Вне entity scope `transition.despawn(...)` принимает только entity ids; raw `EntityIndex` недоступен или бросает clear error.
- Для stale async scope `transition.despawn(self.indices)` проверяет captured generation.
- `transition.entities(...)` не входит в MVP.
- `transition.unscoped(...)` не требуется в entity surface, потому что `transition(action)` уже unscoped.
- Wildcard `*` effects, `condition()`, per-row `bag` и `createEffect("latest")` в entity MVP не поддерживаются.

### 7.8. Reactions API

`reactions` — синхронный post-reducer слой для интеграции committed entity actor state с внешними runtime dependencies.

```ts
export const spriteSyncActor = createMachine({
  storage: "entity",
  initialState: "__INIT",
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
  initialContext: {
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
- Reaction является частью `StorageReactionRuntime` capability, а не generic dispatch hook.
- Reaction error semantics не наследуют fail-fast contract generic dispatch hooks.
- Reaction привязан к accepted event, а не к enter-state.
- Reaction вызывается один раз на actor template per accepted event.
- Reaction получает `self.indices` rows, которые приняли event по `config` и routing.
- Reaction выполняется синхронно; Promise return передается через dispatch `reportError(...)` в `onError` как contract violation, если runtime может надежно определить Promise return, и не await-ится.
- `self` и `entities` read-only в reaction.
- Read-only является TypeScript/runtime view contract; Proxy-based mutation traps не входят в MVP.
- `entities.get(...)` и `entities.maybe(...)` доступны в reaction через scoped deps extension поверх `AppDeps`.
- `entities.get(...)` и `entities.maybe(...)` должны вызываться вне per-entity loops.
- State mutation из reaction запрещена.
- `transition(...)` и `transition.despawn(...)` из reaction запрещены в MVP.
- Reaction может читать user deps и вызывать sync methods внешних deps.
- Reactions для `ENTITY_DESPAWNED` выполняются до удаления actor rows из storage.
- Runtime ловит ошибку каждой reaction и передает ее через dispatch `reportError(...)`, который вызывает `onError`.
- Ошибка reaction не откатывает reducer result.
- Ошибка reaction не отменяет subscribers.
- Ошибка reaction `ENTITY_DESPAWNED` не отменяет collapse/despawn cleanup.
- После ошибки одной reaction runtime продолжает обязательные lifecycle cleanup phases.

Фазовый контракт:

- Reducers выполняются раньше reactions.
- `despawnOn` lifecycle processing выполняется раньше reactions исходного event.
- Reactions internal `ENTITY_DESPAWNED` выполняются до collapse удаляемых rows.
- Subscribers вызываются после sync reactions.
- Enter-state effects вызываются после subscribers.

### 7.9. Despawn

```ts
transition.despawn(self.indices);
transition.despawn("projectile/arrow-1");
```

Требования:

- `transition.despawn(...)` доступен только в entity effects.
- Public `manager.despawn(...)` не входит в MVP.
- External despawn выражается обычным event + `meta.entityId`/`meta.groupTag` и actor config/reducer behavior.
- Despawn operation находит все actor rows attached к entity.
- Runtime доставляет scoped `ENTITY_DESPAWNED` всем attached actor rows.
- Actor config обрабатывает `ENTITY_DESPAWNED`.
- Terminal actor rows удаляются после commit.
- Entity удаляется из `EntityStore`, когда у нее не остается actor rows.

```ts
export const projectileActor = createMachine({
  storage: "entity",
  initialState: "__INIT",
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
  spawnSchema: {
    ticksLeft: i32(),
    damage: i32(),
  },
  initialContext: {
    ticksLeft: i32({ default: 0 }),
    damage: i32({ default: 0 }),
  },
  reducer: (self, action, { payloadFor }) => {
    switch (action.type) {
      case "ENTITY_SPAWNED":
        for (const entity of self.indices) {
          const spawn = payloadFor(entity);
          self.ticksLeft[entity] = spawn.ticksLeft;
          self.damage[entity] = spawn.damage;
        }
        return;

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
- Entity despawn вызывается через `despawnOn`, `transition.despawn(...)` или hydrate/reconcile.

### 7.10. Пайплайн dispatch runtime

Для обычного `manager.transition(action)` entity storage runtime выполняет storage-specific phases, а kernel manager сохраняет общие фазы subscribers и effects:

1. Переводит `action.type` в `eventCode`.
2. Получает templates из `templatesByEventCode[eventCode]`.
3. Для каждого template получает accepted state buckets.
4. Формирует `self.indices` из bucket или reusable scratch buffer.
5. Применяет default transitions.
6. Вызывает reducer один раз на template.
7. Обновляет `stateBuckets`, `statePosition`, `rowVersion`, actor store `version`.
8. Собирает rows, вошедшие в states из `despawnOn`.
9. Выполняет internal despawn processing для собранных entity.
10. Выполняет reactions для internal `ENTITY_DESPAWNED`.
11. Выполняет collapse terminal rows.
12. Коммитит staged entity storage changes.
13. Выполняет reactions исходного event для rows, оставшихся alive/present.
14. Kernel manager уведомляет subscribers.
15. Kernel manager запускает enter-state effects через `StorageEffectsRuntime`.

Требования:

- Per-template reducer/reaction order соответствует registration order `machines`.
- Rows, удаленные через `despawnOn`, не попадают в reactions исходного event.
- Reactions `ENTITY_DESPAWNED` видят columns до удаления rows.
- Effects не запускаются для rows, удаленных через `despawnOn` до effect phase.
- Event pipeline не создает allocations на `TICK`.
- Reactions исходного event выполняются через `StorageReactionRuntime.run(...)` после commit и до subscribers.
- Entity enter-state effects выполняются через `StorageEffectsRuntime.resolveInvocations(...)` / `invoke(...)` в core-managed effect phase.
- Subscribers не видят частично созданные entities.
- Subscribers не видят rows, запланированные на despawn через `despawnOn`.
- Reactions исходного event видят committed state после lifecycle processing.

### 7.11. Spawn event pipeline

При `manager.transition({ type: "SPAWN_PROJECTILE", payload })` entity storage runtime выполняет storage-specific spawn phases, а kernel manager сохраняет общие фазы subscribers и effects:

1. Принимает public spawn event.
2. Переводит `action.type` в `eventCode`.
3. Находит payload type по `spawnEvents`.
4. Находит recipe внутри `spawn`.
5. Вызывает recipe.
6. Валидирует все returned specs.
7. Выделяет `entityIndex`.
8. Регистрирует `entityId`, `groupTag` и alive flag.
9. Создает actor rows из `EntitySpawnSpec.actors`.
10. Выставляет `presence[entityIndex] = 1` для каждого actor store.
11. Выставляет `stateCode[entityIndex] = code("__INIT")`.
12. Добавляет row в `stateBuckets[__INIT]`.
13. Сохраняет actor-specific spawn payload.
14. Доставляет scoped internal `ENTITY_SPAWNED` созданным actor rows.
15. Применяет default `__INIT -> target` transition.
16. Вызывает reducers созданных actor templates.
17. Обновляет state buckets, rowVersion и public versions.
18. Обрабатывает public spawn event всеми machines/templates, которые принимают этот event, включая только что созданные entity rows, если они типизированы на `SpawnEvents`.
19. Коммитит spawned entity storage changes.
20. Выполняет reactions для internal `ENTITY_SPAWNED` и для public spawn event rows, если они приняли этот event.
21. Kernel manager уведомляет subscribers.
22. Kernel manager запускает enter-state effects через `StorageEffectsRuntime`.

Требования:

- Фазы создания entity и actor rows выполняются transactionally.
- Subscribers и effects не видят частично созданную entity.
- Internal `ENTITY_SPAWNED` не выходит в public `transition`.
- Public spawn event delivery выполняется после internal `ENTITY_SPAWNED`, поэтому machines, которые явно включили `SpawnEvents` в `AppEvents`, видят уже созданные rows.
- Только что созданные rows получают public spawn event в том же dispatch, если их current state после `ENTITY_SPAWNED` принимает этот event.
- Если recipe вернул пустой массив specs, public spawn event все равно доставляется существующим machines/templates, которые принимают этот event.
- Public spawn event остается public event для middleware, subscribers и committed public action stream, если такие интеграции включены.
- Spawn recipes не вызываются при hydrate.

### 7.12. Routing

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
  entityId?: string | readonly string[];
}
```

Требования:

- `meta.entityId` типизируется через `entitiesPlugin` action meta extension.
- `meta.entityId` route resolver регистрирует plugin-owned route constraint и не мутирует entity runtime state.
- Entity storage runtime использует route constraint `entityId` и доставляет event всем actor rows указанной entity.
- `groupTag` route доставляет event всем entity rows, принадлежащим entities с matching `EntitySpawnSpec.groupTag`, а также сохраняет текущее поведение для `storage: "instance"` actor groups.
- Доставляются только rows, чей current state принимает event.
- Priority routing следует core plugin system: `actorId > registered plugin route keys в порядке регистрации > groupId > groupTag > unscoped`.
- Если `entityId` является единственным registered plugin route key, фактический priority: `actorId > entityId > groupId > groupTag > unscoped`.
- `actorId` и `groupId` routes адресуют только `storage: "instance"` actor runtime в MVP.
- Public `actorId` routing к entity actor rows не поддерживается.
- Unknown `entityId` не создает actor rows.
- Unknown `groupTag` не создает actor rows.

Entity runtime sidecar:

```ts
type EntityActorRuntime = {
  kind: "entity";
  templateKey: string;
  entityId: string;
  entityIndex: EntityIndex;
  generation: number;
};
```

Требования:

- Entity actor runtime не имеет public `actorId`.
- Entity actor runtime не имеет `bag`.
- Hydrate пересобирает entity sidecar из `ids`, `alive` и actor store `presence`.
- Despawn/collapse обновляет sidecar.

## 8. TypeScript-типизация

```ts
type EntityMachineExtension<
  ContextSchema extends EntitySchema = EntitySchema,
  SpawnSchema extends EntitySchema = EntitySchema,
> = {
  storage: "entity";
  internalEvents: LiteFsmEntityLifecycleEvents;
  input: {
    storage: "entity";
    initialState: "__INIT";
    initialContext: ContextSchema;
    spawnSchema: SpawnSchema;
    despawnOn?: string | readonly string[];
    reactions?: EntityReactions<ContextSchema>;
  };
  reducerContext: EntityReducerContext<SpawnSchema>;
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
- `EntityMachineExtension` сохраняет `initialContext` и `spawnSchema` как phantom metadata в result type каждого entity actor template.
- Extension metadata используется `MachinesState<typeof machines>` и `EntityAccess<AppState>`.
- `storage: "entity"` actor template типизируется только при подключенной extension.
- `manager.entities` доступен только если установлен `entitiesPlugin(...)`.
- `manager.transition(...)` принимает spawn events только из `spawnEvents`, связанного со `spawn` текущего `entitiesPlugin(...)`.
- `manager.transition(...)` не принимает lifecycle events.
- `defineEntitySpawn(...)` проверяет keys, payloads и required fields на уровне TypeScript.

## 9. Snapshot, hydrate и совместимость

Snapshot envelope получает top-level `storage`:

```ts
type EntitySnapshot = {
  entities: {
    ids: string[];
    alive: number[];
    generation: number[];
    groupTagByIndex: string[];
    freeList: number[];
    version: number;
  };
  actors: {
    [templateKey: string]: {
      presence: number[];
      stateCode: number[];
      rowVersion: number[];
      version: number;
      count: number;
      columns: Record<string, number[] | string[]>;
    };
  };
};

type MachineManagerSnapshotWithEntityStorage = {
  schemaVersion?: number;
  machines: Record<string, unknown>;
  storage?: {
    entity?: EntitySnapshot;
  };
};
```

Требования:

- Entity storage runtime регистрирует `snapshot` capability.
- `dehydrate()` включает `storage.entity`, если manager содержит `storage: "entity"` runtime с `snapshot` capability.
- `dehydrate({ storage: ["entity"] })` вызывает `StorageSnapshotRuntime.dehydrate(...)` и выгружает entity storage атомарно целиком.
- `dehydrate({ machines })` и `dehydrate({ storage })` являются независимыми filters.
- Partial export/import entity storage не входит в MVP.
- Snapshot serializes `EntityStore`, `generation`, `freeList`, entity `version`, every entity actor store и `rowVersion`.
- Typed arrays convert to plain arrays.
- Hydrate `storage.entity` идет через `StorageSnapshotRuntime.hydrate(...)` и восстанавливает `EntityStore` и actor stores.
- Hydrate validates `ids`, `alive`, `generation`, `groupTagByIndex` and `freeList` length consistency before applying snapshot.
- Hydrate пересобирает `indexById` и entity sidecar.
- Hydrate validates schema compatibility before applying snapshot.
- Hydrate with old snapshot missing `generation` must initialize `generation` to `0` for alive rows and rebuild `freeList` from `alive`.
- Hydrate with old snapshot missing actor `rowVersion` must rebuild row versions from current manager version.
- Hydrate `storage.entity` является replace-only в MVP независимо от `strategy`.
- Если snapshot содержит `storage.entity`, hydrate атомарно заменяет entity runtime state.
- Если snapshot не содержит `storage.entity`, существующий entity runtime state остается без изменений.
- Hydrate replace invalidates all restored rows by assigning fresh `rowVersion` values.
- Hydrate replace bumps template `version` for restored actor stores.
- Snapshot `rowVersion` can be used as debug/import metadata, but React cache correctness relies on hydrate invalidation policy, not trusting remote `rowVersion`.
- JSON round-trip must restore equivalent state.
- Routing по `entityId` и `groupTag` должен работать после hydrate.
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

## 10. Этапы реализации

Перед началом каждого этапа фиксируется его контракт: какие public API, runtime-поведение, типы, диагностика, гарантии React-слоя чтения, snapshot/hydrate и обратная совместимость меняются именно в этом этапе. Реализация идет строго последовательно: этап N полностью доводится до приемки и тестового gate, только после этого начинается этап N+1.

Обязательный порядок внутри каждого этапа:

1. Уточнить scope этапа по блокам «Область работ», «Вне области работ» и «Критерии приемки».
2. Внести минимальные изменения реализации только для этого scope.
3. Добавить или обновить тесты для всех измененных контрактов этапа: runtime-поведение, типовой API, диагностика, lifecycle, routing, snapshot/hydrate, React subscriptions, benchmarks и обратная совместимость.
4. Обновить тесты, которые проверяли удаленные или измененные внутренние функции, только если эти функции больше не являются владельцами поведения после рефакторинга. Такие проверки должны быть заменены тестами нового владельца поведения или тестами публичного контракта.
5. Запустить точечные проверки для затронутых пакетов и тестовых наборов этапа. Исправлять только падения, вызванные текущим этапом, и не начинать несвязанную чистку тестов.
6. После точечных проверок запустить полный набор проверок для измененных пакетов: runtime tests, type tests, `check-types` и lint, если они затрагиваются этапом. Сборка документации не является gate для этого ТЗ.
7. Зафиксировать 100% coverage по statements, branches, functions и lines для нового и измененного кода этапа. Этап не считается завершенным, если покрытие достигнуто формально, но не покрыты все сценарии использования, перечисленные в критериях приемки, error semantics, lifecycle/routing/snapshot policies и гарантиях совместимости.

Существующие тесты поведения являются регрессионным контрактом и не должны падать. Если после рефакторинга падает тест, который проверяет прежнюю внутреннюю функцию напрямую, тест обновляется под нового владельца поведения; если он проверяет пользовательское поведение, исправляется реализация, а не тест.

### Этап 1 — Пакет entities и базовый entity runtime

Цель этапа: создать `@lite-fsm/entities`, подключить `storage: "entity"` через plugin system и реализовать compile/type surface без public spawn events и entity spawn API.

**Область работ.**

- Добавить `@lite-fsm/entities`.
- Добавить `entitiesPlugin(...)`.
- Добавить `EntityMachineExtension`.
- Зарегистрировать `storage: "entity"` через plugin system.
- Реализовать `runtime/storage.ts`, который собирает `StorageRuntimeBase` и capability blocks entity runtime.
- Зарегистрировать entity action meta и route resolver для `meta.entityId`.
- Зарегистрировать entity scoped deps и transition extensions.
- Реализовать schema descriptors и type-level mapping `EntitySchema -> EntitySpawnPayload/EntityColumns/SchemaValue`.
- Реализовать compile metadata для entity templates.
- Реализовать пустые `EntityStore`, `ColumnarActorStore`, public lightweight state, `manager.entities`, `entities.get(...)`, `entities.maybe(...)`.

**Вне области работ.**

- System lifecycle events.
- Реальные spawn transactions.
- Public spawn events и entity spawn API.
- Reactions.
- Snapshot/hydrate.
- React hooks.
- Benchmarks.
- Examples.

**Критерии приемки.**

- Bundle `@lite-fsm/core` не включает `@lite-fsm/entities`.
- `storage: "entity"` without `entitiesPlugin(...)` throws clear init error through plugin system.
- `storage: "entity"` типизируется только когда wrapper использует `EntityMachineExtension`.
- `initialContext` and `spawnSchema` metadata are preserved in `MachinesState<typeof machines>`.
- `self` and `entities.get("actorKey")` column views are inferred from actor `initialContext`.
- `entities.get("unknownActor")` является TypeScript error.
- `entities.get("actorKey")` reports clear required-access error when runtime diagnostics are enabled and current scope contains an entity without requested actor row.
- `entities.maybe("actorKey")` allows optional actor row access through `store.has(entity)`.

### Этап 2 — System lifecycle events и internal spawn/despawn

Цель этапа: подключить scoped lifecycle events, internal spawn transaction и despawn behavior без расширения public `AppEvents`.

**Область работ.**

- Добавить и экспортировать `LiteFsmEntityLifecycleEvents` из `@lite-fsm/entities`.
- Подключить `LiteFsmEntityLifecycleEvents` к `EntityMachineExtension`.
- Разрешить `ENTITY_SPAWNED` в entity `__INIT`.
- Разрешить `ENTITY_DESPAWNED` в active states entity templates.
- Запретить public transition lifecycle events.
- Запретить custom `__INIT` events в entity templates.
- Реализовать internal spawn transaction primitive.
- Реализовать `payloadFor(entity)` для `ENTITY_SPAWNED`.
- Реализовать `despawnOn`.
- Реализовать `transition.despawn(...)`.

**Вне области работ.**

- Public spawn events и entity spawn API.
- Public manager spawn/despawn APIs.
- Reactions.
- Snapshot/hydrate.
- React hooks.

**Критерии приемки.**

- Entity actor template стартует только через `ENTITY_SPAWNED`.
- `ENTITY_SPAWNED` и `ENTITY_DESPAWNED` типизируются в entity machine config/reducer/reactions без добавления в `AppEvents`.
- Custom `__INIT` event в entity template не проходит validation.
- `payloadFor(entity)` return type is inferred from actor `spawnSchema`.
- `payloadFor(entity)` throws outside `ENTITY_SPAWNED`.
- `despawnOn: "EXPIRED"` despawns whole entity in the same dispatch.
- Owner actor state listed in `despawnOn` does not require `ENTITY_DESPAWNED` edge.
- Enter-state effects for `despawnOn` states are not called.
- Despawn one entity sends scoped `ENTITY_DESPAWNED` to its actor rows.
- Global broadcast `ENTITY_DESPAWNED` невозможен через public transition.

### Этап 3 — Spawn events и entity spawn

Цель этапа: добавить public spawn events, typed recipes и transition typing поверх `entitiesPlugin(...)`.

**Область работ.**

- Добавить `defineSpawnEvents`.
- Добавить `spawnEvent<T>()`.
- Добавить `SpawnEventsFrom<TSpawnEvents>`.
- Добавить `defineEntitySpawn(machines, spawnEvents)`.
- Добавить `entitiesPlugin({ spawn })`.
- Типизировать `manager.transition` как `AppEvents | SpawnEventsFrom<typeof spawnEvents>`.
- Добавить validation для duplicate id, empty actors и transaction atomicity.
- Добавить benchmarks для entity runtime.

**Вне области работ.**

- Reactions.
- Snapshot/hydrate.
- React hooks.
- Examples beyond minimal fixtures.

**Критерии приемки.**

- Spawn event payload types выводятся из `spawnEvents`.
- Recipe keys ограничены ключами `spawnEvents`.
- Recipe actor keys ограничены entity actor keys из `machines`.
- Recipe actor payload проверяется по `spawnSchema`.
- Public spawn event создает entity transaction до public event delivery.
- Machines видят spawn events только когда разработчик включает `SpawnEvents` в `AppEvents`.
- `manager.transition` принимает spawn events, даже если `AppEvents` их не включает.
- Bulk spawn 10000 entities works through public spawn event recipes.
- `TICK` updates rows in one reducer call per template.
- Dispatch uses numeric event/state codes in hot path.
- `TICK` does not scan templates that do not accept `TICK`.
- `TICK` does not allocate per frame.
- State transition updates buckets in `O(1)`.
- Benchmark acceptance from section 7.4 passes in production build.

### Этап 4 — Reactions

Цель этапа: добавить sync reaction layer для entity actors без создания дополнительных public events.

**Область работ.**

- Добавить entity-runtime-only `reactions`.
- Компилировать reactions по `eventCode`.
- Запускать reactions после reducers и lifecycle processing.
- Запускать reactions `ENTITY_DESPAWNED` до collapse.
- Поддержать `entities.get(...)` и `entities.maybe(...)` внутри reactions через scoped deps extension.
- Требовать sync-only reactions.
- Требовать read-only `self/entities` в reactions.
- Запретить `transition(...)` из reactions в MVP.

**Вне области работ.**

- Async reactions.
- Reactions для `storage: "instance"`.
- Public event emission из reactions.
- Snapshot/hydrate.

**Критерии приемки.**

- `spriteSyncActor.reactions.TICK` может синхронизировать sprites через `entities.get("movementActor")` без `SYNC_PENDING`.
- Reaction, вернувший Promise, передает contract violation через dispatch `reportError(...)` в `onError`, если runtime может надежно определить Promise return.
- Mutation `self/entities` из reaction запрещена контрактом и типами; Proxy-based runtime traps не входят в MVP.
- Reaction `ENTITY_DESPAWNED` может читать columns до удаления row.
- Ошибка reaction передается через dispatch `reportError(...)` в `onError` и не блокирует subscribers или despawn collapse.
- Reactions не создают public events.

### Этап 5 — Snapshot/hydrate

Цель этапа: добавить serializable entity storage snapshot и hydrate policy, совместимую с rowVersion-based read layer.

**Область работ.**

- Реализовать format `snapshot.storage.entity`.
- Сериализовать `generation`, `freeList`, entity `version`, actor store `version` и actor `rowVersion`.
- Реализовать hydrate replace-only strategy для `storage.entity`.
- Реализовать hydrate rowVersion invalidation policy.
- Пересобирать sidecar на hydrate.
- Валидировать schema перед применением snapshot.
- Поддержать JSON round-trip.

**Вне области работ.**

- Реализация React hooks.
- Devtools UI.
- Partial export/import entity storage.

**Критерии приемки.**

- `dehydrate -> JSON.stringify -> JSON.parse -> hydrate` восстанавливает entities и actor rows.
- Routing по `entityId` работает после hydrate.
- Routing по `groupTag` работает после hydrate.
- Column values восстанавливаются.
- Entity `generation` и `freeList` восстанавливаются или пересобираются из legacy snapshot.
- React row caches invalidated для восстановленных rows.

### Этап 6 — React entity hooks

Цель этапа: добавить granular React read layer для entity rows без rerender unrelated consumers.

**Область работ.**

- Добавить `@lite-fsm/entities/react`.
- Реализовать `useEntitySnapshot`.
- Реализовать `useEntityCount`.
- Реализовать `useEntityList`.
- Реализовать rowVersion cache.

**Вне области работ.**

- Импорт entity hooks из обычного `@lite-fsm/react`.
- Editor prefab UI.
- Renderer-specific integrations.

**Критерии приемки.**

- Row consumer rerender-ится только при изменении своего row.
- Count consumer rerender-ится при изменении count.
- List consumer rerender-ится согласно list/filter changes.
- Обычный `@lite-fsm/react` не импортирует entity hooks.

### Этап 7 — Examples

Цель этапа: добавить reference examples для `@lite-fsm/entities`, которые демонстрируют финальную composition model, spawn recipes, lifecycle и reactions без привязки к graph/devtools UI.

**Область работ.**

- Добавить `packages/entities/README.md` с минимальным примером `defineSpawnEvents`, `spawnEvent`, `defineEntitySpawn`, `entitiesPlugin({ spawn })` и `manager.entities`.
- Добавить один runnable example fixture с `movementActor`, `projectileActor`, `spriteSyncActor`, `TICK`, spawn projectile/unit и `despawnOn` в виде файла в пакете.
- Показать явный `AppDeps` с `entities: EntityAccess<AppState>` и `manager.setDependencies({ entities: manager.entities, ... })`.
- Показать `reactions` для sprite sync через `entities.get("movementActor")`, без дополнительного public sync event.
- Добавить snippets для schema descriptors: `f32`, `i32`, `string`, `optional(...)`, разница между `spawnSchema` и `initialContext`.

**Вне области работ.**

- Полноценные docs pages в `apps/docs`.
- Devtools UI.
- Editor prefab UI.
- Graph visualizer UI.

**Критерии приемки.**

- Examples используют spawn events, а не public `manager.spawn(...)`.
- Examples используют `groupTag` в `EntitySpawnSpec`.
- Examples используют `reactions` для sprite sync.
- Examples не используют public routing по `actorId` для entity rows.

## 11. Тестовые ожидания

- Coverage является обязательным gate: новый и измененный код должен иметь 100% покрытие по statements, branches, functions и lines. Исключения запрещены без отдельного изменения этого ТЗ.
- 100% coverage не заменяет сценарное покрытие. Для каждого критерия приемки должны быть позитивные, негативные и граничные tests там, где сценарий имеет отдельный runtime/type-level/error-path outcome.
- Каждый этап должен добавлять или обновлять только тесты своего scope и непосредственно затронутых контрактов. Нельзя переходить к следующему этапу с падающими проверками затронутого scope или с незакрытыми coverage gaps текущего этапа.
- Текущие тесты `@lite-fsm/core` проходят без изменения пользовательских сценариев.
- Тесты поведения являются источником истины для обратной совместимости. Их нельзя переписывать под новую реализацию, если public behavior не меняется.
- Тесты, привязанные к конкретным internal functions, которые удалены или переехали при рефакторинге, обновляются на нового владельца поведения или заменяются тестами публичного контракта.
- Runtime tests покрывают spawn transaction, duplicate entity ids, empty actors validation, `transition.despawn(...)`, entity routing, groupTag routing, `despawnOn`, bucket updates, stale scope validation, read-only effects/reactions и reaction error handling.
- Type tests покрывают `EntityMachineExtension`, `initialContext` schema inference, `spawnSchema` payload inference, `SpawnEventsFrom`, `defineEntitySpawn`, `manager.entities`, `EntityAccess<AppState>` и исключение lifecycle events из public `manager.transition`.
- Snapshot tests покрывают JSON round-trip, legacy snapshot без `generation`/`rowVersion`, hydrate replace invalidation, sidecar rebuild и routing after hydrate.
- React tests покрывают row-level subscription invalidation.
- Benchmark tests покрывают критерии из section 7.4.
- Названия новых `describe`/`it`/`test` в проекте должны быть на русском; API-термины остаются на английском.

## 12. Критерий полной готовности

Это ТЗ считается реализованным в полном объеме только когда выполнены все условия:

- Все этапы из раздела 10 имеют статус `done`: их область работ реализована, критерии приемки выполнены, а пункты «Вне области работ» не были случайно реализованы как unstable API.
- Каждое требование из разделов 2-9 либо реализовано и покрыто tests, либо явно относится к разделу «Вне области работ». Нельзя считать ТЗ завершенным при частично реализованном требовании, undocumented behavior или временном обходе.
- Plugin system из [`tz-plugin-system.md`](./tz-plugin-system.md) реализована и прошла собственный критерий полной готовности до начала финальной приемки `@lite-fsm/entities`.
- Все существующие behavior tests проходят без изменения пользовательских сценариев. Если internal tests были обновлены из-за переноса владельца поведения, новый тестовый слой покрывает тот же public или runtime contract.
- Все новые и измененные runtime tests, type tests, snapshot tests, React tests, benchmark tests, `check-types` и lint проходят. Сборка документации остается запрещенной для агента и не является gate этого ТЗ.
- Coverage по новому и измененному коду равен 100% по statements, branches, functions и lines. Формальное покрытие не засчитывается, если не покрыты все позитивные, негативные, граничные и error-path сценарии из критериев приемки.
- В коде не осталось `test.only`, временных `test.skip`, незакрытых TODO/FIXME для scope этого ТЗ, `throw new Error("not implemented")`, debug logging, временных feature flags или fallback-веток, добавленных только для прохождения тестов.
- Нет мертвого кода после реализации: удалены неиспользуемые helpers, types, exports, modules, compatibility shims, unreachable branches и старые владельцы поведения, которые больше не вызываются.
- Public API остается минимальным и строго типизированным: новые exports присутствуют только если они требуются этим ТЗ, а изменения public API отражены в cheatsheets, README и package docs, если они затрагивают существующие правила проекта.
- Нет известных runtime/type/lint ошибок, flaky tests, непроверенных coverage gaps, незадокументированных breaking changes или открытых blockers в журнале реализации.
