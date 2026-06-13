# lite-fsm — Types Cheat Sheet

Сжатый справочник по типовому API. Runtime — в [`API-CHEATSHEET.md`](API-CHEATSHEET.md).

## Точки входа

| Импорт                       | Типы                                                                                                                                                                                                                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@lite-fsm/core`             | весь `types.ts` + `interfaces.ts`: `FSMEvent`, `MachineConfig`, `CFG`, `MachineReducer`, `MachineEffect`, `MachineManagerSnapshot`, `MachinesState`, `MachineEvents`, `MachineDependencies`, `IMachineManager`, `Middleware`, actor types, snapshot types, `ReadonlyManagerAction`, helpers; plugin helper/value/context types для `definePlugin().create(...)`, `LiteFsmPlugin`, `LiteFsmStorageRuntimeDefinition`, `StorageManagerContext`, `StorageRuntimeExtension`, `StorageDependentField`, `StorageDependentTypeLambda`, `StorageTemplate`, public `Storage*Context` |
| `@lite-fsm/entities`         | alpha: `EntityId`, `EntityIndex`, `EntityAccess<AppMachines>`, `EntityMachineExtension`, `EntityReducerContext`, `EntityReducerSelf`, `LiteFsmEntityLifecycleEvents`, `SpawnEventsFrom`; runtime exports `entitiesPlugin()`, `defineSpawnEvents`, `defineEntitySpawn`, `spawnEvent`, `f32`, `i16`, `i32`, `u8`, `string`, `optional`; entity effects/reactions и `snapshot.storage.entity` типизируются через extension/core envelope |
| `@lite-fsm/entities/react`   | alpha: `EntityRowSnapshot`, `EntityListOptions`, `TypedUseEntitySnapshotHook`, `TypedUseEntityCountHook`, `TypedUseEntityListHook`                                                                                                                                                                |
| `@lite-fsm/react`            | `FSMContextType`, `FSMContextProviderProps`, `FSMPersistLifecycle`, `FSMHydrationBoundaryProps`, `FSMStorageHydrationPreview`, typed hook aliases                                                                                                                                                  |
| `@lite-fsm/persist`          | `MaybePromise`, `PersistedRecord`, `PersistStorage`, `PersistStatus`, `PersistRestoreSettledResult`, `PersistManagerOptions`, `PersistController`                                                                                                                                                 |
| `@lite-fsm/persist/react`    | runtime hooks only: `usePersistStatuses`, `useIsPersistRestoring`                                                                                                                                                                                                                                 |
| `@lite-fsm/middleware`       | только runtime middleware                                                                                                                                                                                                                                                                         |
| `@lite-fsm/graph`            | alpha graph compiler/analyzer IR-типы                                                                                                                                                                                                                                                             |
| `@lite-fsm/graph/simulator`  | alpha simulator-типы: snapshots, slices, timeline, choices, available transitions, suggested emissions                                                                                                                                                                                            |
| `@lite-fsm/graph/view-model` | alpha visualizer projection-типы: summaries, topics, workbench rows, anchors, row mappings, overlay inputs, Machine Flow Model                                                                                                                                                                    |
| `@lite-fsm/cli`              | public TS entrypoint не публикуется; типовые contracts CLI — JSON export document `lite-fsm.project-graph-export/v1` и local visualize HTTP API                                                                                                                                                   |
|                              |

## Generics

| Generic    | Значение                                   |
| ---------- | ------------------------------------------ |
| `C`        | config graph object                        |
| `T`        | machine context, `Record<string, unknown>` |
| `P`        | union events, совместимый с `AnyEvent`     |
| `D`        | custom effect dependencies                 |
| `N`        | state name или `"*"` для effect/deps       |
| `S`        | `MachineStore`, карта машин менеджера      |
| `R`        | selector result                            |
| `Snapshot` | transport shape для hydrate/dehydrate      |

## Базовые типы

| Тип                                      | Форма                                     |
| ---------------------------------------- | ----------------------------------------- |
| `AnyEvent`                               | `{ type: string; payload?: unknown }`     |
| `AnyRecord`                              | `Record<string, unknown>`                 |
| `SType`                                  | `string \| number \| symbol`              |
| `WILDCARD`                               | literal `"*"`                             |
| `State<S>`                               | `Exclude<S, "*" \| number \| symbol>`     |
| `StateName<C>`                           | public state keys из `keyof C`, без `"*"` |
| `StateType<C, T>` · `MachineState<C, T>` | `{ state: StateName<C>; context: T }`     |
| `Reducer<S, P>`                          | `(state: S, action: P) => S`              |
| `EffectType`                             | `"every" \| "latest"`                     |

## Entity Types

| Тип                         | Контракт                                                                  |
| --------------------------- | ------------------------------------------------------------------------- |
| `EntityId`                  | alias `string`; публичный id entity                                       |
| `EntityIndex`               | branded `number`; runtime index, не plain input type пользовательского API |
| `EntityAccess<AppMachines>` | typed root accessor для `manager.entities`                                |
| `EntitiesPlugin<AppDeps, PluginEvents>` | type-only plugin source для `TypedCreateMachineFn` и manager events от runtime `spawn` |
| `EntityMachineExtension`    | machine-facing extension для `storage: "entity"` через plugin source      |
| `EntityReducerContext<ContextSchema, SpawnSchema, Config = object>` | reducer context с `self` и `payloadFor(entity)` для entity actor template |
| `EntityReducerSelf<ContextSchema, Config = object>` | batch self API: `indices`, `states`, `presence`, `rowVersion`, direct columns, `stateCode`, `prevStateCode`, `has`, `entityId` |
| `LiteFsmEntityLifecycleEvents` | internal lifecycle union для `storage: "entity"` templates               |
| `SpawnEventsFrom<typeof spawnEvents>` | discriminated union public spawn events                                  |

`EntityMachineExtension` подключается к `TypedCreateMachineFn` через `EntitiesPlugin<AppDeps>` или реальные runtime plugin values `typeof plugin`/`typeof plugins`. Передача `EntityMachineExtension` третьим generic напрямую не является поддерживаемым plugin source.

```ts
import { createMachine as createLiteFsmMachine, type TypedCreateMachineFn } from "@lite-fsm/core";
import { f32, optional, string } from "@lite-fsm/entities";
import type { EntitiesPlugin } from "@lite-fsm/entities";

type AppEvent = { type: "TICK" };
type AppDeps = {};

export const createMachine: TypedCreateMachineFn<AppEvent, AppDeps, EntitiesPlugin<AppDeps>> = createLiteFsmMachine;

const movementActor = createMachine({
  storage: "entity",
  initialState: "__INIT",
  initialContext: {
    x: f32(),
    y: f32(),
  },
  spawnSchema: {
    x: f32(),
    y: f32(),
    label: optional(string()),
  },
  config: {
    __INIT: { ENTITY_SPAWNED: "active" },
    active: { TICK: "expired" },
    expired: {},
  },
  despawnOn: "expired",
});
```

`LiteFsmEntityLifecycleEvents` равен `{ type: "ENTITY_SPAWNED" } | { type: "ENTITY_DESPAWNED" }`. `EntityMachineExtension.internalEvents` добавляет эти события только в `storage: "entity"` config/reducer type surface. Они не входят в пользовательский `AppEvent`, не выводятся в `MachineEvents<typeof machines>` и не принимаются public `manager.transition(...)`, если приложение не добавило их вручную в свой public union. Runtime все равно запрещает public dispatch этих names.

`EntityMachineExtension.input` включает `despawnOn?: string | readonly string[]`. Поле доступно только для `storage: "entity"` и описывает public states, после которых runtime удаляет всю entity в том же dispatch. Runtime валидирует, что states существуют в `config` и не являются `__INIT`, `__RESOLVED`, `__REJECTED` или `__CANCELLED`. Terminal states удаляют только текущую row и не означают entity despawn. Public `manager.despawn(...)` не входит в тип менеджера.

`__INIT` entity template должен быть transition map и может объявлять только `ENTITY_SPAWNED`. Custom event edge из `__INIT` является ошибкой инициализации. `storage: "instance"` продолжает поддерживать обычные custom `__INIT` events.

Descriptors несут type-level metadata для future columns и spawn payload. `f32` использует `Float32Array`, `i16` — `Int16Array`, `i32` — `Int32Array`, `u8` — `Uint8Array`, `string()` — строковую колонку. `optional(inner)` допустим только в `spawnSchema` и дает `T | null`; ключ payload остается обязательным. `MachineResultMetadata<typeof movementActor>` сохраняет `entityContextSchema` и `entitySpawnSchema`.

`EntityMachineExtension.publicState` задает lightweight slice для `MachinesState<typeof machines>`:

```ts
type AppState = MachinesState<typeof machines>;
type MovementSlice = AppState["movementActor"];
// { storage: "entity"; version: number; count: number; capacity: number; ...phantom metadata }
```

Phantom metadata переносит `initialContext` и `spawnSchema` внутри lightweight slice. Runtime не создает phantom поля. Public state union actor template для `EntityAccess<AppMachines>` выводится из machine definitions.

`MachineManagerSnapshot<typeof machines>` сохраняет entity durable payload в
top-level `storage?: Record<string, unknown>`. Для entity runtime ключ
`storage.entity` содержит validated JSON-compatible payload, но `@lite-fsm/entities`
не экспортирует отдельный low-level snapshot handler type. Типы
`machines[entityActorKey]` остаются lightweight slices из
`EntityMachineExtension.publicState`; columns, ids, `generation`, `freeList`,
presence и `rowVersion` не появляются в `MachinesState<typeof machines>`.

```ts
const snapshot = manager.dehydrate();

