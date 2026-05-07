# lite-fsm — Types Cheat Sheet

Сжатый справочник по типовому API. Runtime — в [`API-CHEATSHEET.md`](API-CHEATSHEET.md).

## Точки входа

| Импорт                   | Типы                                                                                                                                                                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@lite-fsm/core`          | весь `types.ts` + `interfaces.ts`: `FSMEvent`, `MachineConfig`, `CFG`, `MachineReducer`, `MachineEffect`, `MachineManagerSnapshot`, `MachinesState`, `MachineEvents`, `MachineDependencies`, `IMachineManager`, `Middleware`, actor types, snapshot types, helpers |
| `@lite-fsm/react`         | `FSMContextType`, `FSMContextProviderProps`, `FSMPersistLifecycle`, `FSMHydrationBoundaryProps`, typed hook aliases                                                                                                                                                 |
| `@lite-fsm/persist`       | `MaybePromise`, `PersistedRecord`, `PersistStorage`, `PersistStatus`, `PersistRestoreSettledResult`, `PersistManagerOptions`, `PersistController`                                                                                                                   |
| `@lite-fsm/persist/react` | runtime hooks only: `usePersistStatus`, `useIsPersistRestoring`                                                                                                                                                                                                     |
| `@lite-fsm/middleware`    | только runtime middleware                                                                                                                                                                                                                                           |

## Generics

| Generic    | Значение                                   |
| ---------- | ------------------------------------------ |
| `C`        | config graph object                        |
| `T`        | machine context, `Record<string, unknown>` |
| `P`        | union events, совместимый с `AnyEvent`     |
| `D`        | custom effect dependencies                 |
| `N`        | state name или `"*"` для effect/deps       |
| `S`        | `MachineStore`, карта машин manager-а      |
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

| Тип                         | Форма                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------ |
| `FSMEventMeta`              | `{ actorId?, groupId?, groupTag?, senderActorId?, senderGroupId?, senderGroupTag? }` |
| `ManagerAction<P>`          | `P & { meta?: FSMEventMeta }`                                                        |
| `ManagerCommitAction<S, P>` | user action или `HydrateAction<S>`                                                   |

`actorId`, `groupId`, `groupTag` — `string | string[]`.

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
| `config`                  | `C`                                                         |
| `initialState`            | `StateName<C>`                                              |
| `initialContext`          | `T`                                                         |
| `groupTag?`               | `string` (actor template only)                              |
| `reducer?`                | `MachineReducer<C, P, T>`                                   |
| `effects?`                | `{ [N in EffectStateName<C>]?: MachineEffect<N, C, P, D> }` |
| `hydrate?` · `dehydrate?` | domain transport hooks или actor snapshot hooks             |
| `persistence?`            | actor template only: `"runtime"` (default) \| `"snapshot"`  |

Default `Snapshot`: domain → `StateType<C, T>`, actor hook payload → `DefaultActorSnapshot<C, T>`.

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

| Тип                         | Назначение                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `MachineEffect<N, C, P, D>` | `(deps: D & DefaultDeps...) => void \| Promise<void>`                                                        |
| `EffectStateName<C>`        | domain: `StateName<C> \| "*"`; actor: `ActorPublicState<C> \| "*"`                                           |
| `IncomingEventTypes<C, N>`  | event names, ведущие в state `N`                                                                             |
| `ActionForState<C, N, P>`   | `Extract<P, { type: IncomingEventTypes<C, N> }>` (для `N = "*"` — весь `P`)                                  |
| `DefaultDeps<N, C, P>`      | `{ transition: (action: ManagerAction<P>) => ManagerAction<P>, action: ActionForState<C, N, P>, condition }` |

`transition` в domain effects принимает `ManagerAction<P>`, поэтому новое событие может нести routing `meta`. `action` и `condition` остаются типизированы через исходный `P` и сохраняют сужение по state.

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

| Тип                      | Что выводит                                    |
| ------------------------ | ---------------------------------------------- |
| `MachineStore`           | `Record<string, AnyMachineConfig>`             |
| `MachineSliceState<M>`   | domain slice или actor record для одной машины |
| `MachinesState<S>`       | manager state по карте машин                   |
| `MachineEvents<S>`       | union событий всех машин                       |
| `MachineDependencies<S>` | intersection custom deps всех effects          |

`MachineEvents<{}>` → `never`. `MachineDependencies<{}>` → `{}`.

## Snapshots

| Тип                                            | Назначение                                                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `MachineRuntimeSnapshot<C, T>`                 | runtime domain slice (= `StateType<C, T>`)                                                        |
| `MachineRuntimeSnapshotForMachine<M>`          | runtime snapshot одного machine config                                                            |
| `SnapshotForMachine<M>` · `MachineSnapshot<M>` | transport snapshot одной machine                                                                  |
| `MachineManagerRuntimeSnapshot<S>`             | envelope из `getSnapshot()`; включает live actor records                                          |
| `MachineManagerSnapshot<S>`                    | partial envelope для `hydrate()`; domain + snapshot actors                                        |
| `MachineManagerDehydratedSnapshot<S, K>`       | точный envelope из `dehydrate()`; ключи `K` обязательны                                           |
| `MachineManagerDehydrateResult<S, Keys>`       | результат `dehydrate({ machines: Keys })`: tuple keys обязательны, dynamic array остаётся partial |
| `MachineManagerDehydrateFn<S>`                 | overloads для `dehydrate`: без opts все snapshot keys, с literal `machines` выбранные keys        |
| `SnapshotActorTemplateKey<S>`                  | ключи actor templates с `persistence: "snapshot"`                                                 |
| `SnapshotMachineKey<S>`                        | domain keys + snapshot-actor keys                                                                 |
| `DehydrateOptions<S>`                          | `{ machines?: ReadonlyArray<SnapshotMachineKey<S>> }`                                             |

### Hydration

| Тип                        | Форма                                                             |
| -------------------------- | ----------------------------------------------------------------- |
| `HydrateStrategy`          | `"replace" \| "merge"`                                            |
| `HydrateOptions`           | `{ strategy?: HydrateStrategy }`                                  |
| `HydratePreviewOptions<S>` | `HydrateOptions & { baseState?: MachinesState<S> }`               |
| `HydrateMeta`              | `{ strategy: HydrateStrategy }`                                   |
| `HydrateAction<S>`         | `{ type: "@@lite-fsm/HYDRATE"; payload: { strategy; snapshot } }` |
| `UnknownMachineKeyContext` | `"hydrate" \| "opts.snapshot"`                                    |

## Persist

`@lite-fsm/persist` типизируется от того же `S extends MachineStore`, что и `MachineManager`.

| Тип                        | Форма / назначение                                                                                         |
| -------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `MaybePromise<T>`          | `T \| Promise<T>`                                                                                          |
| `PersistedRecord<S>`       | `{ timestamp: number; storageVersion?: string \| number; snapshot: MachineManagerSnapshot<S> }`            |
| `PersistStorage<S>`        | `{ get, set, remove, subscribe? }`, где value — typed `PersistedRecord<S>`                                 |
| `PersistStatus`            | `{ phase: "idle" } \| { phase: "restoring" } \| { phase: "ready"; restored } \| { phase: "error"; error }` |
| `PersistRestoreSettledResult` | `{ phase: "ready"; restored } \| { phase: "error"; error }`                                             |
| `PersistManagerOptions<S>` | storage, `machines`, hydrate strategy, version/TTL/throttle, `shouldSave`, `migrate`, `onRestoreSettled`, `onError` |
| `PersistController`        | `start`, `restore`, `save`, `flush`, `clear`, `getStatus`, `subscribeStatus`                               |

```ts
type Store = typeof machines;
type Record = PersistedRecord<Store>;
type Storage = PersistStorage<Store>;

