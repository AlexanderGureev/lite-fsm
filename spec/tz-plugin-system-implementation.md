# Plugin system и pluggable runtimes для lite-fsm — ТЗ для реализации

## 1. Цель

Реализовать в `@lite-fsm/core` plugin system, которая позволяет подключать новые runtime capabilities без встраивания их в kernel manager. Текущее поведение lite-fsm должно стать встроенным default runtime preset внутри `@lite-fsm/core`, а внешние runtime вроде `@lite-fsm/entities` должны подключаться через plugins.

Архитектурная граница должна позволять в будущем вынести default runtime preset в отдельный пакет и собрать облегченный manager без `storage: "instance"`, effects, snapshot/hydrate или identity capabilities. В этом ТЗ такой облегченный public API не реализуется: `MachineManager(machines)` продолжает автоматически использовать встроенный default runtime preset.

## 2. Как выполнять это ТЗ

Реализация идет строго по этапам. Этап `N+1` начинается только после полного выполнения критерия завершения этапа `N`.

Для каждого этапа:

1. Читать общие инварианты из разделов 3-7 и текущий этап.
2. Не реализовывать пункты из следующих этапов, даже если они кажутся близкими.
3. Вносить минимальные изменения, достаточные для контракта этапа.
4. Добавлять тесты runtime-поведения, тесты типов, snapshot tests и диагностику только для измененного контракта этапа.
5. Сохранять существующие тесты поведения как регрессионный контракт.
6. Обновлять `API-CHEATSHEET.md` и `TYPES-CHEATSHEET.md`, если этап меняет public API или public types.
7. Не запускать сборку документации и команды, которые транзитивно запускают docs build.

Запрещенные для агента проверки:

- `pnpm run build`;
- `pnpm --filter @lite-fsm/docs build`;
- `pnpm run docs:build`;
- `pnpm run pages:build*`;
- любой `next build` внутри `apps/docs`.

Если нужна проверка сборки документации, ее должен выполнить пользователь. Для агентной проверки пакетов используется `pnpm run build:packages`, если этап требует build-проверки.

### Предусловия и внешние зависимости

- Это ТЗ должно быть реализовано до [`tz-entities-implementation.md`](./tz-entities-implementation.md), потому что `@lite-fsm/entities` зависит от plugin system.
- `@lite-fsm/core` не должен импортировать внешние plugin packages.
- `MachineManager(machines)` и существующие public exports должны сохранить текущее поведение без изменений пользовательского кода.

### Термины

- Plugin — value с `name`, `install(ctx)` и phantom `__capabilities` для TypeScript inference.
- Plugin capability — типовой контракт plugin-provided manager extensions, transition events, machine extensions, action meta, deps и transition extensions.
- Runtime preset — набор runtime plugins и `defaultStorageKind`, с которым создается kernel manager. Public `MachineManager` использует встроенный `defaultRuntimePreset`.
- Storage runtime — runtime-реализация конкретного `machine.storage`, например встроенный `storage: "instance"`.
- Storage runtime capability — опциональный блок storage runtime contract: effects, snapshot, identity или reactions.
- Dispatch context — runtime context одного `transition(...)`, доступный action interceptors, dispatch hooks и storage runtimes.

### Область работ

- `MachineManager(..., { plugins })`.
- Встроенный default runtime preset, который устанавливает `instanceRuntimePlugin` автоматически перед пользовательскими plugins.
- Registry для plugins, actions, storage runtimes, dispatch hooks, routing meta, manager extensions и deps/transition extensions.
- Storage runtime contract с базовым контрактом и опциональными capability blocks для `storage: "instance"` и будущих custom runtimes.
- Internal kernel manager factory, принимающая runtime preset. Public API для custom presets остается вне области работ.
- `TypedCreateMachineFn` с третьим generic для plugin-provided machine extensions.
- Plugin-provided internal machine events без добавления их в пользовательский `AppEvents`.
- Type-level расширение `manager.transition(...)`, `action.meta`, effect deps, scoped `transition` и returned manager object через plugins.
- Snapshot/hydrate extension points для storage runtimes.
- Backward compatibility текущего runtime, middleware, reducers, effects, actors, routing и persistence.

### Вне области работ

- Entity runtime.
- Spawn recipes.
- `ENTITY_SPAWNED` и `ENTITY_DESPAWNED`.
- `manager.entities` и другие entity-specific manager extensions.
- React entity hooks.
- Graph support для entity composition.
- Devtools provider API.
- Public low-level `storageHandlers` API в MVP.
- Public API для custom runtime presets и отключения встроенного default runtime preset.
- Вынесение `instanceRuntimePlugin` или default runtime preset в отдельный пакет.
- Поддержка plugin-provided storage runtimes в standalone `Machine(...)` / `defineMachine().create(...)`.

### Общие тестовые ожидания

- Coverage является обязательным критерием завершения: новый и измененный код должен иметь 100% покрытие по statements, branches, functions и lines. Исключения запрещены без отдельного изменения этого ТЗ.
- 100% coverage не заменяет сценарное покрытие. Для каждого критерия приемки должны быть позитивные, негативные и граничные тесты там, где сценарий имеет отдельный runtime/type-level/error-path outcome.
- Каждый этап должен добавлять или обновлять только тесты своей области работ и непосредственно затронутых контрактов.
- Нельзя переходить к следующему этапу с падающими проверками затронутой области работ или с незакрытыми пробелами покрытия текущего этапа.
- Текущие тесты `@lite-fsm/core` проходят без изменения пользовательских сценариев.
- Тесты поведения являются источником истины для обратной совместимости. Их нельзя переписывать под новую реализацию, если публичное поведение не меняется.
- Тесты, привязанные к конкретным internal functions, которые удалены или переехали при рефакторинге, обновляются на нового владельца поведения или заменяются тестами публичного контракта.
- Названия новых `describe`/`it`/`test` в проекте должны быть на русском; API-термины остаются на английском.

## 3. Общие инварианты

- `@lite-fsm/core` не импортирует внешние plugin packages.
- `MachineManager(machines)` и текущие public exports сохраняют поведение без изменений пользовательского кода.
- Встроенный default runtime preset устанавливается автоматически и остается internal API.
- `instanceRuntimePlugin` и `defaultRuntimePreset` не экспортируются публично в этом ТЗ.
- `storage: "instance"` является поведением встроенного default runtime preset, а не глобальной магией kernel manager.
- Standalone `Machine(...)` и `defineMachine().create(...)` поддерживают только отсутствие `storage` или `storage: "instance"`.
- Standalone runtime не поддерживает plugin-provided storage configs.
- Graph compiler не обязан поддерживать plugin-provided storage kinds в этом ТЗ. Unknown storage kinds могут быть marked unsupported до отдельного graph/devtools ТЗ.
- Public API должен оставаться небольшим, предсказуемым и строго типизированным.
- Plugin runtime валидирует extended config на manager init, даже если TypeScript wrapper уже проверил input shape.
- Пользовательские данные передаются через `payload`, а не через `action.meta`.
- `action.meta` остается служебным routing/sender contract.
- No external plugin-specific code попадает в обычный app bundle без импорта соответствующего plugin package.
- Появление plugin system не должно ломать существующие graph tests.

## 4. Общие ошибки конфигурации

Следующие ошибки являются init-time/runtime contract errors и бросаются независимо от `IS_DEV`:

- duplicate plugin names;
- duplicate storage kind;
- unknown storage kind;
- default storage kind отсутствует в storage registry после установки preset и пользовательских plugins;
- duplicate route meta key;
- plugin-declared `action.meta` key без route resolver;
- duplicate manager extension key;
- попытка перезаписать core manager method;
- duplicate deps/transition extension ownership;
- попытка использовать storage capability, которую runtime явно не поддерживает;
- invalid storage-specific machine config, из-за которого runtime не может безопасно продолжить.