snapshot.machines.movementActor.storage; // "entity"
snapshot.storage?.entity; // unknown payload, валидируется entity runtime
manager.getSnapshot().machines.movementActor.count; // lightweight runtime slice
// @ts-expect-error getSnapshot() не содержит top-level storage
manager.getSnapshot().storage;
```

`dehydrate({ machines })` и `dehydrate({ storage })` имеют независимые filters:
`machines` влияет только на `snapshot.machines`, `storage: []` отключает
storage payloads, а `{ machines: [], storage: ["entity"] }` оставляет только
`storage.entity`. `hydrate(...)` и `getHydratedState(...)` принимают общий core
`MachineManagerSnapshot` envelope; schema compatibility и column payload types
проверяются runtime.

`EntityAccess<AppMachines>` выводит actor keys, columns и public state union из machine definitions и включает только templates с `storage: "entity"`:

```ts
type AppMachines = typeof machines;
type Entities = EntityAccess<AppMachines>;

declare const entities: Entities;
declare const entity: EntityIndex;

entities.get("movementActor").x[entity]; // number
entities.get("movementActor").state(entity); // "moving" | "stopped" | undefined
```

`entities.get("unknownActor")`, domain machines и `storage: "instance"` actor templates являются TypeScript errors. `store.state(entity)` возвращает public actor state union без `"__INIT"` и `undefined` для отсутствующей строки.

`MachineManager(machines, { plugins: [entitiesPlugin()] as const })` добавляет `.entities`; без plugin returned manager не содержит этого поля.

Public spawn events выводятся из `defineSpawnEvents(...)`:

```ts
const spawnEvents = defineSpawnEvents({
  SPAWN_PROJECTILE: spawnEvent<{ id: string; x: number; label: string | null }>(),
});

type SpawnEvents = SpawnEventsFrom<typeof spawnEvents>;
// { type: "SPAWN_PROJECTILE"; payload: { id: string; x: number; label: string | null } }
```

`defineEntitySpawn(machines, spawnEvents)` связывает `spawnEvents` с exhaustive recipes. Recipe payload выводится из `spawnEvents`, actor keys ограничены entity actor keys из `machines`, actor payload проверяется по `spawnSchema`. `entitiesPlugin({ spawn })` добавляет `SpawnEventsFrom<typeof spawnEvents>` в `manager.transition(...)` без отдельной передачи `spawnEvents`; `AppEvent` машин не расширяется автоматически.

```ts
const spawn = defineEntitySpawn(machines, spawnEvents)({
  SPAWN_PROJECTILE: (payload) => ({
    id: payload.id,
    groupTag: "projectile",
    actors: {
      movementActor: { x: payload.x, label: payload.label },
    },
  }),
});

const manager = MachineManager(machines, {
  plugins: [entitiesPlugin({ spawn })] as const,
});

manager.transition({ type: "SPAWN_PROJECTILE", payload: { id: "p1", x: 1, label: null } });
```

`EntityReducerContext<ContextSchema, SpawnSchema, Config = object>` описывает runtime-visible reducer helpers: `self.indices`, `self.states`, `self.presence`, `self.rowVersion`, direct mutable schema columns, `self.stateCode`, `self.prevStateCode`, `self.has(entity)`, `self.entityId(entity)` и `payloadFor(entity)`. `self.states` типизируется public state names из `Config` и дает numeric state codes для safe override. `payloadFor(entity)` принимает `EntityIndex`, возвращает payload из actor `spawnSchema` и не принимает `EntityId` string.

```ts
type MovementReducerContext = EntityReducerContext<
  typeof movementActor.initialContext,
  typeof movementActor.spawnSchema,
  typeof movementActor.config
>;
```

`EntityMachineExtension.effectDeps` добавляет deps только в effects
`storage: "entity"` templates. `self` является readonly batch view: `indices`,
`states`, `presence`, `rowVersion`, `stateCode`, `prevStateCode`, typed readonly
columns, `has(entity)` и `entityId(entity)`. `entities` имеет тип
`EntityAccess<AppMachines>`, если `AppDeps` содержит
`entities?: EntityAccess<AppMachines>`; без этого поля runtime accessor
присутствует, но `entities.get(...)` и `entities.maybe(...)` принимают ключ
`never`.

```ts
type AppMachines = typeof machines;
type AppState = MachinesState<AppMachines>;
type AppDeps = {
  readonly getState?: () => AppState;
  entities?: EntityAccess<AppMachines>;
};

const createMachine: TypedCreateMachineFn<AppEvent, AppDeps, EntitiesPlugin<AppDeps>> = createLiteFsmMachine;

const aiActor = createMachine({
  storage: "entity",
  initialState: "__INIT",
  initialContext: { alert: f32() },
  spawnSchema: {},
  config: {
    __INIT: { ENTITY_SPAWNED: "idle" },
    idle: { WAKE: "active" },
    active: {},
  },
  effects: {
    active: ({ self, entities, transition }) => {
      const movement = entities.maybe("movementActor");

      for (const entity of self.indices) {
        if (!self.has(entity) || !movement.has(entity)) continue;
        transition.entity(self.entityId(entity), { type: "SYNC_POSITION" });
      }

      transition.tag("enemy", { type: "WAKE" });
      transition.actor("uiActor/0", { type: "WAKE" });
      transition.despawn(self.indices);
    },
  },
});
```

`transition.entity(entityId | readonly entityId[], action)` и
`transition.despawn(entityId | readonly entityId[] | self.indices)` доступны
только в entity effects. `transition.despawn(entityIndex)` не принимается:
числовые indices доступны только captured списком `self.indices`. В domain и
`storage: "instance"` effects entity-specific helpers не входят в тип
`transition`. `transition.tag(...)` и `transition.actor(...)` сохраняют core
actor effect typing; `transition.tag(...)` использует `meta.groupTag`, а не
`meta.entityId`.

`EntityMachineExtension.input` также принимает `reactions?: { [eventType]:
(deps) => unknown }` только для `storage: "entity"`. `reactionDeps` включает
`action`, readonly `self`, scoped `entities` и user deps из `AppDeps`, но не
включает `transition` или `condition`. Lifecycle event names доступны в keys
`reactions`, если template `config` принимает соответствующий internal event.
`AppDeps.entities?: EntityAccess<AppMachines>` задает strict keys для
`entities.get(...)` и `entities.maybe(...)`; без этого поля ключи имеют тип
`never`.

`AppDeps.entities` остается optional: runtime entity effects/reactions не читают
root dependency и получают scoped `entities` из `EntityMachineExtension`.
Передача `manager.setDependencies({ entities: manager.entities })` нужна только
обычным domain/process effects, которые должны читать root entity stores.

```ts
const syncActor = createMachine({
  storage: "entity",
  initialState: "__INIT",
  initialContext: { spriteId: string() },
  spawnSchema: {},
  config: {
    __INIT: { ENTITY_SPAWNED: "visible" },
    visible: { POSITION_CHANGED: "visible", ENTITY_DESPAWNED: "removed" },
    removed: {},
  },
  reactions: {
    POSITION_CHANGED: ({ self, entities, renderer }) => {
      const movement = entities.get("movementActor");
      const entity = self.indices[0];

      renderer.sync(self.spriteId[entity], movement.x[entity], movement.y[entity]);
    },
    ENTITY_DESPAWNED: ({ self }) => {
      self.indices;
    },
  },
});
```

`entitiesPlugin()` добавляет route meta key `entityId`. При подключенном plugin `manager.transition(...)` принимает `meta.entityId?: string | readonly string[]`; без plugin этот meta key недоступен на уровне TypeScript. Core keys `actorId`, `groupId` и `groupTag` остаются доступны. Entity storage runtime объявляет `routeMetaKeys: ["entityId"]`, поэтому storage binding требует совместимый resolver `routeMeta.entityId` в `definePlugin().create(...)`.

`@lite-fsm/entities/react` экспортирует read-only hook types для React layer:

```ts
import type {
  EntityListOptions,
  EntityRowSnapshot,
  TypedUseEntityCountHook,
  TypedUseEntityListHook,
  TypedUseEntitySnapshotHook,
} from "@lite-fsm/entities/react";
import { useEntitySnapshot } from "@lite-fsm/entities/react";

type AppMachines = typeof machines;

const useAppEntitySnapshot: TypedUseEntitySnapshotHook<AppMachines> = (templateKey, entityId) =>
  useEntitySnapshot<AppMachines, typeof templateKey>(templateKey, entityId);