const persist = persistManager(manager, {
  storage,
  machines: ["profile"],
  shouldSave: ({ prevState, currentState, action }) => action.type !== "NOOP",
  onRestoreSettled: (result) => {
    if (result.phase === "error") console.error(result.error);
  },
});
```

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

В `MachineManagerSnapshot` для snapshot actor хранится per-actor entry `{ snapshot, meta }`. Пользовательские hooks получают только `snapshot`, data-slice и hydrate meta `{ strategy }`; `actorId`, `groupId` и `groupTag` остаются под управлением manager-а.

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
| `setDependencies`  | `(deps \| updater) => void`                                       |

### Manager options и subscribers

| Тип                           | Форма                                                                                                                                                 |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MachineManagerOptions<S, P>` | `{ onError?, middleware?, snapshot?, schemaVersion?, onUnknownMachineKey?, onSchemaVersionMismatch?, originId?, generateActorId?, generateGroupId? }` |
| `SpawnIdContext<P>`           | `{ templateKey: string; groupTag: string; counter: number; originId: string \| undefined; action: ManagerAction<P> }`                                 |
| `GenerateSpawnIdFn<P>`        | `(ctx: SpawnIdContext<P>) => string`                                                                                                                  |
| `Subscriber<C, T, P>`         | `(prev: StateType<C, T>, current: StateType<C, T>, action: P) => void`                                                                                |
| `TransitionSubscriber<S, P>`  | `(prev: MachinesState<S>, current: MachinesState<S>, action: ManagerCommitAction<S, ManagerAction<P>>) => void`                                       |

