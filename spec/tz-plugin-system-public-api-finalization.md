# Plugin system — ТЗ для финализации public API

## 1. Цель

Финализировать plugin system в `@lite-fsm/core` перед публичным релизом.

Целевой authoring API:

```ts
definePlugin<PluginEvents, HostEvents>().create({
  name: "plugin-name",
  routeMeta: {},
  manager: {},
  storage: [],
  scopedDeps: {},
  scopedTransition: {},
  intercept(ctx) {},
  hooks: {},
});
```

Пользователь не должен писать отдельный `PluginCapabilities`, manifest и ручной `install(ctx)`. Capabilities должны выводиться из DSL sections.

Поведение машин без plugins и существующие runtime-контракты `MachineManager` должны сохраниться. Обратная совместимость текущего public plugin authoring API не требуется.

## 2. Как выполнять это ТЗ

### Область работ

- `packages/core/src/plugin.ts`;
- `packages/core/src/createMachine.ts`;
- `packages/core/src/interfaces.ts`;
- `packages/core/src/runtime/kernel/*`;
- `packages/core/src/runtime/instance/*`;
- public exports из `packages/core/src/index.ts`;
- runtime tests в `tests/core`;
- type tests в `tests/types`;
- documentation fixture в `tests/fixtures/plugin-system-documentation.ts`, если он нужен после финального API;
- `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`, `PLUGIN-SYSTEM-CHEATSHEET.md`.

Docs pages в `apps/docs` не входят в обязательную область реализации. До финализации API они должны содержать только короткую заглушку без старого plugin API. Полная документация сайта выполняется отдельной задачей после финализации public API.

Старые user-facing материалы по plugin system удалены или заменены заглушками. Удаленный documentation fixture старого API не должен использоваться как источник требований.

### Вне области работ

- `@lite-fsm/entities`;
- React hooks для plugins;
- public custom runtime presets и API замены `defaultRuntimePreset`;
- сохранение старого `definePlugin<Capabilities>({ ... })`;
- сохранение public `install(ctx)` и `PluginInstallContext`;
- ручная аннотация plugin factories как `LiteFsmPlugin`;
- прием structural plugin-like objects в `MachineManager(..., { plugins })`;
- отдельные `createPlugin(...)`, `definePlugins(...)`, `definePluginFactory(...)`;
- standalone helpers вроде `defineScopedDeps(...)`, `defineScopedTransition(...)`;
- inline storage runtime objects без `defineStorageRuntime().create(...)`;
- app-level pre-typed helper для `definePlugin`;
- app-parametric manager extension context, зависящий от конкретного `MachineStore` или `AppEvents`;
- автоматическое добавление plugin events в `createMachine<AppEvents>(...)`;
- изменение snapshot format;
- изменение dispatch order;
- изменение routing priority;
- полная generic-типизация storage internals (`TemplateData`, `RuntimeState`, `SnapshotPayload`).

### Запрещенные команды

Агентам запрещено запускать:

- `pnpm run build`;
- `pnpm --filter @lite-fsm/docs build`;
- `pnpm run docs:build`;
- `pnpm run pages:build*`;
- любой `next build` внутри `apps/docs`.

Для package build проверки использовать `pnpm run build:packages`, если этап действительно требует build-проверки.

### Общие тестовые ожидания

- Этап `N+1` начинается только после выполнения критерия завершения этапа `N`.
- Названия `describe`, `it`, `test` писать на русском.
- Runtime-поведение покрывать Vitest.
- Public types покрывать Tstyche.
- Новый и измененный чистый код должен иметь 100% coverage по statements, branches, functions и lines.
- 100% coverage не заменяет сценарные тесты: обязательны happy path, негативные type/runtime сценарии, composition errors и регрессия поведения без plugins.
- Этапы 1-8 можно проверять focused Vitest/Tstyche suites, но этап нельзя помечать `done`, если новый или измененный чистый код не покрыт сценариями, достаточными для полного `pnpm run test:coverage`. Полный coverage gate обязательно закрывается в этапах 9-10; если он не запускался раньше, журнал должен явно фиксировать причину.
- Документация обновляется только после финализации API. На промежуточных этапах запрещено переписывать старую plugin documentation под частично готовое состояние.

### Общие ошибки конфигурации

- Локальная validation в `definePlugin().create(...)` бросает `LiteFsmError` с кодом `LITE_FSM_INVALID_PLUGIN_DEFINITION`.
- `LITE_FSM_INVALID_PLUGIN_DEFINITION` используется для неверного `name`, пустых object sections, пустой `storage` array, unknown top-level sections, неверных entry types, неверного `intercept`, неверных `hooks`, storage definitions без internal marker и пустого storage `kind`.
- `definePlugin().create({ name: "x", install() {} })` запрещен type-level для object literal и бросает `LITE_FSM_INVALID_PLUGIN_DEFINITION` при обходе типов через `unknown`, `any` или переменную.
- Начиная с этапа 3 `MachineManager(..., { plugins })` принимает только values, созданные `definePlugin().create(...)`. Structural objects без internal marker, включая legacy `{ name, install }`, бросают `LITE_FSM_INVALID_PLUGIN_DEFINITION`.
- Локальные ошибки не откладываются до `MachineManager(...)`, если они не зависят от других plugins или machines.
- Local validation проверяет форму DSL sections и entry values. Конфликты владения между plugins, core methods, app deps и runtime tuple остаются composition/runtime errors с существующими codes.
- Composition/runtime errors бросаются в `MachineManager(...)`, если зависят от runtime tuple, preset plugins или machine config.

## 3. Целевой public API

### `definePlugin`

```ts
definePlugin<
  PluginEvents extends AnyEvent = never,
  HostEvents extends AnyEvent = [PluginEvents] extends [never] ? AnyEvent : never,
>().create(definition);
```

Контракты:

- `PluginEvents` расширяет только `manager.transition(...)` после подключения plugin к manager.
- `PluginEvents` не добавляются автоматически в `createMachine<AppEvents>(...)`, reducer, effects или machine config.
- `HostEvents` используются только для contextual typing внутри plugin definition.
- `HostEvents` не расширяют `manager.transition(...)`.
- `PluginEvents` и `HostEvents` не являются runtime-фильтром callbacks. Runtime вызывает зарегистрированные callbacks по текущему dispatch lifecycle; plugin сам проверяет `ctx.action.type`, если должен игнорировать часть actions.
- `definePlugin().create(...)` типизирует наблюдаемые события как `AnyEvent`.
- `definePlugin<PluginEvents>().create(...)` типизирует наблюдаемые события как `PluginEvents`, без загрязнения `AnyEvent`.
- Для наблюдения событий приложения author явно задает второй generic: `definePlugin<PluginEvents, AppEvents>()`.
- Для plugin без собственных событий и со строгим наблюдением событий приложения author использует `definePlugin<never, AppEvents>()`.
- Contextual typing callbacks является authoring contract, а не runtime-гарантией фильтрации.
- Literal `name` должен сохраняться в returned plugin value.
- Returned plugin value является opaque carrier. Пользователь не аннотирует plugin factories как `LiteFsmPlugin`; factory возвращает inference от `definePlugin().create(...)`.
- Runtime value имеет internal marker и normalized payload. `MachineManager` не парсит DSL definition и не принимает structural plugin-like objects.
- Unknown top-level sections, включая legacy `install`, запрещены type-level для object literals и бросают `LITE_FSM_INVALID_PLUGIN_DEFINITION` при runtime обходе типов.
- `definePlugin` является единственным documented authoring API для plugins.