`IS_DEV` используется только для дорогих диагностических проверок, которые не нужны для корректности production hot path.

## 5. Целевой public API

### 5.1. Manager plugins

```ts
const manager = MachineManager(machines, {
  plugins: [somePlugin(options)],
});
```

```ts
type MachineManagerFn = <
  S extends MachineStore,
  AppEvents extends AnyEvent = MachineEvents<S>,
  Plugins extends readonly LiteFsmPlugin[] = [],
>(
  machines: S,
  options?: MachineManagerOptions<S, AppEvents, Plugins>,
) => ManagerFromPlugins<S, AppEvents, Plugins>;

type MachineManagerOptions<
  S extends MachineStore,
  AppEvents extends AnyEvent,
  Plugins extends readonly LiteFsmPlugin[],
> = CoreMachineManagerOptions<S, AppEvents> & {
  plugins?: readonly [...Plugins];
};
```

`plugins` опционален. Literal tuple в `options.plugins` должен сохранять inference plugin capabilities. Если пользователь передает широкий `LiteFsmPlugin[]`, plugin-specific extensions могут быть недоступны в TypeScript.

Требования:

- Отсутствие `plugins` сохраняет текущее поведение `MachineManager`.
- Порядок установки plugins соответствует порядку массива.
- `Plugins` инферится из literal tuple `options.plugins`.
- `PluginTransitionEvents<Plugins>` выводится из `Plugins[number]["__capabilities"]["transitionEvents"]`.
- `PluginManagerExtensions<S, AppEvents, Plugins>` выводится из `Plugins[number]["__capabilities"]["manager"]`.

### 5.2. Plugin value

```ts
type LiteFsmPlugin<Capabilities extends PluginCapabilities = {}> = {
  readonly name: string;
  install(ctx: PluginInstallContext): void;
  readonly __capabilities?: Capabilities;
};

type PluginCapabilities = {
  manager?: object | ManagerExtensionCapability;
  transitionEvents?: AnyEvent;
  machine?: MachineRuntimeExtension;
  actionMeta?: object;
  deps?: object;
  transition?: object;
};
```

`MachineRuntimeExtension` минимально описывает type-level extension для storage-specific machine config, internal events, deps, metadata и public state shape. Полный contract фиксируется в этапе 6.

```ts
const myPlugin = definePlugin<MyPluginCapabilities>({
  name: "my-plugin",
  install(ctx) {
    // registrations
  },
});
```

`definePlugin(...)` возвращает `LiteFsmPlugin`, сохраняет literal `name` и phantom capabilities.

Требования:

- `name` является stable id plugin.
- `install(...)` вызывается один раз на manager init.
- Phantom capabilities используются только для TypeScript inference.
- Plugin не мутирует `machines` напрямую.
- Plugin регистрирует capabilities через `PluginInstallContext`.
- Manager capability может быть generic от `S extends MachineStore`, чтобы returned manager extensions типизировались через machines текущего `MachineManager(...)`.

### 5.3. Plugin install context

Целевой `PluginInstallContext` после всех этапов:

```ts
type PluginInstallContext = {
  actions: ActionRegistry;
  storage: StorageRegistry;
  dispatch: DispatchRegistry;
  routing: RoutingRegistry;
  manager: ManagerExtensionRegistry;
  deps: DepsExtensionRegistry;
};
```

Registry-поля добавляются по этапам. Нельзя публиковать неработающее registry-поле как стабильную поверхность API до этапа, который реализует его runtime-поведение и тесты.

## 6. Целевой runtime preset

Public `MachineManager` использует internal factory:

```ts
type RuntimePreset = {
  readonly name: string;
  readonly defaultStorageKind: string;
  readonly plugins: readonly LiteFsmPlugin[];
};

const defaultRuntimePreset: RuntimePreset = {
  name: "@lite-fsm/core/default-runtime",
  defaultStorageKind: "instance",
  plugins: [instanceRuntimePlugin()],
};

export const MachineManager = createMachineManagerFactory(defaultRuntimePreset);
```

Целевой init flow после завершения этапов:

```ts
function createMachineManagerFactory(preset) {
  return function createMachineManager(machines, options) {
    const registry = createPluginRegistry({
      defaultStorageKind: preset.defaultStorageKind,
    });

    for (const plugin of preset.plugins) {
      registry.install(plugin);
    }

    for (const plugin of options.plugins ?? []) {
      registry.install(plugin);
    }

    registry.assertDefaultStorageRegistered();

    const compiled = compileMachines(
      machines,
      registry.storage,
      registry.defaultStorageKind,
    );
    const runtime = createManagerRuntime(compiled, registry);
    const manager = createBaseManager(runtime);

    for (const extension of registry.managerExtensions) {
      manager[extension.key] = extension.factory(runtime);
    }

    return manager;
  };
}
```

Требования:

- Preset plugins устанавливаются раньше пользовательских plugins.
- `instanceRuntimePlugin` регистрирует `storage: "instance"`.
- Machine без `storage` использует `registry.defaultStorageKind`.
- Явное `storage: "instance"` эквивалентно отсутствующему `storage` в public `MachineManager`.
- Пользовательский plugin не может повторно зарегистрировать `storage: "instance"` в public `MachineManager`.
- Kernel manager не импортирует `runtime/instance/*`.
- Единственная точка kernel assembly, которая импортирует `instanceRuntimePlugin`, находится в `runtime/defaultPreset.ts`.
- Public bundle `@lite-fsm/core` импортирует только встроенный default runtime preset и не импортирует внешние plugin packages.
- Future extraction path: `instanceRuntimePlugin` должен быть реализован через те же registry и storage runtime contracts, что и внешний runtime plugin, чтобы его можно было вынести без переписывания kernel manager.

## 7. Целевая внутренняя структура

Рекомендуемая структура после завершения этапов:

```text
packages/core/src/runtime/kernel/
  createMachineManagerFactory.ts
  registry.ts
  dispatch.ts
  routing.ts
  managerRuntime.ts

packages/core/src/runtime/defaultPreset.ts

packages/core/src/runtime/instance/
  plugin.ts
  storage.ts
  compile.ts
  reduce.ts
  effects.ts
  snapshot.ts
  identity.ts
```

Kernel manager владеет только общим orchestration contract:

- plugin registry;
- preset install order;
- middleware wrapping;
- dispatch context lifecycle;
- action normalization;
- route constraint priority;
- storage runtime selection;
- root public state commit;
- subscribers;
- deps extension pipeline;
- error wiring;
- manager extensions;
- phase ordering.

`defaultRuntimePreset` является composition layer без собственного runtime state. Он только задает `defaultStorageKind` и порядок установки runtime plugins. Текущее поведение lite-fsm принадлежит `instanceRuntimePlugin` и `instanceStorageRuntime`, а не kernel manager.

Future extraction path: перенос `runtime/instance/*` и `runtime/defaultPreset.ts` в отдельный пакет не должен требовать изменений в `runtime/kernel/*`, кроме import path и public packaging.

`instanceStorageRuntime` владеет текущим instance-specific поведением:

- classification текущих domain machines и actor templates;
- actor sidecar;
- actor identity indexes;
- group indexes;
- actor counters;
- actor bag cleanup;
- validation replacement actor records;
- domain delivery;
- actor spawn;
- actor delivery;
- terminal collapse semantics;
- actor-aware effects;
- `condition(...)`;
- actor transition sugar;
- self deps;
- effect target resolution;
- current instance snapshot format;
- actor hydrate/dehydrate hooks.

## 8. Этап 1 — Plugin value и install registry

### Цель

