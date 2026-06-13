# lite-fsm — API Cheat Sheet

Сжатый справочник по runtime API. Типы — в [`TYPES-CHEATSHEET.md`](TYPES-CHEATSHEET.md).

## Точки входа

| Импорт                                                         | Runtime exports                                                                                                                                                   |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@lite-fsm/core`                                               | `createMachine`, `createConfig`, `createReducer`, `createEffect`, `createActorMeta`, `definePlugin`, `defineStorageRuntime`, `Machine`, `defineMachine`, `MachineManager`, `LiteFsmError` |
| `@lite-fsm/persist`                                            | `persistManager`, `createJsonStorage`                                                                                                                             |
| `@lite-fsm/persist/react`                                      | `usePersistStatuses`, `useIsPersistRestoring`                                                                                                                     |
| `@lite-fsm/middleware`                                         | `immerMiddleware`, `devToolsMiddleware`                                                                                                                           |
| `@lite-fsm/middleware/immer` · `@lite-fsm/middleware/devTools` | per-feature entry points                                                                                                                                          |
| `@lite-fsm/react`                                              | `FSMContext`, `FSMContextProvider`, `FSMHydrationBoundary`, `useHydrateSnapshot`, `useManager`, `useSelector`, `useTransition`, `defineMachine`                   |
| `@lite-fsm/graph`                                              | alpha: `compileLiteFsmGraph`, `compileLiteFsmGraphProject`, `selectMachineGraph`, `analyzeLiteFsmGraph` и IR-типы для graph tooling                               |
| `@lite-fsm/graph/simulator`                                    | alpha: `createGraphSimulator`, `createMachineGraphSimulator` для headless symbolic simulation поверх graph IR                                                     |
| `@lite-fsm/graph/view-model`                                   | alpha: `buildGraphVisualizerModel`, `buildMachineWorkbenchModel`, `buildMachineFlowModel` для read-only visualizer projections                                    |
| `@lite-fsm/cli`                                                | alpha binary `lite-fsm`; JS runtime entrypoint не публикуется                                                                                                     |
|                                                                |

`@lite-fsm/react` помечен `"use client"`. Импортировать можно из SSR/RSC, hooks/provider — только в client tree.

## Alpha graph compiler

`@lite-fsm/graph` принимает строку TypeScript/JavaScript или project entrypoint через host и возвращает JSON-документ графа без исполнения пользовательского кода.

```ts
const result = compileLiteFsmGraph(source, {
  filename: "machine.ts",
  parser: "static",
});
const document = result.document;

const project = compileLiteFsmGraphProject({
  entryFileName: "/repo/store/index.ts",
  projectRoot: "/repo",
  host,
});
```

| API                                | Назначение                                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `compileLiteFsmGraph(src, opts?)`  | возвращает `LiteFsmGraphResult`; компилирует machines/managers, refs, config/reducer transitions и effect emissions            |
| `compileLiteFsmGraphProject(opts)` | возвращает `LiteFsmGraphProjectResult` с `document`, `diagnostics` и discovered `files`; filesystem остается за host/CLI-слоем |
| `selectMachineGraph(doc, sel?)`    | выбирает одну machine по `index`, `id`, `variableName`, `exportName`, `managerKey` или `{ managerId, managerKey }`             |
| `analyzeLiteFsmGraph(doc, opts?)`  | запускает semantic analyzer поверх готового IR; возвращает отдельные diagnostics `LFG_ANALYZER_*`                              |
| `LiteFsmGraphDocument`             | универсальный IR для visualizer-а, CLI, analyzer-а и simulator-а                                                               |
| `LiteFsmGraphProjectFile`          | metadata project-файла: exported `fileName`, `language: "ts"`, `roles`, `hash`                                                 |
| `GraphDiagnostic`                  | diagnostic как часть результата; compiler не должен падать на частично неподдержанном коде                                     |

Reducer branches в graph IR символические: compiler сохраняет `reducerCases` и отдельные `GraphTransition` со слоем `"reducer"`, не проверяя consistency с `config`. Effect emissions сохраняются как `GraphEmission`: это suggested events при входе в state, а не state transitions.

`analyzeLiteFsmGraph` не запускается внутри `compileLiteFsmGraph` автоматически и не мутирует document. Правила v1: `unknown-target`, `unreachable-state`, `dead-end-state`, `actor-template-shape`, `reducer-config-consistency`, `effect-event-acceptance`, `wildcard-shadowing`.

## Alpha CLI

`@lite-fsm/cli` предоставляет binary `lite-fsm` для создания starter-проектов и tooling-сценариев. Публичная поверхность CLI — команды create/add-machine/graph export/local visualize и JSON/HTTP contracts, а не runtime import.

```bash
lite-fsm export-graph --entry store/index.ts --out lite-fsm.graph.json --tsconfig tsconfig.json
lite-fsm export-graph --entry store/index.ts --out lite-fsm.graph.json --include-source
lite-fsm visualize --entry store/index.ts --tsconfig tsconfig.json
lite-fsm visualize --entry store/index.ts --port 3030 --no-open
lite-fsm create my-app --template vite
lite-fsm add-machine user-session
```

| Command                    | Назначение                                                                                                      |
| -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `lite-fsm create`          | создает Next/Vite starter с generated `src/store`, `app.Events` aggregator и React wiring                       |
| `lite-fsm add-machine`     | добавляет доменный автомат в generated `src/store`, регистрирует key и подключает локальные `Events` автомата   |
| `lite-fsm export-graph`    | строит project graph через public `compileLiteFsmGraphProject` и пишет JSON export document для visualizer-а    |
| `lite-fsm visualize`       | строит project graph, запускает local host `127.0.0.1:<port>` и отдает visualizer static + session/source API   |
| `<project-name>`           | `create` only: relative target path внутри cwd; parent должен существовать, target не должен существовать       |
| `<name>`                   | `add-machine` only: `kebab-case`, `snake_case` или `camelCase`, например `user-session` → `userSession`         |
| `--template <next\|vite>`  | `create` only: required framework starter                                                                       |
| `--css <tailwind\|none>`   | `create` only: styling preset, default `tailwind`                                                               |
| `--package-manager <...>`  | `create` only: `pnpm`, `npm`, `yarn` или `bun`, default `npm`                                                   |
| `--install`/`--no-install` | `create` only: dependency install после генерации, default install                                              |
| `--entry <path>`           | обязательный TypeScript entrypoint с выбранным top-level `MachineManager(...)`                                  |
| `--out <path>`             | обязательный output file; stdout JSON (`--out -`) не поддерживается                                             |
| `--tsconfig <path>`        | optional explicit tsconfig; без него CLI ищет ближайший `tsconfig.json`, затем fallback к default TS resolution |
| `--include-source`         | opt-in: добавляет top-level `sources.files[]` с текстом discovered project files для static source overlay      |
| `--port <number>`          | `visualize` only: local host port, default `3030`, допустимы integer `1..65535`                                 |
| `--no-open`                | `visualize` only: не запускать browser opener, только напечатать session URL                                    |

| Export document field | Назначение                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------- |
| `version`             | `"lite-fsm.project-graph-export/v1"`                                                        |
| `createdBy`           | `{ package: "@lite-fsm/cli", version }`                                                     |
| `entry`               | display path entrypoint-а и optional `tsconfigPath`                                         |
| `graph`               | `LiteFsmGraphDocument` из `compileLiteFsmGraphProject(...).document`                        |
| `files`               | discovered project files из `LiteFsmGraphProjectResult.files`: path, language, roles и hash |
| `diagnostics`         | только CLI diagnostics `LFC_*`; graph compiler diagnostics остаются в `graph.diagnostics`   |
| `sources`             | optional bundle из `--include-source`; хранит source `text` вне `graph`                     |

CLI не пишет export, если опции невалидны, tsconfig не читается, graph compile вернул blocking diagnostics, manager не содержит resolved machine refs или output file нельзя записать. По умолчанию JSON export не содержит исходный source text; `--include-source` добавляет его вне `graph`.

`visualize` печатает URL вида `http://127.0.0.1:<port>/?session=<token>` после успешного старта. Graph diagnostics выводятся в stderr, но не блокируют local server, если graph document построен. API endpoints требуют token: `GET /api/session?token=...` возвращает JSON export document, `GET /api/source?token=...&fileName=...` читает только discovered project files и возвращает `409 source-stale`, если файл изменился после graph build. Static visualizer files публикуются внутри `@lite-fsm/cli` в `dist/visualizer`.