### DSL sections

Capabilities выводятся из sections:

| Section            | Type-level capability                                       | Runtime-регистрация       |
| ------------------ | ----------------------------------------------------------- | ------------------------- |
| `routeMeta`        | route meta key и тип значения из первого параметра resolver | route resolver            |
| `manager`          | поле returned manager из return type factory                | manager extension factory |
| `storage`          | machine extension из storage definition                     | storage runtime           |
| `scopedDeps`       | deps effect/reaction invocation                             | scoped deps builder       |
| `scopedTransition` | методы scoped `transition`                                  | scoped transition builder |
| `intercept`        | нет public capability                                       | action interceptor        |
| `hooks`            | нет public capability                                       | dispatch hooks            |

Object sections (`routeMeta`, `manager`, `scopedDeps`, `scopedTransition`, `hooks`) должны быть plain non-empty object, если заданы. `storage`, если задан, должен быть non-empty array storage definitions.

`routeMeta` является только routing contract. Значения `action.meta` остаются служебными route/sender данными, а пользовательские данные передаются через `payload`.

`routeMeta` entries имеют форму `(value, ctx) => string | readonly string[]`. Если `value` не аннотирован, helper types считают тип meta value равным `unknown`.

`routeMeta` не может объявлять reserved keys: `actorId`, `groupId`, `groupTag`, `senderActorId`, `senderGroupId`, `senderGroupTag`. Конфликт с reserved key диагностируется как `LITE_FSM_DUPLICATE_ROUTE_META_KEY`.

### Helper types

Public helper types:

```ts
type PluginManagerEvents<Plugin>;
type PluginRouteMeta<Plugin>;
type PluginScopedDeps<Plugin>;
type PluginScopedTransition<Plugin>;
type PluginManagerExtensions<Plugin>;
type PluginMachineExtensions<Plugin>;
type EffectDeps<AppDeps, Plugin>;
```

Контракты:

- Helpers принимают `PluginUnion` и runtime tuple.
- Tuple нормализуется через `[number]`.
- `PluginManagerEvents<Plugin>` возвращает union событий из generic `PluginEvents`.
- `PluginRouteMeta<Plugin>` возвращает raw map объявленных route meta values; optional semantics применяется только в `manager.transition(...).meta`.
- `PluginMachineExtensions<Plugin>` возвращает union machine extensions из storage definitions или `never`.
- `EffectDeps<AppDeps, Plugin>` добавляет scoped deps и scoped transition methods; callable core `transition(action)` появляется в фактических deps эффекта/реакции через core deps, а не через этот helper.
- Runtime tuple отвечает за порядок выполнения plugins; helper types извлекают только members.

### Minimal public surface

Экспортировать из `@lite-fsm/core`:

```ts
definePlugin;
defineStorageRuntime;

type PluginManagerEvents<Plugin>;
type PluginRouteMeta<Plugin>;
type PluginScopedDeps<Plugin>;
type PluginScopedTransition<Plugin>;
type PluginManagerExtensions<Plugin>;
type PluginMachineExtensions<Plugin>;
type EffectDeps<AppDeps, Plugin>;
```

Не документировать как authoring API:

- `LiteFsmPlugin`;
- carrier/internal plugin value types;
- storage runtime context types;
- registry interfaces;
- action/hook context types.

Не экспортировать из public entrypoint, если declaration emit не требует:

- `createPlugin`;
- `createPluginStorage`;
- legacy direct-call overloads `definePlugin(plugin)`;
- `PluginCapabilities`;
- `PluginInstallContext`;
- `PluginSetupContext`;
- `PluginDefinition`;
- `StorageRuntimeDefinition`;
- `PluginStorageRuntime`;
- `InferPluginCapabilities`;
- `InternalPluginValue`;
- `RoutingRegistry`;
- `ManagerExtensionRegistry`;
- `DepsExtensionRegistry`;
- `ActionRegistry`;
- `DispatchRegistry`;
- `ScopedDepsFactory`;
- `ScopedTransitionFactory`;
- `ManagerExtensionCapability`;
- `ManagerExtensionStore`;
- `ManagerExtensionAppEvents`;
- legacy helper types `PluginTransitionEvents`, `PluginActionMeta`, `PluginDeps`, `PluginTransitionExtensions`.

Если часть carrier/context types технически нужна в declarations, examples и cheatsheets не должны использовать эти names.

Если `LiteFsmPlugin` технически остается exported для declaration emit или generic constraints, он должен быть opaque carrier type для values от `definePlugin().create(...)`. Он не должен описывать public `install(ctx)` или `PluginCapabilities` и не используется в examples.

Если внутренний тип для сборки returned manager extensions требует `S`, `AppEvents` и `Plugins`, он должен иметь отдельное internal name, например `ManagerExtensionsForPlugins<S, AppEvents, Plugins>`. Public `PluginManagerExtensions<Plugin>` остается helper type с одним plugin/tuple/union input.

## 4. Целевая runtime-архитектура

`definePlugin().create(definition)` должен возвращать opaque plugin value с internal marker и normalized payload. Runtime-регистрации выводятся из `definition`, а не пишутся пользователем через `install(ctx)`.

`MachineManager(..., { plugins })` проверяет internal marker и передает normalized payload в registry. Manager не выполняет повторную validation/canonicalization DSL definition и не поддерживает structural compatibility для plugin-like objects.

Internal shape:

```ts
type NormalizedPlugin = {
  readonly name: string;
  readonly storage: readonly NormalizedStorageEntry[];
  readonly routeMeta: readonly NormalizedRouteMetaEntry[];
  readonly scopedDeps: readonly NormalizedScopedDepsEntry[];
  readonly scopedTransition: readonly NormalizedScopedTransitionEntry[];
  readonly manager: readonly NormalizedManagerEntry[];
  readonly intercept?: NormalizedActionInterceptor;
  readonly hooks: Partial<Record<DispatchHookPhase, NormalizedDispatchHook>>;
};
```

`Normalized*Entry` types являются internal. Entries должны хранить owner plugin name, key/kind, callback/runtime value и данные для diagnostics. Internal `instance` storage использует stable owner `@lite-fsm/core/instance-runtime`.

Инварианты:

- Встроенный `instance` storage регистрируется через тот же normalized plugin pipeline, что и пользовательские plugins.
- Runtime регистрирует preset plugins до user plugins.
- User plugins применяются в порядке runtime tuple.
- Для каждого plugin registry применяет entries в порядке: `storage`, `routeMeta`, `scopedDeps`, `scopedTransition`, `manager`, `intercept`, `hooks`.
- Storage definitions внутри plugin применяются в порядке массива `storage`.
- Cross-plugin validation выполняется после регистрации всех plugins и до compile machine templates.
- Existing error codes для composition/runtime errors сохраняются.
- Новые локальные ошибки plugin definition используют `LITE_FSM_INVALID_PLUGIN_DEFINITION`.
- Legacy adapter поверх `plugin.install(ctx)` не допускается как долгосрочный runtime path. Если временный internal adapter нужен внутри одного этапа, он должен быть удален до критерия завершения этого этапа.

Существующие error codes должны сохраниться:

- `LITE_FSM_DUPLICATE_PLUGIN`;
- `LITE_FSM_DUPLICATE_STORAGE_KIND`;
- `LITE_FSM_DUPLICATE_ROUTE_META_KEY`;
- `LITE_FSM_DUPLICATE_MANAGER_EXTENSION_KEY`;
- `LITE_FSM_DUPLICATE_SCOPED_EXTENSION_KEY`;
- `LITE_FSM_SCOPED_EXTENSION_CORE_KEY`;
- `LITE_FSM_MANAGER_EXTENSION_CORE_KEY`;
- `LITE_FSM_MISSING_DEFAULT_STORAGE_KIND`;
- `LITE_FSM_MISSING_ROUTE_META_RESOLVER`;
- `LITE_FSM_UNKNOWN_STORAGE_KIND`.

## 5. Этапы реализации

### Этап 1 — Builder API, opaque plugin value и local validation

#### Цель

Ввести `definePlugin().create(...)` как единственный public authoring shape, возвращающий opaque plugin value с internal marker и normalized payload, без подключения этого payload к `MachineManager`.

#### Зависит от

Нет зависимостей.

#### Контракт этапа

- `definePlugin().create({ name })` возвращает plugin value с literal `name`.
- Returned plugin value содержит internal marker и normalized payload.
- Public plugin value не требует и не принимает user-authored `install(ctx)`.
- Builder plugin values не передаются в `MachineManager` на этом этапе; интеграция с manager начинается на этапе 3.
- Structural plugin-like objects без marker не являются валидными plugin values.
- `HostEvents` дают contextual typing для `intercept`, `hooks`, `scopedDeps` и `scopedTransition`.
- `definePlugin().create(...)` без `PluginEvents` использует observer context `ManagerAction<AnyEvent>`.
- `definePlugin<PluginEvents>().create(...)` использует observer context `ManagerAction<PluginEvents>`.
- `definePlugin<PluginEvents, HostEvents>().create(...)` использует observer context `ManagerAction<HostEvents | PluginEvents>`.
- Capabilities выводятся из DSL sections, а не из generic `Capabilities`.
- Plugin factory не аннотируется как `LiteFsmPlugin`; пользовательский код возвращает inference от `definePlugin().create(...)`.
- Legacy direct call `definePlugin({ ... })` недоступен из `@lite-fsm/core`.
- Legacy `install` запрещен как top-level section.
- `defineStorageRuntime` и storage type extraction не входят в этап.
- `storage` section зарезервирован для этапа `defineStorageRuntime` и не принимает inline storage objects.

Local validation:

- invalid `name` бросает `LITE_FSM_INVALID_PLUGIN_DEFINITION`;
- unknown top-level section бросает `LITE_FSM_INVALID_PLUGIN_DEFINITION`;
- legacy `install` бросает `LITE_FSM_INVALID_PLUGIN_DEFINITION`;
- empty object sections бросают `LITE_FSM_INVALID_PLUGIN_DEFINITION`;
- non-object `routeMeta`, `manager`, `scopedDeps`, `scopedTransition` и `hooks` бросают `LITE_FSM_INVALID_PLUGIN_DEFINITION`;
- `storage`, если задан до появления public storage builder, должен бросать `LITE_FSM_INVALID_PLUGIN_DEFINITION` для empty array, object form и entries без internal storage marker;
- invalid `intercept`, hook phase или hook value бросают `LITE_FSM_INVALID_PLUGIN_DEFINITION`;
- `routeMeta`, `manager`, `scopedDeps`, `scopedTransition` и `hooks` валидируются как local DSL sections уже в builder, даже если их runtime-регистрация появляется на следующих этапах;
- Entries в `routeMeta`, `manager`, `scopedDeps`, `scopedTransition` и values в `hooks` должны быть functions.

#### Не делать в этом этапе

- Не менять `MachineManager` runtime pipeline.
- Не переносить `instance` storage.
- Не реализовывать runtime-регистрацию пользовательских DSL sections.
- Не добавлять helper extraction для manager events, route meta, scoped deps или manager extensions.
- Не добавлять public storage builder.

#### Тесты этапа

Type tests:

- literal `name` сохраняется;
- contextual typing для `HostEvents | PluginEvents` работает в DSL callbacks;
- plugin factory не требует и не использует ручную аннотацию `LiteFsmPlugin`;
- legacy direct-call overload недоступен;
- legacy `install` не принимается;
- legacy authoring/registry types не импортируются из `@lite-fsm/core`, если они не нужны для declarations.

Runtime tests:

- invalid `name`, unknown section, empty section и legacy `install` через runtime обход типов бросают `LITE_FSM_INVALID_PLUGIN_DEFINITION`;
- no-op plugin value можно создать без runtime side effects.

#### Критерий завершения

- Tstyche и focused Vitest tests этапа проходят.
- Public exports показывают builder-style `definePlugin`.
- Старый `install(ctx)` не остается public authoring API.

### Этап 2 — Type-level capabilities и helper types

#### Цель

Добавить type-level extraction для plugin tuple и helper types без runtime-регистрации пользовательских DSL sections.

#### Зависит от

Этап 1.

#### Контракт этапа

- `PluginEvents` выводятся как manager-level plugin events.
- `HostEvents` не расширяют `manager.transition(...)`.
- `PluginManagerEvents<typeof plugin>` возвращает `PluginEvents`.
- `PluginRouteMeta<typeof plugin>` возвращает raw route meta map.
- `PluginScopedDeps<typeof plugin>` выводится из `scopedDeps` object keys и builder return types.
- `PluginScopedTransition<typeof plugin>` выводится из `scopedTransition` object keys и builder return types.
- `PluginManagerExtensions<typeof plugin>` выводится из `manager` object keys и factory return types.
- `EffectDeps<AppDeps, Plugin>` добавляет scoped deps и scoped transition methods.
- `PluginMachineExtensions<Plugin>` доступен как public helper, но до этапа `defineStorageRuntime` возвращает `never` для plugins без typed storage definitions.
- Tuple inputs нормализуются через `[number]`.
- Type-level composition manager-level transition events включает plugin events только из текущего plugin tuple.
- `createMachine<DomainEvent>(...)` не принимает plugin event, если приложение явно не включило `PluginManagerEvents<AppPlugins>` в `DomainEvent`.
- `HostEvents` остаются только contextual typing внутри plugin definition.
- Helper types извлекают members, но не задают runtime order выполнения plugins.
- Builder plugin values все еще не передаются в runtime `MachineManager`; тесты этапа проверяют helper extraction и type-level composition событий.