Добавить plugin value, `definePlugin(...)`, install registry и опцию `plugins` в `MachineManager(...)` без изменения runtime-поведения.

### Зависит от

Нет зависимостей.

### Меняется public API

Добавить:

- `LiteFsmPlugin`;
- `PluginCapabilities`;
- `definePlugin(...)`;
- `plugins?: readonly [...Plugins]` в `MachineManagerOptions`.

`PluginInstallContext` на этом этапе содержит только те registry-поля, которые реально работают в этапе. Если конкретное registry-поле еще не реализовано, оно не должно быть доступно как stable public type.

### Runtime-контракт этапа

- `MachineManager(machines)` работает как раньше.
- `MachineManager(machines, { plugins: [] })` работает как `MachineManager(machines)`.
- `MachineManager(machines, { plugins: [pluginA, pluginB] })` вызывает `install(...)` в порядке массива.
- Plugin install выполняется один раз на manager init.
- Plugin install выполняется до compile machines.
- Plugin не получает mutable runtime state конкретного dispatch.
- Plugin не мутирует `machines` напрямую.
- No-op plugin не меняет state, reducers, middleware, subscribers, effects, snapshot и hydrate.

### Диагностика этапа

- Duplicate plugin names вызывают clear error на manager init.
- Ошибка из `install(...)` пробрасывается вызывающему `MachineManager(...)`.

### Типовой контракт этапа

- `definePlugin(...)` сохраняет literal `name`.
- `definePlugin(...)` сохраняет phantom capabilities.
- Plugin factory может возвращать `LiteFsmPlugin<Capabilities>`, где `Capabilities` выводятся из options factory.
- На этом этапе не требуется типизировать manager extensions, action meta, deps, scoped transition и machine extensions. Эти поверхности расширения реализуются в отдельных этапах.

### Не делать в этом этапе

- Не выделять `StorageRuntime`.
- Не добавлять dispatch hooks.
- Не добавлять routing meta registry.
- Не добавлять manager extensions на returned manager object.
- Не добавлять storage snapshot extension points.
- Не добавлять entity-specific API.
- Не менять public reducer/effect semantics.

### Тесты этапа

Тесты runtime-поведения:

- no-op plugin сохраняет поведение manager;
- plugins устанавливаются в порядке массива;
- каждый plugin устанавливается один раз;
- duplicate plugin names бросают ошибку;
- ошибка из `install(...)` пробрасывается.

Тесты типов:

- `definePlugin(...)` сохраняет literal `name`;
- plugin factory сохраняет inferred capabilities;
- широкий `LiteFsmPlugin[]` не обязан сохранять plugin-specific inference.

### Критерий завершения

- Все существующие тесты затронутой области работ проходят.
- Новые тесты runtime-поведения и типов этапа проходят.
- Public API changes отражены в cheatsheets.
- Coverage нового и измененного кода этапа равен 100% по statements, branches, functions и lines.

## 9. Этап 2 — Storage registry, runtime preset и default `"instance"` wiring

### Цель

Добавить storage registry, internal `RuntimePreset`, `createMachineManagerFactory(...)` и default runtime preset, который регистрирует `storage: "instance"` перед пользовательскими plugins.

Этот этап должен подключить storage registry к manager init, но не обязан полностью разносить текущую instance-specific реализацию по новым файлам. Полная ownership extraction выполняется на этапе 3.

### Зависит от

Этап 1.

### Меняется public API

Public `MachineManager(...)` получает прежнее поведение через internal `createMachineManagerFactory(defaultRuntimePreset)`. Внешний API для custom runtime presets не появляется.

В `PluginInstallContext` добавить работающее поле:

```ts
type StorageRegistry = {
  register(kind: string, runtime: StorageRuntime): void;
  get(kind: string): StorageRuntime | undefined;
};
```

### Internal API этапа

Добавить internal:

- `RuntimePreset`;
- `createMachineManagerFactory(preset)`;
- `defaultRuntimePreset`;
- `instanceRuntimePlugin`;
- storage registry в plugin registry.

Минимальный целевой contract:

```ts
type StorageRuntime = StorageRuntimeBase & {
  effects?: StorageEffectsRuntime;
  snapshot?: StorageSnapshotRuntime;
  identity?: StorageIdentityRuntime;
  reactions?: StorageReactionRuntime;
};

type StorageRuntimeBase = {
  readonly kind: string;
  validateTemplate(ctx: ValidateTemplateContext): void;
  compileTemplate(ctx: CompileTemplateContext): CompiledStorageTemplate;
  createRuntimeState(ctx: CreateRuntimeStateContext): StorageRuntimeState;
  createPublicInitialState(ctx: CreatePublicInitialStateContext): unknown;
  acceptsEvent(ctx: AcceptsEventContext): boolean;
  reduce(ctx: StorageReduceContext): void;
  commit(ctx: StorageCommitContext): void;
};

type StorageEffectsRuntime = {
  resolveInvocations(ctx: ResolveEffectInvocationsContext): StorageEffectInvocation[];
  invoke(ctx: StorageEffectInvocationContext): void;
};

type StorageSnapshotRuntime = {
  dehydrate(ctx: StorageDehydrateContext): unknown;
  hydrate(ctx: StorageHydrateContext): void;
};

type StorageIdentityRuntime = {
  resolve(ctx: ResolveIdentityContext): RuntimeIdentity | undefined;
};

type StorageReactionRuntime = {
  run(ctx: StorageReactionContext): void;
};

type StorageRuntimeState = unknown;
```

### Runtime-контракт этапа

- Public `MachineManager` всегда использует `defaultRuntimePreset`.
- Preset plugins устанавливаются раньше пользовательских plugins.
- `instanceRuntimePlugin.install(ctx)` регистрирует `storage: "instance"` через `ctx.storage.register(...)`.
- `StorageRegistry.register(...)` регистрирует runtime для значения `machine.storage`.
- Machine без `storage` получает `registry.defaultStorageKind`.
- Для public `MachineManager` default storage kind равен `"instance"`.
- Явное `storage: "instance"` поддерживается.
- `storage: "instance"` не является hardcoded fallback в kernel manager.
- `registry.assertDefaultStorageRegistered()` выполняется после установки preset и пользовательских plugins.
- Compile machines резолвит `machine.storage ?? registry.defaultStorageKind`.
- Hot dispatch path не ищет runtime по строке внутри per-actor/per-row loop.

### Диагностика этапа

- Duplicate storage kind вызывает clear error на manager init.
- Unknown storage kind вызывает clear error на manager init.
- Отсутствующий default storage kind вызывает clear error на manager init.
- Попытка пользовательского plugin зарегистрировать `storage: "instance"` вызывает duplicate storage kind error.

### Совместимость этапа

- `MachineManager(machines)` сохраняет поведение.
- `MachineManager(machines, { plugins: [noOpPlugin] })` сохраняет поведение.
- Текущие reducers, effects, actors, middleware, snapshot и hydrate продолжают работать.
- Standalone `Machine(...)` и `defineMachine().create(...)` продолжают поддерживать только отсутствие `storage` или `storage: "instance"`.

### Не делать в этом этапе

- Не реализовывать custom storage runtime.
- Не экспортировать custom preset API.
- Не переносить entity-specific поведение.
- Не менять snapshot format.
- Не добавлять dispatch hooks.
- Не добавлять routing meta registry.

### Тесты этапа

Тесты runtime-поведения:

- machine без `storage` использует `"instance"`;
- явное `storage: "instance"` работает как отсутствие `storage`;
- unknown `storage` бросает init error;
- duplicate storage kind бросает init error;
- missing default storage kind бросает init error через internal factory test;
- preset plugin устанавливается раньше user plugins;
- user plugin не может повторно занять `"instance"`;
- no-op plugin не меняет поведение.

