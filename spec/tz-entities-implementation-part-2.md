# @lite-fsm/entities и entity actor runtime — реализационное ТЗ, часть 2

## 1. Цель

Реализовать пакет `@lite-fsm/entities` для массовых игровых сущностей через entity actor runtime, внутреннее columnar storage, типизированную spawn composition и scoped entity lifecycle. Основная модель разработки остается `createMachine`, `config`, `reducer`, `effects` и `MachineManager.transition`; entity runtime добавляет batch storage и composition поверх этой модели, не превращая core в ECS.

## 2. Как выполнять это ТЗ

Этот файл покрывает этапы 7-12. Он самодостаточен для этих этапов: ниже продублированы цель, термины, public API, runtime architecture, общие инварианты, ошибки и gate предыдущих этапов.

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
- `spawnConfig` — источник истины для public spawn event names и payload types.
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
- `defineSpawnConfig`, `spawn<T>()`, `SpawnEventsFrom<TSpawnConfig>`.
- `defineSpawnRecipes<typeof machines, typeof spawnConfig>()`.
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
- Type tests покрывают `EntityMachineExtension`, `initialContext` schema inference, `spawnSchema` payload inference, `SpawnEventsFrom`, `defineSpawnRecipes`, `manager.entities`, `EntityAccess<AppState>` и исключение lifecycle events из public `manager.transition`.
- Snapshot tests покрывают JSON round-trip, legacy snapshot без `generation`/`rowVersion`, hydrate replace invalidation, sidecar rebuild и routing after hydrate.
- React tests покрывают row-level subscription invalidation.
- Benchmark tests покрывают movement update, projectile lifetime update, `despawnOn` cleanup и sprite sync reaction.
- Названия новых `describe`/`it`/`test` пишутся на русском; API-термины остаются на английском.

### Общие инварианты

- Public API использует термин `entity`, а не `columnar`.
- `@lite-fsm/core` не импортирует внешние plugin packages.
- Core manager не знает про entity store, columnar layout, generation, spawn recipes, buckets, lifecycle и reactions.
- Entity runtime не реализует middleware, subscribers или global event log.
- Entity lifecycle events остаются внутри entity storage runtime.
- Entity lifecycle events не проходят через public `transition`, middleware, generic action interceptors, subscribers или event log как отдельные committed actions.
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
- `payloadFor(entity)` работает только на `ENTITY_SPAWNED`.
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
- lifecycle event names как keys в `spawnConfig` или `spawnRecipes`;
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
  plugins: [
    entitiesPlugin({
      spawnConfig,
      spawnRecipes,
    }),
  ],
});
```

Контракт:

- `entitiesPlugin(...)` является generic factory.
- Plugin capabilities выводятся из переданного `spawnConfig`.
- Plugin регистрирует `storage: "entity"` через `ctx.storage.register(...)`.
- Registered runtime реализует `StorageRuntimeBase` и capability blocks `effects`, `snapshot`, `identity`, `reactions`.
- Plugin расширяет returned manager через `manager.entities`.
- Plugin расширяет `manager.transition(...)` type через `SpawnEventsFrom<typeof spawnConfig>`.
- Plugin регистрирует action interceptor для public spawn events.
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

### Spawn config

```ts
const spawnConfig = defineSpawnConfig({
  SPAWN_UNIT: spawn<UnitSpawn>(),
  SPAWN_PROJECTILE: spawn<ProjectileSpawn>(),
});

