# @lite-fsm/entities и entity actor runtime — реализационное ТЗ, часть 2

## 1. Цель

Реализовать пакет `@lite-fsm/entities` для массовых игровых сущностей через entity actor runtime, внутреннее columnar storage, типизированную spawn composition и scoped entity lifecycle. Основная модель разработки остается `createMachine`, `config`, `reducer`, `effects` и `MachineManager.transition`; entity runtime добавляет batch storage и composition поверх этой модели, не превращая core в ECS.

## 2. Как выполнять это ТЗ

Этот файл покрывает этапы 8-15. Он самодостаточен для этих этапов: ниже продублированы цель, термины, public API, runtime architecture, общие инварианты, ошибки и gate предыдущих этапов.

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

- Plugin system реализована первой и прошла gates актуальных specs:
  `spec/tz-plugin-system-public-api-finalization.md`,
  `spec/tz-storage-runtime-dispatch-refactor.md`,
  `spec/tz-plugin-system-single-route-meta.md`,
  `spec/tz-plugin-system-store-parametric-manager-extensions.md`.
- Исторический `spec/tz-plugin-system-implementation.md` не является источником требований для `@lite-fsm/entities`.
- `@lite-fsm/entities` подключается к `MachineManager` через `plugins`.
- `@lite-fsm/entities` объявляет entity storage через `defineStorageRuntime<EntityStorageRuntimeExtension>().create(...)`.
- `entitiesPlugin(...)` возвращает plugin value из `definePlugin<PluginEvents, HostEvents>().create(...)`.
- `entitiesPlugin(...)` подключает entity storage через plugin section `storage: [entityStorageRuntime]`.
- Entity runtime использует storage runtime blocks `effects`, `snapshot`, `identity` и `reactions`.
- Entity runtime использует plugin hook `hooks.beforeReduce` для public spawn events, чтобы spawn recipes запускались по финальному action после всех `intercept` replacements.
- Entity runtime использует plugin section `routeMeta` для `meta.entityId`.
- Entity storage runtime на этапе routing объявляет `routeMetaKeys: ["entityId"]`, а `definePlugin().create(...)` проверяет, что plugin объявил совместимый resolver `routeMeta.entityId`.
- Entity effect/reaction deps типизируются через `EntityMachineExtension.effectDeps` и `EntityMachineExtension.reactionDeps`, а не через global plugin `scopedDeps`.
- Строгая типизация объекта `entities`, который инжектируется в entity effects/reactions, выводится из `AppDeps.entities?: EntityAccess<AppMachines>`.
- `AppDeps.entities` является опциональным источником типов; runtime entity effects/reactions не читает это dependency и инжектирует accessor, привязанный к текущему entity scope.
- Новые entity-specific transition helpers типизируются через `EntityMachineExtension.effectDeps`, а не через global plugin `scopedTransition`.
- Entity runtime использует plugin section `manager` для `manager.entities`.
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
- `groupTag` — публичная группа entity instance. Она задается в `EntitySpawnSpec`, является свободной непустой строкой и не выводится из recipe key.
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
- `EntityMachineExtension` как storage typing, который `TypedCreateMachineFn` получает через plugin source.
- `storage: "entity"` runtime поверх internal columnar storage.
- Schema descriptors `f32`, `i16`, `i32`, `u8`, `string`, `optional`.
- `defineSpawnEvents`, `spawnEvent<T>()`, `SpawnEventsFrom<TSpawnEvents>`.
- `defineEntitySpawn(machines, spawnEvents)`.
- Public spawn events через `manager.transition(...)`.
- `manager.entities` и typed `EntityAccess<AppMachines>`.
- Новые entity effect helpers `transition.entity(...)` и `transition.despawn(...)`.
- Существующие transition helpers `transition.tag(...)` и `transition.actor(...)` доступны в entity effects с текущей core semantics.
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
- Type tests покрывают `EntityMachineExtension`, `initialContext` schema inference, `spawnSchema` payload inference, `SpawnEventsFrom`, `defineEntitySpawn`, `manager.entities`, `EntityAccess<AppMachines>` и исключение lifecycle events из public `manager.transition`.
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
- Entity lifecycle events не проходят через public `transition`, middleware, plugin `intercept`, subscribers или public committed action result как отдельные committed actions.
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
- Internal `ENTITY_DESPAWNED` reactions видят columns до cleanup.
- Generic reactions для исходного события выполняются после cleanup только для rows со статусом `alive`.
- `payloadFor(entity)` работает только в reducer на `ENTITY_SPAWNED`; reactions/effects читают инициализированные columns через `self`/`entities`.
- `payloadFor(entity)` принимает только `EntityIndex` из текущего `self.indices`; строковый `EntityId` не поддерживается.
- Hydrate не вызывает spawn recipes.
- `actorId` routing к entity actor rows не поддерживается.
- `groupTag` берется из `EntitySpawnSpec`.
- Entity hot loops не делают string comparisons, per-row objects, `Map.get` и per-row allocations на `TICK`.
- Полный dispatch может иметь ограниченный per-action overhead core/kernel pipeline; overhead не должен расти от количества rows иначе чем через reused buffers и проход по accepted rows.

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
- `entitiesPlugin<AppDeps>()` использует `AppDeps` только на уровне типов для entity effect/reaction deps; runtime behavior совпадает с `entitiesPlugin()`.
- `entitiesPlugin({ spawn })` включает public spawn events.
- `spawn` должен быть результатом `defineEntitySpawn(machines, spawnEvents)`.
- Plugin `PluginEvents` для spawn transition events выводятся из `spawnEvents`, сохраненного в `spawn`.
- Plugin включает entity storage definition через section `storage`.
- Entity storage definition создается через `defineStorageRuntime<EntityStorageRuntimeExtension>().create(...)`.
- Entity storage runtime реализует required callbacks `validateTemplate`, `compileTemplate`, `createRuntimeState`, `createPublicInitialState`, `commit`, `acceptsEvent`/`reduce` или `reduceBucket`.
- Entity storage runtime добавляет blocks `effects`, `snapshot`, `identity`, `reactions` на соответствующих этапах.
- Plugin расширяет returned manager через `manager.entities`.
- Plugin расширяет `manager.transition(...)` type через `SpawnEventsFrom<typeof spawnEvents>`, если entity spawn включен.
- Plugin объявляет `hooks.beforeReduce(ctx)` для public spawn events, если entity spawn включен.
- Plugin объявляет `routeMeta.entityId` resolver.
- Entity storage runtime объявляет `routeMetaKeys: ["entityId"]` начиная с этапа routing; отсутствие resolver является init-time error `LITE_FSM_MISSING_ROUTE_META_RESOLVER`.
- Plugin не объявляет global `scopedDeps.entities` и global `scopedTransition.entity/tag/despawn`, потому что эти deps доступны только в `storage: "entity"` invocations.

### `EntityMachineExtension`

```ts
import {
  createMachine as createLiteFsmMachine,
  type ActorPublicState,
  type TypedCreateMachineFn,
} from "@lite-fsm/core";
import { entitiesPlugin } from "@lite-fsm/entities";

const entityPlugin = entitiesPlugin<AppDeps>();
const entityPlugins = [entityPlugin] as const;

export const createMachine: TypedCreateMachineFn<
  AppEvents,
  AppDeps,
  typeof entityPlugins
> = createLiteFsmMachine;
```

```ts
type EntityMachineInput<
  ContextSchema extends EntitySchema = EntitySchema,
  SpawnSchema extends EntitySchema = EntitySchema,
  Config extends object = Record<string, never>,
> = {
  storage: "entity";
  config: Config;
  initialState: "__INIT";
  initialContext: ContextSchema;
  spawnSchema: SpawnSchema;
  despawnOn?: string | readonly string[];
  reactions?: EntityReactions<ContextSchema>;
};

type EntityMachineExtension<
  ContextSchema extends EntitySchema = EntitySchema,
  SpawnSchema extends EntitySchema = EntitySchema,
  Config extends object = Record<string, never>,
  AppDeps = unknown,
> = {
  storage: "entity";
  internalEvents: LiteFsmEntityLifecycleEvents;
  input: EntityMachineInput<ContextSchema, SpawnSchema, Config>;
  reducerContext: EntityReducerContext<SpawnSchema>;
  effectDeps: EntityEffectDeps<ContextSchema, AppDeps>;
  reactionDeps: EntityReactionDeps<ContextSchema, AppDeps>;
  publicState: <Input extends EntityMachineInput<ContextSchema, SpawnSchema, Config>>(
    input: Input,
  ) => EntityMachinePublicState<
    EntityMachineStateMetadata<
      Input["initialContext"],
      Input["spawnSchema"]
    >
  >;
  resultMetadata: <Input extends EntityMachineInput<ContextSchema, SpawnSchema, Config>>(
    input: Input,
  ) => {
    entityContextSchema: Input["initialContext"];
    entitySpawnSchema: Input["spawnSchema"];
  };
};
```

```ts
declare const entityStateMetadata: unique symbol;

type EntityMachineStateMetadata<
  ContextSchema extends EntitySchema,
  SpawnSchema extends EntitySchema,
> = {
  readonly entityContextSchema: ContextSchema;
  readonly entitySpawnSchema: SpawnSchema;
};

type EntityMachinePublicState<Metadata> = {
  storage: "entity";
  version: number;
  count: number;
  capacity: number;
  readonly [entityStateMetadata]?: Metadata;
};
```

Доступность полей по этапам:

| Поле | Доступно с этапа |
| ---- | ---------------- |
| `storage`, `input.storage`, `initialState`, `initialContext`, `spawnSchema`, `resultMetadata` | 2 |
| `publicState` | 3 |
| `internalEvents` | 4 |
| `reducerContext.payloadFor(entity)` и минимальный reducer `self` API (`indices`, schema columns, `stateCode`, `prevStateCode`, `has`, `entityId`) | 5 |
| Оптимизированные метаданные batch reducer (`states`, `presence`, `rowVersion`, bucket-backed `indices`) | 6 |
| `despawnOn` | 8 |
| `effectDeps` | 9 |
| `reactions`, `reactionDeps` | 10 |

Контракт:

- Extension подключается к `TypedCreateMachineFn` только через plugin source: `typeof entityPlugin` или tuple `typeof plugins`.
- Передача `EntityMachineExtension` третьим параметром типа в `TypedCreateMachineFn` не поддерживается.
- `entitiesPlugin<AppDeps>()` принимает `AppDeps` только на уровне типов, чтобы `EntityEffectDeps`/`EntityReactionDeps` могли извлечь `EntityAccess<AppMachines>` из `AppDeps.entities`.
- `AppDeps` может ссылаться на `AppState = MachinesState<typeof machines>` по существующему self-reference pattern для `getState`.
- `AppDeps` может ссылаться на `AppMachines = typeof machines` для строгой типизации `entities`.
- Для bootstrap с `defineEntitySpawn(machines, spawnEvents)` typed wrapper может использовать `entitiesPlugin<AppDeps>()` как источник типизации до создания `spawn`; runtime manager после этого может использовать `entitiesPlugin<AppDeps>({ spawn })`.
- Extension не меняет global `createMachine` typing.
- Extension не добавляет lifecycle events в public `AppEvents`.
- Extension сохраняет `initialContext` и `spawnSchema` как phantom metadata в result type каждого entity actor template.
- Extension добавляет entity-specific `effectDeps` и `reactionDeps` только для `storage: "entity"` templates.
- Extension задает lightweight `publicState`, поэтому `MachinesState<typeof machines>` не раскрывает column arrays.
- `EntityMachinePublicState<Metadata>` содержит закрытый `unique symbol` phantom field, который не создается runtime и переносит metadata внутри lightweight slice.
- Extension metadata используется `MachineResultMetadata<typeof machine>` и `MachinesState<typeof machines>`.
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
- `EntitySpawnSpec.id` обязателен и должен быть непустой строкой.
- `EntitySpawnSpec.id` должен быть уникален среди live entities и specs одного recipe result, но может использоваться повторно после despawn.
- `EntitySpawnSpec.groupTag` обязателен, типизируется как `string` и должен быть непустой строкой.
- `EntitySpawnSpec.actors` содержит хотя бы один actor row.
- `actors` keys являются subset entity actor keys из `machines`.
- `actors` не может ссылаться на domain machine или `storage: "instance"` actor template.
- Actor payload проверяется по actor `spawnSchema`.

### `manager.entities`

```ts
type AppMachines = typeof machines;
type AppState = MachinesState<typeof machines>;

type AppDeps = {
  getState?: () => AppState;
  entities?: EntityAccess<AppMachines>;
};

manager.setDependencies({
  getState: manager.getState,
  // root access для обычных domain/process effects, если он нужен приложению
  entities: manager.entities,
});
```

Контракт:

- `manager.entities` возвращает accessor к entity actor stores, которым владеет entity runtime.
- `manager.entities` является stable live accessor object на весь lifetime manager и переживает hydrate replace.
- Разработчик не создает `entities` вручную.
- `manager.entities` не подмешивается в user deps автоматически.
- Если domain/process effects должны читать root entity stores, приложение может передать `entities: manager.entities` в `setDependencies(...)`.
- `AppDeps.entities?: EntityAccess<AppMachines>` является опциональным источником типов для строгой типизации `entities.get(...)` в entity effects/reactions.
- Entity effects и reactions получают объект `entities`, привязанный к текущему entity scope, через `EntityMachineExtension.effectDeps`/`reactionDeps`; runtime не читает `deps.entities` для entity scopes.
- Если `AppDeps.entities` не объявлен, инжектируемый объект `entities` runtime доступен, но `entities.get(...)`/`entities.maybe(...)` имеют `never` key union на уровне TypeScript.
- `EntityAccess<AppMachines>` выводит доступные keys из machine definitions и включает только `storage: "entity"` actor templates.
- Обычные domain/process machines читаются через `getState()`.
- Для `entities` не требуется ручной `AppActorRegistry` или codegen.
- Core plugin system не хардкодит key `entities`.

### `EntityAccess<AppMachines>`

```ts
type ReadonlyEntityColumn<T> = {
  readonly [entity: EntityIndex]: T;
};

type EntityContextFor<
  AppMachines extends MachineStore,
  K extends EntityActorKey<AppMachines>,
> = AppMachines[K] extends {
  readonly initialContext: infer Context extends EntitySchema;
}
  ? EntityContextFromSchema<Context>
  : never;

type EntityStateFor<
  AppMachines extends MachineStore,
  K extends EntityActorKey<AppMachines>,
> = AppMachines[K] extends {
  readonly config: infer Config extends object;
}
  ? ActorPublicState<Config>
  : never;

type EntityActorStoreViewFor<
  AppMachines extends MachineStore,
  K extends EntityActorKey<AppMachines>,
> = {
  readonly count: number;
  readonly version: number;
  has(entity: EntityIndex): boolean;
  state(entity: EntityIndex): EntityStateFor<AppMachines, K> | undefined;
} & {
  readonly [Field in keyof EntityContextFor<AppMachines, K>]: ReadonlyEntityColumn<
    EntityContextFor<AppMachines, K>[Field]
  >;
};

type EntityAccess<AppMachines extends MachineStore> = {
  get<K extends EntityActorKey<AppMachines>>(
    key: K,
  ): EntityActorStoreViewFor<AppMachines, K>;

  maybe<K extends EntityActorKey<AppMachines>>(
    key: K,
  ): EntityActorStoreViewFor<AppMachines, K>;
};
```

Контракт:

- `entities.get("actorKey")` является required access.
- `entities.maybe("actorKey")` является optional access.
- `entities.get(...)` и `entities.maybe(...)` возвращают один публичный тип store view; отличие между ними поведенческое и диагностическое.
- Store view кешируется per `actorKey`: повторный `entities.get("actorKey")` возвращает тот же live view object.
- Store view читает current committed columns и переживает hydrate replace.
- `actorKey` типизируется по entity actor keys из `AppMachines`.
- Unknown `actorKey` является TypeScript error.
- Return type выводится из `initialContext` actor template.
- `EntityAccess<AppMachines>` строит key union только из machines с `storage: "entity"`.
- `EntityStateFor<AppMachines, K>` выводится из `ActorPublicState<AppMachines[K]["config"]>` и не деградирует до `string`.
- `entities.get("movementActor").x[entity]` типизируется как value type поля `x` из `initialContext`.
- Store view содержит `count`, `version`, `has(entity)` и `state(entity)`.
- `store.state(entity)` возвращает public state name actor row или `undefined`, если row отсутствует.
- `store.state(entity)` не возвращает `__INIT`; terminal states после cleanup недоступны.
- Store view не раскрывает raw typed arrays как public contract; indexed readonly column API является public contract.
- Root `manager.entities.get(...)` проверяет только known `actorKey`; presence проверяется через `store.has(entityIndex)`.
- Scoped `entities.get(...)` validation проверяет, что каждая entity из текущего `self.indices` имеет requested actor row, если runtime diagnostics включены.
- `entities.maybe(...)` не валидирует наличие actor row.
- `store.has(entity)`, column access и `self.entityId(entity)` принимают `EntityIndex`.
- Optional access требует проверки `store.has(entityIndex)` перед чтением actor columns.
- Внешние APIs используют `EntityId` string: spawn specs, `meta.entityId`, `transition.entity(...)`, `transition.despawn(entityId)`, snapshot и React hooks.

### Entity effect transition helpers

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
- `transition.tag(...)` сохраняет текущую core semantics: отправляет action с `meta.groupTag` через глобальный `groupTag` route.
- `transition.tag(...)` не переписывается entity runtime в `meta.entityId`, не ограничивается entity rows и доставляет action всем runtime, которые поддерживают `groupTag`.
- `transition.actor(...)` является escape hatch для существующих `storage: "instance"` actors и не адресует entity actor rows.
- `transition.entity(...)` и `transition.despawn(...)` являются новыми entity-specific helpers через `EntityMachineExtension.effectDeps`.
- `transition.tag(...)` и `transition.actor(...)` доступны в entity effects как существующие transition helpers с текущей core semantics.
- Public `manager.despawn(...)` и non-entity scoped `transition.despawn(...)` не добавляются.
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
- TypeScript не обязан запрещать lifecycle event names, если пользователь вручную добавил их в `AppEvents`; runtime reject является источником истины.
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
- `optional(inner)` в `spawnSchema` не делает ключ optional: отсутствующий ключ и `undefined` невалидны.
- Descriptors несут phantom types для value type, column type и spawn payload type.
- `initialContext` и `spawnSchema` являются plain object maps известных descriptors; arrays, `Map`, `Set`, class instances и objects с custom prototype невалидны.
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
- `useEntityList`;
- `type EntityRowSnapshot`;
- `type EntityListOptions`;
- `type TypedUseEntitySnapshotHook`;
- `type TypedUseEntityCountHook`;
- `type TypedUseEntityListHook`.

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