#### Не делать в этом этапе

- Не менять `MachineManager` runtime pipeline.
- Не передавать новые builder plugin values в `MachineManager` в runtime tests.
- Не регистрировать пользовательские `routeMeta`, `manager`, `scopedDeps`, `scopedTransition`, `intercept`, `hooks` или `storage`.
- Не добавлять public storage builder.
- Не экспортировать legacy helper types `PluginTransitionEvents`, `PluginActionMeta`, `PluginDeps`, `PluginTransitionExtensions`.

#### Тесты этапа

Type tests:

- `PluginManagerEvents<typeof plugin>` возвращает `PluginEvents`;
- `PluginRouteMeta<typeof plugin>` возвращает raw map без optional semantics;
- `PluginScopedDeps<typeof plugin>` и `PluginScopedTransition<typeof plugin>` выводятся из DSL sections;
- `PluginManagerExtensions<typeof plugin>` выводится из manager section и остается public helper с одним plugin/tuple/union input;
- `EffectDeps<AppDeps, Plugin>` добавляет scoped deps и scoped transition methods;
- manager-level transition event composition получает plugin event только от текущего plugin tuple;
- `createMachine<DomainEvent>(...)` не принимает plugin event, если приложение явно не включило `PluginManagerEvents<AppPlugins>` в `DomainEvent`;
- `HostEvents` не добавляются в manager-level transition event composition;
- tuple и union inputs дают одинаковые helper outputs там, где порядок не является частью type contract.

#### Критерий завершения

- Focused Tstyche tests этапа проходят.
- Public helper types имеют новые names и не требуют legacy `PluginCapabilities`.
- Type-level contract не требует ручной аннотации plugin factories.
- Runtime tests на `MachineManager(..., { plugins })` с builder plugin values отсутствуют до этапа 3.

### Этап 3 — Normalized registry и встроенный `instance` storage

#### Цель

Перевести runtime plugin installation на normalized entries и убрать legacy `install(ctx)` как runtime path.

#### Зависит от

Этапы 1-2.

#### Контракт этапа

- Ввести internal `NormalizedPlugin` shape из раздела 4.
- Registry получает `addPlugin(normalizedPlugin)`.
- `MachineManager(..., { plugins })` принимает только marked plugin values от `definePlugin().create(...)`.
- Structural plugin-like object без marker бросает `LITE_FSM_INVALID_PLUGIN_DEFINITION`.
- `addPlugin` проверяет duplicate plugin names через `LITE_FSM_DUPLICATE_PLUGIN`.
- `addPlugin` применяет entries в фиксированном порядке из раздела 4.
- Встроенный `instance` storage регистрируется через internal normalized storage entry.
- Internal `instance` owner равен `@lite-fsm/core/instance-runtime`.
- `MachineManager(machines)` использует normalized registry path.
- `MachineManager(machines, { plugins: [] })` сохраняет поведение.
- No-op plugin через `.create({ name })` принимается `MachineManager` и не меняет состояние, reducers, middleware, subscribers, effects, snapshot и hydrate.
- `PluginInstallContext`, mutable registry context, `assertInstallOpen` и `plugin.install(ctx)` удалены из основного runtime path.

#### Не делать в этом этапе

- Не реализовывать пользовательские `routeMeta`, `manager`, `scopedDeps`, `scopedTransition`, `intercept`, `hooks` и `storage`.
- Не менять dispatch order, routing priority или snapshot format.
- Не добавлять public storage builder.

#### Тесты этапа

Runtime tests:

- `MachineManager(machines)` работает через normalized `instance` storage;
- no-op plugin не меняет observable behavior;
- duplicate plugin name бросает `LITE_FSM_DUPLICATE_PLUGIN`;
- вызовы старого mutable install context больше не являются частью public/runtime path.

Type tests:

- `MachineManager(..., { plugins })` принимает tuple новых plugin values;
- `manager.transition(...)` получает plugin event только от текущего plugin tuple;
- `HostEvents` не добавляются в `manager.transition(...)`;
- широкий plugin array не обязан сохранять plugin-specific inference.

#### Критерий завершения

- Focused runtime/type tests этапа проходят.
- Встроенный `instance` storage больше не зависит от legacy `instanceRuntimePlugin.install(ctx)`.
- Legacy install adapter не остается как второй runtime path.

### Этап 4 — `routeMeta` и `manager`

#### Цель

Сделать route meta resolvers и manager extensions декларативными sections DSL.

#### Зависит от

Этапы 1-3.

#### Контракт этапа

`routeMeta`:

- object key является route meta key;
- reserved keys `actorId`, `groupId`, `groupTag`, `senderActorId`, `senderGroupId`, `senderGroupTag` запрещены для plugin route meta;
- тип первого параметра resolver является типом `action.meta[key]`;
- если первый параметр resolver не аннотирован, тип meta value считается `unknown`;
- explicit annotation первого параметра resolver требуется для строгого типа `manager.transition(...).meta[key]`;
- resolver имеет форму `(value, ctx) => string | readonly string[]`;
- `ctx.key` типизирован как literal key текущего resolver;
- `ctx.action` в authoring type имеет тип `ManagerAction<HostEvents | PluginEvents>`;
- runtime object `ctx` не меняет форму относительно текущего route resolver context;
- поля route meta в `manager.transition(...).meta` optional;
- `PluginRouteMeta<Plugin>` остается raw map без optional semantics;
- runtime не валидирует input type перед resolver;
- runtime валидирует только результат resolver;
- duplicate route key бросает `LITE_FSM_DUPLICATE_ROUTE_META_KEY`;
- конфликт route key с reserved key бросает `LITE_FSM_DUPLICATE_ROUTE_META_KEY`;
- routing priority не меняется: `actorId` -> plugin route keys в порядке регистрации -> `groupId` -> `groupTag` -> unscoped.

`manager`:

- object key является manager extension key;
- return type factory является типом поля на manager;
- factory получает широкий `ManagerRuntimeContext`;
- `ctx.transition(...)` внутри manager factory остается типизирован как `ManagerAction<AnyEvent>`;
- factory вызывается один раз при создании manager после compile templates, создания runtime state и вычисления initial public state;
- factory может читать `ctx.getState()`, `ctx.getDependencies()` и вызывать `ctx.transition(...)`;
- output manager extensions выводятся только из return type factory;
- app-parametric capability type, зависящий от `S`, конкретного `AppEvents` или `MachineStore`, не добавляется;
- duplicate manager key бросает `LITE_FSM_DUPLICATE_MANAGER_EXTENSION_KEY`;
- попытка занять core manager method бросает `LITE_FSM_MANAGER_EXTENSION_CORE_KEY`.

