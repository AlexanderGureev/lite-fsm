# @lite-fsm/entities и entity actor runtime — реализационное ТЗ, часть 1

## 1. Цель

Реализовать пакет `@lite-fsm/entities` для массовых игровых сущностей через entity actor runtime, внутреннее columnar storage, типизированную spawn composition и scoped entity lifecycle. Основная модель разработки остается `createMachine`, `config`, `reducer`, `effects` и `MachineManager.transition`; entity runtime добавляет batch storage и composition поверх этой модели, не превращая core в ECS.

## 2. Как выполнять это ТЗ

Этот файл покрывает этапы 1-6. После gate этапа 6 работа продолжается в `spec/tz-entities-implementation-part-2.md`.

Реализация идет строго по этапам. Этап `N+1` начинается только после полного выполнения gate этапа `N`.

Для каждого этапа:

- читать разделы 1-4, общие требования этого раздела и текущий этап;
- реализовывать только scope текущего этапа;
- не переносить требования из следующих этапов в текущий этап без явной причины;
- добавлять runtime tests, type tests, snapshot tests, React tests, benchmark tests и проверки диагностики только для измененного контракта этапа;
- сохранять существующие behavior tests как регрессионный контракт;
- обновлять `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`, README и package docs при изменении public API или public types;
- не запускать сборку документации и команды, которые транзитивно запускают docs build.

Запрещенные для агента проверки:

- `pnpm run build`;
- `pnpm --filter @lite-fsm/docs build`;
- `pnpm run docs:build`;
- `pnpm run pages:build*`;
- любой `next build` внутри `apps/docs`.

Если нужна проверка сборки документации, ее выполняет пользователь. Для агентной проверки пакетов используется `pnpm run build:packages`, если этап требует build-проверки и команда не запускает docs build.

### Предусловия и зависимости

- Plugin system из `spec/tz-plugin-system-implementation.md` реализована первой и прошла собственный gate.
- `@lite-fsm/entities` подключается к `MachineManager` через `plugins`.
- `@lite-fsm/entities` регистрирует `storage: "entity"` через `ctx.storage.register(...)`.
- Entity runtime использует storage runtime capability blocks `effects`, `snapshot`, `identity` и `reactions`.
- Entity runtime использует action interceptors для public spawn events.
- Entity runtime использует routing meta registry для `meta.entityId`.
- Entity runtime использует scoped deps и scoped transition extensions для entity effects и reactions.
- Entity runtime использует manager extensions для `manager.entities`.
- `@lite-fsm/core` не содержит реализацию entity runtime и не импортирует `@lite-fsm/entities`.
- `@lite-fsm/entities` добавляется как публичный package в `packages/entities` с alpha status в README и package docs.
- `@lite-fsm/entities` не является dependency пакета `@lite-fsm/core`.

### Термины

- Entity — игровая сущность с публичным `entityId` и внутренним `entityIndex`.
- `entityId` — обычная строка во внешнем API, spawn recipes, snapshot, routing и React hooks.
- `entityIndex` — внутренний индекс columnar arrays. Public branded `EntityRef` в MVP не вводится.
- Actor template — `createMachine(...)`, описывающий behavior slice сущности: movement, sprite sync, health, enemy AI, projectile lifetime, status effect, audio или animation.
- Actor template является единицей поведения, а не data-only компонентом.
- Отдельный actor template создается для самостоятельного lifecycle, state machine, event handling, reducer logic, reaction или effect.
- Данные без собственного поведения хранятся в `initialContext` schema ближайшего actor template.
- Поле, которое всегда изменяется вместе с другим поведением, остается в том же actor template.
- `dx`/`dy` velocity хранится в `movementActor`, если velocity не имеет собственного lifecycle/events.
- `spriteId` хранится в `spriteSyncActor`, а не в отдельном data-only actor.
- Projectile `ticksLeft` и `damage` могут жить в одном `projectileActor`, если lifetime и payload являются одним behavior slice.
- Новый actor template не создается только ради группировки колонок.
- Новый actor template создается, если его можно независимо добавить или убрать из entity через spawn recipe.
- Actor template может читать другой actor через `entities.get(...)`/`entities.maybe(...)`, но не должен становиться копией ECS system/component пары без state machine смысла.
- Actor row — наличие конкретного actor template у конкретной entity.
- `groupTag` — публичная группа entity instance. Она задается в `EntitySpawnSpec`, является свободной строкой и не выводится из recipe key.
- У одной entity ровно один `groupTag`; все actor rows этой entity наследуют `groupTag` из `EntitySpawnSpec`.
- `spawnEvents` — источник истины для public spawn event names и payload types.
- Spawn recipe — функция, которая по payload public spawn event возвращает `EntitySpawnSpec` или массив `EntitySpawnSpec[]`.
- `EntityStore` — manager-owned runtime state всех entity ids, generations, group tags, alive flags и free slots.
- `ColumnarActorStore` — manager-owned runtime state одного entity actor template, индексированный по global `entityIndex`.
- Public state slice — lightweight read model для selectors и `MachinesState`, не источник истины для columns.
- Scope — captured entity invocation context с `entityIndex`, `generation`, source template, event, phase и reusable buffers.

### Область работ

- Пакет `@lite-fsm/entities`.
- Entity plugin `entitiesPlugin(...)`.
- `EntityMachineExtension` для `TypedCreateMachineFn`.
- `storage: "entity"` runtime поверх internal columnar storage.
- Schema descriptors `f32`, `i16`, `i32`, `u8`, `string`, `optional`.
- `defineSpawnEvents`, `spawnEvent<T>()`, `SpawnEventsFrom<TSpawnEvents>`.
- `defineEntitySpawn(machines, spawnEvents)`.
- Public spawn events через `manager.transition(...)`.
- `manager.entities` и typed `EntityAccess<AppState>`.
- Scoped `transition.entity(...)`, `transition.tag(...)`, `transition.actor(...)`, `transition.despawn(...)` внутри entity effects.
- `ENTITY_SPAWNED` и `ENTITY_DESPAWNED` как system lifecycle events только внутри entity runtime.
- Batch reducers, effects и reactions поверх `self.indices`.
- Snapshot/hydrate для entity storage через `snapshot.storage.entity`.
- `@lite-fsm/entities/react` read hooks.
- Benchmarks против hand-written SoA ECS baseline.

### Вне области работ

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
- Graph/devtools provider API, graph UI и devtools UI.

### Общие тестовые ожидания

- Coverage является обязательным gate: новый и измененный код должен иметь 100% покрытие по statements, branches, functions и lines.
- 100% coverage не заменяет сценарное покрытие. Для каждого критерия приемки нужны позитивные, негативные, граничные и error-path tests там, где сценарий имеет отдельный outcome.
- Каждый этап добавляет или обновляет только тесты своего scope и непосредственно затронутых контрактов.
- Нельзя переходить к следующему этапу с падающими проверками затронутого scope или незакрытыми coverage gaps текущего этапа.
- Текущие тесты `@lite-fsm/core` проходят без изменения пользовательских сценариев.
- Тесты поведения являются источником истины для обратной совместимости. Их нельзя переписывать под новую реализацию, если public behavior не меняется.
- Тесты, привязанные к internal functions, которые удалены или переехали при рефакторинге, обновляются на нового владельца поведения или заменяются тестами публичного контракта.
- Runtime tests покрывают spawn transaction, duplicate entity ids, empty actors validation, `transition.despawn(...)`, entity routing, `groupTag` routing, `despawnOn`, bucket updates, stale scope validation, read-only effects/reactions и reaction error handling.
- Type tests покрывают `EntityMachineExtension`, `initialContext` schema inference, `spawnSchema` payload inference, `SpawnEventsFrom`, `defineEntitySpawn`, `manager.entities`, `EntityAccess<AppState>` и исключение lifecycle events из public `manager.transition`.
- Snapshot tests покрывают JSON round-trip, legacy snapshot без `generation`/`rowVersion`, hydrate replace invalidation, sidecar rebuild и routing after hydrate.
- React tests покрывают row-level subscription invalidation.
- Benchmark tests покрывают movement update, projectile lifetime update, `despawnOn` cleanup и sprite sync reaction.
- Названия новых `describe`/`it`/`test` пишутся на русском; API-термины остаются на английском.

