# Plugin System Public API Hardening — ТЗ для реализации

## 1. Цель

Довести plugin system `@lite-fsm/core` до стабильного публичного контракта для сторонних plugins.

Работа закрывает три release blocker:

- публичные storage-типы не должны зависеть от `runtime/kernel/*` и раскрывать internal поля kernel;
- `ctx.action` и `ctx.originalAction` в plugin/storage callbacks должны быть типово immutable, а replacement должен выполняться только через return protocol;
- `manager` extensions должны типизировать `ctx.transition(...)` событиями `PluginEvents`, а не `AnyEvent`.

Breaking changes допустимы только внутри plugin/storage API и их публичных типов. Неплагиновый core API, `createMachine`, `MachineManager`, обычные FSM events, middleware order и snapshot top-level формат не входят в область breaking changes.

## 2. Как выполнять это ТЗ

### Область работ

Основные файлы:

- `packages/core/src/plugin.ts`
- `packages/core/src/pluginTypes.ts`
- `packages/core/src/pluginHelpers.ts`
- `packages/core/src/pluginStorage.ts`
- `packages/core/src/pluginStorageTypes.ts`
- `packages/core/src/runtime/kernel/storage.ts`
- `packages/core/src/runtime/kernel/routing.ts`
- `packages/core/src/runtime/kernel/bucketRuntime.ts`
- `packages/core/src/runtime/kernel/createMachineManagerFactory.ts`
- `packages/core/src/index.ts`
- `tests/core/plugin-system-*.test.ts`
- `tests/core/storage-runtime-dispatch-pipeline.test.ts`
- `tests/types/plugin-system-*.tst.ts`
- `tests/types/exports-surface.tst.ts`
- `tests/fixtures/plugin-system-documentation.ts`
- `PLUGIN-SYSTEM-CHEATSHEET.md`
- `API-CHEATSHEET.md`
- `TYPES-CHEATSHEET.md`

Дополнительные файлы можно менять только если они прямо зависят от public plugin/storage type contracts.

### Запрещенные команды

Агентам запрещено запускать сборку документации и команды, которые транзитивно ее запускают:

- `pnpm run build`
- `pnpm --filter @lite-fsm/docs build`
- `pnpm run docs:build`
- `pnpm run pages:build*`
- любые `next build` внутри `apps/docs`

Если нужна проверка docs build, передать ее пользователю. Для package build использовать `pnpm run build:packages`.

### Вне области работ

- Не менять routing priority.
- Не менять dispatch order: storage `prepareAction`, middleware, storage `beforeReduce`, interceptors, hooks, reducers, commit, subscribers, reactions, effects.
- Не добавлять scheduler/defer/enqueue API.
- Не вводить callback `install`.
- Не принимать structural plugin/storage objects.
- Не менять top-level `MachineManagerSnapshot`.
- Не типизировать storage snapshot через `MachineStore` generic.
- Не добавлять React-level plugin API.
- Не делать deep runtime freeze action/payload.

### Общие инварианты

- Public API остается небольшим и предсказуемым.
- Public `.d.ts` root entrypoint не должен требовать импорта из `@lite-fsm/core/internal/*` или `./runtime/kernel/*`.
- `HostEvents` используются только для наблюдения actions в plugin callbacks.
- `PluginEvents` являются событиями, которые plugin добавляет в `manager.transition(...)`.
- Replacement текущего action выполняется только через documented result protocol.
- Runtime validation для replacement action и callback results сохраняет существующие error codes.
- Производительность production dispatch не должна ухудшиться из-за глубокого обхода `payload`.

## 3. Целевой public API

### `ReadonlyManagerAction`

Root entrypoint `@lite-fsm/core` экспортирует:

```ts
type ReadonlyManagerAction<Events extends AnyEvent, Meta extends object = CoreActionMeta> =
  DeepReadonly<ManagerAction<Events, Meta>>;
```

`DeepReadonly` является implementation detail и не обязан экспортироваться.

Минимальная семантика `DeepReadonly`:

- primitive values и functions остаются исходным типом;
- arrays и tuples становятся readonly и применяют `DeepReadonly` к элементам;
- object properties становятся readonly и применяют `DeepReadonly` к значениям;
- union types сохраняют distributive behavior TypeScript conditional types.

`ReadonlyManagerAction` используется в contexts, где action только наблюдается:

- `DispatchContext["action"]`
- `DispatchContext["originalAction"]`
- `RouteResolverContext["action"]`
- `PluginScopedInvocationContext["event"]`
- все action-aware `Storage*Context`
- `StorageConditionContext["predicate"]` parameter

Result contracts, которые создают replacement или новый action, принимают обычный `ManagerAction<...>`, а не `ReadonlyManagerAction<...>`.

### `StorageManagerContext`

Root entrypoint `@lite-fsm/core` экспортирует:

```ts
type StorageManagerContext<Events extends AnyEvent = AnyEvent> = {
  getState(): MachinesState<MachineStore>;
  transition(action: ManagerAction<Events>, options?: unknown): ManagerAction<Events>;
  onTransition(
    cb: (
      prevState: MachinesState<MachineStore>,
      currentState: MachinesState<MachineStore>,
      action: ReadonlyManagerAction<Events> | { readonly type: string; readonly payload?: unknown },
    ) => void,
  ): () => void;
  getDependencies(): Record<string, unknown>;
};
```

Storage callbacks получают `ctx.manager: StorageManagerContext<StorageObservedEvents>`.

`StorageManagerContext` не содержит:

- `routing`
- `createScopedDeps`
- `config`
- `options`
- `schemaVersion`
- любые registry/kernel объекты

Runtime по-прежнему может использовать internal manager context с дополнительными полями. Public storage types не должны раскрывать эти поля.

### Opaque storage runtime value

`LiteFsmStorageRuntimeDefinition` остается публичным opaque value type для storage definitions.

Контракт:

- hidden payload slot в public type не должен иметь тип `StorageRuntime` из `runtime/kernel/storage`;
- public `.d.ts` для `pluginStorage.ts` не должен импортировать `runtime/kernel/*`;
- runtime accessor для hidden payload может возвращать `unknown` в public module и сужаться до internal `StorageRuntime` только внутри kernel/normalization layer;
- type-level payload для `PluginMachineExtensions<Plugins>` и `StorageRequiredRouteMetaForKeys` сохраняет текущий public inference;
- пользователи не должны видеть normalized storage runtime shape через public type aliases.

### Storage context types

`Storage*Context` остаются публичными generic aliases для exported storage helper/factory signatures.

Контракт:

- `pluginStorageTypes.ts` объявляет public context/result aliases самостоятельно.
- `pluginStorageTypes.ts` не импортирует types из `./runtime/kernel/*`.
- `ctx.dispatch` остается частью `Storage*Context`.
- `StorageDispatchContext` не экспортируется из root API.
- `StorageReduceContext<Ext>["dispatch"]` и другие context access types остаются доступными.
- `ctx.dispatch.route` типизируется self-contained structural union, совместимый с runtime route shape.
- `ctx.dispatch.nextState` остается заменяемым root accumulator.
- `ctx.dispatch.runtime` остается mutable `Map<string, unknown>`.
- `ctx.dispatch.options`, `route`, `prevState`, `skipDelivery` и `reportError` сохраняют текущий contract.
- `ctx.dispatch` не раскрывает action lifecycle fields: `action`, `originalAction`, `preparedAction`, `committedAction`, `dropped`.

### Manager extension context

`ManagerRuntimeContext` и `ManagerExtensionFactory` становятся generic по events:

```ts
type ManagerRuntimeContext<Events extends AnyEvent = AnyEvent> = {
  readonly config: MachineStore;
  readonly options: unknown;
  readonly schemaVersion: number | undefined;
  getState(): MachinesState<MachineStore>;
  transition(action: ManagerAction<Events>, options?: unknown): ManagerAction<Events>;
  onTransition(
    cb: (
      prevState: MachinesState<MachineStore>,
      currentState: MachinesState<MachineStore>,
      action: ReadonlyManagerAction<Events> | { readonly type: string; readonly payload?: unknown },
    ) => void,
  ): () => void;
  getDependencies(): Record<string, unknown>;
};

type ManagerExtensionFactory<Events extends AnyEvent = AnyEvent, Value = unknown> =
  (ctx: ManagerRuntimeContext<Events>) => Value;
```

