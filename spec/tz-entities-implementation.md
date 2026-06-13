# @lite-fsm/entities и entity actor runtime — реализационное ТЗ, часть 1

## 1. Цель

Реализовать пакет `@lite-fsm/entities` для массовых игровых сущностей через entity actor runtime, внутреннее columnar storage, типизированную spawn composition и scoped entity lifecycle. Основная модель разработки остается `createMachine`, `config`, `reducer`, `effects` и `MachineManager.transition`; entity runtime добавляет batch storage и composition поверх этой модели, не превращая core в ECS.

## 2. Как выполнять это ТЗ

Этот файл покрывает этапы 1-7. После gate этапа 7 работа продолжается в `spec/tz-entities-implementation-part-2.md`.

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
- Строгая типизация объекта `entities`, который инжектируется в entity effects/reactions, выводится из `AppDeps.entities?: EntityAccess<AppState>`.
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
- `manager.entities` и typed `EntityAccess<AppState>`.
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
      Input["spawnSchema"],
      ActorPublicState<Input["config"]>
    >
  >;
  resultMetadata: <Input extends EntityMachineInput<ContextSchema, SpawnSchema, Config>>(
    input: Input,
  ) => {
    entityContextSchema: Input["initialContext"];
    entitySpawnSchema: Input["spawnSchema"];
    entityState: ActorPublicState<Input["config"]>;
  };
};
```

```ts
declare const entityStateMetadata: unique symbol;

type EntityMachineStateMetadata<
  ContextSchema extends EntitySchema,
  SpawnSchema extends EntitySchema,
  State extends string = string,