## Alpha graph simulator

`@lite-fsm/graph/simulator` запускает headless symbolic simulation поверх готового `LiteFsmGraphDocument`. Root import `@lite-fsm/graph` simulator runtime не реэкспортирует.

```ts
const simulator = createGraphSimulator(document, {
  scope: { kind: "machines", machineIds: ["checkout", "audit"] },
});

const started = simulator.start();
const sent = simulator.send({ event: { type: "SUBMIT", payload: { id: 1 } } });
```

| API                                | Назначение                                                                                          |
| ---------------------------------- | --------------------------------------------------------------------------------------------------- |
| `createGraphSimulator(doc, opts?)` | создает simulator для document/manager/machines scope                                               |
| `createMachineGraphSimulator(...)` | wrapper для scope из одной machine                                                                  |
| `start()` / `reset()`              | создает initial immutable snapshot; effects initial states не запускаются                           |
| `getAvailableTransitions(filter?)` | возвращает применимые config/reducer candidates для текущих slices                                  |
| `getSuggestedEmissions(filter?)`   | возвращает manual effect emissions последнего committed step                                        |
| `send({ event })`                  | dispatch object event через общую event bus                                                         |
| `sendFromTransition(...)`          | отправляет event выбранного transition; origin branch фиксируется явно                              |
| `sendFromEmission(...)`            | отправляет event выбранной effect emission с routing из IR                                          |
| `choose(...)`                      | commit ранее возвращенного pending branch choice                                                    |
| `GraphSimulationSnapshot.timeline` | immutable timeline graph: `stepsById`, `childrenByStepId`, `linearStepIds` для будущего time travel |

Simulator не исполняет user reducer/effect/guard code. Context берется из `initialContextJson`, initial overrides или summary/unknown fallback; `GraphValueSummary.text` не парсится.

## Alpha graph view-model

`@lite-fsm/graph/view-model` строит синхронную read-only projection поверх `LiteFsmGraphDocument` для будущего visualizer-а. Root import `@lite-fsm/graph` view-model не реэкспортирует.

```ts
const model = buildGraphVisualizerModel(document, {
  analysisDiagnostics: analyzeLiteFsmGraph(document).diagnostics,
});
```

| API                                           | Назначение                                                                                                        |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `buildGraphVisualizerModel(doc,?)`            | строит L1/L2/L3 projection: machines, managers, topics, relation index, diagnostics, workbench rows               |
| `buildMachineWorkbenchModel(m, ?)`            | isolated helper для workbench preview/unit tests одной machine                                                    |
| `buildMachineFlowModel({ model, machineId })` | строит semantic state graph одной machine для Machine Canvas Board без React Flow/DOM/layout state                |
| `GraphVisualizerModel.topics`                 | каталог event topics с producers, consumers, reducer branches и routing summary                                   |
| `GraphVisualizerModel.rowMappings`            | canonical mapping simulator row refs / transition-emission ids к workbench `rowId` с diagnostics ambiguity        |
| `GraphMachineWorkbenchModel.states`           | state blocks и строки `config` / `reducer` / `effect` / `diagnostic` без JSX, DOM, simulator runtime или UI state |
| `MachineFlowModel.edgeGroups`                 | grouped semantic edges: accepted transitions, self-emitted/from-other transitions и emission-only source chips    |

View-model не запускает simulator и не исполняет пользовательский код. Simulation overlay принимает только готовые ids/flags (`currentStateIds*`, `availableTransitionIds*`, `suggestedEmissionIds*`, `firedRefs`, `inspectedRefs`) и проставляет display flags на rows.
Machine Flow строится только поверх `GraphVisualizerModel`: сохраняет semantic ids, source anchors, row refs, producer refs, source state для transition rows, current state из overlay/workbench и не содержит renderer coordinates/styles.

## Mental model

| Термин         | Форма                                                                                                 |
| -------------- | ----------------------------------------------------------------------------------------------------- |
| Event / action | `{ type: string; payload?: unknown; meta?: FSMEventMeta }`                                            |
| Domain slice   | `{ state, context }`                                                                                  |
| Actor slice    | `{ state, context, meta: { actorId, groupId, groupTag } }`                                            |
| Manager state  | `{ [machineKey]: domainSlice \| Record<actorId, actorSlice> }`                                        |
| Snapshot       | `{ schemaVersion?: number; machines: { [machineKey]: snapshot }; storage?: Record<string, unknown> }` |

Pipeline события: `middleware (pre next) → action interceptors → dispatch hooks → reducer graph → commit → subscribers → middleware (post next) → effects hooks → effects`. Middleware "оборачивает" reducer + subscribers; effects идут уже после возврата всей middleware-цепочки. `transition(action)` возвращает committed public action.

## Фазы обработки события (transition)

Что происходит внутри `manager.transition(action)`.

| #   | Фаза                   | Что происходит                                                                             |
| --- | ---------------------- | ------------------------------------------------------------------------------------------ |
| 0   | pre-normalize          | sender, registered routing keys и default routing; late-dispatch отбрасывается             |
| 1   | middleware (pre next)  | каждое middleware до `next(action)` в порядке регистрации                                  |
| 2   | post-normalize         | committed action фиксируется в `ctx.committed`; middleware rewrite повторно нормализуется  |
| 3   | action interceptors    | plugins могут заменить committed action или выставить `skipDelivery`                       |
| 4   | `beforeReduce` hooks   | plugins выполняют staged runtime operations до delivery                                    |
| 5–8 | root reducer           | routing → domain reducers → spawn actors → reduce routed actors → collapse terminal actors |
| 9   | commit                 | `beforeCommit` hooks, commit storage runtimes и commit root state                          |
| 10  | reactions/subscribers  | `beforeSubscribers` hooks → storage reactions → `onTransition` (sync)                      |
| —   | middleware (post next) | каждое middleware после `next(action)` в обратном порядке                                  |
| 12  | effects                | `beforeEffects` hooks → storage effects → `afterEffects` hooks                             |