`definePlugin<PluginEvents, HostEvents>().create({ manager })` передает в manager section `ManagerRuntimeContext<PluginEvents>`.

Следствия:

- `ctx.transition(...)` внутри `manager` extension принимает только `PluginEvents`.
- `HostEvents` не попадают в `ctx.transition(...)` manager extension.
- `definePlugin().create({ manager })` получает `PluginEvents = never`; `ctx.transition(...)` не должен принимать произвольные events.
- `PluginManagerExtensions<Plugins>` сохраняет one-generic helper shape и выводит return types manager factories.
- Публичные методы вроде `manager.cache.refresh()` должны инфериться как `ManagerAction<CacheEvent>`, а не `ManagerAction<AnyEvent>`.

## 4. Целевая архитектура

### Public type boundary

Public plugin/storage authoring types должны жить в public modules:

- `plugin.ts`
- `pluginTypes.ts`
- `pluginHelpers.ts`
- `pluginStorage.ts`
- `pluginStorageTypes.ts`

Internal runtime modules могут импортировать public types, но public modules не импортируют internal kernel types.

Допустимое направление зависимости:

```txt
runtime/kernel/* -> pluginTypes.ts / pluginStorageTypes.ts
```

Недопустимое направление зависимости:

```txt
pluginStorageTypes.ts -> runtime/kernel/*
```

Generated `packages/core/dist/*.d.ts` для root public API не должен содержать public type dependency на `runtime/kernel/*`.

### Action view для callbacks

Runtime lifecycle может хранить обычный mutable internal action reference.

Callback contexts получают readonly action view:

- в production это может быть тот же object, типизированный как readonly;
- в dev mode callback view создается как shallow copy;
- в dev mode freeze применяется только к верхнему уровню action object и к shallow copy `meta`, если `meta` есть;
- `payload` и вложенные объекты не обходятся и не замораживаются;
- объект, переданный пользователем в `manager.transition(action)`, не должен становиться frozen.
- object identity для `ctx.action` и `ctx.originalAction` не является публичным контрактом;
- callbacks могут полагаться на structural value action view, но не на `ctx.originalAction === userAction`.
- hardening распространяется на `routeMeta` resolvers, plugin `intercept`, dispatch hooks, scoped deps/scoped transition invocation contexts и storage callbacks.

Нельзя использовать `deepFreeze` для action hardening.

### Replacement protocol

Replacement текущего action допускается только через:

- plugin `intercept(ctx)` result `{ action }`;
- storage `prepareAction(ctx)` result `{ type: "replace", action }`;
- storage `beforeReduce(ctx)` result `{ type: "replace", action }`.

In-place mutation `ctx.action.type`, `ctx.action.meta` или вложенных полей action не является поддерживаемым contract. Type tests должны запрещать такую мутацию.

Dev runtime hardening должен ловить мутацию верхнего уровня action/meta в callbacks. Production не обязан бросать runtime error для нарушения readonly contract.

## 5. Этапы реализации

### Этап 1 — Foundation public types и boundary audit

#### Цель

Ввести общие public type helpers и зафиксировать границу между public authoring types и internal kernel types.

#### Зависит от

Нет.

#### Контракт этапа

- Добавить `ReadonlyManagerAction<Events, Meta = CoreActionMeta>` в public type surface.
- Добавить internal `DeepReadonly` helper без root export.
- Подготовить generic форму `ManagerRuntimeContext<Events = AnyEvent>` и `ManagerExtensionFactory<Events = AnyEvent, Value = unknown>` без изменения runtime behavior.
- Подготовить opaque hidden payload type для `LiteFsmStorageRuntimeDefinition`, чтобы `pluginStorage.d.ts` не импортировал `runtime/kernel/*`.
- Ввести self-contained public route union для `ctx.dispatch.route` в `pluginStorageTypes.ts`.
- Ввести local public-shape dispatch alias в `pluginStorageTypes.ts`, не экспортируя `StorageDispatchContext` из root API.
- Сохранить существующие root exports, кроме добавления явно перечисленных новых типов.
- Добавить type-level audit, что `StorageDispatchContext` не импортируется из `@lite-fsm/core`.
- Добавить source/dist audit expectations для отсутствия public imports из `runtime/kernel/*` в `pluginStorage.ts` и `pluginStorageTypes.ts`.