> = {
  readonly entityContextSchema: ContextSchema;
  readonly entitySpawnSchema: SpawnSchema;
  readonly entityState: State;
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
| `reducerContext.payloadFor(entity)` | 5 |
| `despawnOn` | 8 |
| `effectDeps` | 9 |
| `reactions`, `reactionDeps` | 10 |

Контракт:

- Extension подключается к `TypedCreateMachineFn` только через plugin source: `typeof entityPlugin` или tuple `typeof plugins`.
- Передача `EntityMachineExtension` третьим параметром типа в `TypedCreateMachineFn` не поддерживается.
- `entitiesPlugin<AppDeps>()` принимает `AppDeps` только на уровне типов, чтобы `EntityEffectDeps`/`EntityReactionDeps` могли извлечь `EntityAccess<AppState>` из `AppDeps.entities`.
- `AppDeps` может ссылаться на `AppState = MachinesState<typeof machines>` по существующему self-reference pattern для `getState`.
- Для bootstrap с `defineEntitySpawn(machines, spawnEvents)` typed wrapper может использовать `entitiesPlugin<AppDeps>()` как источник типизации до создания `spawn`; runtime manager после этого может использовать `entitiesPlugin<AppDeps>({ spawn })`.
- Extension не меняет global `createMachine` typing.
- Extension не добавляет lifecycle events в public `AppEvents`.
- Extension сохраняет `initialContext`, `spawnSchema` и union public states из `config` как phantom metadata в result type каждого entity actor template.
- Extension добавляет entity-specific `effectDeps` и `reactionDeps` только для `storage: "entity"` templates.
- Extension задает lightweight `publicState`, поэтому `MachinesState<typeof machines>` не раскрывает column arrays.
- `EntityMachinePublicState<Metadata>` содержит закрытый `unique symbol` phantom field, который не создается runtime и переносит metadata для `EntityAccess<AppState>`.
- Extension metadata используется `MachineResultMetadata<typeof machine>`, `MachinesState<typeof machines>` и `EntityAccess<AppState>`.
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
type AppState = MachinesState<typeof machines>;

type AppDeps = {
  getState?: () => AppState;
  entities?: EntityAccess<AppState>;
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
- `AppDeps.entities?: EntityAccess<AppState>` является опциональным источником типов для строгой типизации `entities.get(...)` в entity effects/reactions.
- Entity effects и reactions получают объект `entities`, привязанный к текущему entity scope, через `EntityMachineExtension.effectDeps`/`reactionDeps`; runtime не читает `deps.entities` для entity scopes.
- Если `AppDeps.entities` не объявлен, инжектируемый объект `entities` runtime доступен, но `entities.get(...)`/`entities.maybe(...)` имеют `never` key union на уровне TypeScript.
- `EntityAccess<AppState>` выводит доступные keys из `MachinesState<typeof machines>` по закрытому phantom metadata и включает только `storage: "entity"` actor templates.
- Обычные domain/process machines читаются через `getState()`.
- Для `entities` не требуется ручной `AppActorRegistry` или codegen.
- Core plugin system не хардкодит key `entities`.

### `EntityAccess<AppState>`

```ts
type ReadonlyEntityColumn<T> = {
  readonly [entity: EntityIndex]: T;
};

type EntityMachineMetadataFor<
  AppState,
  K extends EntityActorKey<AppState>,
> = AppState[K] extends {
  readonly [entityStateMetadata]?: infer Metadata;
}
  ? Metadata
  : never;

type EntityContextFor<
  AppState,
  K extends EntityActorKey<AppState>,
> = EntityMachineMetadataFor<AppState, K> extends {
  readonly entityContextSchema: infer Context extends EntitySchema;
}
  ? EntityContextFromSchema<Context>
  : never;

type EntityStateFor<
  AppState,
  K extends EntityActorKey<AppState>,
> = EntityMachineMetadataFor<AppState, K> extends {
  readonly entityState: infer State extends string;
}
  ? State
  : never;

type EntityActorStoreViewFor<
  AppState,
  K extends EntityActorKey<AppState>,
> = {
  readonly count: number;
  readonly version: number;
  has(entity: EntityIndex): boolean;
  state(entity: EntityIndex): EntityStateFor<AppState, K> | undefined;
} & {
  readonly [Field in keyof EntityContextFor<AppState, K>]: ReadonlyEntityColumn<
    EntityContextFor<AppState, K>[Field]
  >;
};

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
- `entities.get(...)` и `entities.maybe(...)` возвращают один публичный тип store view; отличие между ними поведенческое и диагностическое.
- Store view кешируется per `actorKey`: повторный `entities.get("actorKey")` возвращает тот же live view object.
- Store view читает current committed columns и переживает hydrate replace.
- `actorKey` типизируется по entity actor keys из `AppState`.
- Unknown `actorKey` является TypeScript error.
- Return type выводится из `initialContext` actor template.
- `EntityAccess<AppState>` строит key union только из machines с `storage: "entity"`.
- `EntityStateFor<AppState, K>` выводится из `ActorPublicState<Input["config"]>` в phantom metadata и не деградирует до `string`.
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
- `react/index.ts` реализует React hooks на `useSyncExternalStore` и rowVersion cache.

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

### Этап 1 — Пакет `@lite-fsm/entities`, exports, plugin shell и `storage: "entity"` storage definition

#### Цель

Создать package shell `@lite-fsm/entities`, базовые package exports, `entitiesPlugin(...)` и storage definition `storage: "entity"` через финальный plugin DSL без реализации schema descriptors, actor rows, spawn recipes и lifecycle.

#### Зависит от

- Plugin system полностью реализована.
- В core доступны `MachineManager(..., { plugins })`, `definePlugin().create(...)`, `defineStorageRuntime().create(...)`, plugin storage section и duplicate/unknown storage diagnostics.

#### Меняется public API

Добавить:

- package `packages/entities`;
- workspace dependency entry `@lite-fsm/entities: workspace:*` в root `package.json` для tests/type tests/smoke imports;
- path alias `@lite-fsm/entities` в `tsconfig.paths.json`;
- export `"."`;
- export `"./package.json"`;
- `entitiesPlugin(...)`;
- `type EntityId`;
- `type EntityIndex`.

Export `"./react"` не добавляется до этапа React hooks.

#### Runtime-контракт этапа

- `entitiesPlugin(...)` устанавливается через `MachineManager(machines, { plugins: [entitiesPlugin(...)] })`.
- `entitiesPlugin(...)` возвращает marked plugin value из `definePlugin().create(...)`.
- Plugin definition содержит section `storage: [entityStorageRuntime]`.
- `entityStorageRuntime` создается через `defineStorageRuntime<EntityStorageRuntimeExtension>().create({ kind: "entity", ... })`.
- Storage runtime shell реализует минимальный public storage runtime contract, достаточный для manager init и clear diagnostics.
- `storage: "entity"` без `entitiesPlugin(...)` бросает unknown storage kind через plugin system.
- Повторная регистрация `storage: "entity"` бросает duplicate storage kind.
- `@lite-fsm/core` не импортирует `@lite-fsm/entities`.
- Package не добавляет entity-specific code в обычный app bundle без импорта `@lite-fsm/entities`.
- Runtime shell не создает rows, columns, spawn transactions, effects, reactions или snapshots.
- `storage: "instance"` сохраняет текущую semantics.

#### Типовой контракт этапа

- `entitiesPlugin(...)` типизируется как plugin value, созданный `definePlugin().create(...)`, с capabilities, которые реально работают на этом этапе.
- `EntityId` является `string`.
- `EntityIndex` является branded `number`.
- `entitiesPlugin(...)` пока не добавляет spawn transition events, manager extensions, action meta или machine extension types.

#### Диагностика и ошибки

- Unknown `storage: "entity"` без plugin должен быть clear init error.
- Duplicate storage kind `entity` должен быть clear init error.
- Invalid plugin options текущего этапа должны давать clear init error.
- Ошибка из storage runtime callbacks пробрасывается вызывающему `MachineManager(...)`.

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
- `entitiesPlugin(...)` registers `storage: "entity"` through plugin storage section;
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
- `tsconfig.paths.json` резолвит `@lite-fsm/entities` на source entry.
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

- `EntityMachineExtension` подключается к `TypedCreateMachineFn` только через plugin source `typeof entityPlugin` или tuple `typeof plugins`.
- Передача `EntityMachineExtension` третьим параметром типа в `TypedCreateMachineFn` является TypeScript error.
- Global `createMachine` typing не меняется.
- `storage: "entity"` actor template типизируется только при подключенной extension.
- `initialContext` сохраняется как phantom `entityContextSchema`.
- `spawnSchema` сохраняется как phantom `entitySpawnSchema`.
- `spawnSchema` выводится в `EntitySpawnPayload<typeof spawnSchema>`.
- `initialContext` выводится в `EntityColumns<typeof initialContext>` для будущего `self`/`entities` store views.
- `initialContext` выводится в serializable `SchemaValue<typeof initialContext>` для snapshot/read API.
- Numeric descriptors выводят typed array columns.
- `string()` выводит string array column.
- `optional(inner)` в `spawnSchema` дает required key с value type `T | null`; отсутствующий ключ и `undefined` невалидны.

#### Диагностика и ошибки

- Missing `initialState`, `initialContext` или `spawnSchema` бросает clear init error.
- `initialState` не `"__INIT"` бросает clear init error.
- Invalid descriptor object бросает clear init error.
- Unknown descriptor shape или schema object с custom prototype бросает clear init error.
- `optional(...)` в `initialContext` бросает clear init error.
- Default в `spawnSchema` бросает clear init error.
- Nested objects, arrays, `Map` и `Set` запрещены.
- Reserved column names запрещены.
- `groupTag` на actor template запрещен.

#### Совместимость

- `storage: "instance"` typing и runtime validation не меняются.
- Existing `TypedCreateMachineFn<AppEvents, AppDeps>` wrappers без третьего параметра типа сохраняют behavior.
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
- unknown descriptor shape или schema object с custom prototype бросает clear error;
- default в `spawnSchema` бросает clear error;
- reserved column name бросает clear error;
- `groupTag` на template бросает clear error;
- `storage: "instance"` custom `__INIT` behavior сохраняется.

Type tests:

- wrapper с plugin source от `entitiesPlugin<AppDeps>()` принимает `storage: "entity"`;
- передача `EntityMachineExtension` третьим параметром типа является TypeScript error;
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

Обновить:

- `EntityMachineExtension` получает dependent `publicState(input)`, который возвращает `EntityMachinePublicState<EntityMachineStateMetadata<Input["initialContext"], Input["spawnSchema"], ActorPublicState<Input["config"]>>>`.

#### Runtime-контракт этапа

- Entity runtime compile создает metadata для каждого `storage: "entity"` template.
- Public state slice для entity actor template имеет форму lightweight read model:

```ts
declare const entityStateMetadata: unique symbol;

type EntityMachineStateMetadata<
  ContextSchema extends EntitySchema,
  SpawnSchema extends EntitySchema,
  State extends string = string,
> = {
  readonly entityContextSchema: ContextSchema;
  readonly entitySpawnSchema: SpawnSchema;
  readonly entityState: State;
};

type EntityMachinePublicState<Metadata> = {
  storage: "entity";
  version: number;
  count: number;
  capacity: number;
  readonly [entityStateMetadata]?: Metadata;
};
```

- Каждый entity actor template имеет собственный public slice.
- Runtime `createPublicInitialState(...)` не создает поле `[entityStateMetadata]`; это закрытый type-only phantom carrier.
- `EntityMachinePublicState<Metadata>` не использует строковые служебные поля для entity marker.
- Phantom metadata переносит `initialContext`, `spawnSchema` и public state union actor template, выведенный из `ActorPublicState<Input["config"]>`.
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
- `manager.entities` возвращает root accessor, которым владеет entity runtime.
- Root accessor умеет создавать store views для known entity actor keys.
- Root accessor является stable live object на весь lifetime manager.
- Store views кешируются per template key и читают current committed runtime state.
- `entities.get(...)` и `entities.maybe(...)` возвращают read-only typed store views для внешнего чтения.
- `store.has(entity)` доступен и возвращает `false` для отсутствующих rows.
- `store.state(entity)` доступен и возвращает public state name actor row или `undefined`, если row отсутствует.
- `store.state(entity)` не возвращает `__INIT`; terminal states после cleanup недоступны.
- Store view exposes columns через indexed readonly column API и не делает raw typed arrays частью public contract.
- Runtime не использует Proxy-based protection.

#### Типовой контракт этапа

- `EntityAccess<AppState>` выводит доступные keys из `MachinesState<typeof machines>`.
- Key union включает только `storage: "entity"` actor templates.
- Unknown `actorKey` является TypeScript error.
- Return type `entities.get("actorKey")` выводится из `initialContext`.
- `MachinesState<typeof machines>` сохраняет enough metadata для `EntityAccess<AppState>` только через закрытый `unique symbol` phantom field.
- `MachinesState<typeof machines>` использует `EntityMachineExtension.publicState` для entity actor templates.
- `EntityAccess<AppState>` не требует ручного `AppActorRegistry` или codegen.

#### Диагностика и ошибки

- `entities.get("actorKey")` для unknown runtime key бросает clear error, если TypeScript был обойден.
- Required-access validation для scoped calls еще не активна, потому что scopes появятся в effects/reactions.
- Capacity/index consistency errors должны быть clear internal invariant errors.

#### Совместимость

- `manager.entities` доступен только если установлен `entitiesPlugin(...)`.
- Без `entitiesPlugin(...)` returned manager shape не содержит `manager.entities`.
- `manager.entities` не подмешивается в user deps автоматически; пользователь передает его через `setDependencies(...)` только если root access нужен domain/process effects.
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
- `store.state(entity)` возвращает `undefined` для missing row;
- returned manager не содержит `entities` без plugin;
- `storage: "instance"` state shape не меняется.

Type tests:

- `EntityAccess<AppState>` включает entity actor keys;
- `EntityAccess<AppState>` исключает domain/process machines и `storage: "instance"` actor templates;
- `entities.get("unknownActor")` является TypeScript error;
- `EntityMachinePublicState<Metadata>` сохраняет разные metadata для разных actor templates через закрытый `unique symbol`;
- store view columns выводятся из `initialContext`;
- `store.state(entity)` типизируется public state union actor template.

#### Gate завершения

- Runtime и type tests этапа проходят.
- Public API changes отражены в cheatsheets и package docs.
- Coverage нового и измененного кода этапа равен 100%.
- Docs build не запускался.

### Этап 4 — Entity lifecycle events, `__INIT` и запрет public lifecycle dispatch

#### Цель

Добавить внутренние lifecycle event types, `__INIT` validation и запрет public lifecycle dispatch без spawn primitive, `payloadFor(entity)`, public spawn events и entity spawn API.

#### Зависит от

- Этапы 1-3.
- Plugin system internal machine events typing реализован.

#### Меняется public API

Добавить:

- `type LiteFsmEntityLifecycleEvents`.

Обновить:

- `EntityMachineExtension` получает `internalEvents: LiteFsmEntityLifecycleEvents`.

#### Runtime-контракт этапа

- `ENTITY_SPAWNED` и `ENTITY_DESPAWNED` являются internal storage runtime events.
- Lifecycle events не входят в пользовательский `AppEvents`.
- Lifecycle events доступны только в `storage: "entity"` config/reducer type surface; reactions получают эти events на этапе reactions.
- Lifecycle events не проходят через public `transition`, middleware, plugin `intercept`, subscribers или public committed action result как отдельные committed actions.
- Public dispatch `ENTITY_SPAWNED` и `ENTITY_DESPAWNED` запрещен даже если пользователь добавил эти names в `AppEvents`.
- Entity actor template будет стартовать только через internal `ENTITY_SPAWNED`; в этом этапе runtime только резервирует lifecycle names и валидирует config.
- `__INIT` в entity template может содержать только `ENTITY_SPAWNED`.
- Custom events в `__INIT` entity template запрещены.
- Runtime не создает entity slots, actor rows, spawn payload buffers или despawn operations в этом этапе.

#### Типовой контракт этапа

- `LiteFsmEntityLifecycleEvents` не подмешивается в public `manager.transition(...)`.
- `EntityMachineExtension` добавляет lifecycle events в config/reducer type surface только для entity actor templates.
- Custom `__INIT` edge должен быть TypeScript error, если это возможно без ухудшения inference.
- `storage: "instance"` сохраняет текущую поддержку custom `__INIT` events.

#### Диагностика и ошибки

- Public dispatch lifecycle events бросает clear error.
- Lifecycle event names в `spawnEvents` и recipe keys будут запрещены на этапе entity spawn; на этом этапе names резервируются.
- Custom `__INIT` edge entity template бросает clear init error.

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

Комплексные tests создания rows, `ENTITY_SPAWNED` delivery и `payloadFor(entity)` через real spawn transaction выполняются на этапе 5, где появляется public spawn staging hook. Этап 4 не добавляет test-only public surface для запуска internal spawn primitive.

Type tests:

- lifecycle events доступны в entity config/reducer через `EntityMachineExtension`;
- lifecycle events не доступны в public `manager.transition(...)`;
- lifecycle events не добавляются в `AppEvents`.

#### Gate завершения

- Runtime и type tests этапа проходят.
- Cheatsheets и package docs отражают lifecycle type-only contract.
- Coverage нового и измененного кода этапа равен 100%.
- Docs build не запускался.

### Этап 5 — Spawn events, entity spawn и public spawn staging hook

#### Цель

Добавить public spawn events, typed recipes, atomic spawn transaction и transition typing поверх `entitiesPlugin(...)`.

#### Зависит от

- Этапы 1-4.
- Plugin system `hooks.beforeReduce(ctx)`, `intercept(ctx)` и plugin transition event typing реализованы.

#### Меняется public API

Добавить:

- `defineSpawnEvents`;
- `spawnEvent<T>()`;
- `type SpawnEventsFrom<TSpawnEvents>`;
- `defineEntitySpawn(machines, spawnEvents)`;
- reducer context entity actor template получает `payloadFor(entity)`;
- `entitiesPlugin({ spawn })` options;
- `manager.transition(...)` принимает `SpawnEventsFrom<typeof spawnEvents>` от текущего `entitiesPlugin(...)`.

#### Runtime-контракт этапа

- `spawnEvents` является источником истины для spawn event names, payload types, `manager.transition(...)` typing и spawn recipe keys.
- `defineEntitySpawn(machines, spawnEvents)` связывает spawn event contract с exhaustive recipes и возвращает единый `spawn` descriptor.
- `entitiesPlugin()` без `spawn` остается валидным и не регистрирует public spawn events.
- `entitiesPlugin({ spawn })` включает public spawn events.
- `entitiesPlugin(...)` не принимает отдельные `spawnEvents` или recipes; частичная spawn-конфигурация не входит в public API.
- `entitiesPlugin({ spawn })` объявляет `hooks.beforeReduce(ctx)` для public spawn events.
- Storage `prepareAction(ctx)` создает per-dispatch transaction slot до middleware.
- Spawn hook выполняется после middleware `next`, после storage `beforeReduce`, после всех plugin `intercept` replacements и до storage reduce.
- Если middleware не вызывает `next`, spawn recipes не запускаются и entity rows не создаются.
- Если финальный `intercept` выставил `skipDelivery: true`, spawn recipes не запускаются и entity rows не создаются.
- Spawn hook читает текущий `ctx.action`; replacement из `intercept` может превратить обычный event в spawn event или spawn event в обычный event до запуска recipe.
- Spawn hook валидирует recipe output и stage-ит spawn operations в `ctx.runtime`, но не мутирует live runtime state.
- Spawn hook не меняет `skipDelivery`, `stopInterceptors` или committed action.
- Public spawn event остается public event для middleware, reducers, subscribers и effects, если такие интеграции включены.
- Spawn recipes исполняются только для финального `ctx.action`, если его `type` совпадает с key из `spawnEvents`.
- Hydrate восстанавливает snapshot и не вызывает spawn recipes.
- Public spawn event не является способом заполнения columns из spawn payload.
- Internal spawn transaction primitive создает entity slot, actor rows, initial column defaults, state `__INIT` и actor-specific spawn payload.
- Runtime доставляет scoped internal `ENTITY_SPAWNED` созданным actor rows.
- Default `__INIT -> target` transition применяется до reducer.
- Reducer вызывается один раз на actor template batch.
- `payloadFor(entity)` всегда присутствует в reducer context.
- `payloadFor(entity)` принимает только `EntityIndex` из текущего `self.indices`.
- `payloadFor(entity)` возвращает actor-specific spawn payload только во время `ENTITY_SPAWNED`.
- `payloadFor(entity)` на любом другом event бросает clear error.
- `payloadFor(entity)` для entity, не входящей в current spawn scope, бросает clear error.
- `payloadFor(entity)` не доступен в reactions/effects и не требует хранения spawn payload после reducer phase.
- Internal `ENTITY_SPAWNED` и actor reducers инициализируют columns.
- Recipe может вернуть один `EntitySpawnSpec` или массив.
- Пустой массив specs разрешен и означает no-op spawn event; public spawn event все равно доставляется существующим machines/templates, которые принимают event.
- `EntitySpawnSpec.id` обязателен и должен быть непустой строкой.
- `EntitySpawnSpec.groupTag` обязателен и должен быть непустой строкой.
- `groupTag` является свободной непустой строкой и не выводится из recipe key.
- `generateActorId` и `generateGroupId` не применяются к `storage: "entity"`.
- `EntitySpawnSpec.actors` содержит хотя бы один actor row.
- Duplicate `EntitySpawnSpec.id` против live entity или внутри одного recipe result является ошибкой.
- Spawn transaction атомарна: если один spec невалиден, state не меняется, subscribers/reactions/effects не запускаются.
- Invalid recipe/spec прерывает весь dispatch до storage reduce и public spawn event delivery.
- Внутри entity storage delivery public spawn event выполняется после internal `ENTITY_SPAWNED` для newly spawned rows.
- Entity actor templates, которые явно включили `SpawnEvents` в `AppEvents`, видят уже созданные rows.
- `storage: "instance"` machines получают public spawn event в обычном storage order и не должны полагаться на reducer-time чтение только что созданных entity rows.
- Только что созданные entity rows получают public spawn event в том же dispatch, если current state после `ENTITY_SPAWNED` принимает этот event.

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
- Actor payload shape mismatch, включая лишние ключи, отсутствующие required keys и `undefined` для `optional(...)`, бросает clear runtime error до mutation.
- `payloadFor(entity)` outside `ENTITY_SPAWNED` бросает clear runtime error.
- `payloadFor(entity)` для entity вне current spawn scope бросает clear runtime error.
- Empty `actors` бросает clear runtime error.
- Missing или empty `id`/`groupTag` бросает clear runtime error.
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
- Не добавлять benchmarks acceptance как gate до этапа 13.

#### Тесты этапа

Runtime tests:

- public spawn event создает entity и actor rows;
- public spawn event доставляется после internal `ENTITY_SPAWNED`;
- `payloadFor(entity)` возвращает actor-specific spawn payload во время `ENTITY_SPAWNED`;
- `payloadFor(entity)` outside `ENTITY_SPAWNED` бросает clear error;
- `payloadFor(entity)` для entity вне current spawn scope бросает clear error;
- newly spawned rows receive public spawn event in same dispatch when config accepts it;
- empty recipe result is no-op spawn but public event delivery continues;
- duplicate id против live entity fails atomically;
- duplicate ids inside one recipe result fail atomically;
- invalid actor payload fails atomically;
- actor payload with extra key fails atomically;
- `optional(...)` actor payload key with missing key or `undefined` fails atomically;
- `optional(...)` actor payload key accepts `null`;
- invalid recipe/spec aborts before storage reduce;
- middleware that does not call `next` prevents spawn recipe execution;
- interceptor replacement to spawn event runs the matching recipe for final `ctx.action`;
- interceptor replacement from spawn event to non-spawn event prevents spawn recipe execution;
- interceptor `skipDelivery: true` prevents spawn recipe execution;
- spawn staging is based on final action after all interceptors regardless of `entitiesPlugin` position;
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
- `payloadFor(entity)` типизируется по actor `spawnSchema`;
- `payloadFor(entityId)` является TypeScript error;
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
- Plugin system `routeMeta` section, single active route meta contract и action meta typing реализованы.

#### Меняется public API

Добавить:

- `meta.entityId?: string | readonly string[]` через `entitiesPlugin` `routeMeta` extension.
- `EntityStorageRuntimeExtension.routeMeta: { entityId: string | readonly string[] }`.
- `entityStorageRuntime` получает `routeMetaKeys: ["entityId"]`.

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

- Event `type` переводится в `eventCode` один раз для финального `ctx.action` после `prepareAction`, middleware `next(action)`, storage `beforeReduce` и всех `intercept` replacements, до entity reduce.
- State names переводятся в `stateCode` при init manager.
- Transition lookup в dispatch выполняется по numeric `eventCode/stateCode`.
- Compiled template metadata содержит `eventAcceptMask`, `transitionTable`, `templatesByEventCode` и `acceptStateBucketsByEventCode`.
- `templatesByEventCode[eventCode]` содержит только templates, которые принимают event в `config`.
- `acceptStateBucketsByEventCode[eventCode]` содержит state buckets, которые принимают event.
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
- `groupTag` route одновременно сохраняет текущее поведение для `storage: "instance"` actor groups с тем же `groupTag`.
- Entity runtime не преобразует `meta.groupTag` в `meta.entityId` и не ограничивает `groupTag` delivery только entity rows.
- Storage definition объявляет `routeMetaKeys: ["entityId"]`; `definePlugin().create(...)` не принимает `entitiesPlugin(...)`, если section `routeMeta.entityId` отсутствует или raw value type несовместим с `EntityStorageRuntimeExtension.routeMeta["entityId"]`.
- `routeMeta.entityId` resolver валидирует raw value, если TypeScript был обойден, и возвращает `string | readonly string[]` для core routing runtime.
- Routing следует финальному plugin system contract: один action может содержать только один active routing key.
- Active routing key может быть только один из `actorId`, registered plugin route keys, `groupId`, `groupTag`.
- Если action содержит несколько active routing keys, например `meta.entityId` и `meta.groupTag`, runtime бросает `LITE_FSM_AMBIGUOUS_ROUTE_META` до delivery.
- Для fanout по нескольким routing constraints пользователь отправляет несколько transitions или unscoped domain event.
- `actorId` и `groupId` routes адресуют только `storage: "instance"` actor runtime в MVP.
- Public `actorId` routing к entity actor rows не поддерживается.
- Unknown `entityId` и unknown `groupTag` не создают actor rows.
- Hydrate sidecar rebuild будет добавлен на этапе 11; routing indexes текущего этапа поддерживают live runtime.

Hot path requirements:

- Per-row actor objects запрещены.
- Per-row reducer/effect/reaction calls запрещены.
- `Map.get` в per-row loops запрещен.
- String comparisons в per-row loops запрещены.
- Per-row allocations на steady-state `TICK` запрещены.
- Allocation guard измеряет отсутствие per-row allocation growth, а не абсолютный ноль heap allocations на весь `manager.transition(...)`.
- Полный dispatch допускает ограниченный per-action overhead core/kernel pipeline.
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

- `meta.entityId` типизируется через plugin `routeMeta` section, `PluginRouteMeta` и storage `routeMetaKeys` binding.
- Core meta keys `actorId`, `groupId`, `groupTag` и sender fields остаются доступны.
- `self.stateCode[entity]` принимает только state code текущего template на уровне runtime; TypeScript помогает через `self.states`.
- Entity actor runtime не имеет public `actorId`.
- Entity actor runtime не имеет `bag`.

#### Диагностика и ошибки

- Invalid `stateCode` после reducer бросает clear dev error.
- Unknown `entityId` не является ошибкой и не создает rows.
- Unknown `groupTag` не является ошибкой и не создает rows.
- Invalid raw `meta.entityId` value бросает clear route resolver error, если TypeScript был обойден.
- Public `actorId` route к entity actor rows не поддерживается и не должен находить entity rows.
- Runtime diagnostics выполняются на scope/view boundary, а не на каждом column access.

#### Совместимость

- `storage: "instance"` сохраняет текущую reducer-authoritative semantics.
- Existing actorId/groupId/groupTag behavior для `storage: "instance"` сохраняется.
- Middleware rewrite не теряет `meta.entityId`.
- Core single-route meta contract остается единой политикой для всех storage runtimes.

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
- invalid raw `meta.entityId` value throws clear route resolver error;
- `meta.groupTag` доставляет action rows matching entity groups;
- action with both `meta.entityId` and `meta.groupTag` throws ambiguous route error;
- `actorId` не адресует entity rows;
- unknown `entityId` no-op;
- unknown `groupTag` no-op;
- middleware rewrite сохраняет `meta.entityId`.

Performance tests:

- hot `TICK` не аллоцирует per frame в production check;
- hot `TICK` не использует per-row objects, string comparisons и `Map.get` в instrumented check.

Type tests:

- `meta.entityId` доступен только при установленном `entitiesPlugin(...)`;
- `routeMetaKeys: ["entityId"]` требует plugin `routeMeta.entityId` resolver на уровне `definePlugin().create(...)`;
- `actorId`, `groupId`, `groupTag` остаются доступны;
- entity reducer `self` получает schema columns и state helpers.

#### Gate завершения

- Runtime, type и performance guard tests этапа проходят.
- Existing routing tests проходят.
- Coverage нового и измененного кода этапа равен 100%.
- Docs build не запускался.

### Этап 7 — Рефакторинг, чистка и полировка части 1

#### Цель

Закрыть cleanup/audit gate после реализации package shell, schema, lightweight state, lifecycle, spawn, routing и hot path contracts, не добавляя новое поведение.

#### Зависит от

- Этапы 1-6.

#### Контракт этапа

Must fix:

- убрать временные helpers, compatibility shims, debug logging, TODO/FIXME, `test.only`, временные `test.skip` и `throw new Error("not implemented")` в scope этапов 1-6;
- удалить неиспользуемые imports, locals, types, test scaffolds и feature flags, которые были нужны только во время реализации этапов 1-6;
- убрать дублирование validation, schema normalization, spawn recipe validation, route normalization, bucket updates и lifecycle staging, если уже есть один явный владелец поведения;
- проверить, что `@lite-fsm/core` не импортирует `@lite-fsm/entities`, а entity runtime не требует legacy plugin API;
- проверить, что public API и public types этапов 1-6 отражены в `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`, README и package docs;
- привести comments/docs к финальному контракту `definePlugin().create(...)`, `defineStorageRuntime().create(...)`, `hooks.beforeReduce`, `routeMeta`, `effectDeps`, `reactionDeps` и `publicState`.

Inspect only:

- декоративные переименования без снижения сложности;
- перенос кода между runtime modules без устранения duplicate owner;
- micro-optimizations без связи с hot path guarantees этапа 6;
- новые abstractions, если они не используются минимум в двух местах и не уменьшают сложность.

Expected remaining hits:

- `scopedDeps` и `scopedTransition` допустимы только как явный запрет для entity effects/reactions или в historical plugin specs;
- `intercept` допустим для описания core plugin phase и lifecycle запретов, но public spawn staging должен ссылаться на `hooks.beforeReduce`;
- `capability` допустимо в historical plugin specs и generic core docs, но active entity-ТЗ должны описывать storage blocks как `effects`, `snapshot`, `identity` и `reactions`;
- строки source audit в этом ТЗ и журнале допустимы как self-reference hits.

#### Не делать в этом этапе

- Не менять public behavior, public API или public types.
- Не добавлять `despawnOn`, entity effects, reactions, snapshot/hydrate, React hooks или benchmarks.
- Не запускать docs build и команды, которые транзитивно запускают docs build.

#### Тесты этапа

- focused regressions для spawn, routing, lifecycle и public state contracts этапов 1-6;
- type tests для `EntityMachineExtension`, `SpawnEventsFrom`, `defineEntitySpawn`, `manager.entities`, `EntityAccess<AppState>` и `meta.entityId`;
- performance guard tests этапа 6 после cleanup;
- lint для затронутого scope;
- `git diff --check`;
- source audit: `rg "ctx\\.storage|storage\\.register|PluginInstallContext|PluginCapabilities|StorageRuntimeBase|public spawn intercept|spawn .*intercept|generic action interceptors" packages/entities tests spec`.

#### Критерий завершения

- Cleanup не изменил runtime behavior, public API, error semantics, routing order, transaction atomicity или hot path guarantees этапов 1-6.
- Все проверки этапа проходят.
- Source audit не содержит active-scope hits, кроме явно перечисленных `Expected remaining hits`.
- Coverage нового и измененного кода этапов 1-6 остается 100%.
- Docs build не запускался.

## 6. Критерий готовности части 1

Часть 1 считается готовой только когда выполнены все условия:

- Этапы 1-7 завершены по своим gates.
- Plugin system реализована и прошла собственный gate до начала реализации `@lite-fsm/entities`.
- Package shell, schema descriptors, `EntityMachineExtension`, empty runtime state, `manager.entities`, lifecycle events, spawn recipes, routing, buckets и hot path guard contracts реализованы и покрыты tests.
- Все runtime tests, type tests и performance guard tests этапов 1-7 проходят.
- Existing core behavior tests затронутого scope проходят без изменения пользовательских сценариев.
- `pnpm run check-types` и lint проходят для затронутого scope, если они требуются gate текущего этапа.
- Сборка документации не запускалась агентом.
- Coverage по новому и измененному коду этапов 1-7 равен 100% по statements, branches, functions и lines.
- Формальное coverage не засчитывается, если не покрыты позитивные, негативные, граничные и error-path сценарии этапов 1-6.
- Нет `test.only`, временных `test.skip`, незакрытых TODO/FIXME для scope части 1, `throw new Error("not implemented")`, debug logging или temporary feature flags.
- Нет мертвого кода в scope части 1.
- Public API этапов 1-6 отражен в `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`, README и package docs.
- После выполнения этого критерия можно переходить к этапу 8 в `spec/tz-entities-implementation-part-2.md`.