Тесты типов:

- `MachineManagerOptions` сохраняет tuple inference для `plugins`;
- отсутствие `plugins` сохраняет default event inference.

### Критерий завершения

- Существующие тесты поведения `@lite-fsm/core` проходят.
- Новые registry/runtime tests этапа проходят.
- Cheatsheets обновлены, если public type surface изменился.
- Coverage нового и измененного кода этапа равен 100%.

## 10. Этап 3 — `instanceStorageRuntime` и разделение ownership

### Цель

Оформить текущее поведение lite-fsm как `instanceStorageRuntime`, зарегистрированный через `instanceRuntimePlugin`. Kernel manager должен обращаться к текущему runtime только через `StorageRuntimeBase` и optional capability blocks.

### Зависит от

Этапы 1-2.

### Меняется public API

Public API не меняется.

### Internal ownership этапа

Перенести текущее instance-specific поведение из kernel manager в `runtime/instance/*`:

- validate и compile текущих domain machines;
- actor template classification;
- actor sidecar;
- actor identity indexes;
- group indexes;
- actor counters;
- actor bag cleanup;
- validation replacement actor records;
- domain delivery;
- actor spawn;
- actor delivery;
- terminal collapse semantics;
- actor-aware effects;
- `condition(...)`;
- actor transition sugar;
- self deps;
- effect target resolution;
- current instance snapshot format;
- domain hydrate/dehydrate hooks;
- actor hydrate/dehydrate hooks;
- skip policy для runtime actor templates.

Kernel modules должны владеть только orchestration:

- middleware wrapping;
- dispatch context lifecycle;
- storage runtime selection;
- generic reduce/commit/effects/reactions phases;
- root public state commit;
- subscribers;
- error wiring.

### Storage runtime capability contract

```ts
type StorageRuntime = StorageRuntimeBase & {
  effects?: StorageEffectsRuntime;
  snapshot?: StorageSnapshotRuntime;
  identity?: StorageIdentityRuntime;
  reactions?: StorageReactionRuntime;
};
```

Требования:

- Custom runtime может выбирать свою внутреннюю структуру state и не обязан использовать текущий actor object layout.
- Storage runtime полностью владеет своими runtime indexes, sidecars, effect targets, routing indexes и mutable state.
- Текущий actor sidecar становится внутренностью `instanceStorageRuntime`, а не общей структурой core manager.
- Storage runtime state хранится в manager runtime sidecar map и принадлежит storage runtime.
- Public `MachinesState` остается read model/type surface, а не обязательным mutable storage для custom runtime.
- Runtime обязан реализовать только `StorageRuntimeBase`.
- Runtime не реализует no-op methods вместо отсутствующего capability block.
- Отсутствие `effects` означает, что runtime не участвует в effect phase.
- Отсутствие `reactions` означает, что runtime не участвует в reaction phase.
- Отсутствие `snapshot` означает, что durable snapshot для этого `storage kind` не поддержан.
- Отсутствие `identity` означает, что runtime не поддерживает runtime identity lookup.
- `createRuntimeState(...)` вызывается один раз на manager init для каждого registered storage kind.
- `createRuntimeState(...)` получает все compiled templates своего `storage kind`.
- Per-template runtime data хранится внутри общего `StorageRuntimeState` этого `storage kind`.
- `createPublicInitialState(...)` возвращает публичный slice для backward compatibility, selectors и `MachinesState`.
- `reduce(...)` пишет только в `runtimeState` или dispatch transaction своего runtime.
- `commit(...)` применяет staged runtime operations до subscribers.
- Storage runtime не вызывает subscribers и не запускает effects во время reduce/commit.
- Reactions являются частью storage runtime contract, а не generic dispatch hooks.
- `reactions.run(...)` выполняется после commit storage runtimes и до subscribers.
- Reactions, которым нужны данные до удаления rows, являются storage-specific lifecycle reactions и могут выполняться внутри `commit(...)` соответствующего storage runtime до destructive cleanup.
- Generic `StorageReactionRuntime` не получает отдельный pre-cleanup hook в этом ТЗ.
- Core manager управляет фазой effects, error wiring и deps extension pipeline.
- Конкретный storage runtime создает effect invocations и вызывает свои storage-specific effect functions через `effects.resolveInvocations(...)` и `effects.invoke(...)`.
- `MachineManager` обращается к runtime через этот контракт.
- Runtime compile выполняется один раз на manager init.

Минимальная форма reduce context:

```ts
type StorageReduceContext = {
  manager: ManagerRuntimeContext;
  dispatch: DispatchContext;
  template: CompiledStorageTemplate;
  runtimeState: StorageRuntimeState;
  action: ManagerAction<AnyEvent>;
};
```

### Runtime-контракт этапа

- Это ТЗ не задает новую семантику для `storage: "instance"`. Source of truth для поведения default runtime — текущая реализация `packages/core/src/MachineManager.ts` и существующие тесты.
- Перенос текущего runtime в `instanceStorageRuntime` является ownership/refactoring work: алгоритмы validate, compile, reduce, actor lifecycle, effects, snapshot/hydrate и sidecar reconciliation сохраняют поведение.
- Изменения поведения default runtime допустимы только если они прямо требуются plugin boundary contract и покрыты отдельным критерием приемки в этом ТЗ.
- `instanceStorageRuntime` полностью сохраняет текущую семантику `storage: "instance"`.
- `instanceRuntimePlugin` не мутирует `machines` напрямую и не хранит per-manager mutable state в plugin value.
- `instanceStorageRuntime.effects` создает текущие effect invocations и вызывает storage-specific effects.
- `instanceStorageRuntime.snapshot` сохраняет current instance snapshot format.
- `instanceStorageRuntime.identity` покрывает текущее поведение actor identity.
- `identity.resolve(...)` используется только для runtime identity lookup.
- `instanceStorageRuntime.reactions`, если нужен для текущего поведения, выполняется после commit и до subscribers.
- Kernel routing может вычислять route constraints и priority, но не читает actor records, не поддерживает actor indexes и не создает actor rows.
- Kernel manager не вызывает instance-specific helpers для actor effects, sidecar reconcile или instance snapshot. Он обращается только к `StorageRuntimeBase` и optional capability blocks.
- Shared pure helpers, нужные и standalone `Machine(...)`, и `instanceStorageRuntime`, должны жить вне `runtime/kernel` и `runtime/instance` либо быть neutral helpers без mutable manager state.

### Импортные ограничения этапа

- Kernel modules не импортируют `runtime/instance/*`.
- `runtime/defaultPreset.ts` является единственной точкой, где kernel assembly импортирует `instanceRuntimePlugin`.
- `@lite-fsm/core` не импортирует внешние plugin packages.

### Совместимость этапа

- Существующие тесты проходят без изменения пользовательских сценариев.
- Текущие actor spawning, routing, effects и persistence работают на `instanceStorageRuntime`.
- `getSnapshot()` возвращает прежний public read model.
- `dehydrate(...)` и `hydrate(...)` сохраняют текущий instance snapshot format.
- Middleware `replaceReducer` сохраняет текущий контракт для domain и `storage: "instance"` public state.

### Не делать в этом этапе

- Не реализовывать поведение custom storage runtime за пределами test fixtures.
- Не добавлять public custom preset API.
- Не добавлять entity runtime.
- Не менять public reducer/effect semantics.
- Не добавлять plugin routing meta.
- Не добавлять storage snapshot `snapshot.storage[kind]`; это этап 9.

### Тесты этапа

Тесты runtime-поведения:

- существующие тесты поведения проходят;
- storage runtime без `effects` capability не участвует в effect phase;
- storage runtime без `reactions` capability не участвует в reaction phase;
- storage runtime не вызывает subscribers/effects напрямую;
- touched runtimes commit выполняется до root commit/subscribers;
- reactions выполняются после commit и до subscribers;
- effect phase выполняется после subscribers и middleware post-`next` code;
- unknown/duplicate storage diagnostics из этапа 2 сохраняются.

Тесты snapshot/hydrate:

- current `dehydrate(...)` / `hydrate(...)` для instance runtime сохраняют прежний format;
- `getSnapshot()` не меняет shape.

Тесты импортных границ:

- kernel files не импортируют `runtime/instance/*`;
- единственный import `instanceRuntimePlugin` находится в `runtime/defaultPreset.ts`.

### Критерий завершения

- Существующие core runtime, snapshot и type tests проходят.
- Новые ownership/runtime/import-boundary tests проходят.
- Coverage нового и измененного кода этапа равен 100%.
- В коде не осталось старого владельца поведения, который больше не вызывается.

## 11. Этап 4 — Routing meta registry

### Цель

Добавить plugin-provided routing meta keys и registry-aware normalization до dispatch hooks.

### Зависит от

Этапы 1-3.

### Меняется public API

В `PluginInstallContext` добавить работающее поле:

```ts
type RoutingRegistry = {
  registerMetaKey<Key extends string>(key: Key, resolver: RouteResolver<Key>): void;
};
```

Plugin capabilities для `actionMeta` типизируются позднее на этапе 6. На этом этапе реализуется runtime routing contract.

### Runtime-контракт этапа

- Routing meta registry является частью normalization contract.
- Registered `meta` keys сохраняются и валидируются в pre-normalization и post-normalization.
- `stripRouting` не удаляет registered plugin meta keys.
- Sender normalization сохраняет registered plugin meta keys.
- Route resolver выполняется во время normalize/routing до выбора targets.
- Route resolver не создает actor rows и не мутирует storage runtime state.
- Core применяет единый routing priority на уровне route constraints.
- Storage runtimes не пересчитывают priority самостоятельно.
- Каждый plugin-owned `meta` key должен быть зарегистрирован через `routing.registerMetaKey(...)`.
- Произвольные неизвестные `action.meta` keys не являются ошибкой runtime: normalization срезает или игнорирует их.
- Plugin-provided `action.meta` fields являются routing/service keys. Пользовательские данные передаются через `payload` или internal plugin transaction state.

Built-in priority:

1. `actorId`;
2. registered plugin route keys в порядке регистрации;
3. `groupId`;
4. `groupTag`;
5. unscoped.

Если action содержит несколько route keys, применяется первый key по priority. Остальные route keys игнорируются как менее приоритетные; intersection/union routing не выполняется.

`groupTag` остается multi-runtime route constraint: каждый storage runtime сам доставляет action своим targets, соответствующим `groupTag`.

### Диагностика этапа

- Duplicate route meta key вызывает clear error на manager init.
- Invalid route resolver result вызывает clear error, если runtime не может безопасно продолжить.
- Произвольный unregistered `action.meta` key не бросает ошибку и не влияет на routing.

### Совместимость этапа

- Core keys `actorId`, `groupId`, `groupTag` и sender fields остаются доступны всегда.
- Текущее actor routing сохраняется.
- Middleware rewrite не должен терять plugin route keys.
- No-op routing registry не меняет поведение.

### Не делать в этом этапе

- Не добавлять action interceptors.
- Не добавлять dispatch hooks.
- Не добавлять manager extensions.
- Не добавлять entity runtime.
- Не добавлять action meta typing; это этап 6.

### Тесты этапа

Тесты runtime-поведения:

- route resolver обрабатывает plugin meta key;
- duplicate route meta key бросает init error;
- unregistered `action.meta` key срезается или игнорируется без ошибки;
- `meta.entityId` test key не теряется при middleware rewrite и post-normalization;
- registered plugin route key имеет priority между `actorId` и `groupId`;
- несколько registered plugin route keys применяются по priority-first в порядке регистрации;
- `groupTag` остается доступным нескольким storage runtimes;
- route resolver не мутирует storage runtime state.

### Критерий завершения

- Существующие routing tests проходят.
- Новые routing registry tests проходят.
- Coverage нового и измененного кода этапа равен 100%.

## 12. Этап 5 — Action interceptors и dispatch hooks

### Цель

Добавить action interceptors, dispatch hook phases и `DispatchContext.reportError(...)`, сохранив существующий middleware contract.

### Зависит от

Этапы 1-4.

### Меняется public API

В `PluginInstallContext` добавить работающие поля:

```ts
type ActionRegistry = {
  intercept(handler: ActionInterceptor): void;
};

type ActionInterceptor = (ctx: ActionInterceptorContext) =>
  | void
  | {
      action?: ManagerAction<AnyEvent>;
      skipDelivery?: boolean;
      stopInterceptors?: boolean;
    };

type DispatchRegistry = {
  beforeReduce(hook: DispatchHook): void;
  afterReduce(hook: DispatchHook): void;
  beforeCommit(hook: DispatchHook): void;
  beforeSubscribers(hook: DispatchHook): void;
  beforeEffects(hook: DispatchHook): void;
  afterEffects(hook: DispatchHook): void;
};
```

### Dispatch pipeline этапа

Целевой порядок:

```ts
function transition(action) {
  const ctx = createDispatchContext(action);

  preNormalizeWithRoutingRegistry(ctx);
  const middlewareResult = runMiddlewareChain(ctx, () => {
    postNormalizeWithRoutingRegistry(ctx);

    runInterceptors(registry.actions, ctx);

    runHooks(registry.dispatch.beforeReduce, ctx);

    if (!ctx.skipDelivery) {
      for (const compiled of templatesAccepting(ctx.action)) {
        compiled.storageRuntime.reduce(ctx.forTemplate(compiled));
      }
    }

    runHooks(registry.dispatch.afterReduce, ctx);
    runHooks(registry.dispatch.beforeCommit, ctx);

    commitStorageRuntimes(ctx);
    commit(ctx);

    runHooks(registry.dispatch.beforeSubscribers, ctx);
    runStorageReactions(ctx);
    notifySubscribers(ctx);
  });

  if (!ctx.committed) return middlewareResult;

  runHooks(registry.dispatch.beforeEffects, ctx);
  invokeStorageEffects(ctx);
  runHooks(registry.dispatch.afterEffects, ctx);
}
```

### Runtime-контракт interceptors

- Action interceptors выполняются после user action validation, middleware `next(...)` и post-normalization.
- Interceptors выполняются до выбора templates, принимающих event.
- Interceptors выполняются в порядке регистрации.
- Interceptor может подготовить runtime transaction.
- Interceptor может добавить plugin-owned internal operation.
- Interceptor может заменить committed public action до reduce.
- Если interceptor возвращает `action`, reducers, subscribers, effects, middleware post-`next` и committed public action stream видят замененный committed action.
- `skipDelivery: true` означает пропуск delivery в storage reducers/templates.
- Если `skipDelivery !== true`, action продолжает обычный machine delivery pipeline.
- `skipDelivery: true` не останавливает следующие interceptors.
- Цепочка interceptors останавливается только через `stopInterceptors: true`.
- `stopInterceptors: true` не отменяет уже staged plugin runtime operations.
- `stopInterceptors: true` сам по себе не пропускает delivery в machines.
- `skipDelivery` и `stopInterceptors` независимы; interceptor возвращает оба флага, если должен и пропустить delivery, и остановить следующие interceptors.
- Action с `skipDelivery: true` сохраняет plugin runtime operations и dispatch hooks, но пропускает delivery в machines.
- Public event остается в committed public action stream, даже если interceptor создал internal runtime operations.