#### Не делать в этом этапе

- Не переписывать storage runtime contexts полностью.
- Не менять runtime dispatch behavior.
- Не менять docs/cheatsheets.
- Не добавлять runtime freeze.

#### Тесты этапа

- Обновить `tests/types/exports-surface.tst.ts` для `ReadonlyManagerAction`.
- Проверить, что `import("@lite-fsm/core").StorageDispatchContext` остается type error.
- Проверить, что `LiteFsmStorageRuntimeDefinition` остается assignable для storage definitions без раскрытия internal payload type.
- Добавить type assertions для `StorageReduceContext<Ext>["dispatch"]["route"]`.
- Добавить focused type test, что public storage route type не требует internal import.

#### Критерий завершения

- Focused Tstyche для измененных type tests проходит.
- `pnpm run test:types` проходит.
- `git diff --check` проходит.
- В журнале указаны оставшиеся expected audit hits, если dist еще не построен.

### Этап 2 — Storage contexts без internal kernel

#### Цель

Сделать `Storage*Context` самодостаточными public aliases и сузить `ctx.manager` до `StorageManagerContext`.

#### Зависит от

Этап 1.

#### Контракт этапа

- Удалить imports из `./runtime/kernel/storage` в `pluginStorageTypes.ts`.
- Удалить public declaration dependency на `./runtime/kernel/storage` из `pluginStorage.ts`.
- Объявить public result aliases storage callbacks в `pluginStorageTypes.ts`.
- Объявить и экспортировать `StorageManagerContext<Events = AnyEvent>`.
- Все public `Storage*Context` должны использовать `StorageManagerContext`.
- `StorageManagerContext` должен содержать только `getState`, `transition`, `onTransition`, `getDependencies`.
- `StorageManagerContext` не должен раскрывать `routing`, `createScopedDeps`, `config`, `options`, `schemaVersion`.
- Internal kernel storage types могут переиспользовать public aliases или объявлять internal superset, но не становятся public dependency.
- Runtime object может оставаться internal superset, если public typing сужает доступ.
- `ctx.dispatch` public shape сохраняет `nextState`, `runtime`, `route`, `prevState`, `skipDelivery`, `options`, `reportError`.
- Internal normalization layer остается единственным владельцем cast из opaque storage payload в internal `StorageRuntime`.

#### Не делать в этом этапе

- Не менять route resolution priority.
- Не менять shape `ctx.dispatch` во время выполнения.
- Не экспортировать `StorageDispatchContext`.
- Не менять action immutability types, кроме зависимостей на `ReadonlyManagerAction`, если они уже введены.

#### Тесты этапа

- Добавить Tstyche checks, что `StorageCreateRuntimeStateContext<Ext>["manager"]` не имеет `routing` и `createScopedDeps`.
- Добавить Tstyche checks, что `Storage*Context["manager"].transition(...)` типизируется событиями `Extension["observedEvents"]` или `AnyEvent`.
- Добавить Tstyche checks, что `Storage*Context["manager"]` не имеет `config`, `options`, `schemaVersion`.
- Обновить contextual typing tests storage runtime callbacks.
- После `pnpm run build:packages` выполнить audit generated declarations: public declaration files не должны импортировать `runtime/kernel/*` из `pluginStorageTypes`.

#### Критерий завершения

- Focused Tstyche по storage context tests проходит.
- Focused runtime tests storage pipeline проходят без behavioral changes.
- `pnpm run test:types` проходит.
- `pnpm run build:packages` проходит.
- `pnpm run test:types:dist` проходит или в журнале указан блокер.