Фазы 2–10 проходят внутри middleware-чейна (через `next` → `_transition`). Effects (12) — после возврата всей цепочки. Если middleware не вызывает `next`, interceptors, hooks, reducers, subscribers и effects не выполняются. Standalone-машина из `Machine.ts` использует подмножество: middleware → reducer → subscribers → middleware (post) → effects, без actor/runtime hook-фаз.

## Описание машины

```ts
const counter = createMachine({
  config: {
    idle: { INC: "idle", RESET: null },
    "*": { BOOT: "idle" },
  },
  initialState: "idle",
  initialContext: { count: 0 },
  reducer: (slice, action, { nextState }) => ({
    state: nextState,
    context: { count: action.type === "RESET" ? 0 : slice.context.count + 1 },
  }),
  effects: {
    idle: ({ action }) => void action.type,
    "*": ({ action }) => void action.type,
  },
});
```

| Поле                              | Назначение                                                                |
| --------------------------------- | ------------------------------------------------------------------------- |
| `config`                          | граф `{ [state]: { [eventType]: target } }`; `"*"` — fallback transitions |
| `initialState` · `initialContext` | стартовое `state` / `context`                                             |
| `reducer?`                        | собирает следующее `{ state, context }`                                   |
| `effects?`                        | sync/async side-effects по target state или `"*"`                         |
| `hydrate?` · `dehydrate?`         | кастомная форма snapshot; дефолт — `{ state, context }`                   |
| `groupTag?`                       | actor template only — tag группы                                          |
| `persistence?`                    | actor template only — `"runtime"` (default) или `"snapshot"`              |

Для domain-машины custom `dehydrate` / `hydrate` задают transport shape этой машины; `MachineManager.dehydrate()`, `hydrate()` и `getHydratedState()` используют именно эту форму, а не дефолтный `{ state, context }`.

### Targets

| Target                                            | Поведение                                                             |
| ------------------------------------------------- | --------------------------------------------------------------------- |
| `"next"`                                          | переход в `"next"`                                                    |
| `null`                                            | self-transition (state не меняется, action дойдёт до reducer/effects) |
| `undefined` / нет ключа                           | action игнорируется                                                   |
| `"__RESOLVED"` · `"__REJECTED"` · `"__CANCELLED"` | actor terminal — actor удаляется                                      |

Явный `config[state][type]` важнее `"*"`. У actor template `__INIT` не наследует `"*"`: spawn только через явный `__INIT` transition.

## Reducer

```ts
reducer: (slice, action, { nextState, config }) => ({
  state: nextState,
  context: { ...slice.context, ...action.payload },
});
```

Без `reducer` runtime делает default merge: `{ state: target ?? current, context: { ...context, ...action.payload } }`.

`undefined` из reducer-а бросает `VOID_REDUCER_ERROR`, кроме случая, когда подключён `immerMiddleware` или middleware с маркером `__liteFsmAllowVoidReducer`.

## Effects

```ts
effects: {
  saving: async ({ action, transition, condition, api }) => {
    await api.save(action.payload);
    await condition((e) => e.type === "ACK");
    transition({ type: "DONE" });
  },
  "*": ({ action }) => void action.type,
}
```

Effect получает один объект:

| Ключ                   | Что даёт                                                                |
| ---------------------- | ----------------------------------------------------------------------- |
| `action`               | action, прошедший middleware                                            |
| `transition(action)`   | dispatch нового события; action может включать routing `meta`           |
| `condition(predicate)` | promise, резолвится на ближайший matching action                        |
| `self`                 | (actor only) `{ actorId, groupId, groupTag }`                           |
| user deps              | из `defineMachine({ dependencies })` или `manager.setDependencies(...)` |
| plugin scoped deps     | `scopedDeps` добавляет invocation dep по object key; `scopedTransition` добавляет методы на `deps.transition` |

State effect приоритетнее `"*"`. Wildcard срабатывает и на self-transition. Ошибки и reject из `condition` уходят в `onError`.

## Factories

`createMachine`, `createConfig`, `createReducer` и `createActorMeta` — typed helpers: runtime-поведение не меняют, только фиксируют и сужают типы. `createEffect` — runtime wrapper: он оборачивает effect guard-ом для политики запуска.

| Factory                                      | Назначение                                                     |
| -------------------------------------------- | -------------------------------------------------------------- |
| `createMachine(cfg)`                         | полный machine config                                          |
| `createConfig(cfg)`                          | только граф переходов                                          |
| `createReducer(fn)`                          | reducer с фиксированным action union                           |
| `createActorMeta(meta)`                      | frozen `Readonly<ActorMeta>` для replacement/time-travel input |
| `definePlugin().create(definition)`          | объявляет marked plugin value для `MachineManager`; plugin sections подключаются через normalized registry |
| `defineStorageRuntime<Extension>().create(definition)` | объявляет opaque storage definition для `definePlugin().create({ storage: [...] })` |
| `createEffect({ effect, type?, cancelFn? })` | возвращает effect с guard-ом для политики запуска              |

### Plugin system

Публичный plugin объявляется только через `definePlugin<PluginEvents, HostEvents>().create({ name, ...sections })`. Первый generic — события, которые plugin добавляет в `manager.transition` и может эмитить через `scope.transition`. Второй generic — события host manager, которые plugin типизированно наблюдает в callbacks. Публичного callback `install` нет. `MachineManager(..., { plugins })` принимает только marked values из builder API; structural objects отклоняются runtime validation.

Типы возвращаемых values доступны из root entrypoint как `LiteFsmPlugin` и `LiteFsmStorageRuntimeDefinition`. Root entrypoint также экспортирует `ReadonlyManagerAction`, `StorageManagerContext`, `DispatchContext`, `ManagerRuntimeContext`, `PluginScopedInvocationContext`, `StorageRuntimeExtension`, `StorageTemplate` и public `Storage*Context` для portable inferred types exported plugin factories. `StorageDispatchContext` не экспортируется; `ctx.dispatch` доступен через public callback context types. Создавать structural plugin/storage values по этим типам нельзя.

`PluginEvents` добавляются к manager-level `transition` для текущего plugin tuple, но не становятся событиями машин автоматически. Если машина обрабатывает plugin event, включите его явно: `type AppEvents = HostEvents | PluginManagerEvents<AppPlugins>`. `HostEvents` используются только для contextual typing внутри plugin definition и не входят в `PluginManagerEvents<Plugins>`. Если второй generic не указан, поля action в callbacks наблюдения (`ctx.action`, `ctx.originalAction`, `routeMeta` `ctx.action`, `scope.event`) типизируются как `ReadonlyManagerAction<AnyEvent>`; `definePlugin<PluginEvents>()` по-прежнему добавляет в `PluginManagerEvents<Plugins>` только `PluginEvents`.

Storage-specific machine typing подключается через app wrapper `TypedCreateMachineFn<P, D, typeof plugins>`. Plugin tuple не расширяет `P` и `D` автоматически: добавьте `PluginManagerEvents<typeof plugins>` и `EffectDeps<AppDeps, typeof plugins>` явно. Прямой `createMachine<AppEvents>(...)` остается core-only API и не принимает custom storage kinds.