type SpawnEvents = SpawnEventsFrom<typeof spawnConfig>;
```

Контракт:

- `defineSpawnConfig(...)` возвращает typed config value.
- `spawn<T>()` задает payload type для spawn event.
- Ключи config являются event `type`.
- `SpawnEventsFrom<typeof spawnConfig>` выводит discriminated union.
- Payload type сохраняется в `manager.transition(...)` и `spawnRecipes`.
- Библиотека не подмешивает `SpawnEvents` в `createMachine<AppEvents>` автоматически.
- Разработчик не обязан добавлять `SpawnEventsFrom<typeof spawnConfig>` в `AppEvents`, чтобы отправлять spawn events через `manager.transition(...)`.
- Machines, включая `storage: "entity"` templates, могут обработать public spawn event только если разработчик явно включил `SpawnEvents` в `AppEvents`.

### Spawn recipes

```ts
const spawnRecipes = defineSpawnRecipes<typeof machines, typeof spawnConfig>()({
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

- Recipe keys совпадают с keys `spawnConfig`.
- Recipe callback payload выводится из `spawnConfig`.
- Recipe может вернуть один `EntitySpawnSpec` или массив `EntitySpawnSpec[]`.
- Пустой массив specs разрешен и означает no-op spawn event.
- `EntitySpawnSpec.id` обязателен.
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
- Разработчик не создает `entities` вручную.
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
- `transition.despawn(...)` доступен только в entity effects.
- В entity effect `transition.despawn(...)` принимает entity ids или entity indices из captured scope.
- Вне entity scope `transition.despawn(...)` принимает только entity ids; raw `EntityIndex` недоступен или бросает clear error.
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
- Lifecycle event names не доступны как keys в `spawnConfig` и `spawnRecipes`.
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
- `defineSpawnConfig`;
- `defineSpawnRecipes`;
- `spawn`;
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
- `spawn.ts` владеет `defineSpawnConfig`, `spawn`, `SpawnEventsFrom`, `defineSpawnRecipes` и recipe typing.
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

### Контракт перед этапом 7

Этап 7 начинается только после завершения этапов 1-6. Для реализации этапов 7-12 достаточно считать выполненным следующий контракт:

- `@lite-fsm/entities` существует как package с exports `"."` и `"./package.json"`.
- `entitiesPlugin(...)` устанавливается через `MachineManager(..., { plugins })` и регистрирует `storage: "entity"`.
- `storage: "entity"` без plugin бросает clear unknown storage error.
- `@lite-fsm/core` не импортирует `@lite-fsm/entities` и не знает про entity store, columnar layout, generation, spawn recipes, buckets, lifecycle и reactions.
- Schema descriptors `f32`, `i16`, `i32`, `u8`, `string`, `optional` реализованы и валидируются.
- `EntityMachineExtension` типизирует `storage: "entity"` actor templates через typed wrapper и сохраняет phantom metadata `initialContext`/`spawnSchema`.
- Entity templates требуют `initialState: "__INIT"`, `initialContext` и `spawnSchema`.
- `manager.entities` существует только при установленном `entitiesPlugin(...)` и типизируется как `EntityAccess<AppState>`.
- Public state slice для entity actor templates является lightweight read model с `storage`, `version`, `count` и `capacity`; columns не попадают в `manager.getState()`.
- Internal lifecycle events `ENTITY_SPAWNED` и `ENTITY_DESPAWNED` доступны только в entity config/reducer/reactions и запрещены через public `manager.transition(...)`.
- `payloadFor(entity)` работает только на `ENTITY_SPAWNED` и типизируется по actor `spawnSchema`.
- `defineSpawnConfig`, `spawn<T>()`, `SpawnEventsFrom<TSpawnConfig>` и `defineSpawnRecipes<typeof machines, typeof spawnConfig>()` реализованы.
- Public spawn event interceptor выполняет atomic spawn transaction до public event delivery и не вызывает spawn recipes при hydrate.
- Spawn recipes валидируют `id`, `groupTag`, actor keys, actor payload shape, duplicate ids и empty `actors` до mutation.
- Columnar reduce pipeline использует numeric event/state codes, `config-default` policy, state buckets, `rowVersion`, `version` и reusable buffers.
- `meta.entityId` routing реализован через plugin action meta extension; `groupTag` route работает для entity rows; public `actorId` routing к entity rows не поддерживается.
- Hot path на `TICK` не делает string comparisons, per-row objects, `Map.get` и allocations.
- Этапы 1-6 прошли runtime/type/performance guard tests, coverage 100%, `check-types`/lint для затронутого scope и не запускали docs build.



### Этап 7 — Despawn, `despawnOn`, `transition.despawn(...)` и lifecycle cleanup

#### Цель

Добавить entity despawn semantics: `despawnOn`, explicit despawn scheduling, scoped `ENTITY_DESPAWNED`, terminal row cleanup, free slot reuse и transition extension `transition.despawn(...)`.

#### Зависит от

- Этапы 1-6.
- Plugin system scoped transition extensions реализованы.

#### Меняется public API

Добавить:

- `despawnOn?: string | readonly string[]` в `EntityMachineExtension` input;
- `transition.despawn(...)` в entity scoped transition extension.

#### Runtime-контракт этапа

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
- Despawn operation находит все actor rows attached к entity.
- Runtime доставляет scoped `ENTITY_DESPAWNED` всем attached actor rows.
- Actor config обрабатывает `ENTITY_DESPAWNED`.
- Terminal actor rows удаляются после commit.
- Entity удаляется из `EntityStore`, когда у нее не остается actor rows.
- `alive[entityIndex]`, `indexById`, `ids`, `groupTagByIndex`, `freeList` и `generation` обновляются consistent.
- `generation[entityIndex]` инкрементируется при повторном использовании slot.
- Captured effect/reaction scopes сохраняют `entityIndex` и `generation`.
- For stale async scope `transition.despawn(self.indices)` проверяет captured generation.
- Reactions будут реализованы на этапе 9; cleanup ordering должен оставить hook point, где `ENTITY_DESPAWNED` reactions видят columns до удаления.

#### Типовой контракт этапа

- `transition.despawn(...)` типизируется только как scoped transition extension entity effects.
- В entity effect `transition.despawn(...)` принимает entity ids или entity indices из captured scope.
- Вне entity scope `transition.despawn(...)` принимает только entity ids; raw `EntityIndex` недоступен или является TypeScript error.
- `Public manager.despawn(...)` не добавляется.
- External despawn выражается обычным event + `meta.entityId`/`meta.groupTag` и actor config/reducer behavior.

#### Диагностика и ошибки

- Invalid `despawnOn` state бросает clear init error.
- `despawnOn` на special state бросает clear init error.
- `despawnOn` на `storage: "instance"` бросает clear init error.
- Raw `EntityIndex` outside entity scope для `transition.despawn(...)` бросает clear runtime error, если TypeScript был обойден.
- Stale captured scope despawn бросает clear error или no-op according to captured generation policy; policy фиксируется в tests.
- Duplicate scheduled despawn одного `entityIndex` дедуплицируется без ошибки.

#### Совместимость

- Public `manager.despawn(...)` не появляется.
- `storage: "instance"` terminal collapse semantics не меняются.
- `ENTITY_DESPAWNED` остается internal lifecycle event.
- Subscribers не видят rows, запланированные на despawn через `despawnOn`.

#### Не делать в этом этапе

- Не добавлять entity enter-state effects, кроме minimal scoped transition type wiring.
- Не добавлять reactions.
- Не добавлять snapshot/hydrate.
- Не добавлять React hooks.
- Не добавлять public routing по `actorId` к entity rows.

#### Тесты этапа

Runtime tests:

- `despawnOn: "EXPIRED"` despawns whole entity in same dispatch;
- owner actor state in `despawnOn` does not require `ENTITY_DESPAWNED` edge;
- multiple actor rows scheduling same entity are deduped;
- transition to `__RESOLVED` alone does not despawn entity;
- despawn sends scoped `ENTITY_DESPAWNED` to all attached actor rows;
- terminal rows are removed after commit;
- entity is removed from `EntityStore` when no actor rows remain;
- `freeList` and `generation` update on slot reuse;
- enter-state effects for `despawnOn` states are not scheduled.

Type tests:

- `despawnOn` accepts state name or readonly array;
- `transition.despawn(...)` is visible in entity effect scope;
- raw `EntityIndex` is not accepted outside entity scope;
- `manager.despawn(...)` does not exist.

#### Gate завершения

- Runtime и type tests этапа проходят.
- Cheatsheets и package docs отражают `despawnOn` и `transition.despawn(...)`.
- Coverage нового и измененного кода этапа равен 100%.
- Docs build не запускался.

### Этап 8 — Entity effects и scoped transition extensions

#### Цель

Реализовать entity enter-state effects, scope-bound `self/entities`, async-safe captured scopes и scoped transition extensions `entity`, `tag`, `actor`, `despawn`.

#### Зависит от

- Этапы 1-7.
- Plugin system scoped deps, scoped transition extensions and storage effects capability реализованы.

#### Меняется public API

Уточнить entity effect deps:

- `self` read-only view текущего actor batch;
- `entities` scope-bound `EntityAccess<AppState>`;
- `transition.entity(...)`;
- `transition.tag(...)`;
- `transition.actor(...)`;
- `transition.despawn(...)`.

Public exports не меняются.

#### Runtime-контракт этапа

- Effect вызывается один раз на batch rows, вошедших в state после dispatch.
- Effect не вызывается при `self.indices.length === 0`.
- Effect привязан к enter-state.
- Effect может быть sync или async.
- Effects запускаются по финальному state после reducer.
- Effects не запускаются для rows, удаленных через `despawnOn` до effect phase.
- Entity enter-state effects выполняются через `StorageEffectsRuntime.resolveInvocations(...)` и `StorageEffectsRuntime.invoke(...)` в core-managed effect phase.
- Effect phase выполняется после subscribers и middleware post-`next`.
- `self` и `entities` read-only в effect.
- `self` и `entities` в async effect являются live views, bound к captured invocation scope.
- `self.indices` является stable captured list для effect invocation.
- Captured invocation сохраняет `entityIndex + generation`.
- `self.has(entity)` после `await` проверяет current presence и captured generation.
- `entities.get(...)` и `entities.maybe(...)` доступны в effect через scoped deps extension поверх `AppDeps` до и после `await`.
- После `await` доступ читает current committed store для captured scope.
- Если entity/actor row из captured scope удалена или slot переиспользован до resume effect, `entities.get(...)` в `IS_DEV` бросает stale scope/missing row error.
- `entities.maybe(...)` после `await` возвращает view, где `store.has(entity)` отражает current presence.
- Async effect, который читает columns после `await`, должен проверять `self.has(entity)` или `store.has(entity)`, если entity могла быть удалена.
- `entities.get(...)` и `entities.maybe(...)` вызываются вне per-entity loops.
- Mutation из effect запрещена.
- Effect выполняет mutation только через `transition(...)`.
- `transition(action)` внутри entity effect является unscoped by default.
- `transition.entity(entityId | readonly entityId[], action)` доставляет action actor rows указанной entity или entities.
- `transition.tag(groupTag | readonly groupTag[], action)` доставляет action entity rows указанной entity groupTag.
- `transition.actor(actorId | readonly actorId[], action)` адресует только `storage: "instance"` actors.
- `transition.despawn(...)` использует despawn semantics этапа 7.
- `transition.entities(...)` не входит в MVP.
- Wildcard `*` effects, `condition()`, per-row `bag` и `createEffect("latest")` в entity MVP не поддерживаются.

#### Типовой контракт этапа

- Entity effect deps включают scope-bound `entities`, а не root `manager.entities`.
- Domain/process machines продолжают видеть root `manager.entities`, если они явно типизированы на `EntityAccess<AppState>`.
- Effect invocation получает captured scope-bound `entities`, доступный до и после `await`.
- `entities.get(...)` и `entities.maybe(...)` возвращают read-only typed store views в effects.
- `transition.entity(...)`, `transition.tag(...)`, `transition.actor(...)` и `transition.despawn(...)` типизируются только при plugin capability.
- Scoped `transition.despawn(...)` доступен только в entity effects.

#### Диагностика и ошибки

- Если user deps содержит `entities`, не равный `manager.entities`, plugin бросает clear error через deps extension.
- Required access `entities.get(...)` в diagnostics проверяет каждую entity из current scope.
- Validation error содержит source actor, event type, requested actor key и entity id.
- Stale scope после `await` бросает clear dev error для required access.
- Production build не обязан выполнять full required-access validation для `entities.get(...)`.
- Попытка использовать unsupported entity effect feature (`*`, `condition`, `latest`, `bag`) бросает clear init error.

#### Совместимость

- Existing effect ordering из plugin system сохраняется.
- Existing `transition(...)` внутри effects сохраняет core methods.
- `transition.actor(...)` не меняет `storage: "instance"` actor routing.
- `storage: "instance"` effects сохраняют текущую semantics.

#### Не делать в этом этапе

- Не добавлять reactions.
- Не добавлять snapshot/hydrate.
- Не добавлять React hooks.
- Не добавлять renderer-specific integrations.
- Не добавлять Proxy-based mutation traps.

#### Тесты этапа

Runtime tests:

- entity enter-state effect runs once per batch;
- effect does not run for empty batch;
- effects run after subscribers and middleware post-`next`;
- effects use final state after reducer;
- effects are not scheduled for `despawnOn` rows;
- async effect keeps captured scope after `await`;
- `self.has(entity)` detects stale/deleted row after `await`;
- `entities.get(...)` required access validates scope in diagnostics;
- `entities.maybe(...)` supports optional rows through `store.has(entity)`;
- `transition.entity(...)` routes to target entity rows;
- `transition.tag(...)` routes by entity groupTag;
- `transition.actor(...)` routes only instance actors;
- `transition.despawn(...)` despawns captured rows with generation check;
- wrong user deps `entities` throws clear error.

Type tests:

- entity effect deps expose typed `self` columns;
- entity effect deps expose scoped `entities`;
- scoped transition methods are typed in entity effects;
- scoped transition methods are unavailable without plugin capability;
- unsupported effect features are rejected.

#### Gate завершения

- Runtime и type tests этапа проходят.
- Existing effects tests проходят.
- Cheatsheets and package docs отражают entity effects и scoped transition extensions.
- Coverage нового и измененного кода этапа равен 100%.
- Docs build не запускался.

### Этап 9 — Reactions и reaction error semantics

#### Цель

Добавить sync-only reaction layer для entity actors: post-reducer external synchronization, scoped read access, `ENTITY_DESPAWNED` pre-cleanup reads и non-fatal error reporting через `reportError(...)`.

#### Зависит от

- Этапы 1-8.
- Plugin system storage reactions capability и `DispatchContext.reportError(...)` реализованы.

#### Меняется public API

Уточнить `EntityMachineExtension` input:

- `reactions?: EntityReactions<ContextSchema>`.

Public exports не меняются.

#### Runtime-контракт этапа

- `reactions` доступны только для `storage: "entity"` в MVP.
- Reaction является частью `StorageReactionRuntime`, а не generic dispatch hook.
- Reaction error semantics не наследуют fail-fast contract generic dispatch hooks.
- Reaction привязан к accepted event, а не к enter-state.
- Reaction вызывается один раз на actor template per accepted event.
- Reaction получает `self.indices` rows, которые приняли event по `config` и routing.
- Reaction выполняется синхронно.
- Promise return передается через dispatch `reportError(...)` в `onError` как contract violation, если runtime может надежно определить Promise return, и не await-ится.
- `self` и `entities` read-only в reaction.
- `entities.get(...)` и `entities.maybe(...)` доступны в reaction через scoped deps extension поверх `AppDeps`.
- `entities.get(...)` и `entities.maybe(...)` вызываются вне per-entity loops.
- State mutation из reaction запрещена.
- `transition(...)` и `transition.despawn(...)` из reaction запрещены в MVP.
- Reaction может читать user deps и вызывать sync methods внешних deps.
- Reducers выполняются раньше reactions.
- `despawnOn` lifecycle processing выполняется раньше reactions исходного event.
- Reactions internal `ENTITY_DESPAWNED` выполняются до collapse удаляемых rows.
- Reactions для `ENTITY_DESPAWNED` видят columns до удаления actor rows.
- Rows, удаленные через `despawnOn`, не попадают в reactions исходного event.
- Runtime ловит ошибку каждой reaction и передает ее через dispatch `reportError(...)`, который вызывает `onError`.
- Ошибка reaction не откатывает reducer result.
- Ошибка reaction не отменяет subscribers.
- Ошибка reaction `ENTITY_DESPAWNED` не отменяет collapse/despawn cleanup.
- После ошибки одной reaction runtime продолжает обязательные lifecycle cleanup phases.
- Subscribers вызываются после sync reactions.
- Enter-state effects вызываются после subscribers.
- Reactions не создают public events.

#### Типовой контракт этапа

- `reactions` типизируются для entity actor templates через `EntityMachineExtension`.
- Lifecycle events доступны в reactions без добавления в `AppEvents`.
- Reaction deps включают read-only `self`, scoped `entities` и user deps.
- Reaction deps не включают `transition`.
- Read-only является TypeScript/runtime view contract; Proxy-based mutation traps не входят в MVP.

#### Диагностика и ошибки

- Promise return из reaction сообщает contract violation через `reportError(...)` в `onError`.
- Exception в reaction передается через `reportError(...)` в `onError`.
- Reaction error не меняет control flow dispatch.
- Required access validation в reaction использует scope и generation.
- Попытка объявить reactions для `storage: "instance"` бросает clear init error.
- Попытка использовать `transition` в reaction является TypeScript error; runtime не предоставляет transition в deps.

#### Совместимость

- Generic dispatch hooks остаются fail-fast.
- Existing subscribers запускаются после reactions.
- Existing effect phase остается после subscribers.
- `storage: "instance"` не получает reactions в MVP.

#### Не делать в этом этапе

- Не добавлять async reactions.
- Не добавлять public event emission from reactions.
- Не добавлять reactions для `storage: "instance"`.
- Не добавлять snapshot/hydrate.
- Не добавлять React hooks.

#### Тесты этапа

Runtime tests:

- reaction runs once per template per accepted event;
- reaction sees committed reducer state;
- reaction can read another actor through `entities.get(...)`;
- `ENTITY_DESPAWNED` reaction reads columns before cleanup;
- rows despawned via `despawnOn` do not receive source event reaction;
- Promise-returning reaction reports contract violation through `onError`;
- thrown reaction error reports through `onError`;
- reaction error does not rollback reducer result;
- reaction error does not block subscribers;
- reaction error does not cancel despawn cleanup;
- reaction cannot dispatch or despawn.

Type tests:

- reactions are accepted on entity templates;
- reactions are rejected for `storage: "instance"`;
- reaction deps expose read-only `self` and scoped `entities`;
- reaction deps do not expose `transition`;
- lifecycle events are available in entity reactions.

#### Gate завершения

- Runtime и type tests этапа проходят.
- Cheatsheets, README и package docs отражают reactions contract.
- Coverage нового и измененного кода этапа равен 100%.
- Docs build не запускался.

### Этап 10 — Snapshot/hydrate через `snapshot.storage.entity`

#### Цель

Добавить durable entity storage snapshot через `snapshot.storage.entity`, replace-only hydrate, schema validation, legacy compatibility для missing `generation`/`rowVersion` и rowVersion invalidation policy.

#### Зависит от

- Этапы 1-9.
- Plugin system storage snapshot extension points реализованы.

#### Меняется public API

Уточнить snapshot envelope:

```ts
type MachineManagerSnapshotWithEntityStorage = {
  schemaVersion?: number;
  machines: Record<string, unknown>;
  storage?: {
    entity?: EntitySnapshot;
  };
};
```

Public exports не меняются.

#### Runtime-контракт этапа

- Entity storage runtime регистрирует `snapshot` capability.
- `dehydrate()` включает `storage.entity`, если manager содержит `storage: "entity"` runtime с `snapshot` capability.
- `dehydrate({ storage: ["entity"] })` вызывает `StorageSnapshotRuntime.dehydrate(...)` и выгружает entity storage атомарно целиком.
- `dehydrate({ machines })` и `dehydrate({ storage })` являются независимыми filters.
- Partial export/import entity storage не входит в MVP.
- Snapshot serializes `EntityStore`, `generation`, `freeList`, entity `version`, every entity actor store и `rowVersion`.
- Typed arrays convert to plain arrays.
- Hydrate `storage.entity` идет через `StorageSnapshotRuntime.hydrate(...)`.
- Hydrate восстанавливает `EntityStore` и actor stores.
- Hydrate validates `ids`, `alive`, `generation`, `groupTagByIndex` and `freeList` length consistency before applying snapshot.
- Hydrate пересобирает `indexById` и entity sidecar.
- Hydrate validates schema compatibility before applying snapshot.
- Hydrate with old snapshot missing `generation` initializes `generation` to `0` for alive rows and rebuilds `freeList` from `alive`.
- Hydrate with old snapshot missing actor `rowVersion` rebuilds row versions from current manager version.
- Hydrate `storage.entity` является replace-only в MVP независимо от `strategy`.
- Если snapshot содержит `storage.entity`, hydrate атомарно заменяет entity runtime state.
- Если snapshot не содержит `storage.entity`, существующий entity runtime state остается без изменений.
- Hydrate replace invalidates all restored rows by assigning fresh `rowVersion` values.
- Hydrate replace bumps template `version` for restored actor stores.
- Snapshot `rowVersion` can be used as debug/import metadata, but React cache correctness relies on hydrate invalidation policy, not trusting remote `rowVersion`.
- JSON round-trip restores equivalent state.
- Routing по `entityId` и `groupTag` работает после hydrate.
- Spawn recipes не вызываются при hydrate.
- Regular `@lite-fsm/core` snapshot/hydrate remains compatible and does not require `@lite-fsm/entities`.

#### Типовой контракт этапа

- Snapshot payload is serializable plain data.
- Entity snapshot shape соответствует schema descriptors текущих actor templates.
- Public state slice остается lightweight read model; columns не попадают в `manager.getState()`.
- React row cache policy фиксируется на уровне `rowVersion`, но hooks добавляются на этапе 11.

#### Диагностика и ошибки

- Explicit `dehydrate({ storage: ["entity"] })` без snapshot capability бросает clear error.
- Hydrate данных known runtime без snapshot capability бросает clear error.
- Inconsistent snapshot lengths бросают clear error before applying snapshot.
- Schema mismatch бросает clear error before applying snapshot.
- Invalid column payload type бросает clear error before applying snapshot.
- Invalid `presence`, `stateCode`, `rowVersion` lengths бросают clear error.
- Hydrate failure не меняет existing entity runtime state.

#### Совместимость

- Current instance snapshot format сохраняется.
- Отсутствие `storage` в snapshot сохраняет compatibility with legacy snapshots.
- `getSnapshot()` не вызывает `StorageSnapshotRuntime.dehydrate(...)` и не включает `storage`.
- `replaceReducer` не является API мутации entity storage runtime.

#### Не делать в этом этапе

- Не добавлять React hooks.
- Не добавлять Devtools provider API.
- Не добавлять graph/devtools metadata.
- Не добавлять partial export/import.
- Не менять existing instance snapshot format.

#### Тесты этапа

Snapshot tests:

- `dehydrate -> JSON.stringify -> JSON.parse -> hydrate` restores entities and actor rows;
- `dehydrate({ storage: ["entity"] })` exports entity storage;
- `dehydrate({ machines })` и `dehydrate({ storage })` filters independent;
- columns restore values;
- `generation`, `freeList`, entity `version`, actor `version` и `rowVersion` serialize;
- legacy snapshot missing `generation` hydrates with generation `0` for alive rows and rebuilt `freeList`;
- legacy snapshot missing `rowVersion` rebuilds row versions;
- hydrate replace invalidates restored rows with fresh `rowVersion`;
- hydrate schema mismatch fails atomically;
- sidecar rebuild happens after hydrate;
- routing by `entityId` works after hydrate;
- routing by `groupTag` works after hydrate;
- hydrate without `storage.entity` preserves existing entity runtime state;
- spawn recipes are not called during hydrate;
- `getSnapshot()` does not include `storage`.

Runtime tests:

- hydrate failure does not mutate current entity state;
- storage snapshot does not affect `storage: "instance"` runtime.

#### Gate завершения

- Snapshot и runtime tests этапа проходят.
- Existing snapshot tests проходят.
- Cheatsheets and package docs reflect `snapshot.storage.entity`.
- Coverage нового и измененного кода этапа равен 100%.
- Docs build не запускался.

### Этап 11 — React hooks: `useEntitySnapshot`, `useEntityCount`, `useEntityList`

#### Цель

Добавить granular React read layer для entity rows через `@lite-fsm/entities/react`, `useSyncExternalStore` и rowVersion cache без rerender unrelated consumers.

#### Зависит от

- Этапы 1-10.
- `@lite-fsm/react` остается отдельным package и не импортирует entity hooks.

#### Меняется public API

Добавить package export:

- `"./react"`.

Добавить hooks:

- `useEntitySnapshot(templateKey, entityId)`;
- `useEntityCount(templateKey)`;
- `useEntityList(templateKey, filter?)`.

#### Runtime-контракт этапа

- Hooks используют `useSyncExternalStore`.
- `useEntitySnapshot` subscribes to one entity row.
- `rowVersion` provides stable snapshot caching.
- Hydrate bumps/invalidates row versions before hooks publish snapshots.
- Update одного row не rerender unrelated row consumers.
- `useEntityCount` subscribes to count changes of one actor template.
- `useEntityList` subscribes to list/filter changes for one actor template.
- Row snapshot reads serializable value shape from `initialContext`, not column arrays directly.
- Hooks read through `manager.entities` and entity runtime subscription/index layer.
- Regular `@lite-fsm/react` не импортирует entity hooks.

#### Типовой контракт этапа

- `templateKey` типизируется по entity actor keys when used with typed manager/context, если existing React typing позволяет.
- `useEntitySnapshot` result shape выводится из `SchemaValue<typeof initialContext>`.
- `useEntityCount` возвращает number.
- `useEntityList` возвращает stable list of entity ids or row snapshots according to final hook signature; выбранная signature фиксируется в cheatsheets.
- Hook types do not expose `EntityIndex` as public row identifier.

#### Диагностика и ошибки

- Unknown `templateKey` бросает clear runtime error, если TypeScript был обойден.
- Missing `entityId` row returns the documented empty value or `undefined`; policy фиксируется в tests and docs.
- Hook usage without manager/provider follows existing `@lite-fsm/react` error policy.
- Hydrate invalidation bugs должны ловиться tests через stale rowVersion cache.

#### Совместимость

- `@lite-fsm/react` bundle не импортирует `@lite-fsm/entities/react`.
- Existing React hooks keep behavior.
- Entity hooks do not require graph/devtools UI.

#### Не делать в этом этапе

- Не добавлять editor prefab UI.
- Не добавлять renderer-specific integrations.
- Не добавлять mutation APIs from React hooks.
- Не менять `@lite-fsm/react` public API кроме optional typing integration, если она нужна для hooks.

#### Тесты этапа

React tests:

- `useEntitySnapshot` renders one row snapshot;
- changing one row rerenders only that row consumer;
- changing unrelated row does not rerender subscriber;
- despawned row invalidates snapshot;
- hydrate invalidates rowVersion cache before publishing snapshots;
- `useEntityCount` rerenders on count changes;
- `useEntityList` rerenders according to list/filter changes;
- regular `@lite-fsm/react` does not import entity hooks.

Type tests:

- hook `templateKey` is limited to entity actor keys where typed integration is available;
- `useEntitySnapshot` returns value shape from `initialContext`;
- public hook types do not expose raw `EntityIndex` as required input.

#### Gate завершения

- React and type tests этапа проходят.
- Existing `@lite-fsm/react` tests проходят.
- Package export `"./react"` работает.
- Cheatsheets, README and package docs reflect React hooks.
- Coverage нового и измененного кода этапа равен 100%.
- Docs build не запускался.

### Этап 12 — Benchmarks, README/examples и final verification

#### Цель

Добавить benchmarks, package README/examples и финальную проверку готовности `@lite-fsm/entities` без расширения runtime surface.

#### Зависит от

- Этапы 1-11.

#### Меняется public API

Не меняется.

Меняется documentation surface:

- `packages/entities/README.md`;
- package docs;
- `API-CHEATSHEET.md`;
- `TYPES-CHEATSHEET.md`;
- runnable example fixture, если он является частью package examples.

#### Runtime-контракт этапа

- Runtime behavior не меняется.
- Benchmarks используют production build path.
- Benchmark `composition-lite-fsm-entities` сравнивает entity runtime с hand-written SoA ECS baseline.
- Benchmark измеряет movement update отдельно.
- Benchmark измеряет projectile lifetime update отдельно.
- Benchmark измеряет `despawnOn` cleanup отдельно.
- Benchmark измеряет sprite sync reaction отдельно.
- Benchmark запускается в Node.js.
- Benchmark запускается в браузерном профиле через headless browser.
- Reducer-only `TICK` не медленнее `1.5x` hand-written SoA ECS baseline на 10k/50k rows.
- Full pipeline без внешних renderer calls не медленнее `2x` hand-written SoA ECS baseline на 10k/50k rows.
- Production build не делает heap allocations на steady-state `TICK`.

#### Типовой контракт этапа

- Public API и public types в cheatsheets соответствуют реализованным exports.
- README показывает typed wrapper с `EntityMachineExtension`.
- README показывает `defineSpawnConfig`, `spawn`, `SpawnEventsFrom`, `defineSpawnRecipes`, `entitiesPlugin` и `manager.entities`.
- README показывает `AppDeps` с `entities: EntityAccess<AppState>` и `manager.setDependencies({ entities: manager.entities, ... })`.
- Examples используют spawn events, а не public `manager.spawn(...)`.
- Examples используют `groupTag` в `EntitySpawnSpec`.
- Examples используют `reactions` для sprite sync через `entities.get("movementActor")`.
- Examples не используют public routing по `actorId` для entity rows.
- Examples показывают descriptors `f32`, `i32`, `string`, `optional(...)` и разницу между `spawnSchema` и `initialContext`.

#### Диагностика и ошибки

- Не добавляются новые runtime errors.
- Benchmarks должны fail-ить ясно при regression относительно thresholds.
- Docs snippets должны компилироваться или быть покрыты type tests/fixture tests.

#### Совместимость

- Docs build агентом не запускается.
- Existing examples outside `packages/entities` не меняют behavior.
- No unstable public API is documented.

#### Не делать в этом этапе

- Не добавлять docs pages в `apps/docs`, если они требуют docs build для проверки.
- Не добавлять Devtools UI.
- Не добавлять editor prefab UI.
- Не добавлять graph visualizer UI.
- Не менять runtime behavior.

#### Тесты этапа

Benchmark tests:

- movement update 10k/50k;
- projectile lifetime update 10k/50k;
- `despawnOn` cleanup 10k/50k;
- sprite sync reaction 10k/50k;
- reducer-only `TICK` threshold;
- full pipeline threshold;
- Node.js profile;
- headless browser profile;
- steady-state `TICK` allocation guard.

Documentation/example tests:

- package README snippets compile or are mirrored by test fixtures;
- runnable example fixture covers `movementActor`, `projectileActor`, `spriteSyncActor`, `TICK`, spawn projectile/unit and `despawnOn`;
- examples use `manager.entities` as deps source;
- examples avoid public `actorId` routing for entity rows.

Final verification:

- runtime tests;
- type tests;
- snapshot tests;
- React tests;
- benchmark tests;
- `pnpm run check-types`;
- lint;
- `pnpm run build:packages`, if build verification is needed and does not run docs build.

#### Gate завершения

- Benchmarks pass required thresholds.
- README, package docs and cheatsheets are current.
- Examples compile or are covered by tests.
- All runtime/type/snapshot/React/benchmark tests pass.
- `check-types` and lint pass.
- No `test.only`, temporary `test.skip`, unresolved TODO/FIXME for this scope, debug logging, temporary feature flags or `throw new Error("not implemented")`.
- No dead code remains.
- Docs build не запускался.

## 6. Критерий полной готовности

ТЗ считается реализованным только когда выполнены все условия:

- Все этапы 1-12 завершены по своим gates.
- Plugin system реализована и прошла собственный gate до финальной приемки `@lite-fsm/entities`.
- Каждое runtime/type/snapshot/react/benchmark/error требование из этого документа реализовано и покрыто tests либо явно относится к разделу «Вне области работ».
- Все существующие behavior tests проходят без изменения пользовательских сценариев.
- Все новые и измененные runtime tests проходят.
- Все type tests проходят.
- Все snapshot tests проходят.
- Все React tests проходят.
- Все benchmark tests проходят.
- `pnpm run check-types` проходит.
- Lint проходит.
- Сборка документации не запускалась агентом и не является gate этого ТЗ.
- Coverage по новому и измененному коду равен 100% по statements, branches, functions и lines.
- Формальное coverage не засчитывается, если не покрыты позитивные, негативные, граничные и error-path сценарии из этапов.
- Нет `test.only`.
- Нет временных `test.skip`.
- Нет незакрытых TODO/FIXME для scope этого ТЗ.
- Нет `throw new Error("not implemented")`.
- Нет debug logging.
- Нет temporary feature flags.
- Нет fallback-веток, добавленных только для прохождения tests.
- Нет мертвого кода: удалены неиспользуемые helpers, types, exports, modules, compatibility shims, unreachable branches и старые владельцы поведения, которые больше не вызываются.
- Public API остается минимальным и строго типизированным.
- Public API отражен в `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`, README и package docs.
- Нет известных runtime/type/lint ошибок, flaky tests, непроверенных coverage gaps, undocumented breaking changes или открытых blockers.