### Общие инварианты

- Public API использует термин `entity`, а не `columnar`.
- `@lite-fsm/core` не импортирует внешние plugin packages.
- Core manager не знает про entity store, columnar layout, generation, spawn recipes, buckets, lifecycle и reactions.
- Entity runtime не реализует middleware, subscribers или committed public action stream API.
- Entity lifecycle events остаются внутри entity storage runtime.
- Entity lifecycle events не проходят через public `transition`, middleware, generic action interceptors, subscribers или committed public action stream как отдельные committed actions.
- `storage: "instance"` сохраняет текущую semantics.
- `storage: "entity"` использует `config-default` transition policy.
- Entity actor row создается только через spawn recipes, internal spawn transaction или hydrate.
- `generateActorId` и `generateGroupId` из `MachineManagerOptions` не применяются к `storage: "entity"`.
- Runtime хранит `indexById: Record<string, EntityIndex>` и переводит `entityId` в `entityIndex` до hot path.
- Columns не попадают в `manager.getState()`.
- Public state slice является lightweight read model.
- Reducer мутирует только `self`.
- Foreign actor store mutations выполняются через events.
- Effects выполняют mutation только через `transition(...)`.
- Reactions являются sync-only.
- `ENTITY_DESPAWNED` reactions видят columns до cleanup.
- `payloadFor(entity)` работает только в reducer на `ENTITY_SPAWNED`; reactions/effects читают инициализированные columns через `self`/`entities`.
- Hydrate не вызывает spawn recipes.
- `actorId` routing к entity actor rows не поддерживается.
- `groupTag` берется из `EntitySpawnSpec`.
- Hot path не делает string comparisons, per-row objects, `Map.get` и allocations на `TICK`.

### Общие ошибки конфигурации

Следующие ошибки являются init-time/runtime contract errors и бросаются независимо от `IS_DEV`, если runtime не может безопасно продолжить:

- `storage: "entity"` без установленного `entitiesPlugin(...)`;
- duplicate storage kind `entity`;
- invalid `storage: "entity"` machine config;
- отсутствующий `initialState`;
- `initialState` entity actor template не равен `"__INIT"`;
- отсутствующий `initialContext`;
- отсутствующий `spawnSchema`;
- `initialContext` не является schema descriptor object;
- `spawnSchema` не является schema descriptor object;
- `optional(...)` в `initialContext`;
- default values в `spawnSchema`;
- nested object, array, `Map` или `Set` в schema;
- reserved column name;
- `groupTag` на actor template;
- custom event edge из `__INIT` entity template;
- public dispatch `ENTITY_SPAWNED` или `ENTITY_DESPAWNED`;
- lifecycle event names как keys в `spawnEvents` или recipe object, переданном в `defineEntitySpawn(...)`;
- invalid recipe output;
- duplicate `EntitySpawnSpec.id` против live entity или внутри одного recipe result;
- empty `EntitySpawnSpec.actors`;
- unknown actor key в recipe output;
- actor payload shape mismatch;
- invalid `stateCode` после reducer;
- invalid `despawnOn` state;
- `entities.get(...)` required-access failure при diagnostics;
- stale captured scope;
- `manager.setDependencies({ entities })` с `entities`, не равным `manager.entities`;
- Promise return из reaction;
- exception в reaction;
- snapshot schema mismatch;
- inconsistent snapshot lengths for `ids`, `alive`, `generation`, `groupTagByIndex` или `freeList`;
- explicit `dehydrate({ storage: ["entity"] })` без snapshot capability;
- hydrate данных known storage runtime без snapshot capability.

`IS_DEV` используется только для дорогих диагностических проверок, которые не нужны для корректности production hot path.

## 3. Целевой public API

### `entitiesPlugin(...)`

```ts
import { entitiesPlugin } from "@lite-fsm/entities";

const manager = MachineManager(machines, {
  plugins: [entitiesPlugin()],
});

const managerWithSpawn = MachineManager(machines, {
  plugins: [
    entitiesPlugin({
      spawn,
    }),
  ],
});
```

Контракт:

- `entitiesPlugin(...)` является generic factory.
- `entitiesPlugin()` разрешен и устанавливает entity storage/runtime без public spawn events.
- `entitiesPlugin({ spawn })` включает public spawn events.
- `spawn` должен быть результатом `defineEntitySpawn(machines, spawnEvents)`.
- Plugin capabilities для spawn transition events выводятся из `spawnEvents`, сохраненного в `spawn`.
- Plugin регистрирует `storage: "entity"` через `ctx.storage.register(...)`.
- Registered runtime реализует `StorageRuntimeBase` и capability blocks `effects`, `snapshot`, `identity`, `reactions`.
- Plugin расширяет returned manager через `manager.entities`.
- Plugin расширяет `manager.transition(...)` type через `SpawnEventsFrom<typeof spawnEvents>`, если entity spawn включен.
- Plugin регистрирует action interceptor для public spawn events, если entity spawn включен.
- Plugin регистрирует route resolver для `meta.entityId`.
- Plugin регистрирует scoped deps и scoped transition extensions для entity effects/reactions.

### `EntityMachineExtension`

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

Контракт:

- Extension подключается только через typed wrapper `TypedCreateMachineFn<AppEvents, AppDeps, EntityMachineExtension>`.
- Extension не меняет global `createMachine` typing.
- Extension не добавляет lifecycle events в public `AppEvents`.
- Extension сохраняет `initialContext` и `spawnSchema` как phantom metadata в result type каждого entity actor template.
- Extension metadata используется `MachinesState<typeof machines>` и `EntityAccess<AppState>`.
- `storage: "entity"` actor template типизируется только при подключенной extension.

### Spawn events

```ts
const spawnEvents = defineSpawnEvents({
  SPAWN_PROJECTILE: spawnEvent<ProjectileSpawn>(),
});

type SpawnEvents = SpawnEventsFrom<typeof spawnEvents>;
```

Контракт:

- `defineSpawnEvents(...)` возвращает typed config value.
- `spawnEvent<T>()` задает payload type для spawn event.
- Ключи config являются event `type`.
- `SpawnEventsFrom<typeof spawnEvents>` выводит discriminated union.
- Payload type сохраняется в `manager.transition(...)` и `defineEntitySpawn(...)`.
- Библиотека не подмешивает `SpawnEvents` в `createMachine<AppEvents>` автоматически.
- Разработчик не обязан добавлять `SpawnEventsFrom<typeof spawnEvents>` в `AppEvents`, чтобы отправлять spawn events через `manager.transition(...)`.
- Machines, включая `storage: "entity"` templates, могут обработать public spawn event только если разработчик явно включил `SpawnEvents` в `AppEvents`.