- `plugin.ts` связывает `entitiesPlugin(...)` с core plugin system: `definePlugin().create(...)`, section `storage`, section `routeMeta.entityId`, spawn `hooks.beforeReduce(ctx)` и section `manager.entities`.
- `schema.ts` владеет descriptors и runtime/type-level schema validation.
- `spawn.ts` владеет `defineSpawnEvents`, `spawnEvent`, `SpawnEventsFrom`, `defineEntitySpawn` и recipe typing.
- `machine-extension.ts` владеет `EntityMachineExtension`, который `entitiesPlugin(...)` передает через storage definition для `TypedCreateMachineFn`.
- `runtime/storage.ts` собирает `defineStorageRuntime<EntityStorageRuntimeExtension>().create(...)` и runtime blocks `effects`, `snapshot`, `identity`, `reactions` для `storage: "entity"`.
- `runtime/compile.ts` валидирует entity templates и компилирует event/state codes, transition tables, buckets metadata, reactions/effects metadata и `despawnOn`.
- `runtime/state.ts` владеет `EntityStore`, `ColumnarActorStore`, capacity growth, buckets и public lightweight state.
- `runtime/transaction.ts` владеет staged operations одного dispatch: spawn, reduce touches, state transitions, despawn, cleanup и version bumps.
- `runtime/routing.ts` переводит core route constraints в entity indices и reusable batch buffers.
- `runtime/identity.ts` реализует storage `identity.resolve(...)` для entity identity lookup без public `actorId`.
- `runtime/reduce.ts` выполняет default transition, reducer batch invocation и post-reducer validation.
- `runtime/lifecycle.ts` выполняет internal `ENTITY_SPAWNED`, `ENTITY_DESPAWNED`, `despawnOn` и `transition.despawn(...)`.
- `runtime/reactions.ts` реализует storage `reactions.run(...)`, выполняет generic sync reactions для исходного события только для rows со статусом `alive` и передает non-fatal errors через `ctx.dispatch.reportError(...)`.
- `runtime/effects.ts` реализует storage `effects.resolveInvocations(...)` и `effects.invoke(...)` для core-managed effect phase.
- `runtime/access.ts` создает root `EntityAccess` и `EntityAccess`/store views, привязанные к текущему scope.
- `runtime/snapshot.ts` реализует storage `snapshot.dehydrate(...)` и `snapshot.hydrate(...)` для `snapshot.storage.entity`.
- `react/index.ts` реализует React hooks на `useSyncExternalStore`, row/list/count caches и storage preview bridge для SSR/hydration.

Внутренний pipeline entity storage runtime:

1. Compile валидирует `storage: "entity"` config, `spawnSchema`, `initialContext`, `__INIT`, `despawnOn`, reactions/effects и компилирует numeric metadata.
2. Storage `prepareAction(ctx)` создает entity transaction slot в `ctx.dispatch.runtime`; spawn `hooks.beforeReduce(ctx)` stage-ит spawn operations в `ctx.runtime` после всех `intercept` replacements, но не мутирует live runtime state.
3. Route and batch выбирает entity indices и actor rows по normalized route constraints и reusable buffers.
4. Reduce применяет default transition, вызывает reducer один раз на batch, валидирует `stateCode` и собирает touched rows.
5. Lifecycle выполняет staged spawn через internal `ENTITY_SPAWNED`, explicit despawn, `despawnOn`, internal `ENTITY_DESPAWNED` reducer calls и lifecycle reactions до физического cleanup удаляемых rows.
6. Commit применяет staged column/state/presence changes, cleanup rows/entity indexes, обновляет buckets, `rowVersion`, actor `version` и public lightweight slices.
7. Generic reactions для исходного события выполняются через storage `reactions.run(...)` после cleanup и до subscribers только для rows со статусом `alive`.
8. Effects создают captured invocations с `entityIndex + generation`; core вызывает effect phase после subscribers и middleware post-`next`.

Граница core:

- core задает только внешний lifecycle, plugin DSL sections, routing meta, storage runtime callbacks, commit/subscribers/effects boundary и guarded dispatch phases;
- core не знает про entity store, columnar layout, generation, spawn recipes, buckets, lifecycle и reactions;
- core не импортирует `@lite-fsm/entities`;
- core не хардкодит `LiteFsmEntityLifecycleEvents`, `manager.entities`, `meta.entityId` или key `entities`;
- entity runtime не обращается к public `MachinesState` как source of truth для columns;
- hot path не проходит через `plugin.ts`;
- validate, transform и mutate остаются отдельными владельцами.

## 5. Этапы реализации

### Контракт перед этапом 8

Этап 8 начинается только после завершения этапов 1-7. Для реализации этапов 8-15 достаточно считать выполненным следующий контракт:

- `@lite-fsm/entities` существует как package с exports `"."` и `"./package.json"`.
- `entitiesPlugin(...)` устанавливается через `MachineManager(..., { plugins })` и подключает `storage: "entity"` через plugin storage section.
- `storage: "entity"` без plugin бросает clear unknown storage error.
- `@lite-fsm/core` не импортирует `@lite-fsm/entities` и не знает про entity store, columnar layout, generation, spawn recipes, buckets, lifecycle и reactions.
- Schema descriptors `f32`, `i16`, `i32`, `u8`, `string`, `optional` реализованы и валидируются.
- `EntityMachineExtension` типизирует `storage: "entity"` actor templates через typed wrapper с plugin source, сохраняет phantom metadata `initialContext`/`spawnSchema` и задает lightweight `publicState`.
- `effectDeps` для entity effects еще не являются частью выполненного контракта части 1 и добавляются на этапе 9.
- `reactions` и `reactionDeps` еще не являются частью выполненного контракта части 1 и добавляются на этапе 10.
- Entity templates требуют `initialState: "__INIT"`, `initialContext` и `spawnSchema`.
- `manager.entities` существует только при установленном `entitiesPlugin(...)` и типизируется как `EntityAccess<AppMachines>`.
- Public state slice для entity actor templates является lightweight read model с `storage`, `version`, `count`, `capacity` и закрытым type-only phantom metadata; columns не попадают в `manager.getState()`.
- Internal lifecycle events `ENTITY_SPAWNED` и `ENTITY_DESPAWNED` доступны только в entity config/reducer и запрещены через public `manager.transition(...)`; reactions получают lifecycle events на этапе 10.
- Минимальный reducer `self` API реализован: `self.indices`, schema columns, `self.stateCode`, `self.prevStateCode`, `self.has(entity)` и `self.entityId(entity)`.
- `payloadFor(entity)` работает только в reducer на `ENTITY_SPAWNED`, принимает только `EntityIndex` из текущего `self.indices` и типизируется по actor `spawnSchema`.
- `defineSpawnEvents`, `spawnEvent<T>()`, `SpawnEventsFrom<TSpawnEvents>` и `defineEntitySpawn(machines, spawnEvents)` реализованы.
- Public spawn `hooks.beforeReduce(ctx)` stage-ит atomic spawn transaction по финальному action после всех `intercept` replacements и не вызывает spawn recipes при hydrate.
- Spawn recipes валидируют non-empty `id`, non-empty `groupTag`, actor keys, actor payload shape, лишние actor payload keys, duplicate ids и empty `actors` до mutation.
- Columnar reduce pipeline использует numeric event/state codes, `config-default` policy, state buckets, `rowVersion`, `version` и reusable buffers.
- `meta.entityId` routing реализован через plugin `routeMeta` section; `groupTag` route работает для entity rows и сохраняет текущее поведение `storage: "instance"`; public `actorId` routing к entity rows не поддерживается.
- Entity storage runtime объявляет `routeMetaKeys: ["entityId"]`, а plugin `routeMeta.entityId` resolver связан с `EntityStorageRuntimeExtension.routeMeta`.
- Single-route meta contract соблюден: action с несколькими active routing keys бросает `LITE_FSM_AMBIGUOUS_ROUTE_META`.
- Entity hot path на `TICK` не делает string comparisons, per-row objects, `Map.get` и per-row allocations.
- Этапы 1-7 прошли runtime/type/performance guard tests, cleanup/source audit gate, coverage 100%, `check-types`/lint для затронутого scope и не запускали docs build.



### Этап 8 — Despawn, `despawnOn` и lifecycle cleanup

#### Цель

Добавить entity despawn semantics: `despawnOn`, scoped `ENTITY_DESPAWNED`, terminal row cleanup, free slot reuse и подготовить lifecycle hook point для будущего `transition.despawn(...)` и reactions.

#### Зависит от

- Этапы 1-7.

#### Меняется public API

Добавить:

- `despawnOn?: string | readonly string[]` в `EntityMachineExtension` input.

#### Runtime-контракт этапа

- `despawnOn` доступен только для `storage: "entity"` в MVP.
- `despawnOn` принимает state name или readonly array state names.
- State из `despawnOn` должен существовать в `config`.
- `despawnOn` не может ссылаться на `__INIT`, `__RESOLVED`, `__CANCELLED`, `__REJECTED`.
- Если actor row после reducer/default transition находится в state из `despawnOn`, runtime schedules despawn всей entity.
- Owner actor row в state из `despawnOn` не обязан иметь `ENTITY_DESPAWNED` edge в этом state.
- Owner actor row удаляется вместе с entity despawn.
- Если несколько actor rows одной entity одновременно попали в `despawnOn`, runtime дедуплицирует entity.
- `despawnOn` processing выполняется синхронно в том же dispatch.
- Переход одного actor row в `__RESOLVED` не вызывает entity despawn автоматически.
- Entity despawn в этом этапе вызывается через `despawnOn`; explicit scoped despawn через `transition.despawn(...)` добавляется на этапе 9, а hydrate/reconcile path использует тот же cleanup contract после появления snapshot/hydrate.
- Despawn operation находит все actor rows attached к entity.
- Runtime создает scoped lifecycle delivery `ENTITY_DESPAWNED` для attached actor rows.
- Reducer на `ENTITY_DESPAWNED` вызывается только для rows, чей текущий state принимает `ENTITY_DESPAWNED` по `config`.
- Actor row без `ENTITY_DESPAWNED` edge удаляется cleanup phase без lifecycle reducer call.
- Owner actor row в `despawnOn` state удаляется даже без `ENTITY_DESPAWNED` edge; reducer на `ENTITY_DESPAWNED` у него вызывается только при наличии edge.
- Terminal actor rows удаляются в storage commit до subscribers.
- Entity удаляется из `EntityStore`, когда у нее не остается actor rows.
- `alive[entityIndex]`, `indexById`, `ids`, `groupTagByIndex`, `freeList` и `generation` обновляются consistent.
- `generation[entityIndex]` инкрементируется при повторном использовании slot.
- `generation` подготавливает stale-scope validation для effects/reactions следующих этапов.
- После despawn `EntitySpawnSpec.id` можно использовать повторно, если entity с таким id больше не live.
- Повторный spawn с тем же `EntitySpawnSpec.id` создает новую live entity и не сохраняет старые actor rows, columns или `rowVersion`.
- `despawnOn` компилируется в internal `despawnStateMask`.
- Reactions будут реализованы на этапе 10; cleanup ordering должен оставить hook point, где `ENTITY_DESPAWNED` reactions видят columns до удаления.