### Runtime-контракт hooks

- Hooks выполняются в порядке регистрации.
- Hook получает текущий dispatch context.
- `beforeReduce` может выполнить staged internal operations до public machine delivery.
- Hook не вызывает `transition(...)` напрямую.
- Reentrant dispatch внутри hook запрещен.
- Plugin hooks не меняют порядок reducer -> commit -> subscribers -> effects, кроме явно разрешенных hook phases.
- No-op hooks не меняют state.
- Effects phase выполняется после возврата всей middleware chain, а не внутри middleware `next(...)`.
- Если middleware не вызвал `next(...)`, interceptors, reducers, commit, subscribers и effects не запускаются.
- Storage runtime `reduce(...)` вызывается только для templates, принимающих event.
- Storage runtime `commit(...)` вызывается один раз для touched runtimes до root commit/subscribers.
- Storage runtime reactions выполняются после commit и до subscribers только для runtimes с `reactions` capability.
- Storage runtime effects выполняются после subscribers и после middleware post-`next` code только для runtimes с `effects` capability.

### Error semantics этапа

- Ошибка dispatch hook является fatal.
- Ошибка hook до commit прерывает dispatch, и state не меняется.
- Ошибка hook после commit пробрасывается вызывающему `transition(...)`.
- После commit rollback не выполняется.
- Если ошибка после commit произошла до оставшихся фаз, оставшиеся фазы не запускаются.
- `onError` не вызывается автоматически для fatal sync hook errors.
- Plugin hook, который выполняет optional external side effect и не должен ломать dispatch, обязан сам выполнить `try/catch` и вызвать `ctx.reportError(error)`.
- `DispatchContext.reportError(error)` передает ошибку в `onError` и не меняет control flow dispatch.

### Не делать в этом этапе

- Не добавлять manager extensions.
- Не добавлять storage snapshot extension points.
- Не добавлять deps extension pipeline.
- Не добавлять entity-specific side effects вне hook contracts.

### Тесты этапа

Тесты runtime-поведения:

- no-op hooks не меняют state;
- interceptors выполняются в порядке регистрации;
- hooks выполняются в порядке регистрации;
- interceptor может заменить committed action;
- замененный action видят reducers, subscribers, effects и committed public action stream;
- `skipDelivery: true` пропускает machine delivery;
- `skipDelivery: true` не останавливает следующие interceptors;
- `stopInterceptors: true` останавливает следующие interceptors;
- `stopInterceptors: true` не отменяет уже staged operations;
- `stopInterceptors: true` без `skipDelivery: true` сохраняет machine delivery;
- middleware без `next(...)` не запускает interceptors/hooks/reducers/effects;
- effects phase остается после middleware chain;
- `beforeReduce` hook выполняется до storage runtime reduce;
- `beforeCommit` hook выполняется до storage runtime commit;
- fatal error до commit не меняет state;
- fatal error после commit не выполняет rollback;
- `reportError(...)` вызывает `onError` и не меняет control flow;
- reentrant dispatch внутри hook запрещен.

### Критерий завершения

- Существующие middleware/effects tests проходят.
- Новые dispatch hook tests проходят.
- Coverage нового и измененного кода этапа равен 100%.

## 13. Этап 6 — TypeScript surface для machine extensions, transition events и action meta

### Цель

Открыть type-level extension points для plugin-provided machine config, internal events, manager transition events и `action.meta`.

### Зависит от

Этапы 1-5.

### Меняется public API

Добавить третий generic в `TypedCreateMachineFn`:

```ts
type TypedCreateMachineFn<
  AppEvents extends AnyEvent,
  AppDeps extends object = {},
  Extensions extends MachineRuntimeExtension = {},
> = <Config>(
  cfg: CreateMachineInput<AppEvents, AppDeps, Extensions, Config>,
) => MachineConfigResult<...>;
```

Зафиксировать минимальный contract для `MachineRuntimeExtension`:

```ts
type MachineRuntimeExtension = {
  readonly storage: string;
  readonly input?: object;
  readonly internalEvents?: AnyEvent;
  readonly reducerContext?: object;
  readonly effectDeps?: object;
  readonly reactionDeps?: object;
  readonly resultMetadata?: object;
  readonly publicState?: unknown;
};
```

Добавить manager transition event inference:

```ts
type ManagerFromPlugins<
  S extends MachineStore,
  AppEvents extends AnyEvent,
  Plugins extends readonly LiteFsmPlugin[],
> = IMachineManager<S, AppEvents | PluginTransitionEvents<Plugins>>;

type ManagerTransitionEvents<AppEvents, Plugins> =
  AppEvents | PluginTransitionEvents<Plugins>;
```

Добавить action meta inference:

```ts
type ManagerActionMeta<Plugins> = CoreActionMeta & PluginActionMeta<Plugins>;
```

Manager object extensions не добавляются в этом этапе. Они реализуются на этапе 8.

### Machine extension typing contract

- Plugins не меняют global `createMachine(...)` typing автоматически.
- Plugin packages экспортируют type-level machine extension.
- Application wrappers передают extension type в `TypedCreateMachineFn`.
- Третий generic принимает composite/union extension type, например `EntityMachineExtension | OtherExtension`.
- Core types распределяют storage-specific input по union extensions и выбирают input shape по `cfg.storage`.
- Machine typing не зависит от runtime plugin values и не требует передавать plugin tuple в `createMachine`.
- Extension может добавлять allowed `storage` values.
- Extension может определять storage-specific `CreateMachineInput` для своего `storage kind`.
- Storage-specific input может переопределять типы core fields, включая `initialContext`, `reducer` и `effects`.
- Extension может добавлять config fields для конкретного `storage`.
- Extension может добавлять internal machine events в `config`/`reducer` без добавления в `AppEvents`.
- Extension может добавлять storage-specific reducer context для matching `storage`.
- Extension может добавлять storage-specific effect/reaction deps для matching `storage`.
- Extension может добавлять effect/reaction config fields.
- Extension может добавлять phantom metadata к `MachineConfigResult` для downstream types.
- Extension может переопределять public state slice type через `publicState`; если `publicState` не задан, используется текущий core shape.
- `resultMetadata` и `publicState` должны быть доступны downstream utility types, включая `MachinesState<S>` и plugin package helpers.
- Extension typing применяется только в wrappers, где разработчик явно передал extension type.
- Core `createMachine` без typed wrapper сохраняет текущее поведение.
- `storage: "instance"` типизируется как явный storage kind из default runtime extension.

Пример wrapper:

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

### Transition event typing contract

- Если пользователь не задал `AppEvents`, `manager.transition(...)` принимает `MachineEvents<S> | PluginTransitionEvents<Plugins>`.
- Если пользователь явно задал `AppEvents`, `manager.transition(...)` принимает `AppEvents | PluginTransitionEvents<Plugins>`.
- Plugin transition events не подмешиваются в `createMachine<AppEvents>`.
- Machine видит plugin events только если разработчик явно добавил их в `AppEvents`.
- Plugin transition events выводятся только из plugins, переданных в текущий `MachineManager(...)`.
- Текущее поведение `MachineEvents<S>` сохраняется без plugins.

### Action meta typing contract

- Plugin может добавить typed `action.meta` fields только для routing/service semantics.
- Plugin action meta только расширяет core meta через intersection, не заменяет его.
- Core keys `actorId`, `groupId`, `groupTag` и sender fields остаются доступны всегда.
- Route resolver должен быть зарегистрирован для каждого plugin-declared `action.meta` key.
- Произвольные неизвестные `action.meta` keys срезаются или игнорируются runtime normalization из этапа 4.
- Пользовательские данные не хранятся в `action.meta`; для них используется `payload`.

### Runtime-контракт этапа

