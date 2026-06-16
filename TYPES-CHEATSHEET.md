# lite-fsm — Types Cheat Sheet

Сжатый справочник по типовому API. Runtime — в [`API-CHEATSHEET.md`](API-CHEATSHEET.md).

## Точки входа

| Импорт                       | Типы                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@lite-fsm/core`             | весь `types.ts` + `interfaces.ts`: core (`FSMEvent`, `MachineConfig`, `CFG`, `MachineReducer`, `MachineEffect`), manager/snapshot/actor типы, `IMachineManager`, `Middleware`; plugin/storage helper-типы (`definePlugin`, `LiteFsmPlugin`, `ManagerExtension*`, `Storage*`). Контракты — в разделах ниже                                                                                  |
| `@lite-fsm/entities`         | alpha: типы `EntityId`, `EntityIndex`, `EntitiesPlugin`, `EntityAccess`, `EntityMachineExtension`, `EntityReducerContext`, `EntityReducerSelf`, `LiteFsmEntityLifecycleEvents`, `SpawnEventsFrom`; runtime `entitiesPlugin()`, `defineSpawnEvents`, `defineEntitySpawn`, `spawnEvent` и schema helpers (`f32`, `i16`, `i32`, `u8`, `string`, `optional`, `resource`)                                                                                                                |
| `@lite-fsm/entities/react`   | alpha: `EntityRowSnapshot`, `EntityListOptions`, `TypedUseEntitySnapshotHook`, `TypedUseEntityCountHook`, `TypedUseEntityListHook`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `@lite-fsm/react`            | `FSMContextType`, `FSMContextProviderProps`, `FSMPersistLifecycle`, `FSMHydrationBoundaryProps`, `FSMStorageHydrationPreview`, typed hook aliases                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `@lite-fsm/persist`          | `MaybePromise`, `PersistedRecord`, `PersistStorage`, `PersistStatus`, `PersistRestoreSettledResult`, `PersistManagerOptions`, `PersistController`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `@lite-fsm/persist/react`    | runtime hooks only: `usePersistStatuses`, `useIsPersistRestoring`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `@lite-fsm/middleware`       | только runtime middleware                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `@lite-fsm/graph`            | alpha graph compiler/analyzer IR-типы                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `@lite-fsm/graph/simulator`  | alpha simulator-типы: snapshots, slices, timeline, choices, available transitions, suggested emissions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `@lite-fsm/graph/view-model` | alpha visualizer projection-типы: summaries, topics, workbench rows, anchors, row mappings, overlay inputs, Machine Flow Model                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `@lite-fsm/cli`              | public TS entrypoint не публикуется; типовые contracts CLI — JSON export document `lite-fsm.project-graph-export/v1` и local visualize HTTP API                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

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

| Тип                                               | Форма                                                                                                           |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `FSMEventMeta` · `CoreActionMeta`                 | `{ actorId?, groupId?, groupTag?, senderActorId?, senderGroupId?, senderGroupTag? }`                            |
| `ManagerAction<P, Meta = CoreActionMeta>`         | `P & { meta?: Meta }`                                                                                           |
| `ReadonlyManagerAction<P, Meta = CoreActionMeta>` | action для callbacks наблюдения; свойства, `meta`, arrays/tuples и вложенные объекты доступны только для чтения |
| `ManagerCommitAction<S, P>`                       | user action или `HydrateAction<S>`                                                                              |

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

- **Default `Snapshot`:** domain → `StateType<C, T>`, actor hook payload → `DefaultActorSnapshot<C, T>`.
- **Custom domain hooks** переопределяют `Snapshot`: `SnapshotForMachine<M>`, `MachineManagerSnapshot<S>`, `dehydrate()`/`hydrate()` используют transport payload из `dehydrate`/`hydrate` (включая машины из `TypedCreateMachineFn<P, D, typeof plugins>`).
- **Storage runtime payloads** не меняют `SnapshotForMachine<M>`: передаются отдельно через `MachineManagerSnapshot<S>["storage"]`.
- **`storage`:** отсутствие эквивалентно `"instance"` в public `MachineManager`. Custom kinds доступны только через `TypedCreateMachineFn<P, D, typeof plugins>` и должны быть зарегистрированы тем же plugin tuple в `MachineManager(..., { plugins })`; `Machine(...)` и `defineMachine().create(...)` поддерживают только отсутствие `storage` и `"instance"`.

## Plugin-aware `TypedCreateMachineFn`

`TypedCreateMachineFn<P, D, Plugins>` принимает plugin source третьим generic: один `LiteFsmPlugin`, union, readonly tuple или широкий `readonly LiteFsmPlugin[]`. Без третьего generic wrapper остаётся core-only и не принимает custom storage kinds.

Plugin source не расширяет `P` и `D` автоматически — manager-level события и scoped deps добавляются явно:

```ts
const plugins = [cachePlugin] as const;