Local validation:

- empty `routeMeta` и `manager` бросают `LITE_FSM_INVALID_PLUGIN_DEFINITION`;
- section entries должны быть functions.

#### Не делать в этом этапе

- Не реализовывать `intercept`, `hooks`, `scopedDeps`, `scopedTransition` и `storage`.
- Не менять routing priority.
- Не публиковать registry/context helper types.

#### Тесты этапа

Type tests:

- route meta optional в `manager.transition(...).meta`;
- route meta имеет тип первого параметра resolver;
- annotated resolver value дает точный тип meta key;
- unannotated resolver value дает `unknown`;
- resolver `ctx.key` сохраняет literal key;
- resolver `ctx.action` типизирован как `ManagerAction<HostEvents | PluginEvents>`;
- `PluginRouteMeta<typeof plugin>` возвращает raw map;
- manager extension доступен только при подключенном plugin tuple;
- manager factory context не типизируется от конкретного app store/events;
- public `PluginManagerExtensions<typeof plugin>` остается one-generic helper, а internal assembler type для returned manager extensions имеет другое name.

Runtime tests:

- route resolver участвует в routing;
- invalid resolver result бросает текущую route resolver error;
- duplicate route key диагностируется;
- reserved route key диагностируется как duplicate route meta key;
- manager extension доступен на manager;
- manager extension factory вызывается один раз после initial runtime state;
- duplicate manager key и core manager key диагностируются.

#### Критерий завершения

- Focused runtime/type tests этапа проходят.
- Public examples по-прежнему отсутствуют, кроме заглушек.

### Этап 5 — `intercept` и `hooks`

#### Цель

Подключить lifecycle behavior из DSL без registry context.

#### Зависит от

Этапы 1-4.

#### Контракт этапа

`intercept`:

- `intercept`, если задан, должен быть function;
- выполняется в plugin order;
- выполняется после storage `prepareAction`;
- получает context с `action`, `originalAction`, `skipDelivery`, `options`, `runtime`, `reportError(error)`;
- `ctx.action` и `ctx.originalAction` имеют тип `ManagerAction<HostEvents | PluginEvents>`;
- первый interceptor видит в `ctx.action` action после `prepareAction`;
- `ctx.originalAction` всегда равен исходному action, переданному в `manager.transition(...)`;
- может вернуть `void` или object с `action`, `skipDelivery`, `stopInterceptors`;
- returned `action` имеет тип `ManagerAction<HostEvents | PluginEvents>`;
- replacement пересчитывает route и виден следующим interceptors, hooks, reducers, subscribers и effects;
- replacement становится committed action для всех следующих dispatch phases;
- если interceptor возвращает одновременно `action` и `stopInterceptors: true`, replacement применяется, а следующие interceptors не выполняются;
- `skipDelivery: true` не доставляет action в machines;
- `stopInterceptors: true` останавливает только следующие interceptors;
- generics `HostEvents` и `PluginEvents` не фильтруют runtime-вызовы; plugin проверяет `ctx.action.type`, если должен игнорировать часть actions.

`hooks`:

- `hooks`, если задан, должен быть plain non-empty object;
- разрешены только фазы `beforeReduce`, `afterReduce`, `beforeCommit`, `beforeSubscribers`, `beforeEffects`, `afterEffects`;
- hook values должны быть functions;
- hooks выполняются по dispatch phase и plugin order;
- hook получает read-only action context с `action`, `originalAction`, `skipDelivery`, `options`, `runtime`, `reportError(error)`;
- hooks не получают return contract или mutable API для replacement action, пропуска delivery или остановки pipeline;
- return value hook runtime игнорирует;
- hooks видят финальный `ctx.action` после interceptors;
- generics `HostEvents` и `PluginEvents` не фильтруют runtime-вызовы; plugin проверяет `ctx.action.type`, если должен игнорировать часть actions.

Ошибки:

- thrown error из `intercept` или hook пробрасывается вызывающему `manager.transition(...)`;
- thrown error не вызывает `onError` автоматически;
- `ctx.reportError(error)` вызывает текущий `onError` pipeline и не меняет control flow;
- если ошибка возникла до commit state, state не меняется;
- если ошибка возникла после commit state, rollback не выполняется, а оставшиеся phases не запускаются.

Local validation:

- empty `hooks` бросает `LITE_FSM_INVALID_PLUGIN_DEFINITION`;
- unknown hook phase бросает `LITE_FSM_INVALID_PLUGIN_DEFINITION`;
- invalid `intercept` или hook value бросает `LITE_FSM_INVALID_PLUGIN_DEFINITION`.

#### Не делать в этом этапе

- Не реализовывать `scopedDeps`, `scopedTransition` и `storage`.
- Не менять dispatch order.
- Не публиковать context helper types для intercept/hooks.

#### Тесты этапа

Type tests:

- `intercept` и hooks получают `ManagerAction<HostEvents | PluginEvents>`;
- `intercept` позволяет вернуть replacement action типа `ManagerAction<HostEvents | PluginEvents>`;
- hooks context не содержит API для replacement/skip/stop;
- callbacks не получают `routing`, `manager`, `deps` или `storage`.

Runtime tests:

- первый interceptor получает prepared action, а `originalAction` сохраняет исходный action;
- intercept order сохраняет plugin order;
- replacement action пересчитывает route;
- replacement action виден следующим interceptors, hooks, reducers, subscribers и effects;
- replacement вместе со `stopInterceptors: true` применяется до остановки следующих interceptors;
- `skipDelivery: true` пропускает delivery;
- hooks order и ignored return value проверены;
- transition из hook остается запрещенным текущим runtime guard;
- thrown error из interceptor/hook пробрасывается вызывающему и не вызывает `onError`;
- `reportError(error)` вызывает `onError` и не останавливает dispatch;
- ошибка до commit не меняет state;
- ошибка после commit не выполняет rollback и останавливает оставшиеся phases.

#### Критерий завершения

- Focused runtime/type tests этапа проходят.
- Hooks/interceptors не открывают второй способ объявлять capabilities.

### Этап 6 — `scopedDeps` и `scopedTransition`

#### Цель

Добавить scoped extensions через inline objects без `keys`, `Object.assign(...)`, ручной аннотации `scope` и casts.

#### Зависит от

Этапы 1-5.

#### Контракт этапа