### Этап 3 — Immutable action contract

#### Цель

Сделать action в plugin/storage callbacks типово readonly и добавить легкую dev runtime защиту без deep freeze.

#### Зависит от

Этапы 1-2.

#### Контракт этапа

- `ctx.action` и `ctx.originalAction` во всех plugin dispatch contexts используют `ReadonlyManagerAction`.
- `RouteResolverContext["action"]` использует `ReadonlyManagerAction`.
- `PluginScopedInvocationContext["event"]` использует `ReadonlyManagerAction`.
- Все action-aware `Storage*Context` используют `ReadonlyManagerAction`.
- `StorageConditionContext["predicate"]` принимает readonly action view.
- Replacement result types сохраняют `ManagerAction<Events>`.
- Route resolvers получают readonly action view и не должны видеть mutable lifecycle action.
- Scoped deps/scoped transition factories получают readonly `scope.event`.
- Dev callback action view является shallow copy.
- Dev runtime freeze применяется только к верхнему уровню action view и shallow copy `meta`.
- `payload` не замораживается.
- Исходный action object, переданный в `manager.transition(...)`, не должен становиться frozen.
- Identity action view не гарантируется: tests должны проверять structural equality, а не `toBe(userAction)`.
- Production runtime не выполняет deep/shallow freeze ради этого contract.
- Runtime route recalculation по replacement protocol сохраняется.

#### Не делать в этом этапе

- Не использовать `deepFreeze` для action.
- Не замораживать вложенный `payload`.
- Не менять callback order.
- Не менять validation rules replacement action.
- Не менять immutability state snapshots.

#### Тесты этапа

- Tstyche: запретить `ctx.action = ...`, `ctx.action.type = ...`, `ctx.action.meta = ...`, `ctx.action.meta.actorId = ...`.
- Tstyche: запретить nested mutation payload через `ReadonlyManagerAction`.
- Tstyche: replacement result принимает новый `ManagerAction`, а не требует readonly action.
- Vitest: mutation `ctx.action.type` в plugin interceptor/hook в dev mode бросает runtime error.
- Vitest: mutation `ctx.action.meta.actorId` в route/storage callback в dev mode бросает runtime error.
- Vitest: исходный object, переданный в `manager.transition(...)`, не frozen после callback.
- Vitest: existing identity expectations для `ctx.originalAction` заменены на structural equality.
- Vitest: replacement protocol продолжает обновлять route и committed action.

#### Критерий завершения

- Focused Vitest action immutability tests проходят.
- Focused Tstyche callback immutability tests проходят.
- `pnpm run test` проходит.
- `pnpm run test:types` проходит.
- `pnpm run test:coverage` проходит для измененного behavior code.

### Этап 4 — Manager extensions по `PluginEvents`

#### Цель

Убрать `AnyEvent` из основного пользовательского API manager extensions и типизировать `ctx.transition(...)` только событиями плагина.

#### Зависит от

Этапы 1 и 3.

#### Контракт этапа

- `PluginDefinitionBase["manager"]` использует `ManagerExtensionFactory<PluginEvents>`.
- `ctx.transition(...)` внутри `manager` section принимает только `ManagerAction<PluginEvents>`.
- `HostEvents` не допускаются в `ctx.transition(...)` manager extension.
- `definePlugin().create({ manager })` не получает `AnyEvent` fallback для `ctx.transition(...)`.
- `PluginManagerExtensions<Plugin>` остается one-generic helper.
- Return type methods manager extension должны сохранять inferred `ManagerAction<PluginEvents>`.
- Runtime behavior manager extension factories не меняется.
- Existing conflict diagnostics для manager keys сохраняются.

#### Не делать в этом этапе

- Не делать manager extension context параметрическим по app `MachineStore`.
- Не добавлять `HostEvents` в `PluginManagerEvents`.
- Не менять публичную форму `PluginManagerExtensions<Plugin>`.
- Не менять runtime registry.

#### Тесты этапа