type MachineEvents = AppEvents | PluginManagerEvents<typeof plugins>;
type MachineDeps = EffectDeps<AppDeps, typeof plugins>;

export const createAppMachine: TypedCreateMachineFn<MachineEvents, MachineDeps, typeof plugins> = createMachine;
```

- Wrapper выбирает storage-specific input по `cfg.storage`; `"instance"` — core kind и не требует plugin storage.
- `MachineEvents<S>` выводит только public `P`. Storage `internalEvents` разрешены в `config`/reducer/effects машины, но не становятся допустимыми в public `manager.transition(...)`.
- Прямой `createMachine<AppEvents>(...)` остаётся core-only API.

### Storage extension contract

Storage author описывает type-level machine contract через `defineStorageRuntime<Extension>().create(...)`. `Extension` не содержит поле `storage` — builder добавляет kind из literal `kind`.

- **Machine-facing** поля (`input`, `internalEvents`, `reducerContext`, `effectDeps`, `reactionDeps`, `resultMetadata`, `publicState`) участвуют в `TypedCreateMachineFn<P, D, typeof plugins>`.
- **Runtime-only** поля типизируют callbacks storage runtime.

`resultMetadata`, `reducerContext`, `effectDeps`, `reactionDeps`, `publicState` бывают fixed object types или dependent function signatures от concrete storage input. Для типов, которым нужен весь input, — `StorageDependentField<Lambda>` (применяется только на type level):

```ts
type EntityStorageExtension = {
  input: {
    storage: "entity";
    initialState: "__INIT";
    initialContext: AnyRecord;
    spawnSchema: AnyRecord;
    despawnOn?: string | readonly string[];
  };
  resultMetadata: <Input extends EntityStorageExtension["input"]>(
    input: Input,
  ) => {
    entityContextSchema: Input["initialContext"];
    entitySpawnSchema: Input["spawnSchema"];
  };
};
```

`input` и `internalEvents` остаются fixed fields (`input` даёт contextual typing storage-specific полей). Dependent field signatures в runtime не создаются и не вызываются.

`StorageDependentField<Lambda>` и `StorageDependentTypeLambda` — для advanced extensions, где result type зависит от всего concrete input, а не от shallow замены по именам полей: `Lambda["type"]` вычисляется через `this["input"]`, runtime value не создаётся.

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

- `transition` в domain effects принимает `ManagerAction<P>` — новое событие может нести routing `meta`.
- При `D = EffectDeps<AppDeps, Plugins>` фактический `transition` — callable core `transition(action)` с пересечением plugin-scoped methods.
- `action` и `condition` типизированы исходным `P` и сохраняют сужение по state.
- Plugin-scoped deps доступны только в effect/reaction deps: не входят в `MachineDependencies<S>` и не передаются через `manager.setDependencies(...)`.

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

| Тип                         | Что выводит                                                     |
| --------------------------- | --------------------------------------------------------------- |
| `MachineStore`              | `Record<string, AnyMachineConfig>`                              |
| `MachineSliceState<M>`      | фрагмент состояния доменной машины или набор записей акторов    |
| `MachinesState<S>`          | состояние менеджера по карте машин                              |
| `MachineEvents<S>`          | union событий всех машин                                        |
| `MachineDependencies<S>`    | intersection custom deps всех effects                           |
| `MachineRuntimeMetadata<M>` | type-only metadata машины, созданной через plugin-aware wrapper |
| `MachineResultMetadata<M>`  | `resultMetadata` из storage extension, иначе `{}`               |

`MachineEvents<{}>` → `never`. `MachineDependencies<{}>` → `{}`. Если extension задаёт `publicState`, `MachinesState<S>` использует этот тип вместо core `{ state, context }` / actor record shape.

## Plugins

Plugin — это marked value из `definePlugin<PluginEvents, HostEvents>().create({ name, ...sections })`. Два generic задают типизацию событий, секции объявляют, что plugin добавляет в менеджер. `MachineManager(..., { plugins })` принимает только такие values, собранные в кортеж (`[cachePlugin] as const`); structural objects plugin'ами не являются, публичного callback `install` нет. Runtime-контракт секций и фаз dispatch описан в [`API-CHEATSHEET.md`](API-CHEATSHEET.md); здесь — только типы.

### Модель

```ts
const cachePlugin = definePlugin<CacheEvents, AppEvents>().create({
  name: "cache",
  routeMeta: { cacheKey: (value: string) => value },     // routing key → action.meta.cacheKey
  manager: { cache: (ctx) => ({ clear() {} }) },         // поле менеджера: manager.cache
  scopedDeps: { trace: (scope) => createTracer(scope) }, // dep эффекта/реакции: deps.trace
  scopedTransition: { refresh: (scope) => () => {} },    // метод: deps.transition.refresh
  intercept: (ctx) => { /* наблюдение / замена committed action */ },
  hooks: { afterEffects: (ctx) => {} },                  // callback фазы dispatch
  storage: [cacheStorage],                               // storage runtime kind
});
```

| Generic / секция   | Роль и тип                                                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `PluginEvents`     | события, которые plugin добавляет в `manager.transition` и эмитит через `scope.transition`                                     |
| `HostEvents`       | события host manager для contextual typing callbacks; в `PluginManagerEvents<Plugins>` и manager-level composition не входят   |
| `routeMeta`        | resolver'ы routing keys: `(value, ctx) => string \| readonly string[]`                                                        |
| `manager`          | factory полей returned manager: `ManagerExtensionFactory<PluginEvents>`                                                        |
| `scopedDeps`       | deps, видимые в effect/reaction invocation: `(scope) => value`                                                                 |
| `scopedTransition` | методы, добавляемые к `deps.transition`: `(scope) => method`                                                                   |
| `intercept`        | callback dispatch: `(ctx) => void \| { action?, skipDelivery?, stopInterceptors? }`                                           |
| `hooks`            | callbacks фаз `beforeReduce`, `afterReduce`, `beforeCommit`, `beforeSubscribers`, `beforeEffects`, `afterEffects`              |
| `storage`          | кортеж storage runtime definitions из `defineStorageRuntime().create(...)`                                                     |

**Плоский namespace.** Ключ секции напрямую становится публичным именем: `routeMeta.cacheKey` → `action.meta.cacheKey`, `manager.cache` → `manager.cache`, `scopedDeps.trace` → `deps.trace`, `scopedTransition.refresh` → `deps.transition.refresh`, storage `kind` → имя storage. Core не добавляет prefix; уникальность ключей обеспечивают plugin author и integrator. Runtime diagnostics конфликта указывают section, key и обоих владельцев.

**Типизация событий.**

- `PluginEvents` расширяют manager-level `transition` для текущего кортежа, но не события машин — включайте их явно: `type AppEvents = HostEvents | PluginManagerEvents<typeof plugins>`.
- `HostEvents` нужны только для contextual typing callbacks внутри plugin definition.
- Без второго generic поля action в callbacks (`ctx.action`, `ctx.originalAction`, resolver `ctx.action`, `scope.event`) типизируются как `ReadonlyManagerAction<AnyEvent>`, а `scope.transition(...)` ограничен `PluginEvents`.

### Helper types

| Тип                                                                              | Контракт                                                                                                                                                 |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PluginManagerEvents<Plugins>`                                                   | union событий из `PluginEvents`; `HostEvents` не входят в manager-level composition                                                                      |
| `PluginRouteMeta<Plugins>`                                                       | raw map route meta values; в `manager.transition(...).meta` поля текущего tuple становятся optional, но runtime принимает только один active routing key |
| `PluginScopedDeps<Plugins>`                                                      | поля из `scopedDeps` по ключам section и return types builder-ов                                                                                         |
| `PluginScopedTransition<Plugins>`                                                | методы из `scopedTransition` по ключам section и return types builder-ов                                                                                 |
| `PluginManagerExtensions<Plugins, S = MachineStore, Events = AnyEvent>`          | поля returned manager по ключам `manager`; generic manager factories и type-only extension contracts инстанцируются текущим store и событиями manager    |
| `EffectDeps<AppDeps, Plugins>`                                                   | `AppDeps` плюс `PluginScopedDeps<Plugins>` и `transition: PluginScopedTransition<Plugins>`                                                               |
| `LiteFsmPlugin<Name, PluginEvents, Definition>`                                  | opaque тип value, возвращаемого `definePlugin().create(...)`; используйте для exported constants и factory return types                                  |
| `LiteFsmStorageRuntimeDefinition<Kind, MachineExtension, RouteMetaRequirements>` | opaque тип value, возвращаемого `defineStorageRuntime().create(...)`; третий generic хранит type-level требования storage к `routeMeta`                  |
| `ManagerExtensionFactory<Events, Value, S>`                                      | функция manager section; получает `ManagerRuntimeContext<Events, S>` и возвращает public extension value                                                 |
| `ManagerExtensionType<Lambda>`                                                   | type-only marker для manager extension, чей public type вычисляется из host manager context                                                              |
| `ManagerExtensionTypeLambda`                                                     | базовый контракт lambda с полем `type`; dependent type получает context через `this["context"]`                                                          |
| `StorageRuntimeExtension`                                                        | public shape storage extension: machine-facing и runtime-only поля                                                                                       |
| `StorageTemplate<TemplateData>`                                                  | `{ key; kind; data? }` для compiled storage templates                                                                                                    |
| `StorageManagerContext<Events>`                                                  | публичное подмножество manager в storage callbacks: `getState`, `transition`, `onTransition`, `getDependencies`                                          |
| `Storage*Context`                                                                | public generic context types storage callbacks для exported storage helper/factory signatures                                                            |