`originId?: string` (без `#`) и кастомные `generateActorId` / `generateGroupId` обеспечивают изоляцию id между менеджерами в P2P / multi-tab / шарды-сценариях. Подробнее — в гайде [Распределенный спавн](/guide/actors#распределенный-спавн).

## Typed factory aliases

`Typed*Fn` фиксируют `P`/`D` один раз для всего приложения.

```ts
export const defineConfig: TypedCreateConfigFn<AppEvent> = createConfig;
export const defineReducer: TypedCreateReducerFn<AppEvent> = createReducer;
export const defineMachine: TypedCreateMachineFn<AppEvent, Deps> = createMachine;
export const defineEffect: TypedCreateEffectFn<AppEvent, Deps> = createEffect;
```

| Alias                        | Фиксирует                     |
| ---------------------------- | ----------------------------- |
| `TypedCreateConfigFn<P>`     | union событий для `CFG`       |
| `TypedCreateReducerFn<P>`    | `action` в reducer            |
| `TypedCreateMachineFn<P, D>` | union событий и deps эффектов |
| `TypedCreateEffectFn<P, D>`  | union событий и deps эффектов |

## Experimental graph IR

`@lite-fsm/graph` экспортирует типы JSON-документа для tooling-слоя. Runtime-пакеты от него не зависят.

```ts
import { compileLiteFsmGraph, selectMachineGraph, type LiteFsmGraphDocument } from "@lite-fsm/graph";

const result = compileLiteFsmGraph(source);
const document: LiteFsmGraphDocument = result.document;
const selected = selectMachineGraph(document, { managerKey: "machineKey" });
```

| Тип                         | Форма                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------- |
| `LiteFsmGraphResult`        | `{ document: LiteFsmGraphDocument; diagnostics: GraphDiagnostic[] }`                  |
| `LiteFsmGraphDocument`      | `{ version, source, machines, managers, diagnostics }`                                |
| `LiteFsmGraphManager`       | manager metadata плюс `machineRefs: { key, machineId, loc? }[]`                       |
| `LiteFsmGraphMachine`       | machine metadata плюс `states`, `transitions`, `emissions`, `reducerCases`            |
| `GraphTransition`           | accepted event edge слоя `config` или `reducer`                                       |
| `GraphReducerCase`          | symbolic reducer branch: event, guard, state-write targets, confidence                |
| `GraphEmission`             | событие, которое может отправить effect при входе в state                             |
| `GraphDiagnostic`           | `{ code, severity, message, machineId?, loc? }`                                       |
| `MachineSelector`           | `{ index }`, `{ id }`, `{ variableName }`, `{ exportName }`, `{ managerKey }` или `{ managerId, managerKey }` |
| `SelectMachineGraphResult`  | success `{ ok: true, machine, diagnostics }` или failure `{ ok: false, candidates, diagnostics }` |
| `CompileLiteFsmGraphOptions` | `{ filename?, language?, parser?: "static", maxMachines? }`                           |

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

| Тип                                                       | Форма                                                                                    |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `FSMContextType<S = MachineStore, P = AnyEvent>`          | `IMachineManager<S, P>`                                                                  |
| `FSMPersistLifecycle`                                     | `{ start(): () => void }`                                                                |
| `FSMContextProviderProps<S, P>`                           | `PropsWithChildren<{ machineManager; getServerSnapshot?; persist? }>`                    |
| `FSMHydrationBoundaryProps<S, P>`                         | `PropsWithChildren<{ snapshot: MachineManagerSnapshot<S>; strategy?: HydrateStrategy; transitionAfterHydrate?: ManagerAction<P> \| readonly ManagerAction<P>[] }>` |
| `TypedUseManagerHook<S, P>` · `TypedUseMachineHook<S, P>` | `() => IMachineManager<S, P>`                                                            |
| `TypedUseSelectorHook<S>`                                 | `<R>(selector: (state: MachinesState<S>) => R, equalityFn?) => R`                        |
| `TypedUseTransitionHook<P>`                               | `() => (payload: ManagerAction<P>) => ManagerAction<P>`                                  |

App-typed hooks:

```ts
type Store = typeof machines;
type Event = MachineEvents<Store>;

export const useManager: TypedUseManagerHook<Store, Event> = baseUseManager;
export const useSelector: TypedUseSelectorHook<Store> = baseUseSelector;
export const useTransition: TypedUseTransitionHook<Event> = baseUseTransition;
```

`TypedUseSelectorHook<S>` принимает `MachineStore`, не computed `MachinesState<S>`. `getServerSnapshot` — root state shape `MachinesState<S>`, не dehydrated envelope; custom функция должна возвращать стабильный snapshot для SSR/hydration pass. `transitionAfterHydrate` принимает plain manager action или readonly array actions и выполняется только на клиенте после boundary hydrate. `persist` принимает structural lifecycle или readonly array lifecycle controllers; `@lite-fsm/react` не импортирует `@lite-fsm/persist`.

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

| Камень                     | Правило                                                               |
| -------------------------- | --------------------------------------------------------------------- |
| расширенный `initialState` | используйте literal / `as const`, иначе state станет `string`         |
| потерянные derived events  | типизируйте через `MachineConfig` или typed factory                   |
| `FSMEvent<"X", undefined>` | payload обязателен: `{ type: "X", payload: undefined }`               |
| wildcard target            | `"*"` — только source key, не target и не `initialState`              |
| actor `__INIT`             | system state, не public state и не effect key                         |
| runtime actors в snapshot  | `DehydrateOptions` принимает только domain keys и snapshot-actor keys |
| `MachineManager({})`       | events → `never`, deps → `{}`, state → `{}`                           |
| тип action в middleware    | используйте `ManagerAction<P>`, если нужен routing `meta`             |
| `TypedUseSelectorHook`     | generic `S` — store config, не computed state                         |

## Команды

| Проверка                  | Команда                   |
| ------------------------- | ------------------------- |
| Типы по source packages   | `pnpm run test:types`      |
| Типы по собранным пакетам | `pnpm run test:types:dist` |
| Полный type-loop          | `pnpm run test:types:all`  |