### Entity spawn

```ts
const spawn = defineEntitySpawn(machines, spawnEvents)({
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
      projectileActor: {
        ticksLeft: payload.ticksLeft,
        damage: payload.damage,
      },
    },
  }),
});
```

Контракт:

- Recipe keys совпадают с keys `spawnEvents`.
- Recipe callback payload выводится из `spawnEvents`.
- `defineEntitySpawn(...)` возвращает единый spawn descriptor для `entitiesPlugin({ spawn })`.
- Recipe может вернуть один `EntitySpawnSpec` или массив `EntitySpawnSpec[]`.
- Пустой массив specs разрешен и означает no-op spawn event.
- `EntitySpawnSpec.id` обязателен.
- `EntitySpawnSpec.id` должен быть уникален среди live entities и specs одного recipe result, но может использоваться повторно после despawn.
- `EntitySpawnSpec.groupTag` обязателен и типизируется как `string`.
- `EntitySpawnSpec.actors` содержит хотя бы один actor row.
- `actors` keys являются subset entity actor keys из `machines`.
- `actors` не может ссылаться на domain machine или `storage: "instance"` actor template.
- Actor payload проверяется по actor `spawnSchema`.

### `manager.entities`

```ts
type AppState = MachinesState<typeof machines>;

type AppDeps = {
  getState: () => AppState;
  entities: EntityAccess<AppState>;
};

manager.setDependencies({
  getState: manager.getState,
  entities: manager.entities,
});
```

Контракт:

- `manager.entities` создает runtime-owned accessor к entity actor stores.
- `manager.entities` является stable live accessor object на весь lifetime manager и переживает hydrate replace.
- Разработчик не создает `entities` вручную.
- Разработчик сам передает `manager.entities` в `setDependencies(...)`; plugin не подмешивает `entities` автоматически.
- `EntityAccess<AppState>` выводит доступные keys из `MachinesState<typeof machines>` и включает только `storage: "entity"` actor templates.
- Обычные domain/process machines читаются через `getState()`.
- Для `entities` не требуется ручной `AppActorRegistry` или codegen.
- Если user deps содержит `entities`, не равный `manager.entities`, plugin бросает clear error через deps extension.
- Core plugin system не хардкодит key `entities`.

### `EntityAccess<AppState>`

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

Контракт:

- `entities.get("actorKey")` является required access.
- `entities.maybe("actorKey")` является optional access.
- Store view кешируется per `actorKey`: повторный `entities.get("actorKey")` возвращает тот же live view object.
- Store view читает current committed columns и переживает hydrate replace.
- `actorKey` типизируется по entity actor keys из `AppState`.
- Unknown `actorKey` является TypeScript error.
- Return type выводится из `initialContext` actor template.
- `EntityAccess<AppState>` строит key union только из machines с `storage: "entity"`.
- `entities.get(...)` validation проверяет, что каждая entity из текущего `self.indices` имеет requested actor row, если runtime diagnostics включены.
- `entities.maybe(...)` не валидирует наличие actor row.
- Optional access требует проверки `store.has(entity)` перед чтением actor columns.

### Scoped transition extensions

Внутри entity effects доступны:

```ts
transition(action);
transition.entity(entityId, action);
transition.entity([entityIdA, entityIdB], action);
transition.tag(groupTag, action);
transition.tag([groupTagA, groupTagB], action);
transition.actor(actorId, action);
transition.despawn(entityId);
transition.despawn(self.indices);
```

Контракт:

- `transition(action)` внутри entity effect остается unscoped.
- `transition.entity(...)` доставляет action actor rows указанной entity или entities.
- `transition.tag(...)` доставляет action entity rows указанной entity `groupTag`.
- `transition.actor(...)` является escape hatch для существующих `storage: "instance"` actors и не адресует entity actor rows.
- `transition.despawn(...)` доступен только в entity effects; public `manager.despawn(...)` и non-entity scoped `transition.despawn(...)` не добавляются.
- В entity effect `transition.despawn(...)` принимает entity ids или entity indices из captured scope.
- `transition.entities(...)` не входит в MVP.
- `transition.unscoped(...)` не требуется, потому что `transition(action)` уже unscoped.

### `LiteFsmEntityLifecycleEvents`

```ts
type LiteFsmEntityLifecycleEvents =
  | { type: "ENTITY_SPAWNED" }
  | { type: "ENTITY_DESPAWNED" };
```

Контракт:

- `ENTITY_SPAWNED` и `ENTITY_DESPAWNED` не входят в пользовательский `AppEvents`.
- Lifecycle event names не доступны как keys в `spawnEvents` и recipe object, переданном в `defineEntitySpawn(...)`.
- Public `manager.transition({ type: "ENTITY_SPAWNED" })` и `manager.transition({ type: "ENTITY_DESPAWNED" })` запрещены.
- Если пользователь ошибочно добавил lifecycle event names в `AppEvents`, runtime reject-ит public dispatch.
- TypeScript best-effort исключает `LiteFsmEntityLifecycleEvents` из public `manager.transition(...)`.
- Lifecycle events доступны только в `storage: "entity"` config/reducer/reactions.
- `@lite-fsm/core` не хардкодит `LiteFsmEntityLifecycleEvents`.

### Schema descriptors

Поддерживаемые descriptors MVP:

```ts
f32(opts?)
i16(opts?)
i32(opts?)
u8(opts?)
string(opts?)
optional(inner)
```

Контракт:

- Numeric descriptors используют typed arrays.
- `string()` использует string array.
- `optional(...)` поддерживает nullable values только в `spawnSchema`.
- `optional(...)` запрещен в entity `initialContext`.
- `initialContext` descriptors всегда non-nullable.
- `opts.default` задает default value только для `initialContext`.
- Отсутствие default означает `0` для numeric и `""` для string.
- Все поля `spawnSchema` обязательны по ключу.
- Defaults в `spawnSchema` запрещены.
- Если nullable spawn payload нужен, используется `optional(inner)`; ключ payload остается required, value type становится `T | null`.
- Descriptors несут phantom types для value type, column type и spawn payload type.
- Reserved column names запрещены: `count`, `capacity`, `ids`, `indexById`, `alive`, `generation`, `freeList`, `stateCode`, `version`, `columns`, `presence`, `rowVersion`, `indices`, `states`.

### Package exports

Package exports:

- `"."` — runtime и type exports.
- `"./react"` — React hooks.
- `"./package.json"` — package metadata.

Обязательные exports из `"."`:

- `entitiesPlugin`;
- `defineSpawnEvents`;
- `defineEntitySpawn`;
- `spawnEvent`;
- `type SpawnEventsFrom`;
- `f32`;
- `i16`;
- `i32`;
- `u8`;
- `string`;
- `optional`;
- `type EntityId`;
- `type EntityIndex`;
- `type EntityAccess`;
- `type LiteFsmEntityLifecycleEvents`;
- `type EntityMachineExtension`.

Обязательные exports из `"./react"`:

- `useEntitySnapshot`;
- `useEntityCount`;
- `useEntityList`.

## 4. Целевая runtime architecture

`entitiesPlugin(...)` использует plugin system как внешний manager/runtime каркас, но внутри `@lite-fsm/entities` имеет собственную storage runtime architecture.

Целевая структура:

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