**Семантика helpers:**

- Принимают plugin union и runtime tuple (tuple нормализуется через `[number]`).
- `PluginRouteMeta<PluginUnion>` возвращает raw value map: annotated resolver `(value: string, ctx) => ...` → `string`, unannotated `value` → `unknown`.
- Optional semantics относятся к `manager.transition(...).meta`: ключи optional и доступны только для подключенного tuple. Типы допускают несколько optional route fields в одном object, но runtime запрещает несколько active routing keys в одном dispatch.
- `ctx.key` в resolver — literal ключ resolver; `ctx.action` — `ReadonlyManagerAction<HostEvents | PluginEvents>` при `HostEvents`, иначе `ReadonlyManagerAction<AnyEvent>`.

### Manager extensions

`PluginManagerExtensions<Plugins, S = MachineStore, Events = AnyEvent>` возвращает поля manager по return type factory из section `manager`. Generics: plugin value/union/tuple; `S` — store текущего `MachineManager`; `Events` — события runtime manager для dependent type contracts.

- Factory может объявить `<S extends MachineStore>(ctx: ManagerRuntimeContext<AnyEvent, S>)` и вернуть тип, зависящий от `MachinesState<S>`.
- Если TS не может применить store к generic factory при извлечении return type, поле definition объявляется как `ManagerExtensionFactory & ManagerExtensionType<Lambda>`, где `Lambda extends ManagerExtensionTypeLambda` вычисляет `type` из `this["context"]`. Marker не меняет runtime DSL.
- Factory получает `ManagerRuntimeContext<PluginEvents, S>`: `ctx.config: S`, `ctx.getState(): MachinesState<S>`, `ctx.transition(...)` принимает/возвращает `ManagerAction<PluginEvents>`. `HostEvents` в runtime factory contract не входят; `create({ manager })` без первого generic не получает fallback на `AnyEvent`.