- Type-level extension не заменяет runtime validation.
- Plugin runtime все равно валидирует extended config на manager init.
- Без plugin extension TypeScript не показывает plugin-specific storage config.
- Без plugin transition capability TypeScript не разрешает plugin transition events.

### Не делать в этом этапе

- Не реализовывать non-core storage runtime.
- Не добавлять entity lifecycle events.
- Не добавлять manager object extensions.
- Не добавлять deps extension runtime pipeline.

### Тесты этапа

Тесты типов:

- test plugin добавляет `storage` kind через typed wrapper;
- test plugin добавляет required config field для своего `storage kind`;
- test plugin переопределяет core field type для storage-specific input;
- test plugin добавляет internal machine event без добавления в app events;
- test plugin добавляет storage-specific reducer context;
- test plugin добавляет phantom `resultMetadata` для downstream utility type;
- test plugin переопределяет `MachinesState` slice через `publicState`;
- core `createMachine` без wrapper не принимает plugin-specific fields;
- `storage: "instance"` типизируется как явный storage kind;
- `manager.transition(...)` принимает plugin transition events только от plugins текущего manager;
- plugin transition events не подмешиваются в machine `AppEvents`;
- `action.meta.foo` типизируется только при plugin capability;
- core meta keys всегда доступны.

Тесты runtime-поведения:

- invalid storage-specific config из test plugin бросает init error;
- отсутствие route resolver для runtime-supported meta key бросает clear error.

### Критерий завершения

- Tstyche type tests этапа проходят.
- Существующие type tests проходят.
- Runtime validation tests этапа проходят.
- Cheatsheets обновлены.
- Coverage runtime-кода этапа равен 100%.

## 14. Этап 7 — Scoped deps и scoped transition extensions

### Цель

Добавить runtime и type-level extension points для effect/reaction deps и scoped `transition`.

### Зависит от

Этапы 1-6.

### Меняется public API

В `PluginInstallContext` добавить работающее поле:

```ts
type DepsExtensionRegistry = {
  extendDeps(factory: ScopedDepsFactory): void;
  extendTransition(factory: ScopedTransitionFactory): void;
};
```

Расширить effect deps typing:

```ts
type EffectDeps<AppDeps, Plugins> = AppDeps &
  PluginDeps<Plugins> & {
    transition: CoreTransition & PluginTransitionExtensions<Plugins>;
  };
```

### Runtime-контракт этапа

- Deps extension вызывается для каждого effect/reaction invocation.
- Deps extension получает invocation scope:
  - source template;
  - event;
  - indices;
  - phase.
- Deps extension может дополнить user deps.
- Deps extension может заменить только keys, явно принадлежащие этому plugin capability.
- Transition extension добавляет методы к scoped `transition`.
- Extension object для async effect должен сохранять captured invocation scope после `await`.
- Reaction deps могут переиспользовать scope-bound objects, если reaction sync-only и это не создает allocations на steady-state hot path.
- Scoped deps и scoped `transition` доступны только внутри effects/reactions.
- Manager extensions и scoped deps являются разными поверхностями расширения.

### Ownership diagnostics этапа

- Duplicate deps extension ownership for same key вызывает clear error на manager init.
- Duplicate transition extension ownership for same key вызывает clear error на manager init.
- Попытка extension заменить key, которым plugin не владеет, вызывает clear error.
- Попытка заменить core `transition` method без явного разрешения вызывает clear error.

### Совместимость этапа

- Существующее поведение `AppDeps` сохраняется.
- Существующий `transition(...)` внутри effects сохраняет core methods.
- No-op deps extension не меняет поведение.
- Effects phase ordering из этапа 5 сохраняется.

### Не делать в этом этапе

- Не добавлять manager object extensions.
- Не добавлять entity-specific deps.
- Не менять public reducer/effect semantics.
- Не добавлять storage snapshot extension points.

### Тесты этапа

Тесты runtime-поведения:

- deps extension вызывается для каждого effect invocation;
- deps extension получает корректный source template, event, indices и phase;
- deps extension может добавить новый dep key;
- deps extension не может override чужой key;
- duplicate deps ownership бросает init error;
- transition extension добавляет scoped method;
- duplicate transition ownership бросает init error;
- async effect сохраняет captured invocation scope после `await`;
- no-op deps extension не меняет поведение.

Тесты типов:

- test plugin добавляет typed dep внутри effect;
- test plugin добавляет typed `transition.foo(...)` внутри effect;
- typed scoped transition недоступен без plugin capability;
- typed scoped deps недоступны вне effects/reactions.

### Критерий завершения

- Существующие effects tests проходят.
- Новые тесты runtime-поведения и типов этапа проходят.
- Cheatsheets обновлены.
- Coverage нового и измененного runtime-кода этапа равен 100%.

## 15. Этап 8 — Manager extensions

### Цель

Добавить manager extensions на returned manager object и типизировать returned manager через plugin capabilities.

### Зависит от

Этапы 1-7.

### Меняется public API

В `PluginInstallContext` добавить работающее поле:

```ts
type ManagerExtensionRegistry = {
  extend<Key extends string, Value>(
    key: Key,
    factory: (ctx: ManagerRuntimeContext) => Value,
  ): void;
};
```

Расширить manager return type:

```ts
type ManagerExtensionCapability = {
  <S extends MachineStore, AppEvents extends AnyEvent>(): object;
};

type ManagerFromPlugins<
  S extends MachineStore,
  AppEvents extends AnyEvent,
  Plugins extends readonly LiteFsmPlugin[],
> = IMachineManager<S, AppEvents | PluginTransitionEvents<Plugins>> &
  PluginManagerExtensions<S, AppEvents, Plugins>;
```

### Runtime-контракт этапа

- Manager extension добавляется на returned manager object.
- Extension factory вызывается после compile machines.
- Extension factory получает stable runtime context.
- Extension не перезаписывает core manager methods.
- Duplicate manager extension key вызывает clear error на manager init.
- Plugin manager extensions могут зависеть от `S extends MachineStore`.
- `PluginManagerExtensions<S, AppEvents, Plugins>` вычисляется с доступом к machines текущего manager.
- Без plugin extension TypeScript не показывает соответствующее поле.

### Совместимость этапа

- Существующие manager methods сохраняют identity и поведение.
- No-op manager extension registry не меняет returned manager.
- `manager.entities` и другие entity-specific extensions не появляются без соответствующего plugin.

### Не делать в этом этапе

- Не реализовывать entity-specific `manager.entities`.
- Не добавлять React hooks.
- Не добавлять storage snapshot extension points.
- Не экспортировать custom preset API.

### Тесты этапа

Тесты runtime-поведения:

- plugin может добавить `manager.foo`;
- extension factory вызывается после compile machines;
- extension получает stable runtime context;
- duplicate extension key бросает init error;
- extension не может перезаписать core manager method;
- no-op plugin не меняет manager shape.

Тесты типов:

- plugin может добавить typed `manager.foo`;
- plugin manager extension может зависеть от `S extends MachineStore`;
- без plugin TypeScript не показывает `manager.foo`;
- широкий `LiteFsmPlugin[]` не обязан сохранять plugin-specific manager extension inference.

### Критерий завершения

- Существующие manager tests проходят.
- Новые тесты runtime-поведения и типов этапа проходят.
- Cheatsheets обновлены.
- Coverage нового и измененного кода этапа равен 100%.

## 16. Этап 9 — Storage snapshot extension points

### Цель

Дать storage runtimes возможность сериализовать и восстанавливать runtime state через `snapshot.storage[kind]` без изменения текущего instance snapshot format.

### Зависит от

Этапы 1-8.

### Меняется public API

Расширить snapshot/dehydrate/hydrate contracts так, чтобы storage runtime snapshots round-trip через top-level `snapshot.storage[kind]`.