```

`EntityRowSnapshot<Context, State>` имеет форму `{ entityId: EntityId; groupTag: string; state: State; context: Context }`. `TypedUseEntitySnapshotHook<AppMachines>` принимает только entity actor keys, принимает `EntityId | null | undefined` и возвращает `EntityRowSnapshot<EntityContext, StateUnion> | undefined`. `TypedUseEntityCountHook<AppMachines>` возвращает `number`; `TypedUseEntityListHook<AppMachines>` возвращает `readonly EntityId[]`. `EntityListOptions` содержит только `groupTag?: string`. Hook types не принимают raw `EntityIndex` как публичный row identifier.

## События

```ts
type AppEvent = FSMEvent<"INC"> | FSMEvent<"SET", { count: number }> | FSMEvent<"RESET", undefined>;
```

| Форма                    | Результат                         |
| ------------------------ | --------------------------------- |
| `FSMEvent<"A">`          | `{ type: "A" }`                   |
| `FSMEvent<"A", Payload>` | `{ type: "A"; payload: Payload }` |
| `FSMEvent<"A" \| "B">`   | `{ type: "A" } \| { type: "B" }`  |
| `FSMEvent<never>`        | `never`                           |

`payload` отсутствует только когда второй generic не передан. Для `undefined`, `void`, `null`, `unknown`, `any`, `X | undefined` — ключ обязателен.

### Routed actions

| Тип                                       | Форма                                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------------------ |
| `FSMEventMeta` · `CoreActionMeta`         | `{ actorId?, groupId?, groupTag?, senderActorId?, senderGroupId?, senderGroupTag? }` |
| `ManagerAction<P, Meta = CoreActionMeta>` | `P & { meta?: Meta }`                                                                |
| `ReadonlyManagerAction<P, Meta = CoreActionMeta>` | action для callbacks наблюдения; свойства, `meta`, arrays/tuples и вложенные объекты доступны только для чтения |
| `ManagerCommitAction<S, P>`               | user action или `HydrateAction<S>`                                                   |

`actorId`, `groupId`, `groupTag` — `string | string[]`. Дополнительные route keys объявляются plugin section `routeMeta`; helper `PluginRouteMeta<Plugins>` описывает raw map этих значений. Runtime принимает только один active routing key на action; несколько routing keys бросают `LITE_FSM_AMBIGUOUS_ROUTE_META`.

## Граф переходов · `CFG<C, P>`

```ts
const config = {
  idle: { START: "loading" },
  loading: { DONE: "idle", FAIL: "error" },
  "*": { RESET: "idle" },
} satisfies CFG<Config, Event>;
```

| Проверка       | Type-level правило                                      |
| -------------- | ------------------------------------------------------- |
| event keys     | только `P["type"]`                                      |
| targets        | state keys из `C`, `null`, для actors — terminal states |
| `"*"` source   | разрешён как fallback                                   |
| `"*"` target   | запрещён                                                |
| `initialState` | `StateName<C>`, без `"*"`                               |

Удобнее всего — `createMachine(...)` или `satisfies MachineConfig<...>`: TS проверяет `CFG` и сохраняет literal types.

## `MachineConfig<C, T, P, D = {}, Snapshot = ...>`

| Поле                      | Тип                                                         |
| ------------------------- | ----------------------------------------------------------- |
| `storage?`                | core storage kind: сейчас только `"instance"`               |
| `config`                  | `C`                                                         |
| `initialState`            | `StateName<C>`                                              |
| `initialContext`          | `T`                                                         |
| `groupTag?`               | `string` (actor template only)                              |
| `reducer?`                | `MachineReducer<C, P, T>`                                   |
| `effects?`                | `{ [N in EffectStateName<C>]?: MachineEffect<N, C, P, D> }` |
| `hydrate?` · `dehydrate?` | domain transport hooks или actor snapshot hooks             |
| `persistence?`            | actor template only: `"runtime"` (default) \| `"snapshot"`  |

Default `Snapshot`: domain → `StateType<C, T>`, actor hook payload → `DefaultActorSnapshot<C, T>`.
Custom domain hooks переопределяют `Snapshot`: `SnapshotForMachine<M>`, `MachineManagerSnapshot<S>`, `dehydrate()` и `hydrate()` используют transport payload из `dehydrate` / `hydrate`, включая машины, созданные через `TypedCreateMachineFn<P, D, typeof plugins>`.
Storage runtime payloads не меняют `SnapshotForMachine<M>`: они передаются отдельно через `MachineManagerSnapshot<S>["storage"]`.
Отсутствие `storage` эквивалентно `storage: "instance"` в public `MachineManager`; custom storage kinds доступны через `TypedCreateMachineFn<P, D, typeof plugins>` и должны быть зарегистрированы тем же plugin tuple в `MachineManager(..., { plugins })`. Standalone `Machine(...)` и `defineMachine().create(...)` поддерживают только отсутствие `storage` и `storage: "instance"`.

## Plugin-aware `TypedCreateMachineFn`

`TypedCreateMachineFn<P, D, Plugins>` принимает plugin source как третий generic: один `LiteFsmPlugin`, union plugins, readonly tuple plugins или широкий `readonly LiteFsmPlugin[]`. Без третьего generic wrapper остается core-only и не принимает custom storage kinds.

Plugin source не расширяет `P` и `D` автоматически. Приложение явно добавляет manager-level plugin events и scoped deps:

```ts
const plugins = [cachePlugin] as const;

type MachineEvents = AppEvents | PluginManagerEvents<typeof plugins>;
type MachineDeps = EffectDeps<AppDeps, typeof plugins>;