- Keys выводятся из object keys.
- `scopedDeps` builder имеет форму `(scope) => depValue`.
- `scopedTransition` builder имеет форму `(scope) => method`.
- `scope` получает contextual typing.
- `scope.event` имеет тип `ManagerAction<HostEvents | PluginEvents>`.
- `scope.transition(...)` принимает только `ManagerAction<PluginEvents>`.
- `scope.transition(...)` не принимает `HostEvents`, если они не входят в `PluginEvents`.
- `definePlugin().create(...)` без `PluginEvents` не позволяет отправить произвольный plugin event через `scope.transition`.
- `EffectDeps<AppDeps, Plugin>` добавляет scoped deps и scoped transition methods.
- При использовании как `D` в `TypedCreateMachineFn` фактический `deps.transition` является core callable transition, пересеченным со scoped methods.
- В effects/reactions одновременно доступны `transition(action)` и `transition.someMethod(...)`.
- `manager.transition.someMethod(...)` остается type error.
- Command-style scoped methods могут возвращать `void`.
- Methods могут возвращать `ManagerAction<PluginEvents>`, если возвращают результат `scope.transition(...)`.
- Duplicate scoped keys, попытка занять core/app dep key и returned key без владельца сохраняют текущую runtime/composition диагностику.
- Local validation проверяет только форму sections и functions.
- Empty `scopedDeps` и `scopedTransition` бросают `LITE_FSM_INVALID_PLUGIN_DEFINITION`.

#### Не делать в этом этапе

- Не менять effect/reaction order.
- Не менять `manager.setDependencies(...)`.
- Не добавлять standalone scoped helpers.
- Не экспортировать `ScopedDepsFactory` и `ScopedTransitionFactory` из public entrypoint, если declaration emit не требует.

#### Тесты этапа

Type tests:

- inline `scopedDeps` и `scopedTransition` дают contextual `scope`;
- `scope.transition(...)` не требует `as ManagerAction<...>`;
- `scope.transition(...)` не принимает host-only events;
- `definePlugin().create(...)` без `PluginEvents` не может отправить arbitrary event через `scope.transition`;
- `EffectDeps` добавляет deps и transition methods из `PluginUnion` и tuple;
- `transition(action)` и `transition.someMethod(...)` доступны в effects/reactions;
- `manager.transition.someMethod(...)` остается type error.

Runtime tests:

- scoped dep доступен только во время effect/reaction invocation;
- scoped transition method доступен внутри invocation;
- duplicate scoped dep/transition keys бросают ownership errors;
- попытка занять core/app dep key бросает текущие ownership errors;
- returned key без владельца бросает текущую ownership error;
- empty sections бросают `LITE_FSM_INVALID_PLUGIN_DEFINITION`.

#### Критерий завершения

- Focused runtime/type tests этапа проходят.
- В source/tests нет новых public examples со scoped `keys` или `Object.assign(..., { keys })`.

### Этап 7 — `defineStorageRuntime` и helper types

#### Цель

Ввести typed storage definition как opaque value и связать его с type-level machine extension без runtime-регистрации storage section.

#### Зависит от

Этапы 1-6.

#### Контракт этапа

Public builder:

```ts
defineStorageRuntime<Extension>().create({
  kind: "cache",
  validateTemplate(ctx) {},
  compileTemplate(ctx) {},
  createRuntimeState(ctx) {},
  createPublicInitialState(ctx) {},
  prepareAction(ctx) {},
  beforeReduce(ctx) {},
  acceptsEvent(ctx) {},
  reduce(ctx) {},
  commit(ctx) {},
  effects: {
    condition(ctx) {},
    resolveInvocations(ctx) {},
    invoke(ctx) {},
  },
  snapshot: {
    dehydrate(ctx) {},
    hydrate(ctx) {},
  },
  identity: {
    resolve(ctx) {},
  },
  reactions: {
    run(ctx) {},
  },
});
```

Контракты:

- `kind` является единственным источником storage kind.
- `Extension` не содержит `storage`.
- Public author передает inline `Extension` generic в `defineStorageRuntime<Extension>()`.
- Internal input constraint `PluginMachineExtensionInput` не экспортируется и не документируется.
- Internal input constraint принимает только `input`, `internalEvents`, `reducerContext`, `effectDeps`, `reactionDeps`, `resultMetadata`, `publicState`.
- Unknown keys и `storage` в `Extension` отклоняются type-level через internal input constraint.
- Public helper возвращает normalized machine extension с `storage: Kind`.
- Builder сохраняет literal `kind`, даже при explicit `Extension`.
- `defineStorageRuntime().create(...)` без `Extension` дает machine extension `{ storage: Kind }`.
- Возвращаемое значение является opaque storage definition для `definePlugin().create({ storage: [...] })`.
- Builder принимает public shape текущего `StorageRuntime` contract: mandatory base methods, optional `prepareAction`, `beforeReduce`, `reduceScope`, template-scope `acceptsEvent`/`reduce`, bucket-scope `reduceBucket`, `effects`, `snapshot`, `identity` и `reactions`.
- Возвращаемое значение не является standalone runtime/preset API и подключается только через `definePlugin().create({ storage: [...] })`.
- Inline storage runtime object в plugin `storage` section не допускается: section принимает только values от `defineStorageRuntime().create(...)`.
- `storage` section принимает readonly array definitions, не object map.
- Public `compileTemplate(ctx)` возвращает только template payload: `void | { data?: unknown }`.
- Builder нормализует public `compileTemplate(ctx)` во внутренний compiled template `{ key: ctx.key, kind, ...payload }`.
- Public builder type отклоняет ручной возврат `key` или `kind` из `compileTemplate(ctx)`.
- Internal storage runtimes, включая `instance`, могут возвращать полный internal `CompiledStorageTemplate`.
- `validateTemplate(ctx)` и `compileTemplate(ctx)` получают contextual `ctx.machine` с input из `Extension["input"]`.
- Остальные storage runtime contexts, runtime state, template data и snapshot payload остаются широкими `unknown`/internal types.
- Additional public generics для `TemplateData`, `RuntimeState`, `SnapshotPayload` не добавляются.
- `effectDeps` и `reactionDeps` в `Extension` являются type contract; runtime implementation обязан реально предоставить эти deps.
- `routeMetaKeys` остается runtime field storage definition, но validation missing resolver подключается в следующем этапе.

Local validation:

- empty storage `kind` бросает `LITE_FSM_INVALID_PLUGIN_DEFINITION`;
- missing mandatory runtime methods бросают `LITE_FSM_INVALID_PLUGIN_DEFINITION`;
- invalid optional block shape (`effects`, `snapshot`, `identity`, `reactions`) бросает `LITE_FSM_INVALID_PLUGIN_DEFINITION`;
- unknown top-level fields storage definition отклоняются type-level для object literals и бросают `LITE_FSM_INVALID_PLUGIN_DEFINITION` при обходе типов;
- До этапа 8 plugin со `storage` section нельзя успешно подключить к `MachineManager`: runtime бросает `LITE_FSM_INVALID_PLUGIN_DEFINITION` с сообщением, что storage section еще не зарегистрирован этим этапом.

#### Не делать в этом этапе

- Не регистрировать user storage section в `MachineManager`.
- Не менять snapshot format.
- Не добавлять custom runtime preset API.