#### Типовой контракт этапа

- Public `manager.despawn(...)` не добавляется.
- External despawn выражается обычным event + `meta.entityId`/`meta.groupTag` и actor config/reducer behavior.

#### Диагностика и ошибки

- Invalid `despawnOn` state бросает clear init error.
- `despawnOn` на special state бросает clear init error.
- `despawnOn` на `storage: "instance"` бросает clear init error.
- Duplicate scheduled despawn одного `entityIndex` дедуплицируется без ошибки.

#### Совместимость

- Public `manager.despawn(...)` не появляется.
- `storage: "instance"` terminal collapse semantics не меняются.
- `ENTITY_DESPAWNED` остается internal lifecycle event.
- Subscribers не видят rows, запланированные на despawn через `despawnOn`.

#### Не делать в этом этапе

- Не добавлять `transition.despawn(...)`.
- Не добавлять entity enter-state effects.
- Не добавлять reactions.
- Не добавлять snapshot/hydrate.
- Не добавлять React hooks.
- Не добавлять public routing по `actorId` к entity rows.

#### Тесты этапа

Runtime tests:

- `despawnOn: "EXPIRED"` despawns whole entity in same dispatch;
- owner actor state in `despawnOn` does not require `ENTITY_DESPAWNED` edge;
- row without `ENTITY_DESPAWNED` edge is removed without lifecycle reducer call;
- row with `ENTITY_DESPAWNED` edge receives lifecycle reducer before cleanup;
- multiple actor rows scheduling same entity are deduped;
- transition to `__RESOLVED` alone does not despawn entity;
- despawn sends scoped `ENTITY_DESPAWNED` to all attached actor rows;
- terminal rows are removed during storage commit before subscribers;
- entity is removed from `EntityStore` when no actor rows remain;
- `freeList` and `generation` update on slot reuse;
- `EntitySpawnSpec.id` can be reused after despawn without preserving old rows or columns.

Type tests:

- `despawnOn` accepts state name or readonly array;
- `manager.despawn(...)` does not exist.

#### Gate завершения

- Runtime и type tests этапа проходят.
- Cheatsheets и package docs отражают `despawnOn`.
- Coverage нового и измененного кода этапа равен 100%.
- Docs build не запускался.

### Этап 9 — Entity effects, entity-specific helpers и core transition helpers

#### Цель

Реализовать entity enter-state effects, scope-bound `self/entities`, async-safe captured scopes, новые entity-specific helpers `entity`/`despawn` и доступность существующих core helpers `tag`/`actor`.

#### Зависит от

- Этапы 1-8.
- Plugin system storage `effects` block и machine extension `effectDeps` реализованы.

#### Меняется public API

Уточнить entity effect deps:

- `EntityMachineExtension` получает `effectDeps: EntityEffectDeps<ContextSchema, AppDeps>`;
- `self` read-only view текущего actor batch;
- `entities` типа `EntityAccess<AppMachines>`, привязанный к текущему entity scope;
- `transition.entity(...)`;
- `transition.despawn(...)`.

Существующие `transition.tag(...)` и `transition.actor(...)` доступны в entity effects с текущей core semantics.

Public exports не меняются.

#### Runtime-контракт этапа

- Effect вызывается один раз на batch rows, вошедших в state после dispatch.
- Effect не вызывается при `self.indices.length === 0`.
- Effect привязан к enter-state.
- Effect не запускается для row, которая приняла event, но осталась в прежнем state.
- Если reducer откатил default transition через `self.stateCode[entity] = self.prevStateCode[entity]`, enter-state effect не запускается.
- Если reducer записал другой валидный финальный state вместо default target, enter-state effect запускается для финального state после reducer.
- Effect может быть sync или async.
- Effects запускаются по финальному state после reducer.
- Effects не запускаются для rows, удаленных через `despawnOn` до effect phase.
- Entity enter-state effects выполняются через storage `effects.resolveInvocations(...)` и `effects.invoke(...)` в core-managed effect phase.
- Entity runtime компилирует `effectsByStateCode` при init manager.
- Effect phase выполняется после subscribers и middleware post-`next`.
- `self` и `entities` read-only в effect.
- `self` и `entities` в async effect являются live views, bound к captured invocation scope.
- `self.indices` является stable captured list для effect invocation.
- Captured invocation сохраняет `entityIndex + generation`.
- `entities` в entity effect имеет публичный тип `EntityAccess<AppMachines>`, но runtime-значение является accessor, привязанным к текущему entity scope.
- Строгий `AppMachines` для инжектируемого объекта `entities` выводится из `AppDeps.entities?: EntityAccess<AppMachines>`.
- Если `AppDeps.entities` не объявлен, инжектируемый объект `entities` runtime доступен, но `entities.get(...)`/`entities.maybe(...)` имеют `never` key union на уровне TypeScript.
- `deps.entities` не читается runtime при создании entity effect scope.
- `self.has(entity)` после `await` проверяет current presence и captured generation.
- `entities.get(...)` и `entities.maybe(...)` доступны в effect через deps, которые entity storage собирает для `EntityMachineExtension.effectDeps`, до и после `await`.
- После `await` доступ читает current committed store для captured scope.
- Если entity/actor row из captured scope удалена или slot переиспользован до resume effect, `entities.get(...)` в `IS_DEV` бросает stale scope/missing row error.
- `entities.maybe(...)` после `await` возвращает view, где `store.has(entity)` отражает current presence.
- Async effect, который читает columns после `await`, должен проверять `self.has(entity)` или `store.has(entity)`, если entity могла быть удалена.
- `entities.get(...)` и `entities.maybe(...)` вызываются вне per-entity loops.
- Mutation из effect запрещена.
- Effect выполняет mutation только через `transition(...)`.
- `transition(action)` внутри entity effect является unscoped by default.
- `transition.entity(entityId | readonly entityId[], action)` доставляет action actor rows указанной entity или entities.
- `transition.entity(...)` дедуплицирует ids с сохранением первого появления.
- Unknown entity ids в `transition.entity(...)` являются no-op.
- `transition.tag(groupTag | readonly groupTag[], action)` сохраняет текущую core semantics `meta.groupTag` и доставляет action всем runtime, которые поддерживают `groupTag`.
- Entity runtime не переписывает `transition.tag(...)` в `meta.entityId` fanout и не ограничивает доставку только entity rows.
- `transition.actor(actorId | readonly actorId[], action)` адресует только `storage: "instance"` actors.
- `transition.despawn(...)` использует despawn semantics этапа 8.
- `transition.despawn(entityId | readonly entityId[])` schedules despawn для указанных live entities.
- Unknown entity ids в `transition.despawn(entityId)` являются no-op.
- `transition.despawn(self.indices)` принимает только entity indices из captured effect scope.
- Raw `EntityIndex` вне captured entity effect scope для `transition.despawn(...)` бросает clear runtime error, если TypeScript был обойден.
- For stale async scope `transition.despawn(self.indices)` проверяет captured generation: в `IS_DEV` бросает clear error, в production выполняет no-op для stale indices.
- `transition.despawn(entityId)` после `await` для уже удаленного id является no-op.
- `transition.entities(...)` не входит в MVP.
- Wildcard `*` effects, `condition()`, per-row `bag` и `createEffect("latest")` в entity MVP не поддерживаются.

#### Типовой контракт этапа

- Entity effect deps включают `entities`, привязанный к текущему entity scope, а не root `manager.entities`.
- Domain/process machines продолжают видеть root `manager.entities`, если они явно типизированы на `EntityAccess<AppMachines>`.
- Effect invocation получает captured `entities`, привязанный к текущему entity scope и доступный до и после `await`.
- `entities.get(...)` и `entities.maybe(...)` возвращают read-only typed store views в effects.
- `transition.entity(...)` и `transition.despawn(...)` типизируются как entity-specific helpers только в entity effects через `EntityMachineExtension.effectDeps`.
- `transition.tag(...)` и `transition.actor(...)` сохраняют типизацию существующих core helpers в entity effects.
- Entity effect `transition.despawn(...)` доступен только в entity effects.

#### Диагностика и ошибки

- Required access `entities.get(...)` в diagnostics проверяет каждую entity из current scope.
- Validation error содержит source actor, event type, requested actor key и entity id.
- Stale scope после `await` бросает clear dev error для required access.
- Stale captured scope despawn бросает clear error в `IS_DEV` и является no-op в production.
- Raw `EntityIndex` вне entity effect scope для `transition.despawn(...)` бросает clear runtime error, если TypeScript был обойден.
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
- accepted event without actual state enter does not schedule effect;
- reducer rollback to `prevStateCode` does not schedule effect;
- reducer override to another valid state schedules effect for final state;
- effects are not scheduled for `despawnOn` rows;
- async effect keeps captured scope after `await`;
- `self.has(entity)` detects stale/deleted row after `await`;
- `entities.get(...)` required access validates scope in diagnostics;
- `entities.maybe(...)` supports optional rows through `store.has(entity)`;
- `transition.entity(...)` routes to target entity rows;
- `transition.entity(...)` dedupes ids and treats unknown ids as no-op;
- `transition.tag(...)` uses global `meta.groupTag` routing and reaches entity rows and `storage: "instance"` actor groups with matching `groupTag`;
- `transition.actor(...)` routes only instance actors;
- `transition.despawn(...)` despawns captured rows with generation check;
- `transition.despawn(entityId)` treats unknown or already deleted ids as no-op;
- stale captured `transition.despawn(self.indices)` throws in `IS_DEV` and no-ops in production;