Все plugin keys находятся в плоском namespace: `routeMeta.cacheKey` означает `action.meta.cacheKey`, `manager.cache` — `manager.cache`, `scopedDeps.trace` — `deps.trace`, `scopedTransition.refresh` — `deps.transition.refresh`. Core не добавляет prefix; plugin author и integrator отвечают за уникальные keys, особенно в multi-instance factories. Дубликаты route meta, manager, scoped deps, scoped transition и storage kind являются hard error; diagnostics указывают section, key и обоих владельцев.

`routeMeta` объявляет routing contract, а не пользовательские данные. Ключ section становится action meta key; используйте scalar keys вроде `entityId`, `cacheKey`, `documentId`, `tenantId`. Reserved route/sender keys запрещены. Resolver возвращает `string | readonly string[]`; runtime не проверяет тип входного `value`, но проверяет результат resolver. `dispatch.route` остается single constraint: один action может содержать только один active routing key из `actorId`, registered plugin route keys, `groupId`, `groupTag`. Несколько routing keys бросают `LITE_FSM_AMBIGUOUS_ROUTE_META`; для fanout отправляйте отдельные `manager.transition(...)` или unscoped domain event. `PluginRouteMeta<PluginUnion>` возвращает raw map значений, а optional semantics относятся к `manager.transition(...).meta`.

`manager` объявляет manager extensions. Ключ section становится полем returned manager, тип поля равен return type factory. Runtime DSL остается прежним: `definePlugin().create({ manager: { key(ctx) { ... } } })`. Factory получает `ManagerRuntimeContext<PluginEvents, S = MachineStore>`: `ctx.transition(...)` принимает события plugin, а не `HostEvents`, `ctx.config` имеет тип текущего store `S`, `ctx.getState()` возвращает `MachinesState<S>`. Generic factory может вернуть extension, зависящий от `MachineStore`, без дополнительных runtime callbacks. Factory вызывается один раз при создании manager после compile templates, runtime state и initial public state.

`intercept(ctx)` выполняется после storage `prepareAction`, в plugin order и до reducer delivery. Context содержит `action`, `originalAction`, `skipDelivery`, `options`, `runtime` и `reportError(error)`. Возврат `{}` является no-op; `{ action }` заменяет committed action и пересчитывает route; `{ skipDelivery: true }` пропускает delivery в machines; `{ stopInterceptors: true }` останавливает только следующие interceptors. Runtime принимает только `void` или plain object с полями `action`, `skipDelivery`, `stopInterceptors`; unknown fields и unknown result shapes бросают `LITE_FSM_INVALID_PLUGIN_CALLBACK_RESULT` с diagnostic владельца `plugin '<name>' intercept`.

`hooks` задает функции фаз `beforeReduce`, `afterReduce`, `beforeCommit`, `beforeSubscribers`, `beforeEffects`, `afterEffects`. Hooks выполняются по фазе и plugin order, видят финальный action после interceptors, не управляют replacement/skip/stop, а return value игнорируется. Вызов `manager.transition(...)` из hook запрещен и бросает `LiteFsmError` с кодом `LITE_FSM_REENTRANT_TRANSITION_FORBIDDEN`; вызовы из subscribers и effects остаются разрешены.

Guarded boundary запрещает nested `manager.transition(...)` в `plugin.intercept`, `storage.prepareAction`, `storage.beforeReduce`, `storage.acceptsEvent`, `storage.reduce`, `storage.reduceBucket`, `storage.commit`, `storage.reactions` и hook phases `hook.beforeReduce`, `hook.afterReduce`, `hook.beforeCommit`, `hook.beforeSubscribers`, `hook.beforeEffects`, `hook.afterEffects`. Ошибка guard пробрасывается из текущего `manager.transition(...)`, не вызывает `onError` автоматически и не запускает вложенный dispatch: action не проходит normalize, middleware, interceptors, reducers, subscribers или effects.

Для текущего action plugin/storage callback использует return protocol фазы и `ctx.dispatch.runtime` для staged данных. Для нового action используйте subscriber или effect, где reentrant `transition(...)` остается разрешен. Explicit scheduler/defer/enqueue API в этом релизе не добавляется.

Storage reactions выполняются после public commit и до subscribers, поэтому входят в guarded boundary: nested dispatch из `reactions.run` запрещен, чтобы subscriber текущего action не получил state, уже измененный вложенным action. Storage effects запускаются позже и сохраняют разрешенную reentrant semantics.

Ошибки из `intercept`, hooks, guarded storage callbacks и route recalculation пробрасываются из `manager.transition(...)` и не вызывают `onError` автоматически. `ctx.reportError(error)` вызывает текущий `onError` и не меняет control flow. Replacement action из plugin или storage callback валидируется до route recalculation: это должен быть object с `type: string`; `@@lite-fsm/*` запрещен и бросает `LITE_FSM_INVALID_REPLACEMENT_ACTION`. Если initial action или replacement action содержит несколько active routing keys, route recalculation бросает `LITE_FSM_AMBIGUOUS_ROUTE_META` до delivery и до вызова plugin route resolvers. Diagnostics для replacement указывают источник: `plugin '<name>' intercept`, `storage runtime '<kind>' prepareAction` или `storage runtime '<kind>' beforeReduce`.

| Plugin/storage `LiteFsmError` code | Когда |
| --- | --- |
| `LITE_FSM_REENTRANT_TRANSITION_FORBIDDEN` | `transition(...)` вызван из guarded dispatch phase |
| `LITE_FSM_AMBIGUOUS_ROUTE_META` | action или replacement action содержит несколько active routing keys |
| `LITE_FSM_INVALID_PLUGIN_CALLBACK_RESULT` | `intercept(ctx)` вернул не `void` и не plain object с публичными полями `action`, `skipDelivery`, `stopInterceptors` |
| `LITE_FSM_INVALID_STORAGE_CALLBACK_RESULT` | storage callback вернул result вне публичного protocol или `acceptsEvent(ctx)` вернул не boolean |
| `LITE_FSM_INVALID_REPLACEMENT_ACTION` | replacement action не является user action с `type: string` или использует reserved `@@lite-fsm/*` prefix |

`scopedDeps` добавляет dep только на время effect/reaction invocation: ключ section становится ключом deps, factory возвращает значение. `scopedTransition` добавляет методы к invocation `deps.transition`, сохраняя callable core `transition(action)`. При явном `HostEvents` `scope.event` типизируется как `ReadonlyManagerAction<HostEvents | PluginEvents>`, а без второго generic — как `ReadonlyManagerAction<AnyEvent>`; `scope.transition(...)` принимает только `ManagerAction<PluginEvents>`. `EffectDeps<AppDeps, Plugins>` добавляет эти scoped deps/methods к app deps.