export const createAppMachine: TypedCreateMachineFn<MachineEvents, MachineDeps, typeof plugins> = createMachine;
```

Wrapper выбирает storage-specific input по `cfg.storage`. `storage: "instance"` остается core kind и не требует plugin storage. `MachineEvents<S>` выводит только public `P`; storage `internalEvents` разрешены в `config`, reducer и effects конкретной machine, но не становятся допустимыми public `manager.transition(...)`. Прямой public `createMachine<AppEvents>(...)` остается core-only API.

Storage author описывает type-level machine contract через `defineStorageRuntime<Extension>().create(...)`. `Extension` не содержит поле `storage`: builder добавляет kind из literal `kind`. Machine-facing поля `input`, `internalEvents`, `reducerContext`, `effectDeps`, `reactionDeps`, `resultMetadata` и `publicState` участвуют в `TypedCreateMachineFn<P, D, typeof plugins>`; runtime-only поля типизируют callbacks storage runtime.

`resultMetadata`, `reducerContext`, `effectDeps`, `reactionDeps` и `publicState` могут быть fixed object types или dependent function signatures от concrete storage input. Для deps/result types, которым нужен весь concrete storage input, можно использовать `StorageDependentField<Lambda>`. Core применяет dependent field только на type level:

```ts
type EntityStorageExtension = {
  input: {
    storage: "entity";
    initialState: "__INIT";
    initialContext: AnyRecord;
    spawnSchema: AnyRecord;
    despawnOn?: string | readonly string[];
  };
  resultMetadata: <Input extends EntityStorageExtension["input"]>(input: Input) => {
    entityContextSchema: Input["initialContext"];
    entitySpawnSchema: Input["spawnSchema"];
  };
};
```

`input` остается fixed object shape и дает contextual typing storage-specific fields. `internalEvents` остается fixed field. Dependent field signatures не создаются и не вызываются в runtime.

`StorageDependentField<Lambda>` и `StorageDependentTypeLambda` предназначены для advanced storage extensions, которым нужен result type как функция от всего concrete storage input, а не только shallow replacement по именам полей. `Lambda["type"]` вычисляется через `this["input"]`; runtime value для такого поля не создается.

## `MachineReducer<C, P, T>`

```ts
type R = MachineReducer<C, P, T>;
//      (state: MachineReducerInputState<C, T>,
//       payload: ManagerAction<P>,
//       meta: { nextState: TransitionNextState<C>; config: C }) => MachineReducerState<C, T> | void
```

| Тип                              | Форма                                                                                                |
| -------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `MachineReducerInputState<C, T>` | domain: `StateType<C, T>`; actor: `{ state: StateName<C> \| ActorTerminalState; context: T }`        |
| `TransitionNextState<C>`         | domain: `StateName<C>`; actor: public actor state \| terminal state                                  |
| `MachineReducerState<C, T>`      | domain: `StateType<C, T>`; actor: `{ state: ActorPublicState<C> \| ActorTerminalState; context: T }` |

`void` на уровне типов разрешён (для `immerMiddleware`); runtime без void-reducer middleware бросит ошибку, если reducer реально вернул `undefined`.

## Effects

```ts
const saveEffect: MachineEffect<"saving", SaveConfig, SaveEvent, { api: Api }> = async ({
  api,
  action,
  transition,
}) => {
  await api.save();
  transition({ type: "DONE" });
};
```

| Тип                            | Назначение                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `MachineEffect<N, C, P, D>`    | `(deps: D & DefaultDeps...) => void \| Promise<void>`                                                        |
| `EffectDeps<AppDeps, Plugins>` | app deps плюс plugin-scoped deps и методы `transition`, выведенные из `definePlugin().create(...)`           |
| `EffectStateName<C>`           | domain: `StateName<C> \| "*"`; actor: `ActorPublicState<C> \| "*"`                                           |
| `IncomingEventTypes<C, N>`     | event names, ведущие в state `N`                                                                             |
| `ActionForState<C, N, P>`      | `Extract<P, { type: IncomingEventTypes<C, N> }>` (для `N = "*"` — весь `P`)                                  |
| `DefaultDeps<N, C, P>`         | `{ transition: (action: ManagerAction<P>) => ManagerAction<P>, action: ActionForState<C, N, P>, condition }` |

`transition` в domain effects принимает `ManagerAction<P>`, поэтому новое событие может нести routing `meta`. Если `D` задан как `EffectDeps<AppDeps, Plugins>`, фактический `transition` в effect является callable core `transition(action)` с пересечением plugin-scoped methods. `action` и `condition` остаются типизированы через исходный `P` и сохраняют сужение по state. Plugin-scoped deps доступны только в effect/reaction deps; они не входят в `MachineDependencies<S>` и не передаются через `manager.setDependencies(...)`.

### Actor effects

| Тип                            | Форма                                                                      |
| ------------------------------ | -------------------------------------------------------------------------- |
| `ActorDefaultDeps<N, C, P>`    | `self`, routed `action`, actor-aware `transition`, actor-aware `condition` |
| `ActorTransition<P>`           | callable `(action) => action` + `.unscoped`, `.actor`, `.group`, `.tag`    |
| `ActorActionForState<C, N, P>` | `ManagerAction<ActionForState<C, N, P>>`                                   |
| `Self`                         | alias к `ActorMeta`                                                        |

## Actors

Actor template определяется literal `__INIT` в `config`.

```ts
type RequestConfig = {
  __INIT: { START: "pending" };
  pending: { DONE: "__RESOLVED"; FAIL: "__REJECTED" };
};
type RequestSlice = PublicActorSlice<RequestConfig, { id: string }>;
```

| Тип                      | Назначение                                                              |
| ------------------------ | ----------------------------------------------------------------------- |
| `ActorMeta`              | `{ actorId: string; groupId: string; groupTag: string }`                |
| `PublicActorSlice<C, T>` | `{ state: ActorPublicState<C>; context: T; meta: Readonly<ActorMeta> }` |
| `ActorTerminalState`     | `"__RESOLVED" \| "__REJECTED" \| "__CANCELLED"`                         |
| `ActorSystemState`       | `"__INIT" \| ActorTerminalState`                                        |
| `ActorPublicState<C>`    | `StateName<C>` без actor system states                                  |
| `ActorPersistence`       | `"runtime" \| "snapshot"`                                               |
| `IsActorTemplate<M>`     | `true`, если `M["config"]` содержит literal `__INIT`                    |

Terminal states допустимы как targets, но не как public state и не как keys в `effects`.

## State и derived типы

```ts
type Store = { counter: typeof counter; request: typeof requestActor };
type AppState = MachinesState<Store>;
type AppEvents = MachineEvents<Store>;
type AppDeps = MachineDependencies<Store>;
```

| Тип                         | Что выводит                                                  |
| --------------------------- | ------------------------------------------------------------ |
| `MachineStore`              | `Record<string, AnyMachineConfig>`                           |
| `MachineSliceState<M>`      | фрагмент состояния доменной машины или набор записей акторов |
| `MachinesState<S>`          | состояние менеджера по карте машин                           |
| `MachineEvents<S>`          | union событий всех машин                                     |
| `MachineDependencies<S>`    | intersection custom deps всех effects                        |
| `MachineRuntimeMetadata<M>` | type-only metadata машины, созданной через plugin-aware wrapper |
| `MachineResultMetadata<M>`  | `resultMetadata` из storage extension, иначе `{}`               |

`MachineEvents<{}>` → `never`. `MachineDependencies<{}>` → `{}`. Если extension задаёт `publicState`, `MachinesState<S>` использует этот тип вместо core `{ state, context }` / actor record shape.

## Plugins

Публичный plugin объявляется только через `definePlugin<PluginEvents, HostEvents>().create(...)`. Первый generic `PluginEvents` — события, которые plugin добавляет в `manager.transition` и может эмитить через `scope.transition(...)`. Второй generic `HostEvents` — события host manager, которые plugin типизированно наблюдает в callbacks. Публичного callback `install` нет. `MachineManager(..., { plugins })` принимает tuple values из builder API; structural objects не являются plugin values.

`PluginEvents` расширяют manager-level `transition` для текущего plugin tuple, но не расширяют события машин автоматически. Если machine config должен обрабатывать plugin event, включите его явно:

```ts
type AppPlugins = typeof cachePlugin;
type AppEvents = HostEvents | PluginManagerEvents<AppPlugins>;
```

`HostEvents` используются для contextual typing callbacks внутри plugin definition. Они не входят в `PluginManagerEvents<Plugins>` и не добавляются в manager-level composition. Если второй generic не указан, поля action в callbacks наблюдения (`ctx.action`, `ctx.originalAction`, `routeMeta` `ctx.action`, `scope.event`) типизируются как `ReadonlyManagerAction<AnyEvent>`, а `scope.transition(...)` остается ограничен `PluginEvents`.

Plugin keys имеют плоский namespace. Core не добавляет prefix к `routeMeta`, `manager`, `scopedDeps`, `scopedTransition` или storage `kind`; plugin author и integrator отвечают за уникальность keys. Runtime diagnostics для конфликтов указывают section, key, первого владельца и конфликтующего владельца.

Доступные helper types:

| Тип                                      | Контракт                                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `PluginManagerEvents<Plugins>`           | union событий из `PluginEvents`; `HostEvents` не входят в manager-level composition              |
| `PluginRouteMeta<Plugins>`               | raw map route meta values; в `manager.transition(...).meta` поля текущего tuple становятся optional, но runtime принимает только один active routing key |
| `PluginScopedDeps<Plugins>`              | поля из `scopedDeps` по ключам section и return types builder-ов                                 |
| `PluginScopedTransition<Plugins>`        | методы из `scopedTransition` по ключам section и return types builder-ов                         |
| `PluginManagerExtensions<Plugins, S = MachineStore>` | поля returned manager по ключам `manager`; generic manager factories инстанцируются текущим store |
| `EffectDeps<AppDeps, Plugins>`           | `AppDeps` плюс `PluginScopedDeps<Plugins>` и `transition: PluginScopedTransition<Plugins>`       |
| `LiteFsmPlugin<Name, PluginEvents, Definition>` | opaque тип value, возвращаемого `definePlugin().create(...)`; используйте для exported constants и factory return types |
| `LiteFsmStorageRuntimeDefinition<Kind, MachineExtension, RouteMetaRequirements>` | opaque тип value, возвращаемого `defineStorageRuntime().create(...)`; третий generic хранит type-level требования storage к `routeMeta` |
| `StorageRuntimeExtension`                | public shape storage extension: machine-facing и runtime-only поля                               |
| `StorageTemplate<TemplateData>`          | `{ key; kind; data? }` для compiled storage templates                                             |
| `StorageManagerContext<Events>`          | публичное подмножество manager в storage callbacks: `getState`, `transition`, `onTransition`, `getDependencies` |
| `Storage*Context`                        | public generic context types storage callbacks для exported storage helper/factory signatures     |

Helpers принимают plugin union и runtime tuple; tuple нормализуется через `[number]`. `PluginRouteMeta<PluginUnion>` возвращает raw value map: annotated resolver `(value: string, ctx) => ...` дает `string`, а unannotated `value` считается `unknown`. Optional semantics относятся к `manager.transition(...).meta`: эти ключи optional и доступны только для подключенного plugin tuple. Типы не запрещают несколько optional route fields в одном object, но runtime contract запрещает несколько active routing keys в одном dispatch. `ctx.key` внутри resolver типизируется literal ключом resolver; при явном `HostEvents` `ctx.action` — `ReadonlyManagerAction<HostEvents | PluginEvents>`, а без второго generic — `ReadonlyManagerAction<AnyEvent>`.

`PluginManagerExtensions<Plugins, S = MachineStore>` возвращает поля manager по return type factory из section `manager`. Первый generic сохраняет старую форму вызова; второй generic задает store текущего `MachineManager`. Factory может объявить `<S extends MachineStore>(ctx: ManagerRuntimeContext<AnyEvent, S>)` и вернуть тип, зависящий от `MachinesState<S>`. Factory получает `ManagerRuntimeContext<PluginEvents, S>`: `ctx.config` имеет тип `S`, `ctx.getState()` возвращает `MachinesState<S>`, а `ctx.transition(...)` принимает `ManagerAction<PluginEvents>` и возвращает `ManagerAction<PluginEvents>`. `HostEvents` не входят в этот contract, а `definePlugin().create({ manager })` без первого generic не получает fallback на произвольный `AnyEvent`.

При явном `HostEvents` `intercept` и hooks получают action context с `action` и `originalAction` типа `ReadonlyManagerAction<HostEvents | PluginEvents>`; без второго generic — `ReadonlyManagerAction<AnyEvent>`. `intercept` может вернуть replacement action как обычный `ManagerAction`, `skipDelivery` и `stopInterceptors`; `{}` является no-op. Runtime принимает только `void` или plain object с известными полями и бросает `LITE_FSM_INVALID_PLUGIN_CALLBACK_RESULT` для неверного result. Hooks получают context без API для replacement/skip/stop; их return value runtime игнорирует. `manager.transition(...)` внутри hook запрещен runtime-ошибкой `LITE_FSM_REENTRANT_TRANSITION_FORBIDDEN`. `DispatchContext`, `ManagerRuntimeContext` и `PluginScopedInvocationContext` экспортируются для portable inferred types exported plugin factories; обычно callbacks пишутся inline и не требуют ручной аннотации context.

Guarded phases для nested `transition(...)`: `plugin.intercept`, `storage.prepareAction`, `storage.beforeReduce`, `storage.acceptsEvent`, `storage.reduce`, `storage.reduceBucket`, `storage.commit`, `storage.reactions` и `hook.*`. Guard error пробрасывается из текущего `manager.transition(...)`, не вызывает `onError` автоматически и не стартует вложенный dispatch. Subscriber и effect callbacks остаются public safe boundary для reentrant dispatch; explicit scheduler API в этом релизе отсутствует. Для текущего action используйте return protocol callback и `ctx.dispatch.runtime`.

`defineStorageRuntime<Extension>().create(...)` связывает advanced storage runtime contract и type-level machine typing. `Extension` не содержит `storage`; builder добавляет storage kind из literal `kind`. Machine-facing поля `input`, `internalEvents`, `reducerContext`, `effectDeps`, `reactionDeps`, `resultMetadata` и `publicState` доступны машинам только через plugin-aware `TypedCreateMachineFn<P, D, typeof plugins>`. Runtime-only поля `runtimeState`, `templateData`, `snapshotData`, `invocation`, `identity`, `observedEvents` и `routeMeta` типизируют callbacks storage runtime и не входят в machine result metadata.

Public `compileTemplate(ctx)` возвращает только `void | { data?: TemplateData }`; `key`, `kind` и unknown fields в result не принимаются runtime validation. `ctx.template.data` и `ctx.templates` используют `Extension["templateData"]`, `ctx.state` использует `Extension["runtimeState"]`, `ctx.invocation` использует `Extension["invocation"]`, `ctx.snapshot` в hydrate использует `Extension["snapshotData"]`. Если `Extension["observedEvents"]` задан, storage callbacks с action (`prepareAction`, `beforeReduce`, `acceptsEvent`, `reduce`, `reduceBucket`, `commit`, `effects.resolveInvocations`, `effects.invoke`, `identity.resolve`, `reactions.run`) получают `ctx.action` и `ctx.originalAction` как `ReadonlyManagerAction<Extension["observedEvents"]>`; без `observedEvents` сохраняется `ReadonlyManagerAction<AnyEvent>`.

`prepareAction(ctx)` и `beforeReduce(ctx)` возвращают `void | { type: "replace"; action } | { type: "drop" }`. Replacement action валидируется до route recalculation: это должен быть object с `type: string`; `@@lite-fsm/*` запрещен runtime-ошибкой `LITE_FSM_INVALID_REPLACEMENT_ACTION`. `reduce(ctx)` и `reduceBucket(ctx)` возвращают только `void | { type: "skip" }`; `drop` и `replace` на reduce stage не являются public contract. `acceptsEvent(ctx)` должен вернуть boolean. Unknown fields, unknown result shapes и не-boolean `acceptsEvent` бросают `LITE_FSM_INVALID_STORAGE_CALLBACK_RESULT`. Diagnostics включают owner `plugin '<name>' intercept`, storage kind и phase вида `storage runtime '<kind>' <phase>`. `reduceScope` по умолчанию равен `"template"`: runtime объявляет `acceptsEvent(ctx)` и `reduce(ctx)`. При `reduceScope: "bucket"` runtime объявляет `reduceBucket(ctx)`, получает `ctx.templates` и не принимает `acceptsEvent` или `reduce`. В template scope `reduceBucket` запрещен.

Новые public diagnostics входят в `LiteFsmError["code"]`: `LITE_FSM_REENTRANT_TRANSITION_FORBIDDEN`, `LITE_FSM_AMBIGUOUS_ROUTE_META`, `LITE_FSM_INVALID_PLUGIN_CALLBACK_RESULT`, `LITE_FSM_INVALID_STORAGE_CALLBACK_RESULT`, `LITE_FSM_INVALID_REPLACEMENT_ACTION`.

В storage context `ctx.action` и `ctx.originalAction` доступны напрямую. `ctx.manager` имеет тип `StorageManagerContext<Extension["observedEvents"]>` и не раскрывает `routing`, `createScopedDeps`, `config`, `options`, `schemaVersion` или registry/kernel objects. `StorageDispatchContext` не экспортируется из root API, но `ctx.dispatch` доступен через public callback contexts, например `StorageReduceContext<Ext>["dispatch"]`. `ctx.dispatch.options`, `route`, `prevState` и `skipDelivery` доступны только для чтения; `ctx.dispatch.runtime` является mutable `Map`; `ctx.dispatch.nextState` заменяется как root accumulator. Action stage fields в `ctx.dispatch` отсутствуют. Если `Extension["routeMeta"]` задан, `routeMetaKeys` типизируется как `readonly (keyof Extension["routeMeta"] & string)[]`; без `routeMeta` сохраняется совместимость со списком строковых ключей. При подключении storage definition `definePlugin().create(...)` проверяет, что plugin объявляет resolver для каждого требуемого ключа и что тип первого параметра resolver assignable к соответствующему `Extension["routeMeta"][key]`. Неаннотированный `value` считается `unknown` и совместим только с требованием `unknown`. Core runtime валидирует protocol resolver result; raw value валидирует сам resolver, если plugin требует строгий input. Resolver вызывается только когда его key является единственным active routing key текущего action. Storage definitions регистрируются только через `definePlugin().create({ storage: [...] })` и `MachineManager(..., { plugins })`.

`snapshot.dehydrate(ctx)` возвращает `{ machines?, snapshot? }`; `snapshot` типизируется как `Extension["snapshotData"]` и сохраняется в `MachineManagerSnapshot["storage"][kind]`. `snapshot.hydrate(ctx)` получает `ctx.machines: Readonly<Record<string, unknown>>` и `ctx.snapshot: Extension["snapshotData"] | undefined`.

Configurable и multi-instance plugins типизируются как обычные factory functions вокруг `definePlugin().create(...)`; helper types принимают `ReturnType<typeof createCachePlugin>` так же, как concrete plugin value.

## Snapshots

| Тип                                            | Назначение                                                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `MachineRuntimeSnapshot<C, T>`                 | runtime domain slice (= `StateType<C, T>`)                                                        |
| `MachineRuntimeSnapshotForMachine<M>`          | runtime snapshot одного machine config                                                            |
| `SnapshotForMachine<M>` · `MachineSnapshot<M>` | transport snapshot одной machine                                                                  |
| `MachineManagerRuntimeSnapshot<S>`             | envelope из `getSnapshot()`; включает активные записи акторов, не включает `storage`              |
| `MachineManagerSnapshot<S>`                    | partial envelope для `hydrate()`; `machines` + optional `storage?: Record<string, unknown>`       |
| `MachineManagerDehydratedSnapshot<S, K>`       | точный envelope из `dehydrate()`; ключи `K` обязательны, `storage` остается optional              |
| `MachineManagerDehydrateResult<S, Keys>`       | результат `dehydrate({ machines: Keys })`: tuple keys обязательны, dynamic array остаётся partial |
| `MachineManagerDehydrateFn<S>`                 | overloads для `dehydrate`: `machines` и `storage` filters независимы                              |
| `SnapshotActorTemplateKey<S>`                  | ключи actor templates с `persistence: "snapshot"`                                                 |
| `SnapshotMachineKey<S>`                        | ключи доменных машин + ключи акторов, сохраняемых в снимок                                        |
| `DehydrateOptions<S>`                          | `{ machines?: ReadonlyArray<SnapshotMachineKey<S>>; storage?: readonly string[] }`                |

### Hydration

| Тип                        | Форма                                                                    |
| -------------------------- | ------------------------------------------------------------------------ |
| `HydrateStrategy`          | `"replace" \| "merge"`; режим применения снимка, не глубокое объединение |
| `HydrateOptions`           | `{ strategy?: HydrateStrategy }`                                         |
| `HydratePreviewOptions<S>` | `HydrateOptions & { baseState?: MachinesState<S> }`                      |
| `HydrateMeta`              | `{ strategy: HydrateStrategy }`                                          |
| `HydrateAction<S>`         | `{ type: "@@lite-fsm/HYDRATE"; payload: { strategy; snapshot } }`        |
| `UnknownMachineKeyContext` | `"hydrate" \| "opts.snapshot"`                                           |

`HydrateStrategy` различает частичное наложение и полный набор записей акторов. В обоих режимах `hydrate()` применяет только ключи из `snapshot.machines`; отсутствующие доменные машины не сбрасываются. Для обработчиков доменных машин значение приходит как `HydrateMeta["strategy"]`. `snapshot.storage[kind]` имеет базовый тип `unknown` внутри `Record<string, unknown>` и валидируется runtime, который зарегистрировал этот `kind`; неизвестный kind и runtime без snapshot capability являются ошибками.

## Persist

`@lite-fsm/persist` типизируется от того же `S extends MachineStore`, что и `MachineManager`.

| Тип                           | Форма / назначение                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `MaybePromise<T>`             | `T \| Promise<T>`                                                                                                   |
| `PersistedRecord<S>`          | `{ timestamp: number; storageVersion?: string \| number; snapshot: MachineManagerSnapshot<S> }`                     |
| `PersistStorage<S>`           | `{ get, set, remove, subscribe? }`, где value — typed `PersistedRecord<S>`                                          |
| `PersistStatus`               | `{ phase: "idle" } \| { phase: "restoring" } \| { phase: "ready"; restored } \| { phase: "error"; error }`          |
| `PersistRestoreSettledResult` | `{ phase: "ready"; restored } \| { phase: "error"; error }`                                                         |
| `PersistManagerOptions<S>`    | storage, `machines`, hydrate strategy, version/TTL/throttle, `shouldSave`, `migrate`, `onRestoreSettled`, `onError` |
| `PersistController`           | `start`, `restore`, `save`, `flush`, `clear`, `getStatus`, `subscribeStatus`                                        |

```ts
type Store = typeof machines;
type Record = PersistedRecord<Store>;
type Storage = PersistStorage<Store>;

const storage = createJsonStorage<Store>({
  key: "app:state:v1",
  storage: () => window.localStorage,
});

const persist = persistManager(manager, {
  storage,
  machines: ["profile"],
  shouldSave: ({ prevState, currentState, action }) => action.type !== "NOOP",
  onRestoreSettled: (result) => {
    if (result.phase === "error") console.error(result.error);
  },
});
```

`createJsonStorage` принимает только lazy factory `() => { getItem; setItem; removeItem }`; plain storage object типами отклоняется. Контракт `PersistStorage<S>` остаётся `{ get, set, remove, subscribe? }`, поэтому `subscribe` добавляется вручную через расширение adapter-а.

`PersistManagerOptions<S>["machines"]` использует `DehydrateOptions<S>["machines"]`: runtime actor templates без `persistence: "snapshot"` на уровне типов не принимаются. `migrate(record)` возвращает `MachineManagerSnapshot<S> | undefined`, поэтому старый transport record можно конвертировать без расширения core snapshot API.

### Actor snapshot hooks

| Тип                                  | Сигнатура                                                        |
| ------------------------------------ | ---------------------------------------------------------------- |
| `ActorDataSlice<C, T>`               | `{ state: ActorPublicState<C>; context: T }`                     |
| `DefaultActorSnapshot<C, T>`         | `ActorDataSlice<C, T>`                                           |
| `ActorSnapshotEntry<Snapshot>`       | `{ snapshot: Snapshot; meta: Readonly<ActorMeta> }`              |
| `ActorTemplateSnapshot<C, T>`        | `Record<string, ActorSnapshotEntry<DefaultActorSnapshot<C, T>>>` |
| `ActorHydrateHook<C, T, Snapshot>`   | `(prev, snapshot, meta: HydrateMeta) => ActorDataSlice<C, T>`    |
| `ActorDehydrateHook<C, T, Snapshot>` | `(slice) => Snapshot`                                            |

В `MachineManagerSnapshot` для актора, сохраняемого в снимок, хранится запись `{ snapshot, meta }` на каждого актора. Пользовательские обработчики получают только `snapshot`, фрагмент данных и meta `hydrate` со стратегией; `actorId`, `groupId` и `groupTag` остаются под управлением менеджера.

## Runtime интерфейсы

### `IMachine<C, T, P, D>`

| Ключ           | Тип                                                                                  |
| -------------- | ------------------------------------------------------------------------------------ |
| `config`       | `C`                                                                                  |
| `transition`   | `(state: StateType<C, T>, action: P) => StateType<C, T>`                             |
| `invokeEffect` | `(prev, current, deps: D & DefaultDeps<StateName<C> \| "*", C, P>) => Promise<void>` |

### `IMachineManager<S, P = MachineEvents<S>>`

| Ключ               | Тип                                                               |
| ------------------ | ----------------------------------------------------------------- |
| `transition`       | `(payload: ManagerAction<P>) => ManagerAction<P>`                 |
| `getState`         | `() => MachinesState<S>`                                          |
| `getSnapshot`      | `() => MachineManagerRuntimeSnapshot<S>`                          |
| `getHydratedState` | `(snapshot, opts?: HydratePreviewOptions<S>) => MachinesState<S>` |
| `hydrate`          | `(snapshot, opts?: HydrateOptions) => void`                       |
| `dehydrate`        | `MachineManagerDehydrateFn<S>`                                    |
| `onTransition`     | `(cb: TransitionSubscriber<S, P>) => () => void`                  |
| `replaceReducer`   | `(enhancer: (reducer) => reducer) => void`                        |
| `setDependencies`  | `(deps: MachineDependencies<S> \| updater) => void`               |

### Manager options и subscribers

| Тип                                    | Форма                                                                                                                                                           |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MachineManagerOptions<S, P, Plugins>` | `{ onError?, middleware?, snapshot?, schemaVersion?, onUnknownMachineKey?, onSchemaVersionMismatch?, originId?, generateActorId?, generateGroupId?, plugins? }` |
| `SpawnIdContext<P>`                    | `{ templateKey: string; groupTag: string; counter: number; originId: string \| undefined; action: ManagerAction<P> }`                                           |
| `GenerateSpawnIdFn<P>`                 | `(ctx: SpawnIdContext<P>) => string`                                                                                                                            |
| `Subscriber<C, T, P>`                  | `(prev: StateType<C, T>, current: StateType<C, T>, action: P) => void`                                                                                          |
| `TransitionSubscriber<S, P>`           | `(prev: MachinesState<S>, current: MachinesState<S>, action: ManagerCommitAction<S, ManagerAction<P>>) => void`                                                 |

`originId?: string` (без `#`) и кастомные `generateActorId` / `generateGroupId` обеспечивают изоляцию id между менеджерами в P2P / multi-tab / шарды-сценариях. Подробнее — в гайде [Распределенный спавн](/guide/actors#распределенный-спавн).

`MachineDependencies<S>` берёт пользовательские зависимости из `MachineConfig` / `TypedCreateMachineFn<P, D, typeof plugins>` и signatures `effects`, исключая runtime deps менеджера и актора.

## Typed factory aliases

`Typed*Fn` фиксируют `P`/`D` один раз для всего приложения. `TypedCreateMachineFn` дополнительно принимает plugin source и включает storage-specific machine typing из plugin storage definitions.

```ts
export const defineConfig: TypedCreateConfigFn<AppEvent> = createConfig;
export const defineReducer: TypedCreateReducerFn<AppEvent> = createReducer;
export const defineMachine: TypedCreateMachineFn<AppEvent, Deps> = createMachine;
export const defineEffect: TypedCreateEffectFn<AppEvent, Deps> = createEffect;
```

| Alias                                    | Фиксирует                                                          |
| ---------------------------------------- | ------------------------------------------------------------------ |
| `TypedCreateConfigFn<P>`                 | union событий для `CFG`                                            |
| `TypedCreateReducerFn<P>`                | `action` в reducer                                                 |
| `TypedCreateMachineFn<P, D, Plugins>`    | union событий, deps эффектов и optional plugin-aware storage typing |
| `TypedCreateEffectFn<P, D>`              | union событий и deps эффектов                                      |

## Alpha graph IR

`@lite-fsm/graph` экспортирует типы JSON-документа для tooling-слоя. Runtime-пакеты от него не зависят.

```ts
import {
  analyzeLiteFsmGraph,
  compileLiteFsmGraph,
  compileLiteFsmGraphProject,
  selectMachineGraph,
  type GraphJsonObject,
  type LiteFsmGraphDocument,
} from "@lite-fsm/graph";
import { createGraphSimulator, type GraphSimulationSnapshot } from "@lite-fsm/graph/simulator";

const result = compileLiteFsmGraph(source);
const projectResult = compileLiteFsmGraphProject({ entryFileName, projectRoot, host });
const document: LiteFsmGraphDocument = result.document;
const json: GraphJsonObject = { count: 1 };
const selected = selectMachineGraph(document, { managerKey: "machineKey" });
const analysis = analyzeLiteFsmGraph(document, { strict: true });
const snapshot: GraphSimulationSnapshot | undefined = createGraphSimulator(document).getSnapshot();
```

| Тип                                   | Форма                                                                                                                                                                               |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LiteFsmGraphResult`                  | `{ document: LiteFsmGraphDocument; diagnostics: GraphDiagnostic[] }`                                                                                                                |
| `LiteFsmGraphProjectResult`           | `LiteFsmGraphResult & { files: readonly LiteFsmGraphProjectFile[] }` для project graph compiler                                                                                     |
| `GraphAnalysisResult`                 | `{ diagnostics: GraphDiagnostic[] }` для semantic analyzer-а                                                                                                                        |
| `LiteFsmGraphDocument`                | `{ version: "lite-fsm.graph/v1", source, machines, managers, diagnostics }`                                                                                                         |
| `GraphLanguage`                       | `"ts" \| "tsx" \| "js" \| "jsx" \| "unknown"`                                                                                                                                       |
| `GraphSource`                         | `{ filename?, language, hash?, kind?, entryFileName?, files? }`; project mode использует `kind: "project"` и file-aware metadata                                                    |
| `GraphSourceFile`                     | `{ fileName, language, hash? }` для source files внутри project document                                                                                                            |
| `LiteFsmGraphManager`                 | manager metadata плюс `machineRefs: { key, machineId, loc? }[]`                                                                                                                     |
| `LiteFsmGraphMachine`                 | machine metadata плюс `kind`, `states`, `transitions`, `emissions`, `reducerCases`, `initialContextSummary`, `initialContextJson?`, `persistence?`                                  |
| `GraphState`                          | state metadata: `key`, `kind`, `isInitial`, `isPublicActorState`, optional `loc`                                                                                                    |
| `GraphStateRef` / `GraphEventRef`     | symbolic refs для source state и event type без привязки к runtime union                                                                                                            |
| `GraphJsonValue/Object`               | JSON-safe values для graph IR, simulator payload и initial context overrides                                                                                                        |
| `GraphTarget`                         | target union: concrete state, self, actor terminal, dynamic, blocked или unknown                                                                                                    |
| `GraphTransition`                     | accepted event edge слоя `config` или `reducer`                                                                                                                                     |
| `GraphReducerCase`                    | symbolic reducer branch: event, guard, state-write targets, confidence                                                                                                              |
| `GraphEmission`                       | событие, которое может отправить effect при входе в state; не является transition                                                                                                   |
| `GraphRouting`                        | routing emission-а: `default`, `unscoped`, `actor`, `group`, `tag` или `unknown`                                                                                                    |
| `GraphRoutingTarget`                  | literal, array, `self.actorId/groupId/groupTag` или dynamic routing target                                                                                                          |
| `GraphCondition`                      | captured guard/branch condition: text, kind и optional source location                                                                                                              |
| `GraphValueSummary`                   | summary для initial context или dynamic values: `empty`, `literal`, `object`, `array`, `external`, `dynamic`, `unknown`                                                             |
| `GraphDiagnostic`                     | `{ code, severity, message, machineId?, loc? }`                                                                                                                                     |
| `SourceLocation`                      | `{ fileName?, start, end }`; `fileName` заполняется в project mode                                                                                                                  |
| `MachineSelector`                     | `{ index }`, `{ id }`, `{ variableName }`, `{ exportName }`, `{ managerKey }` или `{ managerId, managerKey }`                                                                       |
| `SelectMachineGraphResult`            | success `{ ok: true, machine, diagnostics }` или failure `{ ok: false, candidates, diagnostics }`                                                                                   |
| `CompileLiteFsmGraphOptions`          | `{ filename?, language?, parser?: "static", maxMachines? }`                                                                                                                         |
| `CompileLiteFsmGraphProjectOptions`   | `{ entryFileName, projectRoot?, host }`; host владеет чтением source и module resolution                                                                                            |
| `LiteFsmGraphProjectHost`             | `{ readSource(fileName), resolveModule({ fromFileName, moduleSpecifier }) }`                                                                                                        |
| `LiteFsmGraphProjectModuleResolution` | discriminated union `resolved`/`core`/`external`/`not-found`/`unsupported-extension`                                                                                                |
| `LiteFsmGraphProjectFile`             | `{ fileName, language: "ts", roles, hash }`; roles: `entry`, `machine`, `barrel`, `helper`                                                                                          |
| `AnalyzeLiteFsmGraphOptions`          | `{ rules?: GraphAnalysisRuleId[], strict?: boolean, scope?: GraphAnalysisScope }`                                                                                                   |
| `GraphAnalysisScope`                  | `{ kind: "document" }`, `{ kind: "machine", machineId }` или `{ kind: "manager", managerId }`                                                                                       |
| `GraphAnalysisRuleId`                 | analyzer rule union: `unknown-target`, `unreachable-state`, `dead-end-state`, `actor-template-shape`, `reducer-config-consistency`, `effect-event-acceptance`, `wildcard-shadowing` |

`LiteFsmGraphDocument.diagnostics` содержит compiler diagnostics. Diagnostics analyzer-а возвращаются отдельно из `GraphAnalysisResult` и имеют коды `LFG_ANALYZER_*`.

## CLI project graph export document

`lite-fsm export-graph` пишет versioned JSON envelope для передачи project graph document в visualizer без повторного compile source. `lite-fsm visualize` использует тот же envelope внутри local session response. `@lite-fsm/cli` не публикует public TS entrypoint, поэтому типы ниже описывают JSON/HTTP contracts, а не импортируемые exports пакета.

```ts
type LiteFsmProjectGraphExportDocument = {
  version: "lite-fsm.project-graph-export/v1";
  createdBy: { package: "@lite-fsm/cli"; version: string };
  entry: { path: string; tsconfigPath?: string };
  graph: LiteFsmGraphDocument;
  files: readonly LiteFsmGraphProjectFile[];
  diagnostics: readonly CliDiagnostic[];
  sources?: {
    files: ReadonlyArray<{
      fileName: string;
      language: "ts";
      hash: string;
      text: string;
    }>;
  };
};
```

| Тип / поле           | Назначение                                                                                                           |
| -------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `entry.path`         | entrypoint path relative to CLI cwd, когда возможно                                                                  |
| `entry.tsconfigPath` | присутствует только если CLI использовал explicit или nearest tsconfig                                               |
| `graph`              | ровно `compileLiteFsmGraphProject(...).document`; `graph.diagnostics` хранит `LFG_*` diagnostics                     |
| `files`              | ровно `compileLiteFsmGraphProject(...).files`                                                                        |
| `diagnostics`        | только CLI diagnostics `LFC_*`; graph diagnostics печатаются командой, но в JSON остаются внутри `graph.diagnostics` |
| `sources`            | optional `--include-source` bundle; порядок и metadata совпадают с `files`, `text` не входит в `graph`               |

`CliDiagnostic` имеет форму `{ code, severity, message, file?, loc?, hint? }`, где `severity` — `"info" | "warning" | "error"`, а code в MVP: `LFC_INVALID_OPTIONS`, `LFC_TSCONFIG_NOT_FOUND`, `LFC_TSCONFIG_INVALID`, `LFC_GRAPH_PROJECT_FAILED`, `LFC_NO_MACHINES_EXPORTED`, `LFC_SOURCE_BUNDLE_FILE_UNREADABLE`, `LFC_VISUALIZER_STATIC_MISSING`, `LFC_VISUALIZER_PORT_UNAVAILABLE`, `LFC_VISUALIZER_SERVER_FAILED`, `LFC_VISUALIZER_OPEN_FAILED`, `LFC_WRITE_FAILED`.

### CLI visualize local session API

`lite-fsm visualize` печатает browser URL `/?session=<token>`. Query parameter `session` содержит token; API routes принимают тот же token через `token`.

```ts
type VisualizeSessionResponse = {
  ok: true;
  sessionId: string;
  capabilities: {
    mode: "local";
    canReadFiles: true;
    canWriteFiles: false;
    canApplyPatch: false;
    projectRoot: string;
  };
  entry: { path: string; tsconfigPath?: string };
  projectRoot: string;
  exportDocument: LiteFsmProjectGraphExportDocument;
};

type VisualizeSourceResponse = {
  ok: true;
  fileName: string;
  language: "ts";
  hash: string;
  text: string;
};

type VisualizeApiError = {
  ok: false;
  code: string;
  message: string;
};
```

| Route                                    | Contract                                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `GET /api/session?token=...`             | возвращает current session metadata и `LiteFsmProjectGraphExportDocument` без source text        |
| `GET /api/source?token=...&fileName=...` | возвращает source только для `exportDocument.files[].fileName`; hash совместим с graph file hash |

`/api/source` отклоняет absolute paths, `..`, encoded traversal и файлы вне allowlist. `409 source-stale` означает, что текущий file text уже не совпадает с `exportDocument.files[].hash`.

## Alpha graph simulator types

`@lite-fsm/graph/simulator` экспортирует типы headless simulation runtime. Они не зависят от DOM, React или app modules.

| Тип                            | Форма/назначение                                                                                                              |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `CreateGraphSimulatorOptions`  | `scope`, `actorMode`, `effectMode`, branch/evaluation policies, initial state/context overrides                               |
| `GraphSimulationScope`         | `{ kind: "document" }`, `{ kind: "manager", managerId }` или `{ kind: "machines", machineIds }`                               |
| `GraphSimulationEvent`         | `{ type: string; payload?: GraphJsonValue; meta?: GraphSimulationEventMeta }`                                                 |
| `GraphSimulationSliceRef`      | domain, actorTemplate или future actor ref                                                                                    |
| `GraphSimulationSnapshot`      | immutable текущие slices, slice indexes, diagnostics и `GraphSimulationTimeline`                                              |
| `GraphAvailableTransition`     | accepted/effective transition candidate с `canApply`, layer, target, guard и confidence                                       |
| `GraphSuggestedEmission`       | manual effect emission candidate последнего committed step                                                                    |
| `GraphSendResult`              | success `{ ok: true, snapshot, step }` или controlled failure `{ ok: false, reason, snapshot?, pendingChoice?, diagnostics }` |
| `GraphSimulationPendingChoice` | pending branch choice для `choose(...)`, keyed by `sliceId`                                                                   |
| `GraphEvaluationPolicy`        | optional symbolic hooks `evaluateTransition` и `reduceContext`; default policy не исполняет user code                         |

`sendFromTransition` принимает `payload`, но не принимает routing `meta`: routing override задается только через обычный `send({ event })` или через IR routing у `sendFromEmission`.

## Alpha graph view-model types

`@lite-fsm/graph/view-model` типизирует read-only данные для visualizer-а. Эти типы не содержат React, DOM, CodeMirror, layout или simulator runtime lifecycle.

| Тип                                            | Назначение                                                                                                                                                         |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GraphVisualizerModel`                         | root projection: machines, managers, topics, relations, diagnostics, row mappings, workbench models                                                                |
| `GraphMachineSummary` / `GraphManagerSummary`  | L1 inventory summaries с counts, topic types, source anchors и diagnostic ids                                                                                      |
| `GraphTopicSummary`                            | L2 event catalog: producers, config consumers, reducer branches, routing kinds/values                                                                              |
| `GraphMachineWorkbenchModel`                   | L3 state blocks, global behavior, rows, diagnostics и source anchors одной machine                                                                                 |
| `GraphWorkbenchRow`                            | union строк `config`, `reducer`, `effect`, `diagnostic`, `unknown`                                                                                                 |
| `GraphTargetView`                              | display-safe target: `state`, `self`, `terminal`, `dynamic`, `blocked`, `unknown`                                                                                  |
| `GraphSourceAnchor`                            | read-only source binding; `editable` всегда `false`                                                                                                                |
| `GraphDiagnosticAnchor`                        | build-local diagnostic id + origin + optional graph/source binding                                                                                                 |
| `GraphVisualizerRowMappingIndex`               | mapping transition/emission identifiers к `rowId`, включая folded reducer rows                                                                                     |
| `GraphVisualizerSimulationOverlayInput`        | готовые simulation ids/flags для подсветки rows без запуска simulator-а                                                                                            |
| `MachineFlowModel`                             | controlled `missing-machine` или ready semantic graph одной machine                                                                                                |
| `MachineFlowNode`                              | state/wildcard/effect-source/synthetic target node с semantic id, role, badges, anchors и stats                                                                    |
| `MachineFlowEdgeGroup`                         | grouped transition/emission edge с semantic refs, row refs, producer refs и diagnostics                                                                            |
| `MachineFlowRowRef` / `MachineFlowProducerRef` | compact source metadata для edge popover/detail panel без восстановления semantics в renderer; config/reducer row refs хранят `sourceStateKey` для wildcard labels |

`GraphConfigRow.foldedReducerTransitionIds` показывает reducer branches, свернутые в config row. Для команд visualizer app использует `GraphConfigRow.transitionId` или `GraphReducerRow.transitionId`; ambiguous/no-match mapping виден через `GraphVisualizerRowMappingIndex.diagnostics`.
`MachineFlowModel` хранит semantic ids (`stateId`, `rowId`, `edgeGroup.groupId`) и не хранит React Flow ids, layout coordinates, stroke/style hints или DOM state.

## Middleware

```ts
const logger: Middleware<AppState, AppEvent> = (api) => (next) => (action) => next(action);
```

| Тип                                     | Форма                                                                   |
| --------------------------------------- | ----------------------------------------------------------------------- |
| `Middleware<S = unknown, P = AnyEvent>` | `(api) => (next) => (action) => action`                                 |
| `MiddlewareApi<S, P>`                   | `getState`, `transition`, `replaceReducer`, `onTransition`, `condition` |
| `GenericMiddleware`                     | middleware, совместимое с любыми `S`/`P`                                |
| `VoidReducerMiddleware`                 | `GenericMiddleware & { __liteFsmAllowVoidReducer: true }`               |

`Middleware` работает с `ManagerAction<P>`, поэтому `api.transition`, `next` и `action` могут содержать routing `meta`.

## React

| Тип                                                       | Форма                                                                                                                                                              |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `FSMContextType<S = MachineStore, P = AnyEvent>`          | `IMachineManager<S, P>`                                                                                                                                            |
| `FSMPersistLifecycle`                                     | `{ start(): () => void }`                                                                                                                                          |
| `FSMContextProviderProps<S, P>`                           | `PropsWithChildren<{ machineManager; getServerSnapshot?; persist?: readonly FSMPersistLifecycle[] }>`                                                              |
| `FSMHydrationBoundaryProps<S, P>`                         | `PropsWithChildren<{ snapshot: MachineManagerSnapshot<S>; strategy?: HydrateStrategy; transitionAfterHydrate?: ManagerAction<P> \| readonly ManagerAction<P>[] }>` |
| `FSMStorageHydrationPreview`                              | `{ hasPreview: boolean; preview: unknown \| undefined; hasServerPreview: boolean; serverPreview: unknown \| undefined }`                                           |
| `TypedUseManagerHook<S, P>` · `TypedUseMachineHook<S, P>` | `() => IMachineManager<S, P>`                                                                                                                                      |
| `TypedUseSelectorHook<S>`                                 | `<R>(selector: (state: MachinesState<S>) => R, equalityFn?) => R`                                                                                                  |
| `TypedUseTransitionHook<P>`                               | `() => (payload: ManagerAction<P>) => ManagerAction<P>`                                                                                                            |

App-typed hooks:

```ts
type Store = typeof machines;
type Event = MachineEvents<Store>;

export const useManager: TypedUseManagerHook<Store, Event> = baseUseManager;
export const useSelector: TypedUseSelectorHook<Store> = baseUseSelector;
export const useTransition: TypedUseTransitionHook<Event> = baseUseTransition;
```

`TypedUseSelectorHook<S>` принимает `MachineStore`, не computed `MachinesState<S>`. `getServerSnapshot` — root state shape `MachinesState<S>`, не dehydrated envelope; custom функция должна возвращать стабильный snapshot для SSR/hydration pass. `transitionAfterHydrate` принимает plain manager action или readonly array actions и выполняется только на клиенте после boundary hydrate. `useStorageHydrationPreview(storageKind)` возвращает `FSMStorageHydrationPreview`; оба payload поля имеют тип `unknown`, чтобы plugin packages сами валидировали `snapshot.storage[kind]`. `persist` принимает только readonly array lifecycle entries; `@lite-fsm/persist/react` читает массив статусов через provider context, а lifecycle-only entry представлен как `null`. `@lite-fsm/react` не импортирует `@lite-fsm/persist` или `@lite-fsm/entities`.

### React `defineMachine`

```ts
const useCounter = defineMachine<AppEvent, Deps>().create(counter);
const count = useCounter((slice) => slice.context.count);
useCounter.transition({ type: "INC" });
```

Возвращает hook `(selector, equalityFn?) => R` + методы standalone machine: `transition`, `getState`, `onTransition`, `addMiddleware`.

## Шаблоны вывода типов

### Strict машина через `satisfies`

```ts
const machine = {
  config: { idle: { START: "loading" }, loading: { DONE: "idle" } },
  initialState: "idle",
  initialContext: { value: 0 },
} satisfies MachineConfig<Config, Context, Event>;
```

Используйте, когда важны derived: `MachineEvents`, `MachineDependencies`, `MachinesState`, snapshot-типы, typed hooks.

### Store-уровень

```ts
export const machines = { counter, request };

export type Store = typeof machines;
export type AppState = MachinesState<Store>;
export type AppEvent = MachineEvents<Store>;
export type AppDeps = MachineDependencies<Store>;
export type AppSnapshot = MachineManagerSnapshot<Store>;
export type AppManager = IMachineManager<Store, AppEvent>;
```

## Подводные камни

| Камень                     | Правило                                                                                        |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| расширенный `initialState` | используйте literal / `as const`, иначе state станет `string`                                  |
| потерянные derived events  | типизируйте через `MachineConfig` или typed factory                                            |
| `FSMEvent<"X", undefined>` | payload обязателен: `{ type: "X", payload: undefined }`                                        |
| wildcard target            | `"*"` — только source key, не target и не `initialState`                                       |
| actor `__INIT`             | system state, не public state и не effect key                                                  |
| runtime actors в snapshot  | `DehydrateOptions` принимает только ключи доменных машин и ключи акторов, сохраняемых в снимок |
| `MachineManager({})`       | events → `never`, deps → `{}`, state → `{}`                                                    |
| тип action в middleware    | используйте `ManagerAction<P>`, если нужен routing `meta`                                      |
| `TypedUseSelectorHook`     | generic `S` — store config, не computed state                                                  |

## Команды

| Проверка                  | Команда                    |
| ------------------------- | -------------------------- |
| Типы по source packages   | `pnpm run test:types`      |
| Типы по собранным пакетам | `pnpm run test:types:dist` |
| Полный type-loop          | `pnpm run test:types:all`  |