- Tstyche: `ctx.transition({ type: "PLUGIN_EVENT" })` внутри manager section проходит.
- Tstyche: `ctx.transition({ type: "HOST_EVENT" })` внутри manager section является ошибкой.
- Tstyche: `ctx.transition({ type: "UNKNOWN" })` в `definePlugin().create({ manager })` является ошибкой.
- Tstyche: `manager.cache.refresh()` инферится как `ManagerAction<CacheEvent>`.
- Tstyche: `PluginManagerExtensions<typeof plugin>` отражает `ManagerAction<PluginEvents>`, не `ManagerAction<AnyEvent>`.
- Vitest: runtime manager extension behavior и duplicate manager key diagnostics сохраняются.

#### Критерий завершения

- Focused Tstyche manager extension tests проходят.
- Focused Vitest plugin manager extension tests проходят.
- `pnpm run test:types` проходит.
- `pnpm run test` проходит.

### Этап 5 — Документация и примеры

#### Цель

Обновить public cheatsheets и documentation fixtures под финальный hardening contract.

#### Зависит от

Этапы 1-4.

#### Контракт этапа

- `PLUGIN-SYSTEM-CHEATSHEET.md` описывает `ReadonlyManagerAction`, immutable callback action contract и replacement protocol.
- `PLUGIN-SYSTEM-CHEATSHEET.md` описывает `StorageManagerContext` и отсутствие `routing`/`createScopedDeps` в public storage manager.
- `PLUGIN-SYSTEM-CHEATSHEET.md` описывает, что `StorageDispatchContext` не экспортируется, но `ctx.dispatch` доступен через callback contexts.
- `API-CHEATSHEET.md` фиксирует public exports `ReadonlyManagerAction` и `StorageManagerContext`.
- `TYPES-CHEATSHEET.md` фиксирует manager extension typing по `PluginEvents`.
- Documentation fixture меняет expected `manager.cache.refresh()` return type с `ManagerAction<AnyEvent>` на `ManagerAction<CachePluginEvent>`.
- Формулировки не должны обещать runtime deep freeze.

#### Не делать в этом этапе

- Не запускать docs build.
- Не добавлять полноценную docs site page для plugins, если она не нужна для cheatsheet consistency.
- Не менять runtime behavior.

#### Тесты этапа

- Обновить `tests/fixtures/plugin-system-documentation.ts`.
- Обновить `tests/types/plugin-system-documentation.tst.ts`.
- Запустить focused Tstyche documentation fixture tests.
- Проверить `rg "ManagerAction<AnyEvent>" tests/fixtures/plugin-system-documentation.ts tests/types/plugin-system-documentation.tst.ts` на отсутствие legacy expectation для manager extension return.

#### Критерий завершения

- Documentation fixture type tests проходят.
- `pnpm run test:types` проходит.
- `git diff --check` проходит.
- Docs build не запускался; журнал фиксирует это явно.

### Этап 6 — Рефакторинг, чистка и полировка

#### Цель

Убрать временные решения и проверить, что public API hardening не оставил дублирующих владельцев type/runtime contracts.

#### Зависит от

Этапы 1-5.

#### Контракт этапа

Must fix:

- temporary helpers и transitional branches;
- stale comments про `AnyEvent` manager extensions;
- stale docs wording про read-only action без nested immutability;
- active public imports из `runtime/kernel/*`;
- hidden storage runtime payload, типизированный как internal `StorageRuntime` в public declarations;
- duplicate definitions result/context aliases между public types и kernel types, если один владелец уже очевиден;
- dead imports, unused locals, unused type aliases;
- TODO/FIXME в области работ.

Inspect only:

- декоративные переименования без снижения сложности;
- перенос runtime code между модулями без явного владельца;
- micro-optimizations без performance contract;
- изменение routing priority или dispatch order.

Expected remaining hits:

- internal imports из `@lite-fsm/core/internal/*` в tests;
- internal kernel types внутри `packages/core/src/runtime/kernel/*`;
- упоминания `runtime/kernel/*` в этом ТЗ и журнале;
- negative type tests для отсутствующих internal/public exports.

#### Не делать в этом этапе