### Callbacks: intercept и hooks

- `action`/`originalAction` — `ReadonlyManagerAction<HostEvents | PluginEvents>` при `HostEvents`, иначе `ReadonlyManagerAction<AnyEvent>`.
- `intercept` возвращает replacement `ManagerAction`, `skipDelivery` или `stopInterceptors`; `{}` — no-op. Runtime принимает только `void` или plain object с известными полями, иначе `LITE_FSM_INVALID_PLUGIN_CALLBACK_RESULT`.
- Hooks не имеют API для replacement/skip/stop; их return value игнорируется. `manager.transition(...)` внутри hook → `LITE_FSM_REENTRANT_TRANSITION_FORBIDDEN`.
- `DispatchContext`, `ManagerRuntimeContext`, `PluginScopedInvocationContext` экспортируются для inferred types exported factories; обычно callbacks пишут inline.

**Guarded phases** для nested `transition(...)`: `plugin.intercept`, `storage.prepareAction`, `storage.beforeReduce`, `storage.acceptsEvent`, `storage.reduce`, `storage.reduceBucket`, `storage.commit`, `storage.reactions`, `hook.*`. Guard error пробрасывается из текущего `manager.transition(...)`, не вызывает `onError` и не стартует вложенный dispatch. Safe boundary для reentrant dispatch — subscriber и effect callbacks (explicit scheduler API нет); для текущего action используйте return protocol callback и `ctx.dispatch.runtime`.

