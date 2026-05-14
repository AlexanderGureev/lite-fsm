# lite-fsm — Types Cheat Sheet

Сжатый справочник по типовому API. Runtime — в [`API-CHEATSHEET.md`](API-CHEATSHEET.md).

## Точки входа

| Импорт                    | Типы                                                                                                                                                                                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@lite-fsm/core`          | весь `types.ts` + `interfaces.ts`: `FSMEvent`, `MachineConfig`, `CFG`, `MachineReducer`, `MachineEffect`, `MachineManagerSnapshot`, `MachinesState`, `MachineEvents`, `MachineDependencies`, `IMachineManager`, `Middleware`, actor types, snapshot types, helpers |
| `@lite-fsm/react`         | `FSMContextType`, `FSMContextProviderProps`, `FSMPersistLifecycle`, `FSMHydrationBoundaryProps`, typed hook aliases                                                                                                                                                |
| `@lite-fsm/persist`       | `MaybePromise`, `PersistedRecord`, `PersistStorage`, `PersistStatus`, `PersistRestoreSettledResult`, `PersistManagerOptions`, `PersistController`                                                                                                                  |
| `@lite-fsm/persist/react` | runtime hooks only: `usePersistStatus`, `useIsPersistRestoring`                                                                                                                                                                                                    |
| `@lite-fsm/middleware`    | только runtime middleware                                                                                                                                                                                                                                          |
| `@lite-fsm/graph`         | experimental graph compiler/analyzer IR-типы                                                                                                                                                                                                                       |
| `@lite-fsm/graph/simulator` | experimental simulator-типы: snapshots, slices, timeline, choices, available transitions, suggested emissions                                                                                                                                                     |
| `@lite-fsm/graph/view-model` | experimental visualizer projection-типы: summaries, topics, workbench rows, anchors, row mappings, overlay inputs, Machine Flow Model                                                                                                                            |
|                           |

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

| Тип                          | Форма                                                                                                                                                                               |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LiteFsmGraphResult`         | `{ document: LiteFsmGraphDocument; diagnostics: GraphDiagnostic[] }`                                                                                                                |
| `LiteFsmGraphProjectResult`  | `LiteFsmGraphResult & { files: LiteFsmGraphProjectFile[] }` для project graph compiler                                                                                              |
| `GraphAnalysisResult`        | `{ diagnostics: GraphDiagnostic[] }` для semantic analyzer-а                                                                                                                        |
| `LiteFsmGraphDocument`       | `{ version, source, machines, managers, diagnostics }`                                                                                                                              |
| `GraphSource`                | `{ filename?, language, hash?, kind?, entryFileName?, files? }`; project mode использует `kind: "project"` и file-aware metadata                                                     |
| `GraphSourceFile`            | `{ fileName, language, hash? }` для source files внутри project document                                                                                                            |
| `LiteFsmGraphManager`        | manager metadata плюс `machineRefs: { key, machineId, loc? }[]`                                                                                                                     |
| `LiteFsmGraphMachine`        | machine metadata плюс `states`, `transitions`, `emissions`, `reducerCases`, `initialContextSummary`, `initialContextJson?`                                                          |
| `GraphJsonValue/Object`      | JSON-safe values для graph IR, simulator payload и initial context overrides                                                                                                          |
| `GraphTransition`            | accepted event edge слоя `config` или `reducer`                                                                                                                                     |
| `GraphReducerCase`           | symbolic reducer branch: event, guard, state-write targets, confidence                                                                                                              |
| `GraphEmission`              | событие, которое может отправить effect при входе в state; не является transition                                                                                                   |
| `GraphRouting`               | routing emission-а: `default`, `unscoped`, `actor`, `group`, `tag` или `unknown`                                                                                                    |
| `GraphRoutingTarget`         | literal, array, `self.actorId/groupId/groupTag` или dynamic routing target                                                                                                          |
| `GraphDiagnostic`            | `{ code, severity, message, machineId?, loc? }`                                                                                                                                     |
| `SourceLocation`             | `{ fileName?, start, end }`; `fileName` заполняется в project mode                                                                                                                  |
| `MachineSelector`            | `{ index }`, `{ id }`, `{ variableName }`, `{ exportName }`, `{ managerKey }` или `{ managerId, managerKey }`                                                                       |
| `SelectMachineGraphResult`   | success `{ ok: true, machine, diagnostics }` или failure `{ ok: false, candidates, diagnostics }`                                                                                   |
| `CompileLiteFsmGraphOptions` | `{ filename?, language?, parser?: "static", maxMachines? }`                                                                                                                         |
| `CompileLiteFsmGraphProjectOptions` | `{ entryFileName, projectRoot?, host }`; host владеет чтением source и module resolution                                                                                     |
| `LiteFsmGraphProjectHost`    | `{ readSource(fileName), resolveModule({ fromFileName, moduleSpecifier }) }`                                                                                                        |
| `LiteFsmGraphProjectModuleResolution` | discriminated union `resolved`/`core`/`external`/`not-found`/`unsupported-extension`                                                                                 |
| `LiteFsmGraphProjectFile`    | `{ fileName, language: "ts", roles, hash }`; roles: `entry`, `machine`, `barrel`, `helper`                                                                                         |
| `AnalyzeLiteFsmGraphOptions` | `{ rules?: GraphAnalysisRuleId[], strict?: boolean, scope?: GraphAnalysisScope }`                                                                                                   |
| `GraphAnalysisScope`         | `{ kind: "document" }`, `{ kind: "machine", machineId }` или `{ kind: "manager", managerId }`                                                                                       |
| `GraphAnalysisRuleId`        | analyzer rule union: `unknown-target`, `unreachable-state`, `dead-end-state`, `actor-template-shape`, `reducer-config-consistency`, `effect-event-acceptance`, `wildcard-shadowing` |