Type tests:

- entity effect deps expose typed `self` columns;
- entity effect deps expose scoped `entities`;
- `AppDeps.entities?: EntityAccess<AppMachines>` включает строгую типизацию `entities.get("actorKey")` в entity effects;
- отсутствие `AppDeps.entities` отклоняет string keys для `entities`, инжектируемого в entity effect;
- entity-specific transition helpers are typed in entity effects;
- raw `EntityIndex` is not accepted outside entity effect scope;
- `transition.despawn(...)` is unavailable outside entity effects;
- `manager.despawn(...)` does not exist;
- entity-specific transition helpers are unavailable outside `storage: "entity"` effects;
- unsupported effect features are rejected.

#### Gate завершения

- Runtime и type tests этапа проходят.
- Existing effects tests проходят.
- Cheatsheets and package docs отражают entity effects, entity-specific transition helpers и core helper semantics.
- Coverage нового и измененного кода этапа равен 100%.
- Docs build не запускался.

### Этап 10 — Reactions и reaction error semantics

#### Цель

Добавить sync-only reaction layer для entity actors: post-reducer external synchronization, scoped read access, `ENTITY_DESPAWNED` pre-cleanup reads и non-fatal error reporting через `reportError(...)`.

#### Зависит от

- Этапы 1-9.
- Plugin system storage `reactions` block и `ctx.dispatch.reportError(...)` реализованы.

#### Меняется public API

Уточнить `EntityMachineExtension` input:

- `reactions?: EntityReactions<ContextSchema>`.

Уточнить `EntityMachineExtension` deps:

- `reactionDeps: EntityReactionDeps<ContextSchema, AppDeps>`.

Public exports не меняются.

#### Runtime-контракт этапа

- `reactions` доступны только для `storage: "entity"` в MVP.
- Reaction является частью storage `reactions.run(...)`, а не generic dispatch hook.
- Reaction error semantics не наследуют fail-fast contract generic dispatch hooks.
- Reaction привязан к accepted event, а не к enter-state.
- Reaction вызывается один раз на actor template per accepted event.
- Reaction получает `self.indices` rows, которые приняли event по `config` и routing.
- Reaction запускается для accepted event даже если reducer не изменил columns или state.
- Entity runtime компилирует `reactionsByEventCode` при init manager.
- Reaction выполняется синхронно.
- Promise return передается через dispatch `reportError(...)` в `onError` как contract violation, если runtime может надежно определить Promise return, и не await-ится.
- Runtime не обязан ловить eventual rejection Promise, возвращенного reaction, потому async reactions не поддерживаются.
- `self` и `entities` read-only в reaction.
- `entities.get(...)` и `entities.maybe(...)` доступны в reaction через deps, которые entity storage собирает для `EntityMachineExtension.reactionDeps`.
- `entities` в entity reaction имеет публичный тип `EntityAccess<AppMachines>`, но runtime-значение является accessor, привязанным к текущему entity scope.
- Строгий `AppMachines` для инжектируемого объекта `entities` выводится из `AppDeps.entities?: EntityAccess<AppMachines>`.
- Если `AppDeps.entities` не объявлен, инжектируемый объект `entities` runtime доступен, но `entities.get(...)`/`entities.maybe(...)` имеют `never` key union на уровне TypeScript.
- `deps.entities` не читается runtime при создании entity reaction scope.
- `entities.get(...)` и `entities.maybe(...)` вызываются вне per-entity loops.
- State mutation из reaction запрещена.
- `transition(...)` и `transition.despawn(...)` из reaction запрещены в MVP.
- Reaction может читать user deps и вызывать sync methods внешних deps.
- Reducers выполняются раньше reactions.
- `despawnOn` lifecycle processing выполняется раньше reactions исходного event.
- Internal `ENTITY_DESPAWNED` reactions являются storage-specific lifecycle reactions entity runtime и выполняются внутри entity lifecycle/commit до физического cleanup удаляемых rows.
- Reactions на `ENTITY_DESPAWNED` запускаются только для rows, которые приняли `ENTITY_DESPAWNED` по `config`.
- Rows без `ENTITY_DESPAWNED` edge не получают lifecycle reaction и удаляются cleanup phase.
- Generic storage `reactions.run(...)` покрывает только reactions исходного public/internal event после cleanup.
- Reactions для `ENTITY_DESPAWNED` видят columns до удаления actor rows.
- Rows, удаленные через `despawnOn`, не попадают в reactions исходного event.
- Порядок despawn pipeline фиксирован: reducer/default transition исходного event; `despawnOn` и explicit despawn staging; scoped `ENTITY_DESPAWNED` delivery; `ENTITY_DESPAWNED` reactions; cleanup rows/entity/indexes/generation/freeList/versions; reactions исходного события только для rows со статусом `alive`; subscribers; effects только для rows со статусом `alive`.
- Runtime ловит ошибку каждой reaction и передает ее через dispatch `reportError(...)`, который вызывает `onError`.
- Ошибка reaction не откатывает reducer result.
- Ошибка reaction не отменяет subscribers.
- Ошибка reaction `ENTITY_DESPAWNED` не отменяет collapse/despawn cleanup.
- Ошибка reaction и Promise contract violation не меняют return value `manager.transition(...)`: возвращается committed public action.
- После ошибки одной reaction runtime продолжает обязательные lifecycle cleanup phases.
- Subscribers вызываются после sync reactions.
- Enter-state effects вызываются после subscribers.
- Reactions не создают public events.

#### Типовой контракт этапа

- `reactions` типизируются для entity actor templates через `EntityMachineExtension`.
- Lifecycle events доступны в reactions без добавления в `AppEvents`.
- Reaction deps включают read-only `self`, scope-bound `entities` и user deps.
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
- reaction runs for accepted event even when reducer leaves columns and state unchanged;
- reaction sees committed reducer state;
- reaction can read another actor through `entities.get(...)`;
- `ENTITY_DESPAWNED` reaction reads columns before cleanup;
- `ENTITY_DESPAWNED` reaction runs only for rows that accepted lifecycle event;
- rows without `ENTITY_DESPAWNED` edge are cleaned up without lifecycle reaction;
- rows, удаленные через `despawnOn`, не получают reaction исходного event;
- subscribers observe already-cleaned state after despawn;
- effects are not scheduled for despawned rows;
- Promise-returning reaction reports contract violation through `onError`;
- Promise-returning reaction is not awaited and eventual rejection is outside reaction error contract;
- thrown reaction error reports through `onError`;
- reaction error does not change `manager.transition(...)` return value;
- reaction error does not rollback reducer result;
- reaction error does not block subscribers;
- reaction error does not cancel despawn cleanup;
- reaction cannot dispatch or despawn.

Type tests:

- reactions are accepted on entity templates;
- reactions are rejected for `storage: "instance"`;
- reaction deps expose read-only `self` and scoped `entities`;
- `AppDeps.entities?: EntityAccess<AppMachines>` включает строгую типизацию `entities.get("actorKey")` в entity reactions;
- отсутствие `AppDeps.entities` отклоняет string keys для `entities`, инжектируемого в entity reaction;
- reaction deps do not expose `transition`;
- lifecycle events are available in entity reactions.

#### Gate завершения

- Runtime и type tests этапа проходят.
- Cheatsheets, README и package docs отражают reactions contract.
- Coverage нового и измененного кода этапа равен 100%.
- Docs build не запускался.

### Этап 11 — Snapshot/hydrate через `snapshot.storage.entity`

#### Цель

Добавить durable entity storage snapshot через `snapshot.storage.entity`, replace-only hydrate, schema validation, legacy compatibility для missing `generation`/`rowVersion` и rowVersion invalidation policy.

#### Зависит от

- Этапы 1-10.
- Plugin system storage `snapshot` block реализован.

#### Меняется public API

Уточнить snapshot envelope:

```ts
type MachineManagerSnapshotWithEntityStorage = {
  schemaVersion?: number;
  machines: Record<string, unknown>;
  storage?: Record<string, unknown> & {
    entity?: EntitySnapshot;
  };
};
```

Public exports не меняются. `MachineManagerSnapshot` в core хранит базовую `storage?: Record<string, unknown>` envelope; `@lite-fsm/entities` типизирует и валидирует `storage.entity`.

#### Runtime-контракт этапа