### Storage runtime

`defineStorageRuntime<Extension>().create(...)` связывает runtime contract и type-level machine typing (контракт `Extension` — в разделе Plugin-aware `TypedCreateMachineFn`). Machine-facing поля доступны машинам только через `TypedCreateMachineFn<P, D, typeof plugins>`; runtime-only поля (`runtimeState`, `templateData`, `snapshotData`, `invocation`, `identity`, `observedEvents`, `routeMeta`) типизируют callbacks и не входят в machine result metadata.

**Контексты callbacks:**

- `ctx.template.data`/`ctx.templates` → `Extension["templateData"]`, `ctx.state` → `["runtimeState"]`, `ctx.invocation` → `["invocation"]`, hydrate `ctx.snapshot` → `["snapshotData"]`.
- При заданном `Extension["observedEvents"]` action-callbacks (`prepareAction`, `beforeReduce`, `acceptsEvent`, `reduce`, `reduceBucket`, `commit`, `effects.resolveInvocations`, `effects.invoke`, `identity.resolve`, `reactions.run`) получают `ctx.action`/`ctx.originalAction` как `ReadonlyManagerAction<Extension["observedEvents"]>`, иначе `ReadonlyManagerAction<AnyEvent>`.
- `ctx.manager: StorageManagerContext<Extension["observedEvents"]>` не раскрывает `routing`, `createScopedDeps`, `config`, `options`, `schemaVersion`, registry/kernel.
- `StorageDispatchContext` не экспортируется из root, но `ctx.dispatch` доступен через public contexts (`StorageReduceContext<Ext>["dispatch"]`): `options`/`route`/`prevState`/`skipDelivery` — readonly, `runtime` — mutable `Map`, `nextState` — root accumulator; action-stage fields отсутствуют.

**Return-протоколы callbacks:**

- `compileTemplate(ctx)` → `void | { data?: TemplateData }`; `key`, `kind` и unknown fields отклоняются.
- `prepareAction`/`beforeReduce` → `void | { type: "replace"; action } | { type: "drop" }`. Replacement валидируется до route recalculation: object с `type: string`; `@@lite-fsm/*` запрещён (`LITE_FSM_INVALID_REPLACEMENT_ACTION`).
- `reduce`/`reduceBucket` → `void | { type: "skip" }` (`drop`/`replace` на reduce stage не public). `acceptsEvent` → boolean. Прочее → `LITE_FSM_INVALID_STORAGE_CALLBACK_RESULT`. Diagnostics указывают owner (`plugin '<name>' intercept`, `storage runtime '<kind>' <phase>`).
- `reduceScope` default `"template"` (объявляются `acceptsEvent` и `reduce`); при `"bucket"` — `reduceBucket` + `ctx.templates`, без `acceptsEvent`/`reduce`. В template scope `reduceBucket` запрещён.

**routeMeta и регистрация:**

- При заданном `Extension["routeMeta"]` `routeMetaKeys: readonly (keyof Extension["routeMeta"] & string)[]`, иначе список строковых ключей.
- `definePlugin().create(...)` проверяет, что plugin объявляет resolver для каждого требуемого ключа и тип первого параметра assignable к `Extension["routeMeta"][key]`; unannotated `value` → `unknown` (совместим только с `unknown`).
- Core валидирует protocol resolver result, raw value — сам resolver. Resolver вызывается только когда его key — единственный active routing key. Регистрация — только через `definePlugin().create({ storage: [...] })` + `MachineManager(..., { plugins })`.