`defineStorageRuntime<Extension>().create(...)` объявляет advanced storage definition для plugin section `storage: [definition]`. `Extension` описывает machine-facing поля `input`, `internalEvents`, `reducerContext`, `effectDeps`, `reactionDeps`, `resultMetadata`, `publicState` и runtime-only поля `runtimeState`, `templateData`, `snapshotData`, `invocation`, `identity`, `observedEvents`, `routeMeta`. Builder добавляет storage kind из literal `kind`; machine-facing поля становятся доступны только через `TypedCreateMachineFn<P, D, typeof plugins>` после подключения storage definition в `definePlugin().create({ storage: [...] })`.

Machine-facing поля `resultMetadata`, `reducerContext`, `effectDeps`, `reactionDeps` и `publicState` могут быть fixed object types или dependent type-only function signatures от concrete storage input. `input` и `internalEvents` остаются fixed fields. Dependent signatures не создаются и не вызываются в runtime; TypeScript использует их для `MachineResultMetadata<M>`, `MachinesState<S>`, reducer meta и effect/reaction deps.

`compileTemplate(ctx)` возвращает только `void | { data?: TemplateData }`; `key` и `kind` формируются builder-ом. Primitive, `null`, arrays, `key`, `kind` и unknown fields бросают `LITE_FSM_INVALID_STORAGE_CALLBACK_RESULT` с diagnostic `storage runtime '<kind>' compileTemplate`. `routeMetaKeys` — runtime dependency от action meta keys. Если `Extension["routeMeta"]` задан, TypeScript ограничивает `routeMetaKeys` его строковыми ключами и `definePlugin().create(...)` проверяет наличие совместимых `routeMeta` resolvers у plugin. Runtime не валидирует raw route meta values; resolver вызывается только когда его key является единственным active routing key текущего action. `snapshot.dehydrate(ctx)` возвращает `{ machines?, snapshot? }`: `snapshot` попадает в top-level `MachineManagerSnapshot.storage[kind]`. `snapshot.hydrate(ctx)` получает `ctx.machines` и `ctx.snapshot`.

Action stages используют strict object result protocol: `prepareAction(ctx)` и `beforeReduce(ctx)` возвращают `void | { type: "replace"; action } | { type: "drop" }`. `prepareAction` выполняется до middleware, `beforeReduce` — после middleware и до interceptors. Reduce stages возвращают только `void | { type: "skip" }`: `void` помечает runtime touched, `{ type: "skip" }` не запускает `commit`, `reactions` и `effects` для этого runtime. `acceptsEvent(ctx)` должен вернуть строго boolean. Unknown fields и unknown result shapes бросают `LITE_FSM_INVALID_STORAGE_CALLBACK_RESULT` с diagnostic `storage runtime '<kind>' <phase>`.

По умолчанию `reduceScope` равен `"template"`: runtime объявляет `acceptsEvent(ctx)` и `reduce(ctx)`. Для `reduceScope: "bucket"` runtime объявляет только `reduceBucket(ctx)` и получает все templates bucket в `ctx.templates`; `acceptsEvent` и `reduce` в этом режиме запрещены. В template scope запрещен `reduceBucket`.

Action читается как `ctx.action`, исходный action — как `ctx.originalAction`. Если `Extension["observedEvents"]` задан, storage callbacks, которые получают action, используют `ReadonlyManagerAction<Extension["observedEvents"]>`; иначе используется `ReadonlyManagerAction<AnyEvent>`. Этот тип запрещает мутацию `type`, `meta`, arrays/tuples и вложенных полей `payload`; runtime не обещает deep freeze. `ctx.manager` имеет public тип `StorageManagerContext<Extension["observedEvents"]>` без `routing`, `createScopedDeps`, `config`, `options` и `schemaVersion`. В `ctx.dispatch` только `nextState` является заменяемым root accumulator; `runtime` является mutable `Map` для per-dispatch данных. `options`, `route`, `prevState` и `skipDelivery` доступны только для чтения, action stage fields не раскрываются. Методы storage runtime пишутся inline с contextual typing; named context-type imports нужны только для exported helper/factory signatures. `effectDeps` и `reactionDeps` в extension являются type contract. Дубликат `kind` внутри одного plugin считается `LITE_FSM_INVALID_PLUGIN_DEFINITION`; дубликат между plugins или с internal preset — `LITE_FSM_DUPLICATE_STORAGE_KIND`.

Configurable и multi-instance plugins объявляйте обычными factory functions вокруг `definePlugin().create(...)`; каждый экземпляр должен иметь уникальный `name` и уникальные exposed keys.

### `createEffect`

```ts
const load = createEffect({
  type: "latest",
  cancelFn:
    ({ signal }) =>
    () =>
      signal.aborted,
  effect: async ({ transition }) => transition({ type: "DONE" }),
});
```

| Опция                     | Поведение                                                                                           |
| ------------------------- | --------------------------------------------------------------------------------------------------- |
| `type: "every"` (default) | каждый запуск получает рабочий `transition`                                                         |
| `type: "latest"`          | новый запуск делает предыдущие запуски stale; их `transition` возвращает action без dispatch        |
| `cancelFn(deps)`          | возвращает `cancel(): boolean`; `true` подавляет `transition`, но не отменяет async-работу effect-а |

`createEffect` не отменяет promise, request или timer внутри effect-а. Он контролирует только возможность отправить новое событие через `transition`. В actor effect guard покрывает и callable `transition`, и `transition.unscoped/actor/group/tag`.

## `Machine(cfg)` — pure machine

Низкоуровневая фабрика без state, middleware, подписок.

```ts
const machine = Machine(counter);
const next = machine.transition({ state: "idle", context: { count: 0 } }, { type: "INC" });
await machine.invokeEffect("idle", next.state, deps);
```

| Метод                               | Что делает                      |
| ----------------------------------- | ------------------------------- |
| `config`                            | ссылка на `cfg.config`          |
| `transition(slice, action)`         | следующее `{ state, context }`  |
| `invokeEffect(prev, current, deps)` | вызывает state effect или `"*"` |

Actor templates standalone не работают — только в `MachineManager`.
Standalone `Machine(...)` поддерживает отсутствие `storage` и явное `storage: "instance"`; другие значения отклоняются на init.

## `defineMachine(opts?).create(cfg)` — standalone stateful

```ts
const machine = defineMachine<AppEvent, Deps>({ dependencies, onError }).create(counter);

machine.transition({ type: "INC" });
machine.getState();
const off = machine.onTransition((prev, next, action) => {});
machine.addMiddleware(immerMiddleware);
```

| Метод                  | Что делает                                                         |
| ---------------------- | ------------------------------------------------------------------ |
| `getState()`           | текущее `{ state, context }`                                       |
| `transition(action)`   | middleware → reducer → subscribers → effects                       |
| `onTransition(cb)`     | подписка `(prev, current, action) => void`; возвращает unsubscribe |
| `addMiddleware(...mw)` | добавляет middleware в конец цепочки                               |

`defineMachine` фиксирует `P`, `D`, `opts` один раз; каждый `.create(cfg)` возвращает независимую машину. Standalone `.create(cfg)` поддерживает только отсутствие `storage` и `storage: "instance"`.

## `MachineManager(machines, opts?)`