#### Тесты этапа

Type tests:

- `defineStorageRuntime<Extension>().create({ kind })` сохраняет literal `kind`;
- `PluginMachineExtensions<typeof plugin>` возвращает normalized extension;
- plugin с несколькими storage definitions дает union extensions;
- plugin без storage дает `never`;
- tuple и union inputs дают одинаковые helper outputs;
- `TypedCreateMachineFn` принимает declared storage kinds и отклоняет unknown kind;
- public `compileTemplate` не принимает return value с ручными `key` или `kind`;
- optional `prepareAction`, `beforeReduce`, `effects.condition`, `effects.resolveInvocations`, `effects.invoke`, `snapshot`, `identity` и `reactions` принимаются в storage builder;
- storage runtime contexts не требуют дополнительных public generics для runtime state, template data или snapshot payload;
- object form `storage: { cache }` не принимается;
- inline object form `storage: [{ kind: "cache", ... }]` не принимается;
- named storage context types не нужны в public examples.

Runtime tests:

- invalid storage definition shape бросает `LITE_FSM_INVALID_PLUGIN_DEFINITION`;
- empty storage `kind` бросает `LITE_FSM_INVALID_PLUGIN_DEFINITION`;
- invalid optional block shape бросает `LITE_FSM_INVALID_PLUGIN_DEFINITION`;
- plugin со storage section, переданный в `MachineManager` до этапа 8, бросает `LITE_FSM_INVALID_PLUGIN_DEFINITION`.

#### Критерий завершения

- Focused runtime/type tests этапа проходят.
- `defineStorageRuntime` экспортирован как public builder.
- Public custom runtime preset API не появился.

### Этап 8 — Runtime storage section

#### Цель

Подключить `storage` section к normalized runtime registry.

#### Зависит от

Этап 7.

#### Контракт этапа

- `definePlugin().create({ storage: [definition] })` регистрирует storage runtimes через normalized entries.
- Storage definitions внутри plugin применяются в порядке массива.
- Empty `storage: []` бросает `LITE_FSM_INVALID_PLUGIN_DEFINITION`.
- Object form `storage: {}` бросает `LITE_FSM_INVALID_PLUGIN_DEFINITION`.
- Invalid storage definition marker бросает `LITE_FSM_INVALID_PLUGIN_DEFINITION`.
- Duplicate storage kind внутри одного plugin бросает `LITE_FSM_INVALID_PLUGIN_DEFINITION`.
- Duplicate storage kind между plugins или preset бросает `LITE_FSM_DUPLICATE_STORAGE_KIND`.
- Missing runtime storage для declared storage kind невозможен по конструкции DSL.
- `routeMetaKeys` storage definition участвует в validation `LITE_FSM_MISSING_ROUTE_META_RESOLVER`.
- Несовпадение compiled template `kind` и storage definition `kind` невозможно через public builder; `LITE_FSM_INVALID_STORAGE_RUNTIME` сохраняется только для internal storage entries, если такой path остается.

#### Не делать в этом этапе

- Не менять snapshot format.
- Не добавлять custom runtime preset API.
- Не добавлять storage internals generics.

#### Тесты этапа

Runtime tests:

- storage runtime из plugin section регистрируется;
- machine с declared storage kind компилируется и создает public initial state;
- duplicate storage kind внутри plugin и между plugins диагностируется разными error codes;
- invalid/empty storage sections бросают `LITE_FSM_INVALID_PLUGIN_DEFINITION`;
- `routeMetaKeys` без resolver бросает `LITE_FSM_MISSING_ROUTE_META_RESOLVER`.

Type tests:

- `definePlugin().create({ storage: [cacheStorage] })` выводит machine extension из `cacheStorage`;
- `MachineManager(..., { plugins })` сохраняет tuple inference после storage plugin.

#### Критерий завершения

- Focused runtime/type tests этапа проходят.
- Storage section работает через normalized registry path.
- Public custom runtime preset API не появился.

### Этап 9 — Рефакторинг, чистка и полировка

#### Цель

После реализации всего runtime и type API провести целевую чистку измененной кодовой базы до обновления документации и финальной проверки.

#### Зависит от

Этапы 1-8.

#### Контракт этапа

- Проверить измененные модули plugin system в `packages/core/src/plugin.ts`, `packages/core/src/createMachine.ts`, `packages/core/src/interfaces.ts`, `packages/core/src/runtime/kernel/*` и `packages/core/src/runtime/instance/*`.
- Удалить временные адаптеры миграции, ветки совместимости, мертвый код, неиспользуемые imports, неиспользуемые types и вспомогательные функции тестов, если они больше не нужны после перехода на финальный API.
- Упростить код, который стал сложнее контракта: убрать лишние уровни косвенности, дублирующую validation, повторную canonicalization и неиспользуемые промежуточные структуры.
- Сохранить одного владельца для каждой ответственности: local validation остается в слое builder, cross-plugin validation остается в слое runtime composition, storage normalization остается в storage builder или registry path.
- Проверить public exports: оставить только финальный documented surface и технически необходимые declaration types; legacy names не должны возвращаться в examples или public authoring API.
- Проверить tests: удалить или переписать тесты, которые фиксируют промежуточные implementation details, но не проверяют public contract.
- Поисковый аудит в этом этапе проверяет измененные source/tests и public examples. Исторические `spec/*implementation*` и implementation logs не считаются блокером, если они не используются как источник требований.
- Не менять public API, runtime order, snapshot format, routing priority или error semantics, закрытые этапами 1-8.
- Любое упрощение должно быть покрыто существующими или обновленными сценарными тестами; чистка не должна снижать coverage gate.

#### Не делать в этом этапе

- Не добавлять новые capabilities, extension points или helper types.
- Не переписывать cheatsheets и documentation fixture; это выполняется на следующем этапе.
- Не запускать docs build.
- Не использовать рефакторинг как повод менять уже принятые контракты этапов 1-8.

#### Тесты этапа

- Focused runtime/type regression tests plugin system проходят после чистки.
- Поисковый аудит по измененным source/tests и public examples подтверждает отсутствие legacy authoring path: `install(ctx)`, `PluginInstallContext`, `PluginCapabilities`, `createPluginStorage`, `registerMetaKey`, public `createPlugin`.
- Coverage по новому и измененному чистому коду остается 100% по statements, branches, functions и lines.
- `pnpm run test:coverage`, если команда не запускает docs build.
- `pnpm run check-types`, если не запускает docs build.
- `pnpm run lint`, если изменения требуют lint-проверки.

#### Критерий завершения

- В измененной области нет временных адаптеров, неиспользуемых imports/types/functions и тестов промежуточного API.
- Runtime/type tests, нужные для контрактов этапов 1-8, продолжают проходить.
- Public surface не расширен сверх целевого API.

### Этап 10 — Документация и финальная проверка

#### Цель

Создать cheatsheets и documentation fixture plugin system с нуля после стабилизации API.

#### Зависит от