- Entity storage runtime объявляет `snapshot` block.
- `dehydrate()` включает `storage.entity`, если manager содержит `storage: "entity"` runtime с `snapshot` capability.
- `dehydrate({ storage: ["entity"] })` вызывает storage `snapshot.dehydrate(ctx)` и выгружает entity storage атомарно целиком.
- `dehydrate({ machines })` и `dehydrate({ storage })` являются независимыми filters.
- `dehydrate()` без filters экспортирует eligible `machines` и `storage.entity`.
- `dehydrate({ machines })` фильтрует только `machines` и не отключает `storage.entity`.
- `dehydrate({ storage: ["entity"] })` фильтрует только storage и не отключает `machines`.
- `dehydrate({ storage: [] })` явно отключает export entity storage.
- Чтобы экспортировать только entity storage, используется `dehydrate({ machines: [], storage: ["entity"] })`.
- Partial export/import entity storage не входит в MVP.
- Durable entity data хранится только в `storage.entity`; `machines[entityActorKey]` не хранит rows или columns и восстанавливается из storage runtime.
- `machines[entityActorKey]` из snapshot не мутирует entity rows, columns, presence, ids или generations.
- Если snapshot не содержит `storage.entity`, hydrate не меняет entity runtime state даже при наличии `machines[entityActorKey]`; public lightweight slice канонизируется из текущего entity runtime state.
- Snapshot serializes `EntityStore`, `generation`, `freeList`, entity `version`, every entity actor store и `rowVersion`.
- Typed arrays convert to plain arrays.
- Hydrate `storage.entity` идет через storage `snapshot.hydrate(ctx)`.
- Hydrate восстанавливает `EntityStore` и actor stores.
- Hydrate validates `ids`, `alive`, `generation`, `groupTagByIndex` and `freeList` length consistency before applying snapshot.
- Hydrate пересобирает `indexById` и entity sidecar.
- Hydrate validates schema compatibility before applying snapshot.
- Hydrate with old snapshot missing `generation` initializes `generation` to `0` for alive rows and rebuilds `freeList` from `alive`.
- Hydrate with old snapshot missing actor `rowVersion` rebuilds row versions from current manager version.
- Hydrate `storage.entity` является replace-only в MVP независимо от `strategy`.
- Если snapshot содержит `storage.entity`, hydrate атомарно заменяет entity runtime state.
- Если snapshot не содержит `storage.entity`, существующий entity runtime state остается без изменений.
- Hydrate replace не сравнивает snapshot entity ids с live entity ids; duplicate validation применяется к snapshot self-consistency, а не к заменяемому live state.
- Hydrate, который меняет только `storage.entity`, является committed change и уведомляет subscribers через `@@lite-fsm/HYDRATE`.
- `getHydratedState(...)` валидирует `storage.entity`, preview-ит только lightweight public slices (`version`, `count`, `capacity`) и не мутирует runtime columns.
- Если `getHydratedState(...)` получает storage runtime snapshot для неизвестного runtime или runtime без preview support, он бросает clear error.
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
- `getSnapshot()` возвращает runtime public read model с lightweight entity slices, но не durable entity envelope.
- React row cache policy фиксируется на уровне `rowVersion`, но hooks добавляются на этапе 12.

#### Диагностика и ошибки

- Explicit `dehydrate({ storage: ["entity"] })` без snapshot capability бросает clear error.
- Hydrate данных known runtime без snapshot capability бросает clear error.
- Hydrate или preview данных unknown storage runtime бросает clear error.
- Inconsistent snapshot lengths бросают clear error before applying snapshot.
- Schema mismatch бросает clear error before applying snapshot.
- Invalid column payload type бросает clear error before applying snapshot.
- Invalid `presence`, `stateCode`, `rowVersion` lengths бросают clear error.
- Hydrate failure не меняет existing entity runtime state.

#### Совместимость

- Current instance snapshot format сохраняется.
- Отсутствие `storage` в snapshot сохраняет compatibility with legacy snapshots.
- `getSnapshot()` не вызывает storage `snapshot.dehydrate(ctx)` и не включает `storage`.
- `replaceReducer` не является API мутации entity storage runtime.
- External replacement entity public slice через `replaceReducer` не меняет entity storage; runtime восстанавливает canonical lightweight slice из entity runtime state.

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
- `dehydrate()` default includes `storage.entity`;
- `dehydrate({ storage: [] })` excludes entity storage;
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
- hydrate with `machines[entityActorKey]` and without `storage.entity` does not mutate entity rows or columns;
- hydrate replace with snapshot ids matching live ids succeeds when snapshot is self-consistent;
- storage-only hydrate notifies subscribers with `@@lite-fsm/HYDRATE`;
- `getHydratedState(...)` previews lightweight public slices and does not mutate columns;
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

### Этап 12 — React hooks: `useEntitySnapshot`, `useEntityCount`, `useEntityList`

#### Цель

Добавить granular React read layer для entity rows через `@lite-fsm/entities/react`, `useSyncExternalStore`, row/list/count caches и корректный SSR/hydration preview без rerender unrelated consumers.

#### Зависит от

- Этапы 1-11.
- `@lite-fsm/react` остается отдельным package и не импортирует entity hooks.
- `FSMHydrationBoundary` и React hydration overlay из `@lite-fsm/react` доступны как точка интеграции для preview state.

#### Меняется public API

Добавить package export:

- `"./react"`.
- path alias `@lite-fsm/entities/react` в `tsconfig.paths.json`.

Добавить hooks:

```ts
useEntitySnapshot(templateKey, entityId);
useEntityCount(templateKey, options?);
useEntityList(templateKey, options?);
```

Целевые сигнатуры:

```ts
type EntityRowSnapshot<Context, State extends string = string> = {
  readonly entityId: EntityId;
  readonly groupTag: string;
  readonly state: State;
  readonly context: Context;
};

type EntityListOptions = {
  readonly groupTag?: string;
};

function useEntitySnapshot<
  AppMachines extends MachineStore = MachineStore,
  K extends EntityActorKey<AppMachines> = EntityActorKey<AppMachines>,
>(
  templateKey: K,
  entityId: EntityId | null | undefined,
): EntityRowSnapshot<EntityContextFor<AppMachines, K>, EntityStateFor<AppMachines, K>> | undefined;

function useEntityCount<
  AppMachines extends MachineStore = MachineStore,
  K extends EntityActorKey<AppMachines> = EntityActorKey<AppMachines>,
>(
  templateKey: K,
  options?: EntityListOptions,
): number;

function useEntityList<
  AppMachines extends MachineStore = MachineStore,
  K extends EntityActorKey<AppMachines> = EntityActorKey<AppMachines>,
>(
  templateKey: K,
  options?: EntityListOptions,
): readonly EntityId[];
```

Добавить typed aliases для app-level wrappers:

```ts
type TypedUseEntitySnapshotHook<AppMachines extends MachineStore> = <
  K extends EntityActorKey<AppMachines>,
>(
  templateKey: K,
  entityId: EntityId | null | undefined,
) => EntityRowSnapshot<EntityContextFor<AppMachines, K>, EntityStateFor<AppMachines, K>> | undefined;

type TypedUseEntityCountHook<AppMachines extends MachineStore> = <
  K extends EntityActorKey<AppMachines>,
>(
  templateKey: K,
  options?: EntityListOptions,
) => number;

type TypedUseEntityListHook<AppMachines extends MachineStore> = <
  K extends EntityActorKey<AppMachines>,
>(
  templateKey: K,
  options?: EntityListOptions,
) => readonly EntityId[];
```

Обязательные exports из `"./react"`:

- `useEntitySnapshot`;
- `useEntityCount`;
- `useEntityList`;
- `type EntityRowSnapshot`;
- `type EntityListOptions`;
- `type TypedUseEntitySnapshotHook`;
- `type TypedUseEntityCountHook`;
- `type TypedUseEntityListHook`.

Для корректного SSR/hydration preview добавить generic storage-preview bridge в `@lite-fsm/react` для plugin packages:

```ts
type FSMStorageHydrationPreview = {
  readonly hasPreview: boolean;
  readonly preview: unknown | undefined;
  readonly hasServerPreview: boolean;
  readonly serverPreview: unknown | undefined;
};

function useStorageHydrationPreview(storageKind: string): FSMStorageHydrationPreview;
```

Контракт bridge:

- `FSMHydrationBoundary` хранит не только preview `MachinesState`, но и raw storage preview map из исходного snapshot.
- `useStorageHydrationPreview("entity")` возвращает active preview `snapshot.storage.entity`, если текущий `FSMHydrationBoundary` или parent boundary содержит `storage.entity`.
- `hasPreview` отличает отсутствующий storage preview от присутствующего preview со значением `undefined`, если TypeScript был обойден.
- `serverPreview` и `hasServerPreview` используются как source для `getServerSnapshot` внутри entity hooks.
- Для nested boundaries child без `storage[storageKind]` наследует parent storage preview этого kind.
- Для nested boundaries child с `storage[storageKind]` заменяет parent storage preview этого kind.
- Bridge является generic API для plugin packages и не импортирует `@lite-fsm/entities` в `@lite-fsm/react`.
- Bridge не дает API мутации storage и не экспортирует storage runtimes.

#### Runtime-контракт этапа

- Hooks используют `useSyncExternalStore`.
- `@lite-fsm/entities/react` использует существующий manager context из `@lite-fsm/react`; отдельный provider не добавляется.
- Main export `@lite-fsm/entities` не импортирует React и не зависит runtime-веткой от `@lite-fsm/react`.
- `@lite-fsm/entities` объявляет `react` и `@lite-fsm/react` в package-level `peerDependencies` с `peerDependenciesMeta.optional: true`; эти зависимости нужны subpath `"./react"`, а main export их не импортирует.
- `useEntitySnapshot` subscribes to one entity row.
- `useEntitySnapshot(templateKey, null)` и `useEntitySnapshot(templateKey, undefined)` возвращают `undefined` и не подписываются на конкретный row. Это нужно для selected/hovered entity без условного вызова hooks.
- `useEntitySnapshot` возвращает serializable row snapshot с `entityId`, `groupTag`, `state` и `context`.
- `context` внутри row snapshot строится из `initialContext` schema и не раскрывает column arrays.
- `state` внутри row snapshot выводится из states actor template и отражает current committed или preview row state.
- `groupTag` внутри row snapshot берется из `EntityStore`, а не из actor template.
- `rowVersion` provides stable snapshot caching: если row не изменился, `getSnapshot` возвращает ту же ссылку.
- Missing row cache должен возвращать стабильный `undefined` и инвалидироваться при spawn того же `entityId` для этого `templateKey`.
- Despawn и повторный spawn того же `entityId` инвалидируют старый row snapshot независимо от reuse internal `entityIndex`.
- Update одного row не rerender unrelated row consumers.
- `useEntityCount` subscribes to count changes of one actor template.
- `useEntityCount(templateKey, options?)` считает present rows выбранного `templateKey`, а не количество unique entities в group.
- `useEntityList` subscribes to list changes for one actor template.
- `useEntityCount(templateKey, { groupTag })` и `useEntityList(templateKey, { groupTag })` фильтруют rows по точному `EntitySpawnSpec.groupTag`.
- `groupTag` option является exact filter по уже существующему groupTag index. Arbitrary predicate/filter не входит в MVP.
- Count snapshot кешируется по `countVersion` или эквивалентному version source для пары `templateKey + groupTag`.
- List snapshot кешируется по `listVersion` или эквивалентному version source для пары `templateKey + groupTag`. Если membership и порядок не изменились, `getSnapshot` возвращает ту же `readonly EntityId[]` ссылку.
- Порядок ids в `useEntityList` является runtime-defined и может меняться при despawn/state transitions; stable sorted ordering не гарантируется.
- Hooks read through `manager.entities` and entity runtime subscription/index layer.
- Regular `@lite-fsm/react` не импортирует entity hooks.
- `@lite-fsm/entities/react` использует `useStorageHydrationPreview("entity")` для выбора между committed entity runtime и active storage preview.