Owners и module boundaries:

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
- `react/index.ts` реализует React hooks на `useSyncExternalStore` и rowVersion cache.

Внутренний pipeline entity storage runtime:

1. Compile валидирует `storage: "entity"` config, `spawnSchema`, `initialContext`, `__INIT`, `despawnOn`, reactions/effects и компилирует numeric metadata.
2. Transaction prepare создает entity transaction в `DispatchContext`; spawn interceptor stage-ит spawn operations, но не мутирует live runtime state.
3. Route and batch выбирает entity indices и actor rows по normalized route constraints и reusable buffers.
4. Reduce применяет default transition, вызывает reducer один раз на batch, валидирует `stateCode` и собирает touched rows.
5. Lifecycle выполняет staged spawn через internal `ENTITY_SPAWNED`, explicit despawn, `despawnOn` и internal `ENTITY_DESPAWNED`.
6. Commit применяет staged column/state/presence changes, обновляет buckets, `rowVersion`, actor `version` и public lightweight slices.
7. Reactions выполняются после reducer/lifecycle processing и до subscribers; `ENTITY_DESPAWNED` reactions видят columns до окончательного cleanup.
8. Effects создают captured invocations с `entityIndex + generation`; core вызывает effect phase после subscribers и middleware post-`next`.

Граница core:

- core задает только внешний lifecycle, routing meta, storage runtime contracts, commit/subscribers/effects boundary и deps extension pipeline;
- core не знает про entity store, columnar layout, generation, spawn recipes, buckets, lifecycle и reactions;
- core не импортирует `@lite-fsm/entities`;
- core не хардкодит `LiteFsmEntityLifecycleEvents`, `manager.entities`, `meta.entityId` или key `entities`;
- entity runtime не обращается к public `MachinesState` как source of truth для columns;
- hot path не проходит через `plugin.ts`;
- validate, transform и mutate остаются отдельными владельцами.


## 5. Этапы реализации

### Этап 1 — Пакет `@lite-fsm/entities`, exports, plugin shell и `storage: "entity"` registration

#### Цель

Создать package shell `@lite-fsm/entities`, базовые package exports, `entitiesPlugin(...)` и регистрацию `storage: "entity"` через plugin system без реализации schema descriptors, actor rows, spawn recipes и lifecycle.

#### Зависит от

- Plugin system полностью реализована.
- В core доступны `MachineManager(..., { plugins })`, `ctx.storage.register(...)`, storage runtime contract и duplicate/unknown storage diagnostics.

#### Меняется public API

Добавить:

- package `packages/entities`;
- workspace dependency entry `@lite-fsm/entities: workspace:*` в root `package.json` для tests/type tests/smoke imports;
- export `"."`;
- export `"./package.json"`;
- `entitiesPlugin(...)`;
- `type EntityId`;
- `type EntityIndex`.

Export `"./react"` не добавляется до этапа React hooks.

#### Runtime-контракт этапа

- `entitiesPlugin(...)` устанавливается через `MachineManager(machines, { plugins: [entitiesPlugin(...)] })`.
- Plugin вызывает `ctx.storage.register("entity", entityStorageRuntime)`.
- Registered runtime реализует минимальный `StorageRuntimeBase`, достаточный для manager init и clear diagnostics.
- `storage: "entity"` без `entitiesPlugin(...)` бросает unknown storage kind через plugin system.
- Повторная регистрация `storage: "entity"` бросает duplicate storage kind.
- `@lite-fsm/core` не импортирует `@lite-fsm/entities`.
- Package не добавляет entity-specific code в обычный app bundle без импорта `@lite-fsm/entities`.
- Runtime shell не создает rows, columns, spawn transactions, effects, reactions или snapshots.
- `storage: "instance"` сохраняет текущую semantics.

#### Типовой контракт этапа

- `entitiesPlugin(...)` типизируется как `LiteFsmPlugin` с capabilities, которые реально работают на этом этапе.
- `EntityId` является `string`.
- `EntityIndex` является branded `number`.
- `entitiesPlugin(...)` пока не добавляет spawn transition events, manager extensions, action meta или machine extension types.

#### Диагностика и ошибки

- Unknown `storage: "entity"` без plugin должен быть clear init error.
- Duplicate storage kind `entity` должен быть clear init error.
- Invalid plugin options текущего этапа должны давать clear init error.
- Ошибка из `entitiesPlugin(...).install(...)` пробрасывается вызывающему `MachineManager(...)`.

#### Совместимость

- `MachineManager(machines)` без plugins работает как раньше.
- `MachineManager(machines, { plugins: [entitiesPlugin(...)] })` не меняет behavior существующих `storage: "instance"` machines.
- Existing core runtime, snapshot, effects, middleware и type tests остаются валидными.

#### Не делать в этом этапе

- Не добавлять `EntityMachineExtension`.
- Не добавлять schema descriptors.
- Не добавлять `manager.entities`.
- Не добавлять `defineSpawnEvents`, `spawnEvent`, `SpawnEventsFrom` или `defineEntitySpawn`.
- Не добавлять lifecycle events.
- Не добавлять columnar stores.
- Не добавлять entity routing.
- Не добавлять React hooks.
- Не добавлять benchmarks.

#### Тесты этапа

Runtime tests:

- package can be imported from `@lite-fsm/entities`;
- `entitiesPlugin(...)` installs once through `MachineManager`;
- `storage: "entity"` without plugin throws unknown storage kind;
- duplicate `storage: "entity"` registration throws duplicate storage kind;
- no-op install не меняет behavior `storage: "instance"`;
- `@lite-fsm/core` bundle/import graph не импортирует `@lite-fsm/entities`.

Type tests:

- `entitiesPlugin(...)` является `LiteFsmPlugin`;
- `EntityId` совместим со строкой;
- `EntityIndex` не является plain public input type для user-facing APIs.

#### Gate завершения

- Все тесты этапа проходят.
- Existing tests затронутого scope проходят.
- Package metadata и exports корректны.
- Public API changes отражены в cheatsheets и package docs.
- Coverage нового и измененного кода этапа равен 100%.
- Docs build не запускался.

### Этап 2 — Schema descriptors и `EntityMachineExtension`

#### Цель

Добавить schema descriptors, storage-specific typing для entity actor templates и runtime validation template config без создания runtime rows и без lifecycle delivery.

#### Зависит от

- Этап 1.
- Plugin system type-level machine extensions реализованы.

#### Меняется public API

Добавить:

- `f32`;
- `i16`;
- `i32`;
- `u8`;
- `string`;
- `optional`;
- `type EntityMachineExtension`.

`LiteFsmEntityLifecycleEvents` еще не добавляется как public lifecycle contract; lifecycle typing добавляется на этапе 4.

#### Runtime-контракт этапа

- `storage: "entity"` templates валидируются entity runtime на manager init.
- `initialState` обязателен и должен быть `"__INIT"`.
- `initialContext` обязателен и является schema descriptor object, а не готовым runtime context object.
- `spawnSchema` обязателен; пустой spawn payload задается как `spawnSchema: {}`.
- Actor без columns задает `initialContext: {}`.
- `initialContext` задает будущий columnar storage layout, default values, `self` columns, `EntityAccess` columns, snapshot value shape и phantom metadata.
- `spawnSchema` задает actor-specific payload для будущего `ENTITY_SPAWNED`.
- Runtime не заполняет columns автоматически из spawn payload.
- `groupTag` не задается на `storage: "entity"` actor template.
- `storage: "instance"` сохраняет текущую поддержку custom `__INIT` events и обычный `initialContext`.