Этапы 1-9.

#### Контракт этапа

Создать актуальные материалы:

- `PLUGIN-SYSTEM-CHEATSHEET.md`;
- plugin sections в `API-CHEATSHEET.md`;
- plugin sections в `TYPES-CHEATSHEET.md`;
- `tests/fixtures/plugin-system-documentation.ts`;
- runtime/type tests для documentation fixture.

Docs pages в `apps/docs` остаются заглушками. Полная документация сайта всегда выполняется отдельной задачей и не входит в критерий завершения этого ТЗ.

Документация должна:

- описывать `definePlugin<PluginEvents, HostEvents>().create(...)` как единственный public authoring API;
- объяснять `PluginEvents`, `HostEvents` и отсутствие автоматического добавления plugin events в machines;
- описывать DSL sections через контракты, а не через internal registries;
- явно указывать, что public `install(ctx)` нет;
- описывать `routeMeta` как служебный routing contract, не пользовательские данные;
- рекомендовать простые scalar route keys вроде `entityId`, `cacheKey`, `documentId`, `tenantId`;
- описывать `PluginRouteMeta<PluginUnion>` как raw map, а optional semantics как часть `manager.transition(...).meta`;
- показывать storage runtime как advanced section после базовых extensions;
- показывать `defineStorageRuntime<Extension>().create({ kind, ... })`;
- показывать `compileTemplate(ctx)` без ручного `key` и `kind`;
- показывать inline contextual storage methods без imports named context types;
- объяснять, что `effectDeps` и `reactionDeps` в storage extension являются type contract;
- показывать `PluginUnion` и runtime tuple как inputs helper types;
- показывать explicit включение `PluginManagerEvents<AppPlugins>` в `AppEvents`, если machine обрабатывает plugin event;
- показывать configurable/multi-instance plugins через обычную factory function вокруг `definePlugin().create(...)`;
- не использовать `auditTarget` как базовый route meta example;
- не использовать `Object.assign(..., { keys })`, scoped `keys`, `as ManagerAction<...>`, `registerMetaKey`, `ctx.storage.register`, `PluginCapabilities`, `PluginInstallContext`, `createPluginStorage`.

#### Не делать в этом этапе

- Не запускать docs build.
- Не начинать `@lite-fsm/entities`.
- Не добавлять новые runtime extension points.

#### Тесты этапа

- Documentation fixture компилируется через Tstyche.
- Runtime fixture покрывает no-op plugin, route meta, manager extension, intercept или hooks, scoped deps/transition, storage runtime и plugin event.
- Search audit подтверждает отсутствие legacy API в public examples, cheatsheets, documentation fixture, docs source и измененных source/tests.
- Исторические `spec/*implementation*` и implementation logs не считаются блокером search audit, если они не используются как source of truth для финального API.
- `pnpm run test:types`;
- focused runtime tests plugin system;
- `pnpm run test:coverage`, если команда не запускает docs build;
- `pnpm run check-types`, если не запускает docs build;
- `pnpm run lint`, если изменения требуют lint-проверки.

#### Критерий завершения

- Cheatsheets и fixture описывают только финальный API.
- `apps/docs` не содержит старых plugin examples и может оставаться с заглушкой.
- Public examples не содержат legacy plugin API.

## 6. Критерий полной готовности

ТЗ выполнено, когда:

- `definePlugin<PluginEvents, HostEvents>().create(...)` является единственным documented plugin authoring API;
- `MachineManager(..., { plugins })` принимает только marked plugin values от `definePlugin().create(...)` и отклоняет structural plugin-like objects;
- plugin factories не требуют и не используют ручную аннотацию `LiteFsmPlugin`; если `LiteFsmPlugin` технически экспортирован, он остается opaque carrier type без public `install(ctx)`;
- default `HostEvents` условный: без `PluginEvents` используется `AnyEvent`, с объявленными `PluginEvents` используется `never`, если author явно не передал второй generic;
- `PluginEvents` расширяет manager-level `transition`, но не machine events без явного включения в `AppEvents`;
- `HostEvents` работает только как contextual typing внутри plugin definition;
- capabilities выводятся из DSL sections;
- `PluginEvents` и `HostEvents` не фильтруют runtime callbacks; plugin проверяет `ctx.action.type`, если должен игнорировать часть actions;
- `routeMeta` запрещает reserved keys `actorId`, `groupId`, `groupTag`, `senderActorId`, `senderGroupId`, `senderGroupTag`;
- `routeMeta`, `manager`, `scopedDeps`, `scopedTransition`, `intercept`, `hooks` регистрируются декларативно без public registry context;
- manager extension factories вызываются один раз при создании manager после compile templates, runtime state и initial public state;
- `intercept` выполняется после storage `prepareAction`, видит prepared `ctx.action`, сохраняет исходный `ctx.originalAction` и пересчитывает route при replacement;
- hooks получают read-only action context, а их return value игнорируется;
- thrown errors из intercept/hooks пробрасываются вызывающему и не вызывают `onError`; `reportError(error)` вызывает `onError` и не меняет control flow;
- `defineStorageRuntime<Extension>().create(...)` связывает storage runtime и machine extension;
- `PluginMachineExtensionInput` остается internal constraint, не экспортируется и не документируется;
- `defineStorageRuntime().create(...)` открывает текущий storage runtime contract, включая `prepareAction`, `beforeReduce`, `reduceScope`, template-scope `acceptsEvent`/`reduce`, bucket-scope `reduceBucket`, `effects.condition`, `effects.resolveInvocations`, `effects.invoke`, `snapshot`, `identity` и `reactions`, но не добавляет generics для `TemplateData`, `RuntimeState` и `SnapshotPayload`;
- public `compileTemplate(ctx)` возвращает только `void | { data?: unknown }`, а builder подставляет internal `key` и `kind`;
- plugin `storage` section принимает только values от `defineStorageRuntime().create(...)`, а не inline runtime objects;
- `PluginMachineExtensions<Plugin>` и `EffectDeps<AppDeps, Plugin>` принимают `PluginUnion` и tuple;
- `EffectDeps<AppDeps, Plugin>` добавляет scoped deps/methods, а callable core `transition(action)` приходит из core deps при фактическом effect/reaction invocation;
- internal runtime использует normalized entries и `addPlugin(normalizedPlugin)`, а не legacy `plugin.install(ctx)` adapter;
- встроенный `instance` storage использует normalized path;
- existing composition/runtime error codes сохранены, а local definition errors используют `LITE_FSM_INVALID_PLUGIN_DEFINITION`;
- поведение `MachineManager(machines)` без plugins не изменилось;
- измененная область очищена от временных адаптеров, неиспользуемых imports/types/functions и тестов промежуточного API;
- новый/измененный чистый код покрыт сценарными тестами и 100% coverage;
- cheatsheets и documentation fixture созданы с нуля и не содержат legacy examples;
- полная документация сайта оставлена для отдельной задачи;