#### SSR и hydration preview

- Entity hooks должны возвращать одинаковые значения на server render, hydration render и client render для одного и того же active hydration preview.
- `FSMHydrationBoundary` preview должен быть видим для `@lite-fsm/entities/react` так же, как `useSelector` видит preview через `useHydrationOverlay`.
- Если active hydration preview содержит `snapshot.storage.entity`, entity hooks читают preview rows/list/count из этого snapshot без мутации committed entity runtime.
- Если active hydration preview не содержит `snapshot.storage.entity`, entity hooks читают текущий committed entity runtime.
- Entity storage hydrate является replace-only; preview semantics для entity hooks должны соответствовать этому правилу независимо от `strategy`.
- Nested `FSMHydrationBoundary` должен наследовать parent entity preview, если child snapshot не содержит `storage.entity`, и заменить entity preview, если содержит.
- `getServerSnapshot` для entity hooks должен читать server preview entity data, а не committed client entity runtime.
- Hydrate commit должен инвалидировать row/list/count caches до публикации subscriber notification, чтобы первый post-commit snapshot совпал с hydrated storage.
- `getHydratedState(...)` остается preview только для lightweight public slices. Для React entity hooks stage добавляет отдельный read-only preview path к entity runtime или storage preview bridge; этот path не записывает columns и не становится public mutation API.
- Preview validation errors для `snapshot.storage.entity` должны совпадать с ошибками этапа 11 и не оставлять частично примененный preview/cache state.

#### Типовой контракт этапа

- `templateKey` типизируется по entity actor keys через typed hook aliases и typed manager/context integration.
- `useEntitySnapshot` возвращает `EntityRowSnapshot<SchemaValue<typeof initialContext>, StateUnion> | undefined`.
- `useEntitySnapshot` принимает `EntityId | null | undefined`, но не принимает `EntityIndex`.
- `useEntityCount` возвращает number.
- `useEntityList` возвращает `readonly EntityId[]`.
- Hook types do not expose `EntityIndex` as public row identifier.
- `EntityListOptions.groupTag` типизируется как `string`; multi-tag и массив tags не входят в MVP.

#### Диагностика и ошибки

- Unknown `templateKey` бросает clear runtime error, если TypeScript был обойден.
- Missing `entityId` row returns `undefined`.
- `null` или `undefined` `entityId` не являются ошибкой.
- Hook usage without manager/provider follows existing `@lite-fsm/react` error policy.
- Hook usage with manager that lacks `manager.entities` throws clear runtime error.
- Hook usage with manager whose entity runtime has no React subscription/preview capability throws clear runtime error.
- Invalid `groupTag` type at runtime throws clear error, если TypeScript был обойден.
- Hydrate invalidation bugs должны ловиться tests через stale rowVersion/listVersion/countVersion cache.

#### Совместимость

- `@lite-fsm/react` bundle не импортирует `@lite-fsm/entities/react`.
- Importing `@lite-fsm/entities/react` without installed `@lite-fsm/react` fails through normal module resolution.
- Existing React hooks keep behavior.
- Entity hooks do not require graph/devtools UI.
- Existing `FSMContextProvider`, `FSMHydrationBoundary`, `useSelector`, `useManager` and `useTransition` behavior remains compatible.
- `useStorageHydrationPreview(...)` в `@lite-fsm/react` остается generic bridge for plugin packages and does not depend on `@lite-fsm/entities`.

#### Не делать в этом этапе

- Не добавлять editor prefab UI.
- Не добавлять renderer-specific integrations.
- Не добавлять mutation APIs from React hooks.
- Не добавлять arbitrary predicate/filter для `useEntityList` или `useEntityCount`.
- Не добавлять sorting option или stable sorted ordering.
- Не добавлять multi-tag filtering.
- Не добавлять React hook, который возвращает raw column arrays или `EntityIndex`.
- Не менять `@lite-fsm/react` public API кроме typed integration и `useStorageHydrationPreview(...)`.

#### Тесты этапа

React tests:

- `useEntitySnapshot` renders one row snapshot with `entityId`, `groupTag`, `state` and `context`;
- `useEntitySnapshot(templateKey, null)` and `useEntitySnapshot(templateKey, undefined)` return `undefined` without conditional hook usage;
- changing one row rerenders only that row consumer;
- changing unrelated row does not rerender subscriber;
- despawned row invalidates snapshot;
- despawn + respawn same `entityId` invalidates previous row snapshot;
- hydrate invalidates rowVersion/listVersion/countVersion caches before publishing snapshots;
- `FSMHydrationBoundary` with `snapshot.storage.entity` makes `useEntitySnapshot` read preview row data before hydrate commit;
- `FSMHydrationBoundary` with `snapshot.storage.entity` makes `useEntityList` and `useEntityCount` read preview list/count data before hydrate commit;
- server render and hydration render produce matching entity hook snapshots for the same storage preview;
- nested `FSMHydrationBoundary` inherits parent entity preview when child snapshot lacks `storage.entity`;
- nested `FSMHydrationBoundary` replaces parent entity preview when child snapshot contains `storage.entity`;
- `useStorageHydrationPreview("entity")` reports preview/serverPreview for current and nested boundaries without importing `@lite-fsm/entities`;
- `useEntityCount` rerenders on count changes;
- `useEntityCount(templateKey, { groupTag })` counts only rows with matching `groupTag`;
- `useEntityList` returns `readonly EntityId[]` and rerenders according to list changes;
- `useEntityList(templateKey, { groupTag })` returns only rows with matching `groupTag`;
- list snapshot keeps reference identity when membership/order did not change;
- `useEntityList` exposes runtime-defined order without sorted ordering guarantee;
- missing row returns `undefined` from `useEntitySnapshot`;
- entity hooks throw clear error when manager has no `manager.entities`;
- entity hooks throw clear error when manager entity runtime lacks React subscription/preview capability;
- regular `@lite-fsm/react` does not import entity hooks.

Type tests:

- hook `templateKey` is limited to entity actor keys through typed aliases;
- `useEntitySnapshot` returns `EntityRowSnapshot` with `context` value shape from `initialContext`;
- `useEntitySnapshot` exposes row `state` as inferred state union;
- `useEntitySnapshot` may return `undefined`;
- `useEntitySnapshot` accepts `EntityId | null | undefined`;
- `useEntityList` returns `readonly EntityId[]`;
- `useEntityList` and `useEntityCount` accept `{ groupTag?: string }`;
- typed hook aliases preserve app `AppMachines`;
- `useStorageHydrationPreview(...)` exposes unknown storage payload and does not expose entity-specific types;
- public hook types do not expose raw `EntityIndex` as required input.

#### Gate завершения

- React and type tests этапа проходят.
- Existing `@lite-fsm/react` tests проходят.
- Package export `"./react"` работает.
- `tsconfig.paths.json` резолвит `@lite-fsm/entities/react` на source entry.
- Cheatsheets, README and package docs reflect React hooks.
- Coverage нового и измененного кода этапа равен 100%.
- Docs build не запускался.

### Этап 13 — Benchmarks, README/examples

#### Цель

Добавить benchmarks, package README/examples и документационные проверки `@lite-fsm/entities` без расширения runtime surface.

#### Зависит от

- Этапы 1-12.

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
- Этап добавляет явные benchmark scripts без docs build: `pnpm run bench:entities` для Node.js profile и `pnpm run bench:entities:browser` для headless browser profile.
- Benchmark запускается в Node.js.
- Benchmark запускается в браузерном профиле через headless browser.
- Каждый benchmark scenario выполняет не менее 5 warmup iterations и 30 measured iterations.
- Hard gate сравнивает median measured time с threshold; p95 фиксируется в benchmark output и package performance report.
- Если p95 используется как hard gate для конкретного runner, его budget должен быть явно записан рядом с benchmark fixture, чтобы flaky threshold не зависел от локальной машины.
- Reducer-only `TICK` не медленнее `1.5x` hand-written SoA ECS baseline на 10k/50k rows.
- Full pipeline без внешних renderer calls не медленнее `2x` hand-written SoA ECS baseline на 10k/50k rows.
- Production build не делает per-row heap allocations внутри entity hot loops на steady-state `TICK`.
- Полный dispatch допускает ограниченный per-action overhead core/kernel pipeline.
- Allocation guard измеряет отсутствие per-row allocation growth, а не абсолютный ноль heap allocations на весь `manager.transition(...)`.