- Не расширять scope на React, middleware, persist или graph.
- Не менять public API сверх уже реализованных contracts.
- Не переписывать cheatsheets как changelog.

#### Тесты этапа

- Focused regressions по измененным runtime contracts.
- Focused Tstyche по измененным public type contracts.
- `rg` audit по stale identifiers и forbidden public imports.
- `git diff --check`.
- `pnpm run lint`.

#### Критерий завершения

- Cleanup audit не находит active stale hits.
- Focused runtime/type regressions проходят.
- `pnpm run lint` проходит.
- `git diff --check` проходит.
- Журнал содержит expected remaining hits.

### Этап 7 — Release checks

#### Цель

Проверить source, dist declarations и release-facing type surface после hardening.

#### Зависит от

Этапы 1-6.

#### Контракт этапа

- Source tests и type tests должны пройти.
- Package dist должен быть построен через разрешенную команду.
- Dist Tstyche должен пройти.
- Public declaration audit должен подтвердить отсутствие public imports из `runtime/kernel/*` для storage authoring types.
- Docs build не запускается.

#### Не делать в этом этапе

- Не исправлять unrelated lint/test failures без отдельного решения.
- Не запускать `pnpm run build` или docs build.
- Не менять runtime behavior.

#### Тесты этапа

Обязательные команды:

- `pnpm run test`
- `pnpm run test:types`
- `pnpm run check-types`
- `pnpm run lint`
- `pnpm run test:coverage`
- `pnpm run build:packages`
- `pnpm run test:types:dist`
- `git diff --check`

Audit commands:

- `rg "runtime/kernel" packages/core/dist --glob "index.d.*" --glob "plugin.d.*" --glob "pluginTypes.d.*" --glob "pluginStorage.d.*" --glob "pluginStorageTypes.d.*" --glob "pluginHelpers.d.*"`
- `rg "ManagerAction<AnyEvent>" tests/fixtures/plugin-system-documentation.ts tests/types/plugin-system-documentation.tst.ts`

Для `rg` audit отсутствие совпадений является успешным результатом, даже если команда возвращает exit code `1`.

#### Критерий завершения

- Все обязательные команды проходят.
- Audit hits либо отсутствуют, либо записаны как expected remaining hits с обоснованием.
- Журнал содержит итоговый список проверок и статус docs build: not run by policy.

## 6. Критерий полной готовности

Работа считается готовой только если выполнены все пункты:

- `ReadonlyManagerAction` и `StorageManagerContext` экспортируются из `@lite-fsm/core`.
- `LiteFsmStorageRuntimeDefinition` остается opaque и не тянет `StorageRuntime` из `runtime/kernel/*` в public declarations.
- Public `Storage*Context` не импортируют `runtime/kernel/*` и не раскрывают kernel-only поля.
- `StorageDispatchContext` не экспортируется из root API.
- `ctx.manager` в storage callbacks не содержит `routing`, `createScopedDeps`, `config`, `options`, `schemaVersion`.
- Plugin/storage callback action contexts используют `ReadonlyManagerAction`.
- Type tests запрещают мутацию `ctx.action`, `ctx.action.meta` и nested payload.
- Dev runtime hardening использует только shallow copy + `Object.freeze` верхнего уровня action/meta.
- Исходный object пользователя из `manager.transition(action)` не замораживается.
- Callback action view не обещает object identity с user action.
- Replacement protocol остается единственным supported способом заменить текущий action.
- Manager extensions типизируют `ctx.transition(...)` только `PluginEvents`.
- `HostEvents` остаются observer-only и не попадают в `PluginManagerEvents`.
- Documentation fixture и cheatsheets описывают финальный контракт.
- `pnpm run test` проходит.
- `pnpm run test:types` проходит.
- `pnpm run check-types` проходит.
- `pnpm run lint` проходит.
- `pnpm run test:coverage` проходит.
- `pnpm run build:packages` проходит.
- `pnpm run test:types:dist` проходит.
- `git diff --check` проходит.
- Dist audit не показывает public declaration dependency на `runtime/kernel/*` в plugin/storage public type surface.
- Docs build не запускался агентом.