#### Типовой контракт этапа

- `EntityMachineExtension` подключается только через typed wrapper `TypedCreateMachineFn<AppEvents, AppDeps, EntityMachineExtension>`.
- Global `createMachine` typing не меняется.
- `storage: "entity"` actor template типизируется только при подключенной extension.
- `initialContext` сохраняется как phantom `entityContextSchema`.
- `spawnSchema` сохраняется как phantom `entitySpawnSchema`.
- `spawnSchema` выводится в `EntitySpawnPayload<typeof spawnSchema>`.
- `initialContext` выводится в `EntityColumns<typeof initialContext>` для будущего `self`/`entities` store views.
- `initialContext` выводится в serializable `SchemaValue<typeof initialContext>` для snapshot/read API.
- Numeric descriptors выводят typed array columns.
- `string()` выводит string array column.
- `optional(inner)` в `spawnSchema` дает required key с value type `T | null`.

#### Диагностика и ошибки

- Missing `initialState`, `initialContext` или `spawnSchema` бросает clear init error.
- `initialState` не `"__INIT"` бросает clear init error.
- Invalid descriptor object бросает clear init error.
- `optional(...)` в `initialContext` бросает clear init error.
- Default в `spawnSchema` бросает clear init error.
- Nested objects, arrays, `Map` и `Set` запрещены.
- Reserved column names запрещены.
- `groupTag` на actor template запрещен.

#### Совместимость

- `storage: "instance"` typing и runtime validation не меняются.
- Existing `TypedCreateMachineFn<AppEvents, AppDeps>` wrappers без third generic сохраняют behavior.
- Plugin runtime validation остается обязательной даже при TypeScript wrapper.

#### Не делать в этом этапе

- Не добавлять lifecycle events.
- Не разрешать `ENTITY_SPAWNED`/`ENTITY_DESPAWNED` в reducer runtime.
- Не создавать `EntityStore`.
- Не добавлять `manager.entities`.
- Не добавлять public spawn events и entity spawn API.
- Не добавлять routing, effects, reactions, snapshot или React hooks.

#### Тесты этапа

Runtime tests:

- valid entity template проходит manager init;
- missing `spawnSchema` бросает clear error;
- missing `initialContext` бросает clear error;
- `initialState` не `"__INIT"` бросает clear error;
- `optional(...)` в `initialContext` бросает clear error;
- default в `spawnSchema` бросает clear error;
- reserved column name бросает clear error;
- `groupTag` на template бросает clear error;
- `storage: "instance"` custom `__INIT` behavior сохраняется.

Type tests:

- wrapper с `EntityMachineExtension` принимает `storage: "entity"`;
- core `createMachine` без wrapper не принимает `storage: "entity"`;
- `initialContext` schema inference сохраняет column types;
- `spawnSchema` payload inference сохраняет nullable через `optional(...)`;
- unknown descriptor shape является TypeScript error, если это возможно без ухудшения inference.

#### Gate завершения

- Runtime и type tests этапа проходят.
- Existing type tests проходят.
- Cheatsheets и package docs отражают новые descriptors и `EntityMachineExtension`.
- Coverage нового и измененного кода этапа равен 100%.
- Docs build не запускался.

### Этап 3 — Compile metadata, empty `EntityStore`, `ColumnarActorStore`, public lightweight state и `manager.entities`

#### Цель

Добавить compiled metadata, manager-owned empty entity storage state, public lightweight state slices и root accessor `manager.entities` без spawn, lifecycle, routing delivery и effects.

#### Зависит от

- Этапы 1-2.
- Plugin system manager extensions реализованы.

#### Меняется public API

Добавить:

- `manager.entities`;
- `type EntityAccess<AppState>`.

#### Runtime-контракт этапа

- Entity runtime compile создает metadata для каждого `storage: "entity"` template.
- Public state slice для entity actor template имеет форму lightweight read model:

```ts
type EntityMachineState<Metadata> = {
  storage: "entity";
  version: number;
  count: number;
  capacity: number;
};
```

- Каждый entity actor template имеет собственный public slice.
- `version`, `count` и `capacity` инициализируются из empty actor store.
- `version` увеличивается при committed изменениях actor store: row create, row despawn/collapse, state change, accepted reducer rows, hydrate invalidation.
- `count` равен количеству present rows для actor template.
- `capacity` отражает текущую capacity actor store.
- Runtime state columns не попадают в `manager.getState()`.
- `manager.getState()` не является source of truth для per-row entity columns.
- Empty `EntityStore` содержит `count`, `capacity`, `ids`, `indexById`, `alive`, `generation`, `groupTagByIndex`, `freeList`, `version`.
- Empty `ColumnarActorStore` содержит `templateKey`, `capacity`, `count`, `version`, `presence`, `stateCode`, `rowVersion`, `stateBuckets`, `statePosition`, `acceptedScratch`, `enteredScratchByState`, `columns`.
- Actor store индексируется global `entityIndex`.
- Данные в actor columns валидны только при `presence[entityIndex] === 1`.
- Capacity actor stores растет автоматически.
- `manager.entities` возвращает runtime-owned root accessor.
- Root accessor умеет создавать store views для known entity actor keys.
- Root accessor является stable live object на весь lifetime manager.
- Store views кешируются per template key и читают current committed runtime state.
- `entities.get(...)` и `entities.maybe(...)` возвращают read-only typed store views для внешнего чтения.
- `store.has(entity)` доступен и возвращает `false` для отсутствующих rows.
- Runtime не использует Proxy-based protection.

#### Типовой контракт этапа

- `EntityAccess<AppState>` выводит доступные keys из `MachinesState<typeof machines>`.
- Key union включает только `storage: "entity"` actor templates.
- Unknown `actorKey` является TypeScript error.
- Return type `entities.get("actorKey")` выводится из `initialContext`.
- `MachinesState<typeof machines>` сохраняет enough metadata для `EntityAccess<AppState>`.
- `EntityAccess<AppState>` не требует ручного `AppActorRegistry` или codegen.

#### Диагностика и ошибки

- `entities.get("actorKey")` для unknown runtime key бросает clear error, если TypeScript был обойден.
- Required-access validation для scoped calls еще не активна, потому что scopes появятся в effects/reactions.
- Capacity/index consistency errors должны быть clear internal invariant errors.

#### Совместимость

- `manager.entities` доступен только если установлен `entitiesPlugin(...)`.
- Без `entitiesPlugin(...)` returned manager shape не содержит `manager.entities`.
- `manager.entities` не подмешивается в user deps автоматически; пользователь передает его через `setDependencies(...)`.
- `storage: "instance"` public state и selectors не меняются.
- Middleware `replaceReducer` не становится API мутации custom storage runtime.
- External replacement entity public slice не меняет entity storage; runtime восстанавливает canonical lightweight slice из entity runtime state.

#### Не делать в этом этапе

- Не добавлять lifecycle events.
- Не создавать live rows.
- Не добавлять public spawn events.
- Не добавлять routing по `entityId` или `groupTag`.
- Не добавлять reducers, effects, reactions.
- Не добавлять snapshot/hydrate.
- Не добавлять React hooks.

#### Тесты этапа

Runtime tests:

- manager с entity templates возвращает lightweight public slices;
- `manager.getState()` не содержит columns;
- `manager.entities.get("actorKey")` возвращает typed store view;
- `manager.entities.maybe("actorKey")` возвращает optional store view;
- repeated `manager.entities.get("actorKey")` returns same live view object;
- `store.has(entity)` возвращает `false` для missing row;
- returned manager не содержит `entities` без plugin;
- `storage: "instance"` state shape не меняется.

Type tests:

- `EntityAccess<AppState>` включает entity actor keys;
- `EntityAccess<AppState>` исключает domain/process machines и `storage: "instance"` actor templates;
- `entities.get("unknownActor")` является TypeScript error;
- store view columns выводятся из `initialContext`.

#### Gate завершения

- Runtime и type tests этапа проходят.
- Public API changes отражены в cheatsheets и package docs.
- Coverage нового и измененного кода этапа равен 100%.
- Docs build не запускался.

### Этап 4 — Entity lifecycle events, `__INIT`, internal `ENTITY_SPAWNED`/`ENTITY_DESPAWNED`, `payloadFor`

#### Цель

Добавить внутренние lifecycle events, scoped internal spawn/despawn primitive, `__INIT` validation и reducer context `payloadFor(entity)` без public spawn events и entity spawn API.

#### Зависит от

- Этапы 1-3.
- Plugin system internal machine events typing реализован.

#### Меняется public API

Добавить:

- `type LiteFsmEntityLifecycleEvents`.

Обновить:

- `EntityMachineExtension` получает `internalEvents: LiteFsmEntityLifecycleEvents`;
- reducer context entity actor template получает `payloadFor(entity)`.

#### Runtime-контракт этапа

- `ENTITY_SPAWNED` и `ENTITY_DESPAWNED` являются internal storage runtime events.
- Lifecycle events не входят в пользовательский `AppEvents`.
- Lifecycle events доступны только в `storage: "entity"` config/reducer/reactions.
- Lifecycle events не проходят через public `transition`, middleware, generic action interceptors, subscribers или committed public action stream как отдельные committed actions.
- Public dispatch `ENTITY_SPAWNED` и `ENTITY_DESPAWNED` запрещен даже если пользователь добавил эти names в `AppEvents`.
- Entity actor template стартует только через internal `ENTITY_SPAWNED`.
- `__INIT` в entity template может содержать только `ENTITY_SPAWNED`.
- Custom events в `__INIT` entity template запрещены.
- Internal spawn transaction primitive создает entity slot, actor rows, initial column defaults, state `__INIT` и actor-specific spawn payload.
- Runtime доставляет scoped internal `ENTITY_SPAWNED` созданным actor rows.
- Default `__INIT -> target` transition применяется до reducer.
- Reducer вызывается один раз на actor template batch.
- `payloadFor(entity)` всегда присутствует в reducer context.
- `payloadFor(entity)` возвращает actor-specific spawn payload только во время `ENTITY_SPAWNED`.
- `payloadFor(entity)` на любом другом event бросает clear error.
- `payloadFor(entity)` не доступен в reactions/effects и не требует хранения spawn payload после reducer phase.
- Runtime не заполняет columns автоматически из spawn payload.
- Internal despawn primitive доставляет scoped `ENTITY_DESPAWNED` attached actor rows.
- Spawn/despawn primitive атомарен внутри entity transaction.

#### Типовой контракт этапа

- `LiteFsmEntityLifecycleEvents` не подмешивается в public `manager.transition(...)`.
- `EntityMachineExtension` добавляет lifecycle events в config/reducer/reactions только для entity actor templates.
- `payloadFor(entity)` return type выводится из actor `spawnSchema`.
- Custom `__INIT` edge должен быть TypeScript error, если это возможно без ухудшения inference.
- `storage: "instance"` сохраняет текущую поддержку custom `__INIT` events.

#### Диагностика и ошибки

- Public dispatch lifecycle events бросает clear error.
- Lifecycle event names в `spawnEvents` и recipe keys будут запрещены на этапе entity spawn; на этом этапе names резервируются.
- Custom `__INIT` edge entity template бросает clear init error.
- `payloadFor(entity)` outside `ENTITY_SPAWNED` бросает clear error.
- `payloadFor(entity)` для entity, не входящей в current spawn scope, бросает clear error.
- Invalid actor-specific spawn payload shape бросает clear error до mutation.

#### Совместимость

- `@lite-fsm/core` не хардкодит lifecycle event names.
- `storage: "instance"` reducer-authoritative behavior и lifecycle не меняются.
- Existing public transition behavior не меняется.

#### Не делать в этом этапе

- Не добавлять `defineSpawnEvents`, `spawnEvent`, `SpawnEventsFrom` или `defineEntitySpawn`.
- Не добавлять public spawn events.
- Не добавлять `despawnOn`.
- Не добавлять `transition.despawn(...)`.
- Не добавлять reactions.
- Не добавлять snapshot/hydrate.
- Не добавлять React hooks.

#### Тесты этапа

Runtime tests:

- public transition `ENTITY_SPAWNED` запрещен;
- public transition `ENTITY_DESPAWNED` запрещен;
- custom `__INIT` edge entity template запрещен;
- `storage: "instance"` custom `__INIT` сохраняется.

Комплексные tests создания rows, `ENTITY_SPAWNED` delivery и `payloadFor(entity)` через real spawn transaction выполняются на этапе 5, где появляется public spawn interceptor. Этап 4 не добавляет test-only public surface для запуска internal spawn primitive.

Type tests:

- lifecycle events доступны в entity config/reducer через `EntityMachineExtension`;
- lifecycle events не доступны в public `manager.transition(...)`;
- `payloadFor(entity)` типизируется по actor `spawnSchema`;
- lifecycle events не добавляются в `AppEvents`.

#### Gate завершения

- Runtime и type tests этапа проходят.
- Cheatsheets и package docs отражают lifecycle type-only contract.
- Coverage нового и измененного кода этапа равен 100%.
- Docs build не запускался.

### Этап 5 — Spawn events, entity spawn и public spawn event interceptor

#### Цель

Добавить public spawn events, typed recipes, atomic spawn transaction и transition typing поверх `entitiesPlugin(...)`.

#### Зависит от

- Этапы 1-4.
- Plugin system action interceptors и plugin transition event typing реализованы.

#### Меняется public API

Добавить:

- `defineSpawnEvents`;
- `spawnEvent<T>()`;
- `type SpawnEventsFrom<TSpawnEvents>`;
- `defineEntitySpawn(machines, spawnEvents)`;
- `entitiesPlugin({ spawn })` options;
- `manager.transition(...)` принимает `SpawnEventsFrom<typeof spawnEvents>` от текущего `entitiesPlugin(...)`.

#### Runtime-контракт этапа