**Snapshot hooks:**

- `snapshot.dehydrate(ctx)` → `{ machines?, snapshot? }`; `snapshot: Extension["snapshotData"]` хранится в `MachineManagerSnapshot["storage"][kind]`.
- `snapshot.hydrate(ctx)` получает `ctx.machines: Readonly<Record<string, unknown>>` и `ctx.snapshot: Extension["snapshotData"] | undefined`.

### Diagnostics и factory plugins

- Новые public коды в `LiteFsmError["code"]`: `LITE_FSM_REENTRANT_TRANSITION_FORBIDDEN`, `LITE_FSM_AMBIGUOUS_ROUTE_META`, `LITE_FSM_INVALID_PLUGIN_CALLBACK_RESULT`, `LITE_FSM_INVALID_STORAGE_CALLBACK_RESULT`, `LITE_FSM_INVALID_REPLACEMENT_ACTION`.
- Configurable и multi-instance plugins — обычные factory functions вокруг `definePlugin().create(...)`; helper types принимают `ReturnType<typeof createCachePlugin>` как concrete plugin value.

## Entities (alpha)

`@lite-fsm/entities` — alpha-плагин и storage runtime kind `"entity"`: колоночное (SoA) хранилище строк поверх машины-шаблона с template-level runtime resources для cache и рабочих структур. Машина типизируется только через plugin-aware `TypedCreateMachineFn<P, D, EntitiesPlugin<D>>`; прямой core `createMachine` про kind `"entity"` не знает.

```ts
type AppEvent = { readonly type: "TICK" };
type Deps = { readonly entities: () => EntityAccess<AppMachines> };

const createMachine: TypedCreateMachineFn<AppEvent, Deps, EntitiesPlugin<Deps>> = createLiteFsmMachine;

const movement = createMachine({
  storage: "entity",
  initialState: "__INIT",
  initialContext: { x: f32({ default: 0 }) },
  spawnSchema: { x: f32() },
  config: { __INIT: { ENTITY_SPAWNED: "active" }, active: { TICK: "active" } },
  reducer(_state, action, { self, entities, payloadFor }) {
    const view = entities().get("movement");
    /* batch по self.indices */
  },
});
```

| Тип                                                          | Форма / назначение                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EntityId`                                                   | `string`; стабильный строковый id сущности                                                                                                                                                                                                                                                                                                                  |
| `EntityIndex`                                               | branded `number`; индекс строки в колонках (`self.x[entity]`, `view.x[entity]`). Resources принадлежат шаблону и не индексируются по `EntityIndex`. Для public view значение колонки имеет смысл только при `view.has(entity) === true`                                                                                                                         |
| `EntitiesPlugin<AppDeps = unknown, PluginEvents = never>`    | opaque `LiteFsmPlugin` value плагина. Третий generic `TypedCreateMachineFn<P, D, EntitiesPlugin<D>>` включает storage typing kind `"entity"`. `entitiesPlugin({ spawn })` выводит `PluginEvents` = public spawn events (`SpawnEventsFrom<...>`); `entitiesPlugin()` без спавна оставляет `never`                                                              |
| `EntityMachineExtension<Ctx, Spawn, Config, AppDeps>`        | storage extension contract kind `"entity"`: fixed `input` (`storage`, `initialState: "__INIT"`, `initialContext`, `spawnSchema`, optional `despawnOn`, `reactions`), `internalEvents = LiteFsmEntityLifecycleEvents`, dependent `reducerContext` / `effectDeps` / `reactionDeps`, `resultMetadata`, `publicState`. Прикладной код берёт его через `EntitiesPlugin` |
| `LiteFsmEntityLifecycleEvents`                              | `{ type: "ENTITY_SPAWNED" } \| { type: "ENTITY_DESPAWNED" }`; internal events машины-шаблона. Public dispatch запрещён runtime-ошибкой. `ENTITY_DESPAWNED` является локальным cleanup hook для удаляемых строк актёра                                                                            |
| `SpawnEventsFrom<SpawnEvents>`                              | union public spawn events из `defineSpawnEvents(...)`: `{ type: Type; payload: Payload }`. Добавьте в `P` приложения, чтобы `manager.transition` принимал спавн                                                                                                                                                                                              |

### Schema resources

`resource(factory)` и `resource(factory, expose)` разрешены только в `initialContext` entity-машины. В `spawnSchema` resource descriptor является type error и runtime validation error.

```ts
type SpatialGrid = {
  clear(): void;
  ownerOnly(): void;
  queryRadius(x: number, y: number, radius: number): readonly EntityIndex[];
};