#### Типовой контракт этапа

- Public API и public types в cheatsheets соответствуют реализованным exports.
- README показывает typed wrapper с plugin source `typeof entityPlugin` или `typeof plugins`, а не передачу `EntityMachineExtension` третьим параметром типа.
- README показывает `defineSpawnEvents`, `spawnEvent`, `SpawnEventsFrom`, `defineEntitySpawn`, `entitiesPlugin({ spawn })` и `manager.entities`.
- README показывает `AppDeps` с `getState?: () => AppState` и `entities?: EntityAccess<AppMachines>`.
- README показывает `manager.setDependencies({ entities: manager.entities, ... })` только для domain/process effects, которым нужен root entity access.
- README явно разделяет `deps.entities` как опциональный root accessor и источник типов, а также объект `entities`, который инжектируется в entity effects/reactions и привязан к текущему entity scope.
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
- `pnpm run bench:entities`;
- `pnpm run bench:entities:browser`;
- benchmark output reports median and p95 after warmup;
- steady-state `TICK` allocation guard for per-row allocation growth.

Documentation/example tests:

- package README snippets compile or are mirrored by test fixtures;
- runnable example fixture covers `movementActor`, `projectileActor`, `spriteSyncActor`, `TICK`, spawn projectile/unit and `despawnOn`;
- examples use `manager.entities` as root deps source only for domain/process effects that need root entity access;
- examples keep typed entity effects/reactions by declaring `entities?: EntityAccess<AppMachines>` in `AppDeps`;
- examples avoid public `actorId` routing for entity rows.

#### Gate завершения

- `pnpm run bench:entities` и `pnpm run bench:entities:browser` проходят required median thresholds и печатают p95.
- README, package docs and cheatsheets are current.
- Examples compile or are covered by tests.
- Docs build не запускался.

### Этап 14 — Рефакторинг, чистка и полировка

#### Цель

Закрыть итоговый cleanup/audit gate после runtime, React, snapshot, benchmark и documentation этапов без расширения public API и без изменения поведения.

#### Зависит от

- Этапы 1-13.

#### Контракт этапа

Must fix:

- убрать временные helpers, compatibility shims, debug logging, TODO/FIXME, `test.only`, временные `test.skip`, `throw new Error("not implemented")` и fallback-ветки, добавленные только для tests;
- удалить неиспользуемые imports, locals, types, exports, modules, feature flags, benchmark scaffolds и React preview scaffolds, которые больше не нужны;
- убрать дублирование validation, schema normalization, spawn staging, lifecycle cleanup, route resolution, snapshot validation, React cache invalidation и benchmark data setup, если один владелец ответственности уже очевиден;
- проверить, что `@lite-fsm/core`, `@lite-fsm/react`, `@lite-fsm/entities`, tests, examples и package docs используют финальные plugin contracts: `definePlugin().create(...)`, `defineStorageRuntime().create(...)`, `hooks.beforeReduce`, `routeMetaKeys`, `effectDeps`, `reactionDeps`, `publicState`;
- проверить, что `@lite-fsm/react` не импортирует `@lite-fsm/entities/react`, а `@lite-fsm/entities` main export не импортирует React runtime;
- привести comments/docs к финальному контракту, а не к истории реализации.

Inspect only:

- декоративные переименования без снижения сложности;
- перенос кода между runtime modules без устранения duplicate owner;
- micro-optimizations за пределами benchmark thresholds;
- новые abstractions или type aliases без второго места использования или явного снижения сложности.

Expected remaining hits:

- `scopedDeps` и `scopedTransition` допустимы в core plugin docs/tests и как явный запрет для entity-specific deps, но не как реализация entity effects/reactions;
- `intercept` допустим как core plugin phase, но public spawn staging должен ссылаться на `hooks.beforeReduce`;
- `StorageRuntimeBase`, `PluginInstallContext`, `PluginCapabilities`, `ctx.storage.register` и `storage.register` допустимы только в historical specs или regression-аудитах;
- строки source audit в этом ТЗ и журнале допустимы как self-reference hits.

#### Не делать в этом этапе

- Не менять public API, public types, storage snapshot format, React hook signatures, routing semantics или benchmark thresholds.
- Не добавлять docs pages в `apps/docs`, Devtools UI, graph UI, editor prefab UI или renderer-specific integrations.
- Не запускать docs build и команды, которые транзитивно запускают docs build.

#### Тесты этапа

- focused regressions для contracts, затронутых cleanup;
- type tests при изменении types или exports;
- snapshot/React/benchmark tests, если cleanup затронул соответствующий слой;
- lint для затронутого scope;
- `git diff --check`;
- source audit: `rg "ctx\\.storage|storage\\.register|PluginInstallContext|PluginCapabilities|StorageRuntimeBase|public spawn intercept|spawn .*intercept|generic action interceptors" packages/entities packages/react tests spec`.

#### Критерий завершения

- Cleanup не изменил public behavior, public API, error semantics, routing order, transaction atomicity, snapshot format, React cache guarantees или performance guarantees.
- Все проверки этапа проходят.
- Source audit не содержит active-scope hits, кроме явно перечисленных `Expected remaining hits`.
- Coverage нового и измененного кода остается 100%.
- Docs build не запускался.

### Этап 15 — Финальная проверка `ecs_example`

#### Цель

Проверить, что минимальный игровой пример в `ecs_example` компилируется и выполняется на финальном `@lite-fsm/entities` API после завершения runtime, React, snapshot, benchmark, документационных и cleanup этапов.

#### Зависит от

- Этапы 1-14.

#### Контракт этапа

- Этап не меняет public API, public types, runtime behavior, snapshot format, React hooks или benchmark thresholds.
- `ecs_example/store` должен оставаться app-level примером, который потребляет публичные entrypoints `@lite-fsm/core`, `@lite-fsm/entities`, `@lite-fsm/entities/react`, `@lite-fsm/middleware/immer`, `@lite-fsm/persist` и `@lite-fsm/react`.
- Пример должен использовать финальный API из этого ТЗ: `entitiesPlugin({ spawn })`, `defineSpawnEvents`, `spawnEvent`, `SpawnEventsFrom`, `defineEntitySpawn`, schema descriptors, `storage: "entity"`, `spawnSchema`, `initialContext`, `despawnOn`, `manager.entities`, `EntityAccess<AppMachines>`, `transition.entity(...)`, `transition.tag(...)`, `transition.actor(...)`, `transition.despawn(...)`, `reactions` и React entity hook aliases.
- Пример должен содержать минимум один обычный domain/process machine, один `storage: "instance"` actor и один `storage: "entity"` actor template.
- Все три владельца поведения должны принимать `TICK`; каждый reducer/effect/reaction должен менять только свой слой ответственности.
- Public spawn должен идти через `manager.transition({ type: "SPAWN_ENEMY", ... })`, а не через несуществующий public `manager.spawn(...)`.
- Entity routing должен проверяться через `meta.entityId`; `groupTag` routing должен проверяться через `meta.groupTag` или `transition.tag(...)`.
- Пример должен проверять root `manager.entities.get("enemyActor")`, snapshot `dehydrate()`, preview `getHydratedState(...)`, hydrate `hydrate(...)` и persist save/restore loop.
- `ecs_example` не должен использовать `@ts-nocheck`, `as any`, ручной `EntityAccess`, private/internal entrypoints, raw storage runtime APIs или public routing по `actorId` к entity rows.
- Если финальная реализация API отличается от чернового примера, исправлять нужно пример или ТЗ только через публичный финальный контракт, а не через ослабление типов.

#### Не делать в этом этапе

- Не менять runtime implementation, public API, public types, docs snippets или benchmark thresholds ради прохождения примера.
- Не добавлять compatibility shim только для `ecs_example`.
- Не запускать docs build и команды, которые транзитивно запускают docs build.
- Не превращать пример в package docs вместо executable gate: пример должен оставаться проверяемым кодом.

#### Тесты этапа

- `pnpm exec tsc --noEmit -p ecs_example/tsconfig.json` проходит.
- Добавить или обновить focused smoke test, который импортирует `runEcsExample()` из `ecs_example/run-example.ts`, выполняет сценарий и проверяет минимум:
  - `SPAWN_ENEMY` создает entity row;
  - `TICK` проходит через обычный machine, instance actor и entity actor;
  - `meta.entityId` доставляет `DAMAGE_ENTITY` нужной entity row;
  - `groupTag` routing доставляет `BOOST_ENEMIES`;
  - `manager.entities.get("enemyActor").count` отражает live row;
  - `dehydrate()`, `getHydratedState(...)` и `hydrate(...)` сохраняют entity storage;
  - persist storage получает запись после save;
  - sprite adapter получает reaction/effect commands без ручной мутации UI.
- Focused smoke test запускается отдельной командой без docs build, например `pnpm exec vitest run tests/entities/ecs-example-final-gate.test.ts`.
- `pnpm exec eslint ecs_example` проходит.
- `git diff --check` проходит.

#### Критерий завершения

- `ecs_example` компилируется без `@ts-nocheck`, `as any` и private/internal imports.
- Runtime smoke test примера проходит и проверяет интеграцию spawn, entity routing, `TICK`, effects, reactions, snapshot/hydrate, `manager.entities` и persist.
- Lint и whitespace checks этапа проходят.
- Docs build не запускался.

## 6. Критерий полной готовности

ТЗ считается реализованным только когда выполнены все условия:

- Все этапы 1-15 завершены по своим gates.
- Plugin system реализована и прошла собственный gate до финальной приемки `@lite-fsm/entities`.
- Каждое runtime/type/snapshot/react/benchmark/error требование из этого документа реализовано и покрыто tests либо явно относится к разделу «Вне области работ».
- `ecs_example` компилируется и выполняется как финальный integration gate на публичном API `@lite-fsm/entities`.
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