- `spawnEvents` является источником истины для spawn event names, payload types, `manager.transition(...)` typing и spawn recipe keys.
- `defineEntitySpawn(machines, spawnEvents)` связывает spawn event contract с exhaustive recipes и возвращает единый `spawn` descriptor.
- `entitiesPlugin()` без `spawn` остается валидным и не регистрирует public spawn events.
- `entitiesPlugin({ spawn })` включает public spawn events.
- `entitiesPlugin(...)` не принимает отдельные `spawnEvents` или recipes; частичная spawn-конфигурация не входит в public API.
- `entitiesPlugin(...)` регистрирует action interceptor для public spawn events.
- Spawn event interceptor выполняет spawn transaction до public spawn event delivery.
- Spawn event interceptor не возвращает `skipDelivery: true`, если public spawn event должен быть видим machines из `AppEvents`.
- Public spawn event остается public event для middleware, subscribers и committed public action stream, если такие интеграции включены.
- Spawn recipes исполняются только при `manager.transition(spawnEvent)`.
- Hydrate восстанавливает snapshot и не вызывает spawn recipes.
- Public spawn event не является способом заполнения columns из spawn payload.
- Internal `ENTITY_SPAWNED` и actor reducers инициализируют columns.
- Recipe может вернуть один `EntitySpawnSpec` или массив.
- Пустой массив specs разрешен и означает no-op spawn event; public spawn event все равно доставляется существующим machines/templates, которые принимают event.
- `EntitySpawnSpec.id` обязателен.
- `EntitySpawnSpec.groupTag` обязателен.
- `groupTag` является свободной строкой и не выводится из recipe key.
- `generateActorId` и `generateGroupId` не применяются к `storage: "entity"`.
- `EntitySpawnSpec.actors` содержит хотя бы один actor row.
- Duplicate `EntitySpawnSpec.id` против live entity или внутри одного recipe result является ошибкой.
- `EntitySpawnSpec.id` можно использовать повторно после despawn, если entity с таким id больше не live.
- Spawn transaction атомарна: если один spec невалиден, state не меняется, subscribers/reactions/effects не запускаются.
- Invalid recipe/spec прерывает весь dispatch до public spawn event delivery.
- Public spawn event delivery выполняется после internal `ENTITY_SPAWNED`.
- Machines, которые явно включили `SpawnEvents` в `AppEvents`, видят уже созданные rows.
- Только что созданные rows получают public spawn event в том же dispatch, если current state после `ENTITY_SPAWNED` принимает этот event.

#### Типовой контракт этапа

- `defineSpawnEvents(...)` возвращает typed config value.
- `spawnEvent<T>()` задает payload type.
- `SpawnEventsFrom<typeof spawnEvents>` выводит discriminated union.
- Payload type сохраняется в `manager.transition(...)` и `defineEntitySpawn(...)`.
- `defineEntitySpawn(machines, spawnEvents)` проверяет keys, payloads и required fields.
- `entitiesPlugin({ spawn })` выводит plugin transition events из `spawnEvents`, связанного с `spawn`.
- Recipe keys совпадают с keys `spawnEvents`.
- Actor keys являются subset entity actor keys из `machines`.
- Actor payload проверяется по actor `spawnSchema`.
- Unknown recipe key, unknown actor key, лишнее поле в actor payload и отсутствующее required поле actor payload являются TypeScript error.
- Библиотека не подмешивает `SpawnEvents` в `createMachine<AppEvents>` автоматически.
- `manager.transition(...)` принимает spawn events, даже если `AppEvents` их не включает.
- `manager.transition(...)` не принимает `LiteFsmEntityLifecycleEvents`.

#### Диагностика и ошибки

- Lifecycle event names запрещены как keys в `spawnEvents` и recipe object, переданном в `defineEntitySpawn(...)`.
- Unknown recipe key бросает clear init error, если TypeScript был обойден.
- Missing recipe for spawnEvents key бросает clear init error.
- Передача в `entitiesPlugin(...)` невалидного `spawn` descriptor бросает clear init error.
- Unknown actor key в recipe output бросает clear runtime error до mutation.
- Actor payload shape mismatch бросает clear runtime error до mutation.
- Empty `actors` бросает clear runtime error.
- Missing `id` или `groupTag` бросает clear runtime error.
- Duplicate id бросает clear runtime error и не меняет state.
- Recipe exception прерывает dispatch до mutation.

#### Совместимость

- Machines видят spawn events только если разработчик явно включил `SpawnEvents` в `AppEvents`.
- Regular events из `AppEvents` продолжают проверяться по `AppEvents`.
- `SPAWN_PROJECTILE` payload проверяется по `spawnEvents`; `TICK` проверяется по `AppEvents`.
- `storage: "instance"` actor spawning и routing не меняются.

#### Не делать в этом этапе

- Не добавлять columnar performance optimizations beyond correctness, если они относятся к этапу 6.
- Не добавлять `despawnOn` и `transition.despawn(...)`.
- Не добавлять entity effects.
- Не добавлять reactions.
- Не добавлять snapshot/hydrate.
- Не добавлять React hooks.
- Не добавлять benchmarks acceptance как gate до этапа 12.

#### Тесты этапа

Runtime tests:

- public spawn event создает entity и actor rows;
- public spawn event доставляется после internal `ENTITY_SPAWNED`;
- newly spawned rows receive public spawn event in same dispatch when config accepts it;
- empty recipe result is no-op spawn but public event delivery continues;
- duplicate id против live entity fails atomically;
- id can be reused after despawn;
- duplicate ids inside one recipe result fail atomically;
- invalid actor payload fails atomically;
- invalid recipe/spec aborts before public spawn event delivery;
- empty actors fails atomically;
- subscribers/effects не видят partially spawned entities;
- hydrate не вызывает spawn recipes.

Type tests:

- `SpawnEventsFrom<typeof spawnEvents>` выводит union;
- `manager.transition(...)` принимает spawn event из текущего plugin;
- `entitiesPlugin({ spawn })` сохраняет transition event typing без отдельной передачи `spawnEvents`;
- `manager.transition(...)` не принимает lifecycle events;
- machine `AppEvents` не получает spawn events автоматически;
- recipe payload выводится из `spawnEvents`;
- recipe actor payload проверяется по `spawnSchema`;
- unknown actor key является TypeScript error.

#### Gate завершения

- Runtime и type tests этапа проходят.
- Cheatsheets, README и package docs отражают spawn API.
- Coverage нового и измененного кода этапа равен 100%.
- Docs build не запускался.

### Этап 6 — Columnar reduce pipeline, numeric event/state codes, buckets, routing и hot path guarantees

#### Цель

Реализовать производительный batch reduce pipeline: numeric metadata, state buckets, `config-default` policy, entity routing, `groupTag` routing и hot path guarantees.

#### Зависит от

- Этапы 1-5.
- Plugin system routing meta registry и action meta typing реализованы.

#### Меняется public API

Добавить:

- `meta.entityId?: string | readonly string[]` через `entitiesPlugin` action meta extension.

Уточнить runtime-visible reducer API для entity actor templates:

- `self.indices`;
- `self.states`;
- `self.prevStateCode`;
- `self.presence`;
- `self.stateCode`;
- `self.rowVersion`;
- `self.has(entity)`;
- `self.entityId(entity)`;
- schema columns как direct fields.

#### Runtime-контракт этапа