```ts
const manager = MachineManager(
  { counter, todos, syncActor },
  {
    middleware: [immerMiddleware, devToolsMiddleware()],
    plugins: [plugin],
    schemaVersion: 1,
    snapshot: initialSnapshot,
    onError: console.error,
  },
);

manager.setDependencies({ api });
manager.transition({ type: "INC" });
```

| Опция                      | Назначение                                                                                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `middleware?`              | цепочка middleware на все user actions                                                                                                                                               |
| `plugins?`                 | tuple values из `definePlugin().create(...)`; включает plugin events, optional route meta и manager extensions текущего tuple                                      |
| `snapshot?`                | начальный snapshot, применяется со strategy `"replace"`                                                                                                                              |
| `schemaVersion?`           | версия snapshot                                                                                                                                                                      |
| `onError?`                 | ошибки effects / `condition`                                                                                                                                                         |
| `onUnknownMachineKey?`     | unknown key в `hydrate` или initial snapshot                                                                                                                                         |
| `onSchemaVersionMismatch?` | mismatch `snapshot.schemaVersion`                                                                                                                                                    |
| `originId?`                | префикс владельца, добавляется ко всем created id (`originId#templateKey/counter`); строка без `#` (P2P / multi-tab / шарды)                                                         |
| `generateActorId?`         | `(ctx: SpawnIdContext<P>) => string` — кастомный actor id; counter в ctx инкрементируется всегда                                                                                     |
| `generateGroupId?`         | то же для groupId (применяется только при unscoped spawn)                                                                                                                            |

| Метод                               | Назначение                                                               |
| ----------------------------------- | ------------------------------------------------------------------------ |
| `getState()`                        | текущее состояние менеджера                                              |
| `transition(action)`                | dispatch user action; возвращает фактически применённый action           |
| `onTransition(cb)`                  | `(prev, current, action) => void`                                        |
| `setDependencies(deps \| updater)`  | задаёт user deps для effects                                             |
| `replaceReducer(enhancer)`          | подменяет root reducer (вызывается из middleware)                        |
| `getSnapshot()`                     | runtime snapshot `{ schemaVersion, machines }` без hooks и `storage`     |
| `dehydrate(opts?)`                  | snapshot с machine hooks и `snapshot.storage[kind]` для storage runtimes |
| `hydrate(snapshot, opts?)`          | применяет снимок без middleware/effects                                  |
| `getHydratedState(snapshot, opts?)` | предварительный результат `hydrate` без изменения менеджера              |

Тип `deps` для `setDependencies` выводится из `MachineConfig` / `TypedCreateMachineFn<P, D, typeof plugins>` и из signatures `effects`; runtime deps (`action`, `transition`, `condition`, `self`) в user deps не входят.

Action идёт во все доменные автоматы; автомат без подходящего transition остаётся без изменений (селекторы не дёргаются). Префикс `@@lite-fsm/*` зарезервирован — отправлять через `transition` нельзя.

## Hydration

```ts
const snapshot = manager.dehydrate({ machines: ["counter"], storage: ["custom"] });
manager.hydrate(snapshot, { strategy: "merge" });

const preview = manager.getHydratedState(snapshot, {
  strategy: "replace",
  baseState: manager.getState(),
});
```

`dehydrate()` типизирует все машины, которые участвуют в снимке, как обязательные. `dehydrate({ machines: ["counter"] })` делает обязательными только выбранные literal keys; dynamic array остаётся partial envelope для безопасности. `storage` filter независим от `machines`: `dehydrate({ machines })` не отключает storage payloads, `dehydrate({ storage: [] })` отключает их явно, `dehydrate({ storage: [kind] })` выбирает только указанные storage runtimes. `getSnapshot()` не вызывает storage `dehydrate` и не добавляет `storage`.

| API                  | Hooks       | Mutates | Subscribers          | Effects |
| -------------------- | ----------- | ------- | -------------------- | ------- |
| `getSnapshot()`      | —           | —       | —                    | —       |
| `dehydrate()`        | `dehydrate` | —       | —                    | —       |
| `getHydratedState()` | `hydrate`   | —       | —                    | —       |
| `hydrate()`          | `hydrate`   | да      | `@@lite-fsm/HYDRATE` | —       |

`strategy` не выполняет глубокое объединение поля `context` и не заменяет всё состояние менеджера. В обоих режимах `hydrate()` рассматривает только ключи из `snapshot.machines`; отсутствующие доменные машины остаются как есть. `snapshot.storage[kind]` передается только runtime, который зарегистрировал этот `kind`; неизвестный kind или runtime без snapshot capability бросает ошибку.

| Strategy    | Поведение                                                                                                                                                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `"merge"`   | частичное наложение: ключи доменных машин из снимка применяются; акторы, сохраняемые в снимок, вне входящего набора записей остаются                                                                                            |
| `"replace"` | полный набор записей акторов: ключи доменных машин из снимка применяются; акторы, сохраняемые в снимок, но отсутствующие во входящем наборе записей, удаляются; для доменных машин семантику замены задаёт обработчик `hydrate` |

Domain hooks:

```ts
const profile = createMachine({
  config: { ready: {} },
  initialState: "ready",
  initialContext: { user: null },
  dehydrate: (slice) => slice.context.user,
  hydrate: (prev, user) => (prev.context.user === user ? prev : { state: prev.state, context: { user } }),
});
```

Unknown machine keys пропускаются: в DEV — warning + `onUnknownMachineKey`. `schemaVersion` миграцию не делает, только триггерит `onSchemaVersionMismatch`. Snapshot объекты считайте immutable; hooks делайте идемпотентными и возвращайте `prev`, если данные те же.

## Persist

`@lite-fsm/persist` — опциональный слой поверх `MachineManager.dehydrate()`, `hydrate()` и `onTransition()`. Core entrypoint его не импортирует.

```ts
const storage = createJsonStorage<AppStore>({
  key: "app:fsm",
  storage: () => window.localStorage,
});

const persist = persistManager(manager, {
  storage,
  storageVersion: 1,
  machines: ["profile"],
  throttleMs: 500,
  migrate: (record) => migrateSnapshot(record),
  onRestoreSettled: (result) => {
    // result.phase === "ready" | "error"
  },
  onError: console.error,
});

const stop = persist.start();
await persist.flush();
stop();
```

| API                                   | Что делает                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `persistManager(manager, opts)`       | создаёт controller для restore/save/clear и подписки на manager/storage                           |
| `createJsonStorage({ key, storage })` | адаптер для `localStorage` / `sessionStorage`-совместимых JSON-хранилищ; `storage` — lazy factory |
| `controller.start()`                  | ref-counted start; запускает background restore и подписки                                        |
| `controller.restore()`                | читает запись, валидирует envelope persist-слоя и вызывает `manager.hydrate`                      |
| `controller.save()`                   | сразу пишет `manager.dehydrate({ machines })`                                                     |
| `controller.flush()`                  | немедленно пишет отложенный throttled save                                                        |
| `controller.clear()`                  | отменяет pending save, удаляет storage record и сбрасывает status                                 |
| `controller.getStatus()`              | текущий `{ phase }` snapshot                                                                      |
| `controller.subscribeStatus(cb)`      | подписка на смену status                                                                          |