`LiteFsmGraphDocument.diagnostics` содержит compiler diagnostics. Diagnostics analyzer-а возвращаются отдельно из `GraphAnalysisResult` и имеют коды `LFG_ANALYZER_*`.

## CLI project graph export document

`lite-fsm export-graph` пишет versioned JSON envelope для передачи project graph document в visualizer без повторного compile source.

```ts
type LiteFsmProjectGraphExportDocument = {
  version: "lite-fsm.project-graph-export/v1";
  createdBy: { package: "@lite-fsm/cli"; version: string };
  entry: { path: string; tsconfigPath?: string };
  graph: LiteFsmGraphDocument;
  files: LiteFsmGraphProjectFile[];
  diagnostics: CliDiagnostic[];
  sources?: {
    files: Array<{
      fileName: string;
      language: "ts";
      hash: string;
      text: string;
    }>;
  };
};
```

| Тип / поле        | Назначение                                                                                      |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| `entry.path`      | entrypoint path relative to CLI cwd, когда возможно                                             |
| `entry.tsconfigPath` | присутствует только если CLI использовал explicit или nearest tsconfig                       |
| `graph`           | ровно `compileLiteFsmGraphProject(...).document`; `graph.diagnostics` хранит `LFG_*` diagnostics |
| `files`           | ровно `compileLiteFsmGraphProject(...).files`                                                    |
| `diagnostics`     | только CLI diagnostics `LFC_*`, показанные во время command execution                            |
| `sources`         | optional `--include-source` bundle; порядок и metadata совпадают с `files`, `text` не входит в `graph` |

`CliDiagnostic` имеет форму `{ code, severity, message, file?, loc?, hint? }`, где `severity` — `"info" | "warning" | "error"`, а code в MVP: `LFC_INVALID_OPTIONS`, `LFC_TSCONFIG_NOT_FOUND`, `LFC_TSCONFIG_INVALID`, `LFC_GRAPH_PROJECT_FAILED`, `LFC_NO_MACHINES_EXPORTED`, `LFC_SOURCE_BUNDLE_FILE_UNREADABLE`, `LFC_WRITE_FAILED`.

## Experimental graph simulator types

`@lite-fsm/graph/simulator` экспортирует типы headless simulation runtime. Они не зависят от DOM, React или app modules.