type SpatialGridView = {
  queryRadius(x: number, y: number, radius: number): readonly EntityIndex[];
};

const initialContext = {
  x: f32({ default: 0 }),
  unitGrid: resource(
    (): SpatialGrid => ({
      clear() {},
      ownerOnly() {},
      queryRadius: () => [],
    }),
    (grid): SpatialGridView => ({
      queryRadius: grid.queryRadius.bind(grid),
    }),
  ),
  scratch: resource(() => new Int32Array(256)),
} as const;
```

| Поверхность                                  | Типовое правило                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------------- |
| Owner `self.unitGrid`                        | mutable owner type `SpatialGrid`; owner-only методы доступны                    |
| Owner `self.scratch`                         | mutable owner type `Int32Array`; private resource остаётся доступен владельцу   |
| Consumer `entities().get("movement").unitGrid` | ровно exposed `SpatialGridView`, который вернул `expose`                         |
| Consumer private resource                    | ключ отсутствует в `EntityAccess`; он не представлен как property типа `never`  |
| `MachineResultMetadata["entityContextSchema"]` | сохраняет author `initialContext` с column и resource descriptors                |
| `spawnSchema`                                | принимает только spawn descriptors; `resource(...)` запрещён                    |

Consumer view не преобразуется в read-only wrapper. Если внешний код должен видеть только safe facade, задайте эту форму в `expose`.

### Reducer и контекст строк

`reducer` entity-машины получает третьим аргументом `EntityReducerContext`; первый аргумент `state` не используется.

| Тип                                          | Форма                                                                                                                                                                                                                                                            |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EntityReducerContext<Ctx, Spawn, Config, AppDeps = unknown>` | `{ self: EntityReducerSelf<Ctx, Config>; entities: () => <EntityAccess из AppDeps.entities или широкий fallback>; payloadFor(entity: EntityIndex): <значения спавна по Spawn> }`                                                                                 |
| `EntityReducerSelf<Ctx, Config>`             | mutable колонки `Ctx` (`Float32Array` / `Int16Array` / `Int32Array` / `Uint8Array` / `string[]`) + mutable owner resources + `indices: readonly EntityIndex[]`, `states: Record<PublicState, number>`, `presence`, `stateCode`, `prevStateCode`, `rowVersion`, `has(entity)`, `entityId(entity)` |

`entities()` в `EntityReducerContext` доступен на `ENTITY_SPAWNED`, public events и routed events. Если `AppDeps` содержит `readonly entities: () => EntityAccess<AppMachines>`, reducer получает строгие entity keys и колонки из `AppMachines`. Если `AppDeps.entities` отсутствует или несовместим с `EntityAccess<...>`, тип fallback — широкий `EntityAccess` с `get(string)`.

```ts
type AppMachines = typeof machines;
type AppDeps = {
  readonly entities: () => EntityAccess<AppMachines>;
};

const createAppMachine: TypedCreateMachineFn<
  AppEvent,
  AppDeps,
  EntitiesPlugin<AppDeps>
> = createMachine;
```

Store views из `entities()` типизируют колонки только для чтения: запись в колонку чужого view является ошибкой TypeScript, а `self.<column>[entity] = value` разрешён только в reducer владельца колонки. Exposed resource view имеет ровно тот тип, который вернул `expose`; private resources не входят в `EntityAccess`. Обычные reducers и `storage: "instance"` reducers не получают поле `entities`.

`payloadFor(entity)` валиден на `ENTITY_SPAWNED`. Запись `self.stateCode[entity] = self.states.<STATE>` планирует переход строки. Reducer и `reactions.ENTITY_DESPAWNED` могут читать колонки удаляемой строки до физического удаления; финальную внешнюю синхронизацию выполняйте через reaction, а не через state `effects` целевого состояния.