`createJsonStorage` принимает только `storage: () => { getItem; setItem; removeItem }`. Factory не вызывается при создании adapter-а, вызывается заново на каждом `get`, `set`, `remove` и не кешируется; `subscribe` добавляйте вручную через `PersistStorage`. `persistManager` не проверяет browser/server environment.

`start()` не блокирует SSR/hydration. Пока restore в процессе, user transitions не пишутся сразу; если live state изменился во время restore, controller после restore сохраняет финальное состояние. `@@lite-fsm/HYDRATE` сам по себе save не планирует, а restore из `storage.subscribe()` не делает echo-save без live изменений.

| Опция               | Назначение                                                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `storage`           | `{ get, set, remove, subscribe? }`                                                                                         |
| `machines?`         | те же snapshot-eligible keys, что в `dehydrate({ machines })`                                                              |
| `strategy?`         | стратегия для `hydrate`, по умолчанию `"merge"`; не глубокое объединение `context` и не замена всего состояния менеджера   |
| `storageVersion?`   | версия persist record; mismatch без `migrate` удаляет record. `undefined` vs определённое значение тоже считается mismatch |
| `maxAge?`           | TTL в миллисекундах; expired record удаляется                                                                              |
| `throttleMs?`       | coalescing для saves; default `0`, для browser storage обычно `300-1000`                                                   |
| `shouldSave?`       | фильтр manager transitions перед save                                                                                      |
| `migrate?`          | конвертация старого `PersistedRecord` в текущий `MachineManagerSnapshot`                                                   |
| `onRestoreSettled?` | вызывается из restore-пути с `{ phase: "ready"; restored }` или `{ phase: "error"; error }`                                |
| `onError?`          | `(err, "restore" \| "save" \| "clear") => void`                                                                            |

`restore()` удаляет invalid, expired и несовместимые records. `onRestoreSettled` вызывается и при успешном завершении restore, и при restore error; `clear()` его не вызывает. Background restore/save из `start()` проглатывают ошибки после `onError` и status update; прямые `await restore/save/flush/clear` пробрасывают ошибки.

## Actor templates

Машина становится actor template, если в `config` есть literal `__INIT`.

```ts
const request = createMachine({
  groupTag: "request",
  config: {
    __INIT: { START: "pending" },
    pending: { RESOLVE: "__RESOLVED", FAIL: "__REJECTED" },
  },
  initialState: "__INIT",
  initialContext: { id: "" },
});
```

| Правило           | Значение                                                  |
| ----------------- | --------------------------------------------------------- |
| `initialState`    | всегда `"__INIT"`                                         |
| spawn             | action должен match-ить `__INIT` transition               |
| public record     | `state.requests[actorId] = { state, context, meta }`      |
| terminal targets  | `__RESOLVED` · `__REJECTED` · `__CANCELLED` удаляют actor |
| доменные автоматы | получают action независимо от actor routing               |
| standalone        | actor templates работают только в `MachineManager`        |

### Routing

```ts
manager.transition({ type: "RESOLVE", meta: { actorId: "request/0" } });
manager.transition({ type: "FAIL", meta: { groupId: "request/0" } });
manager.transition({ type: "CANCEL", meta: { groupTag: "request" } });
```

Каждый dispatch принимает один active route key. `actorId`, `groupId` и `groupTag` принимают `string | string[]`; если указать несколько routing keys, runtime бросит `LITE_FSM_AMBIGUOUS_ROUTE_META`.

Actor effect получает `self` и actor-aware dispatch:

```ts
effects: {
  pending: ({ self, transition }) => {
    transition.actor(self.actorId, { type: "RESOLVE" });
    transition.group(self.groupId, { type: "PING" });
    transition.tag(self.groupTag,   { type: "BROADCAST" });
    transition.unscoped({ type: "GLOBAL_DONE" });
  },
}
```

Action из actor effect без явного routing остаётся в своей группе. `transition.unscoped(...)` снимает routing.

### Distributed spawn

```ts
const alice = MachineManager({ likeSync }, { originId: "alice" });
const bob = MachineManager({ likeSync }, { originId: "bob" });

bob.hydrate(alice.dehydrate(), { strategy: "merge" });
// keys: ["alice#likeSync/0", "bob#likeSync/0"]
```

| Сценарий                | Что задать                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------ |
| Дефолт                  | `templateKey/0` · `templateKey/1`                                                    |
| Один `originId`         | `originId#templateKey/0`                                                             |
| `generateActorId` задан | возвращаемое значение генератора (collision → `LITE_FSM_INVALID_GENERATED_ID`)       |
| Доменный id из payload  | `generateActorId: ({ originId, action }) => `${originId}#user/${action.payload.id}`` |

`generateActorId` получает `{ templateKey, groupTag, counter, originId, action }`. Чтобы counter после `hydrate` восстанавливался, держите хвост id как `.../N`; UUID-хвост — counter не двигается, collision все равно блокируется через `isTaken`.

| Error code                      | Когда                                                        |
| ------------------------------- | ------------------------------------------------------------ |
| `LITE_FSM_INVALID_OPTIONS`      | `originId` пустой или содержит `#`                           |
| `LITE_FSM_INVALID_GENERATED_ID` | generator вернул не-строку, пустую строку или уже занятый id |

### Persistence

По умолчанию actors живут только в runtime: `dehydrate()` их пропускает, `hydrate()` пропускает входящий actor key. Чтобы actors попали в snapshot — `persistence: "snapshot"`:

```ts
const request = createMachine({
  persistence: "snapshot",
  groupTag: "request",
  config: { __INIT: { START: "pending" }, pending: { DONE: "__RESOLVED" } },
  initialState: "__INIT",
  initialContext: { id: "" },
});
```

Без hooks актор, сохраняемый в снимок, использует дефолтный payload `{ state, context }`. Кастомные actor snapshot hooks видят пользовательский фрагмент данных `{ state, context }`, payload snapshot и meta `hydrate` со стратегией. `actorId`, `groupId` и `groupTag` сохраняет и восстанавливает `MachineManager` рядом с записью актора в снимке.

## Middleware

```ts
const logger: Middleware<AppState, AppEvent> = (api) => (next) => (action) => {
  const result = next(action);
  void api.getState();
  void action;
  return result;
};
```

| `MiddlewareApi`            | Что даёт                       |
| -------------------------- | ------------------------------ |
| `getState()`               | текущий state                  |
| `transition(action)`       | дёрнуть всю цепочку middleware |
| `replaceReducer(enhancer)` | обернуть root reducer          |
| `onTransition(cb)`         | подписка из middleware         |
| `condition(predicate)`     | дождаться matching action      |

Правила:

- порядок pre-next = порядок регистрации, post-next — обратный (как в Redux);
- код до `next(action)` видит prev state, код после — committed state и уже отработавших subscribers;
- effects запускаются после возврата всей middleware-цепочки;
- чтобы заблокировать action — не вызывать `next(action)`;
- чтобы изменить — вызвать `next(modifiedAction)`;
- `transition` возвращает action, дошедший до reducer-а;
- `condition(predicate)` обслуживается дефолтным storage (`"instance"`); plugin storage может объявить собственный `effects.condition`, но публичный `MiddlewareApi.condition` его не вызывает.