| Тип                               | Форма/назначение                                                                                                            |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `CreateGraphSimulatorOptions`     | `scope`, `actorMode`, `effectMode`, branch/evaluation policies, initial state/context overrides                            |
| `GraphSimulationScope`            | `{ kind: "document" }`, `{ kind: "manager", managerId }` или `{ kind: "machines", machineIds }`                            |
| `GraphSimulationEvent`            | `{ type: string; payload?: GraphJsonValue; meta?: GraphSimulationEventMeta }`                                               |
| `GraphSimulationSliceRef`         | domain, actorTemplate или future actor ref                                                                                  |
| `GraphSimulationSnapshot`         | immutable текущие slices, slice indexes, diagnostics и `GraphSimulationTimeline`                                            |
| `GraphAvailableTransition`        | accepted/effective transition candidate с `canApply`, layer, target, guard и confidence                                    |
| `GraphSuggestedEmission`          | manual effect emission candidate последнего committed step                                                                  |
| `GraphSendResult`                 | success `{ ok: true, snapshot, step }` или controlled failure `{ ok: false, reason, snapshot?, pendingChoice?, diagnostics }` |
| `GraphSimulationPendingChoice`    | pending branch choice для `choose(...)`, keyed by `sliceId`                                                                 |
| `GraphEvaluationPolicy`           | optional symbolic hooks `evaluateTransition` и `reduceContext`; default policy не исполняет user code                      |

`sendFromTransition` принимает `payload`, но не принимает routing `meta`: routing override задается только через обычный `send({ event })` или через IR routing у `sendFromEmission`.

## Experimental graph view-model types

`@lite-fsm/graph/view-model` типизирует read-only данные для visualizer-а. Эти типы не содержат React, DOM, CodeMirror, layout или simulator runtime lifecycle.

| Тип                                          | Назначение                                                                                         |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `GraphVisualizerModel`                       | root projection: machines, managers, topics, relations, diagnostics, row mappings, workbench models |
| `GraphMachineSummary` / `GraphManagerSummary` | L1 inventory summaries с counts, topic types, source anchors и diagnostic ids                       |
| `GraphTopicSummary`                          | L2 event catalog: producers, config consumers, reducer branches, routing kinds/values                |
| `GraphMachineWorkbenchModel`                 | L3 state blocks, global behavior, rows, diagnostics и source anchors одной machine                   |
| `GraphWorkbenchRow`                          | union строк `config`, `reducer`, `effect`, `diagnostic`, `unknown`                                  |
| `GraphTargetView`                            | display-safe target: `state`, `self`, `terminal`, `dynamic`, `blocked`, `unknown`                    |
| `GraphSourceAnchor`                          | read-only source binding; `editable` всегда `false`                                                 |
| `GraphDiagnosticAnchor`                      | build-local diagnostic id + origin + optional graph/source binding                                   |
| `GraphVisualizerRowMappingIndex`             | mapping transition/emission identifiers к `rowId`, включая folded reducer rows                       |
| `GraphVisualizerSimulationOverlayInput`      | готовые simulation ids/flags для подсветки rows без запуска simulator-а                              |
| `MachineFlowModel`                           | controlled `missing-machine` или ready semantic graph одной machine                                  |
| `MachineFlowNode`                            | state/wildcard/effect-source/synthetic target node с semantic id, role, badges, anchors и stats      |
| `MachineFlowEdgeGroup`                       | grouped transition/emission edge с semantic refs, row refs, producer refs и diagnostics              |
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
| `FSMContextProviderProps<S, P>`                           | `PropsWithChildren<{ machineManager; getServerSnapshot?; persist? }>`                                                                                              |
| `FSMHydrationBoundaryProps<S, P>`                         | `PropsWithChildren<{ snapshot: MachineManagerSnapshot<S>; strategy?: HydrateStrategy; transitionAfterHydrate?: ManagerAction<P> \| readonly ManagerAction<P>[] }>` |
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

| Проверка                  | Команда                    |
| ------------------------- | -------------------------- |
| Типы по source packages   | `pnpm run test:types`      |
| Типы по собранным пакетам | `pnpm run test:types:dist` |
| Полный type-loop          | `pnpm run test:types:all`  |