Entity reducer является sync-only: в контекст не входят deps и `transition`, Promise result является runtime error. `self`, `entities()` и store views нельзя сохранять после возврата reducer.

`reactions` получают sync-only зависимости. `self.indices` имеет тип `readonly EntityIndex[]` и является представлением текущего вызова. `self`, `self.indices`, объект `deps` и представления из `entities()` нельзя сохранять или мутировать после завершения reaction.

### Доступ к колонкам

| Тип                          | Форма / назначение                                                                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EntityAccess<AppMachines>`  | `{ get(key), maybe(key) }`; per-template view `{ count, version, has(entity), state(entity), <column>, <exposed resource> }`. Колонки только для чтения, индекс по `EntityIndex`; exposed resources не индексируются по строке; `state(entity)` сужается до `ActorPublicState<Config> \| undefined` |

`manager.entities()` — manager extension плагина типа `() => EntityAccess<AppMachines>` и root access ко всем entity stores. Reducer получает root access через storage runtime без scoped validation; `AppDeps.entities` является источником строгих типов. В effects/reactions runtime создает scoped access: `get` проверяет scope в dev, `maybe` возвращает view без этой проверки. Для effects/reactions передайте `manager.entities` в deps (`setDependencies({ entities: manager.entities })`).

Колонки удалённых строк не являются public state: после `has(entity) === false` значения `view.<column>[entity]` могут быть устаревшими. Resources не входят в public state, snapshots, hydrate payload, persistence или React row snapshots. `dehydrate()` сериализует удалённые слоты через defaults из column descriptors. `version` actor store и entity store — monotonic invalidation token, а не счетчик строк, событий или отдельных мутаций.

### React (`@lite-fsm/entities/react`)

| Тип                                       | Форма                                                                                            |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `EntityRowSnapshot<Context, State = string>` | `{ entityId: EntityId; groupTag: string; state: State; context: Context }`                       |
| `EntityListOptions`                       | `{ groupTag?: string }`                                                                          |
| `TypedUseEntitySnapshotHook<AppMachines>` | `(key, id: EntityId \| null \| undefined) => EntityRowSnapshot<...> \| undefined`                |
| `TypedUseEntityCountHook<AppMachines>`    | `(key, options?: EntityListOptions) => number`                                                   |
| `TypedUseEntityListHook<AppMachines>`     | `(key, options?: EntityListOptions) => readonly EntityId[]`                                       |

Хуки принимают `<AppMachines>` generic, сужают `key` до entity-шаблонов, а `context` / `state` — по схеме и `config` выбранного шаблона:

```ts
const row = useEntitySnapshot<AppMachines>("movement", id);
const ids = useEntityList<AppMachines>("movement", { groupTag: "unit" });
```

`TypedUse*Hook` фиксируют `AppMachines` один раз для exported app-хуков, аналогично `TypedUse*Hook` в `@lite-fsm/react`.

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

| Alias                                 | Фиксирует                                                           |
| ------------------------------------- | ------------------------------------------------------------------- |
| `TypedCreateConfigFn<P>`              | union событий для `CFG`                                             |
| `TypedCreateReducerFn<P>`             | `action` в reducer                                                  |
| `TypedCreateMachineFn<P, D, Plugins>` | union событий, deps эффектов и optional plugin-aware storage typing |
| `TypedCreateEffectFn<P, D>`           | union событий и deps эффектов                                       |

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

- `TypedUseSelectorHook<S>` принимает `MachineStore`, не computed `MachinesState<S>`.
- `getServerSnapshot` — root state shape `MachinesState<S>`, не dehydrated envelope; custom функция должна возвращать стабильный snapshot для SSR/hydration pass.
- `transitionAfterHydrate` принимает plain manager action или readonly array actions; выполняется только на клиенте после boundary hydrate.
- `useStorageHydrationPreview(storageKind)` возвращает `FSMStorageHydrationPreview`; оба payload-поля имеют тип `unknown`, чтобы plugin packages сами валидировали `snapshot.storage[kind]`.
- `persist` принимает только readonly array lifecycle entries; `@lite-fsm/persist/react` читает массив статусов через provider context, lifecycle-only entry представлен как `null`.
- `@lite-fsm/react` не импортирует `@lite-fsm/persist` или `@lite-fsm/entities`.

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