### `immerMiddleware`

```ts
MachineManager({ counter }, { middleware: [immerMiddleware] });
```

Оборачивает root reducer в `produce(...)`: можно мутировать draft и не возвращать ничего. Если reducer всё-таки вернул объект, top-level поля копируются в draft, неизменённые вложенные объекты сохраняют ссылки. Несёт маркер `__liteFsmAllowVoidReducer === true` — core разрешает `void` reducer.

### `devToolsMiddleware(options?)`

```ts
MachineManager({ counter }, { middleware: [devToolsMiddleware({ blacklistActions: ["TICK"] })] });
```

| Опция                         | Значение                                         |
| ----------------------------- | ------------------------------------------------ |
| `blacklistActions?: string[]` | action types, не отправляющиеся в Redux DevTools |

Без `window.__REDUX_DEVTOOLS_EXTENSION__` — pass-through. С extension: `connect` → `init` → `send` на каждый user action и `@@lite-fsm/HYDRATE`; `JUMP_TO_ACTION` / `ROLLBACK` восстанавливают state через `replaceReducer`.

## React

```tsx
type Store = { counter: typeof counter };
const manager = MachineManager({ counter });

function App() {
  return (
    <FSMContextProvider machineManager={manager}>
      <Counter />
    </FSMContextProvider>
  );
}

function Counter() {
  const count = useSelector<Store, number>((s) => s.counter.context.count);
  const transition = useTransition<AppEvent>();
  return <button onClick={() => transition({ type: "INC" })}>{count}</button>;
}
```

| API                                        | Назначение                                                                                    |
| ------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `FSMContextProvider`                       | кладёт manager в context; фиксирует `getServerSnapshot` для SSR/hydration                     |
| `useManager<S, P>()`                       | manager из context                                                                            |
| `useTransition<P>()`                       | `manager.transition`                                                                          |
| `useSelector<S, R>(selector, equalityFn?)` | `useSyncExternalStoreWithSelector`-обёртка; default equality — `===`                          |
| `FSMHydrationBoundary`                     | preview snapshot уже на render + apply в layout effect; может dispatch post-hydration actions |
| `useHydrateSnapshot(snapshot, opts?)`      | apply snapshot в layout effect, без preview                                                   |
| `defineMachine`                            | standalone machine как hook                                                                   |

`FSMContextProvider` принимает `getServerSnapshot?: () => MachinesState<S>` и `persist?: readonly { start(): () => void }[]`. Без `getServerSnapshot` он кеширует `machineManager.getState()` для текущего менеджера при первой отрисовке. Это состояние корня для React `useSyncExternalStore`, а не envelope `MachineManagerSnapshot`.

`persist` — массив structural lifecycle entries: provider вызывает `start()` для каждого entry в `useEffect`, а cleanup вызывает возвращённые stop-функции. Entry с `getStatus()` и `subscribeStatus()` попадает в массив статусов для `@lite-fsm/persist/react`; lifecycle-only entry представлен как `null`. `@lite-fsm/react` не зависит от `@lite-fsm/persist`, поэтому туда можно передать любой совместимый controller.

```tsx
import { useIsPersistRestoring, usePersistStatuses } from "@lite-fsm/persist/react";

function PersistBadge() {
  const [status] = usePersistStatuses();
  const restoring = useIsPersistRestoring();
  return <span>{restoring ? "restoring" : (status?.phase ?? "none")}</span>;
}
```

`usePersistStatuses()` возвращает массив той же длины и в том же порядке, что `FSMContextProvider.persist`. Если provider есть, но `persist` не передан или равен `[]`, возвращается `[]`. `useIsPersistRestoring()` возвращает `true`, когда хотя бы один non-null status имеет `phase === "restoring"`. Для UI, который должен скрывать данные до завершения первого restore, проверяйте `status?.phase === "idle" || status?.phase === "restoring"`.

Внутри `FSMHydrationBoundary` selector читает render overlay; для SSR/hydration ближайший boundary server snapshot имеет приоритет над Provider snapshot. `useManager().getState()` в render всегда читает live manager и не участвует в SSR-safe overlay contract.

### Hydration в React

```tsx
<FSMHydrationBoundary snapshot={snapshot} strategy="merge">
  <Page />
</FSMHydrationBoundary>

<FSMHydrationBoundary snapshot={snapshot} transitionAfterHydrate={{ type: "CHECK_ONBOARDING" }}>
  <Page />
</FSMHydrationBoundary>
```

| Когда                                                                      | API                    |
| -------------------------------------------------------------------------- | ---------------------- |
| snapshot должен быть виден subtree уже на первом render (SSR/RSC/Suspense) | `FSMHydrationBoundary` |
| только применить snapshot после mount                                      | `useHydrateSnapshot`   |

`FSMHydrationBoundary` держит отдельный server snapshot overlay, поэтому delayed RSC/Suspense descendants во время hydration видят тот же snapshot даже если boundary уже сделал layout-effect commit, а live manager успел измениться.

`transitionAfterHydrate?: ManagerAction<P> | readonly ManagerAction<P>[]` выполняется только на клиенте после commit snapshot-а в live manager. Plain actions сериализуются через RSC, поэтому их можно передавать из server component без client wrapper. Повтор с тем же `snapshot + strategy + transitionAfterHydrate` не dispatch-ится повторно под StrictMode.

Не вкладывайте boundaries с разным snapshot на один и тот же machine key: preview идёт parent → child, а layout effect — child → parent, поэтому parent перезапишет child. Server data, загруженные ниже root layout-а, передавайте через boundary snapshot, а не через render-phase `transition()` ниже Provider-а.

### React `defineMachine`

```tsx
const useCounter = defineMachine<AppEvent>().create(counter);

function Counter() {
  const count = useCounter((s) => s.context.count);
  return <button onClick={() => useCounter.transition({ type: "INC" })}>{count}</button>;
}
```

Hook-instance совмещает методы standalone machine (`transition`, `getState`, `onTransition`, `addMiddleware`). Несколько компонентов на один hook делят один state.

## Runtime notes

| Тонкость                 | Коротко                                                               |
| ------------------------ | --------------------------------------------------------------------- |
| DEV freeze               | snapshots из `getState()` deep-frozen при `NODE_ENV !== "production"` |
| Subscribers              | sync после изменения state; unsubscribe виден на следующем dispatch   |
| Effects                  | после subscribers; ошибки идут в `onError`, machine не падает         |
| Reentrant `transition`   | разрешён из middleware/subscriber/effect, проходит обычный pipeline   |
| Self-transition (`null`) | state не меняется; default reducer мержит payload в context           |
| Wildcard                 | fallback для transitions и effects; явный state приоритетнее          |
| Empty manager            | `MachineManager({})` валиден; state = `{}`                            |
| Reserved actions         | `@@lite-fsm/*` — только для core                                      |

## Команды

| Проверка             | Команда                   |
| -------------------- | ------------------------- |
| Unit tests           | `pnpm run test`           |
| Type tests           | `pnpm run test:types`     |
| Typecheck            | `pnpm run check-types`    |
| Lint                 | `pnpm run lint`           |
| Release verification | `pnpm run verify:release` |