Добавить filter:

```ts
dehydrate({ storage })
```

Filter `storage` независим от существующего `dehydrate({ machines })`.

В MVP `MachineManagerSnapshot` получает базовую storage envelope форму:

```ts
type MachineManagerSnapshot<S extends MachineStore> = {
  schemaVersion?: number;
  machines: Partial<{ [key in SnapshotMachineKey<S>]: SnapshotForMachine<S[key]> }>;
  storage?: Record<string, unknown>;
};
```

Plugin-specific snapshot payload типизируется и валидируется package-level API соответствующего plugin.

### Runtime-контракт этапа

- `StorageSnapshotRuntime.dehydrate(...)` получает доступ к `runtimeState` своего storage kind.
- `StorageSnapshotRuntime.hydrate(...)` получает доступ к `runtimeState` своего storage kind.
- `snapshot.dehydrate(...)` вызывается только `dehydrate(...)`.
- Storage runtime snapshot сериализуется в top-level `snapshot.storage[kind]`.
- Runtime без `snapshot` capability не пишет `snapshot.storage[kind]`.
- `dehydrate()` без filters экспортирует все eligible `machines` и все storage runtimes со `snapshot` capability.
- `dehydrate({ machines })` фильтрует только `machines` и не отключает `storage`.
- `dehydrate({ storage })` фильтрует только storage и не отключает `machines`.
- `dehydrate({ storage: [] })` явно отключает export storage runtimes.
- Если `dehydrate({ storage })` явно запрашивает runtime без `snapshot` capability, manager бросает clear error.
- Если `hydrate(...)` получает `snapshot.storage[kind]` для известного runtime без `snapshot` capability, manager бросает clear error.
- Если `hydrate(...)` или `getHydratedState(...)` получает `snapshot.storage[kind]` для неизвестного storage runtime, manager бросает clear error.
- `getSnapshot()` не вызывает `StorageSnapshotRuntime.dehydrate(...)`.
- `getSnapshot()` возвращает только public `machines` read model без `storage`.
- Time travel, import и durable restore custom storage runtimes должны идти через `dehydrate(...)` / `hydrate(...)` и `snapshot.storage[kind]`.

### Совместимость этапа

- Текущий snapshot format для `storage: "instance"` сохраняется.
- Отсутствие `storage` в snapshot сохраняет совместимость с текущими snapshots.
- Текущие dehydrate/hydrate tests проходят.
- `replaceReducer` не является API мутации custom storage runtime.
- Middleware `replaceReducer` сохраняет текущий контракт для domain и `storage: "instance"` public state.

### Диагностика этапа

- Явный `dehydrate({ storage })` для runtime без `snapshot` capability бросает clear error.
- `hydrate(...)` snapshot данных известного runtime без `snapshot` capability бросает clear error.
- `hydrate(...)` и `getHydratedState(...)` snapshot данных неизвестного storage runtime бросают clear error.
- Invalid storage snapshot payload бросает clear error, если runtime не может безопасно продолжить.

### Не делать в этом этапе

- Не реализовывать entity snapshot format.
- Не добавлять Devtools provider API.
- Не добавлять graph/devtools metadata.
- Не менять existing instance snapshot format.

### Тесты этапа

Тесты snapshot/hydrate:

- текущие dehydrate/hydrate tests проходят;
- test storage runtime snapshot round-trip проходит через `snapshot.storage[testKind]`;
- runtime без `snapshot` capability не добавляет `snapshot.storage[kind]`;
- `dehydrate()` по умолчанию включает snapshot runtimes с `snapshot` capability;
- `dehydrate({ machines })` не отключает storage snapshot;
- `dehydrate({ storage: [] })` отключает storage snapshot;
- явный `dehydrate({ storage: [kind] })` для runtime без capability бросает clear error;
- `hydrate(...)` данных известного runtime без capability бросает clear error;
- unknown storage snapshot key бросает clear error;
- `getSnapshot()` не включает `storage`;
- отсутствие `storage` в legacy snapshot сохраняет поведение hydrate.

Тесты runtime-поведения:

- storage snapshot не влияет на чужие storage runtimes;
- hydrate вызывает только runtime, которому принадлежит `storage kind`.

### Критерий завершения

- Существующие snapshot tests проходят.
- Новые storage snapshot tests проходят.
- Cheatsheets обновлены, если public snapshot type изменился.
- Coverage нового и измененного кода этапа равен 100%.

## 17. Этап 10 — Документация, examples и final verification

### Цель

Задокументировать plugin lifecycle, storage runtime contract, typed `createMachine` extension pattern и минимальные examples для будущих runtime plugins.

### Зависит от

Этапы 1-9.

### Меняется документация

Обновить документацию и cheatsheets без запуска docs build:

- plugin lifecycle;
- `definePlugin(...)`;
- `MachineManager(..., { plugins })`;
- встроенный default runtime preset;
- storage runtime contract;
- optional capability blocks;
- typed `createMachine` wrapper pattern;
- plugin-provided manager extension;
- plugin-provided storage runtime;
- `snapshot.storage[kind]`;
- ограничение: custom runtime presets остаются future extension point;
- ограничение: `@lite-fsm/entities` зависит от этой plugin system, но не реализуется в этом ТЗ.

### Примеры этапа

Добавить minimal test plugin fixture, который демонстрирует:

- no-op plugin;
- plugin transition event;
- typed `action.meta`;
- typed machine extension для test storage kind;
- typed scoped dep;
- typed scoped transition method;
- typed manager extension;
- storage runtime snapshot round-trip.

Fixture должен быть тестовым или документационным, не unstable public API.

### Не делать в этом этапе

- Не добавлять examples для `@lite-fsm/entities`.
- Не добавлять migration guide для API вне этого ТЗ.
- Не запускать docs build.
- Не менять runtime-поведение.

### Проверки этапа

Запустить проверки, которые не собирают документацию:

- тесты runtime-поведения затронутых пакетов;
- тесты типов;
- `check-types`;
- lint;
- `pnpm run build:packages`, если нужна build-проверка пакетов и она не запускает docs build.

Если доступная команда транзитивно запускает docs build, ее не запускать и явно передать пользователю, что docs build не проверялся.

### Критерий завершения

- Документация описывает текущее публичное поведение, а не future API.
- Cheatsheets отражают public API и public types.
- Примеры компилируются или покрыты тестами.
- Нет `test.only`, временных `test.skip`, незакрытых TODO/FIXME для области работ этого ТЗ, debug logging и fallback-веток только для прохождения тестов.
- В коде не осталось `throw new Error("not implemented")`, временных feature flags или compatibility shims, добавленных только для прохождения тестов.
- Нет мертвого кода после реализации.

## 18. Критерий полной готовности

ТЗ считается реализованным только когда выполнены все условия:

- Все этапы 1-10 завершены по своим критериям завершения.
- Каждое требование из этого документа реализовано и покрыто тестами либо явно указано как вне области работ.
- Все существующие тесты поведения проходят без изменения пользовательских сценариев.
- Все новые тесты runtime-поведения, тесты типов, snapshot tests, `check-types` и lint проходят.
- Сборка документации не запускалась агентом и не является критерием приемки этого ТЗ.
- Coverage по новому и измененному коду равен 100% по statements, branches, functions и lines.
- Формальное покрытие не засчитывается, если не покрыты все позитивные, негативные, граничные и error-path сценарии из критериев приемки.
- Public API остается минимальным и строго типизированным.
- Public API и public types отражены в cheatsheets.
- Нет известных runtime/type/lint ошибок, flaky tests, непроверенных пробелов покрытия, undocumented breaking changes или открытых blockers в журнале реализации.