- Event `type` переводится в `eventCode` один раз на входе `manager.transition`.
- State names переводятся в `stateCode` при init manager.
- Transition lookup в dispatch выполняется по numeric `eventCode/stateCode`.
- Compiled template metadata содержит `eventAcceptMask`, `transitionTable`, `templatesByEventCode`, `acceptStateBucketsByEventCode`, `reactionsByEventCode`, `effectsByStateCode` и `despawnStateMask`.
- `templatesByEventCode[eventCode]` содержит только templates, которые принимают event в `config`.
- `acceptStateBucketsByEventCode[eventCode]` содержит state buckets, которые принимают event.
- `despawnOn` компилируется в `despawnStateMask`.
- Runtime не сравнивает строки внутри per-entity loops.
- Runtime не сканирует все templates на каждый event.
- `storage: "entity"` использует `config-default` transition policy.
- Runtime определяет matching rows, применяет default state transition до reducer, затем reducer может override `self.stateCode[entity]`.
- Отмена default transition выполняется записью `self.stateCode[entity] = self.prevStateCode[entity]`.
- Effects в будущих этапах запускаются по финальному state после reducer.
- Reducer вызывается один раз на actor template per event.
- `self.indices` содержит только rows, подходящие по presence, state, event и routing.
- Reducer не обязан проверять `self.has(entity)` для entity из `self.indices`.
- После reducer runtime bump-ит `rowVersion` для всех `self.indices`.
- После accepted reducer call runtime считает все `self.indices` измененными.
- Actor store `version` увеличивается, если `self.indices.length > 0` или lifecycle operation изменила store.
- `stateBuckets[stateCode]` хранит dense list entity indices для rows в конкретном state.
- `statePosition[entityIndex]` хранит позицию entity внутри текущего bucket.
- State transition обновляет buckets через swap-remove за `O(1)`.
- Порядок внутри state buckets и entity lists является runtime-defined; stable sorted ordering не гарантируется.
- `acceptedScratch` и `enteredScratchByState` переиспользуются между dispatch.
- Entity-routed event доставляется всем actor rows указанной entity или entities.
- Entity-routed arrays дедуплицируются с сохранением первого появления; unknown ids являются no-op.
- `groupTag` route доставляет event всем entity rows, принадлежащим entities с matching `EntitySpawnSpec.groupTag`.
- `groupTag` сохраняет текущее поведение для `storage: "instance"` actor groups.
- Routing priority следует plugin system: `actorId > registered plugin route keys > groupId > groupTag > unscoped`.
- Если `entityId` является единственным registered plugin route key, фактический priority: `actorId > entityId > groupId > groupTag > unscoped`.
- Если action содержит `meta.entityId` и `meta.groupTag`, применяется `entityId`; route keys работают priority-first, без union/intersection.
- `actorId` и `groupId` routes адресуют только `storage: "instance"` actor runtime в MVP.
- Public `actorId` routing к entity actor rows не поддерживается.
- Unknown `entityId` и unknown `groupTag` не создают actor rows.
- Hydrate sidecar rebuild будет добавлен на этапе 10; routing indexes текущего этапа поддерживают live runtime.

Hot path requirements:

- Per-row actor objects запрещены.
- Per-row reducer/effect/reaction calls запрещены.
- `Map.get` в per-row loops запрещен.
- String comparisons в per-row loops запрещены.
- Allocations на steady-state `TICK` запрещены.
- `self.indices` ссылается на state bucket или reusable scratch buffer.
- `entities.get("templateKey").<column>[entity]` является direct indexed access после получения store view.
- `entities.get(...)` и `entities.maybe(...)` вызываются вне per-entity loops.
- Bulk operations используют contiguous/reused buffers.

Минимальная целевая сложность:

- Broadcast `TICK`: `O(sum accepted alive rows by accepted templates)`.
- Entity-routed event: `O(actor rows attached to routed entities)`.
- `groupTag`-routed event: `O(actor rows attached to routed entities in target groups)`.
- Spawn `N` entities: `O(N * actor templates per entity)`.
- Despawn `N` entities: `O(N * actor rows per entity)`.
- State transition for row: `O(1)` bucket update.

#### Типовой контракт этапа

- `meta.entityId` типизируется через plugin action meta extension.
- Core meta keys `actorId`, `groupId`, `groupTag` и sender fields остаются доступны.
- `self.stateCode[entity]` принимает только state code текущего template на уровне runtime; TypeScript помогает через `self.states`.
- Entity actor runtime не имеет public `actorId`.
- Entity actor runtime не имеет `bag`.

#### Диагностика и ошибки

- Invalid `stateCode` после reducer бросает clear dev error.
- Unknown `entityId` не является ошибкой и не создает rows.
- Unknown `groupTag` не является ошибкой и не создает rows.
- Public `actorId` route к entity actor rows не поддерживается и не должен находить entity rows.
- Runtime diagnostics выполняются на scope/view boundary, а не на каждом column access.

#### Совместимость

- `storage: "instance"` сохраняет текущую reducer-authoritative semantics.
- Existing actorId/groupId/groupTag behavior для `storage: "instance"` сохраняется.
- Middleware rewrite не теряет `meta.entityId`.
- Core routing priority остается единой политикой для всех storage runtimes.

#### Не делать в этом этапе

- Не добавлять `despawnOn`.
- Не добавлять entity effects.
- Не добавлять reactions.
- Не добавлять snapshot/hydrate.
- Не добавлять React hooks.
- Не добавлять public `manager.spawn(...)` или `manager.despawn(...)`.

#### Тесты этапа

Runtime tests:

- `TICK` доставляется только templates, которые принимают `TICK`;
- reducer вызывается один раз на template per event;
- `config-default` transition применяется до reducer;
- reducer может override `stateCode`;
- invalid `stateCode` бросает dev error;
- state transition обновляет buckets в `O(1)` behavior test;
- `rowVersion` bump происходит для accepted rows;
- `meta.entityId` доставляет action rows указанной entity;
- `meta.entityId` array dedupe сохраняет первое появление и порядок доставки;
- `meta.groupTag` доставляет action rows matching entity groups;
- `actorId` не адресует entity rows;
- unknown `entityId` no-op;
- unknown `groupTag` no-op;
- middleware rewrite сохраняет `meta.entityId`.

Performance tests:

- hot `TICK` не аллоцирует per frame в production check;
- hot `TICK` не использует per-row objects, string comparisons и `Map.get` в instrumented check.

Type tests:

- `meta.entityId` доступен только при установленном `entitiesPlugin(...)`;
- `actorId`, `groupId`, `groupTag` остаются доступны;
- entity reducer `self` получает schema columns и state helpers.

#### Gate завершения

- Runtime, type и performance guard tests этапа проходят.
- Existing routing tests проходят.
- Coverage нового и измененного кода этапа равен 100%.
- Docs build не запускался.

## 6. Критерий готовности части 1

Часть 1 считается готовой только когда выполнены все условия:

- Этапы 1-6 завершены по своим gates.
- Plugin system реализована и прошла собственный gate до начала реализации `@lite-fsm/entities`.
- Package shell, schema descriptors, `EntityMachineExtension`, empty runtime state, `manager.entities`, lifecycle events, spawn recipes, routing, buckets и hot path guard contracts реализованы и покрыты tests.
- Все runtime tests, type tests и performance guard tests этапов 1-6 проходят.
- Existing core behavior tests затронутого scope проходят без изменения пользовательских сценариев.
- `pnpm run check-types` и lint проходят для затронутого scope, если они требуются gate текущего этапа.
- Сборка документации не запускалась агентом.
- Coverage по новому и измененному коду этапов 1-6 равен 100% по statements, branches, functions и lines.
- Формальное coverage не засчитывается, если не покрыты позитивные, негативные, граничные и error-path сценарии этапов 1-6.
- Нет `test.only`, временных `test.skip`, незакрытых TODO/FIXME для scope части 1, `throw new Error("not implemented")`, debug logging или temporary feature flags.
- Нет мертвого кода в scope части 1.
- Public API этапов 1-6 отражен в `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`, README и package docs.
- После выполнения этого критерия можно переходить к этапу 7 в `spec/tz-entities-implementation-part-2.md`.
