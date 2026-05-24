# Plugin system и pluggable runtimes для lite-fsm — ТЗ

## 1. Цель

Реализовать в `@lite-fsm/core` plugin system, которая позволяет подключать новые runtime capabilities без встраивания их в kernel manager. Текущее поведение lite-fsm должно стать встроенным default runtime preset внутри `@lite-fsm/core`, а внешние runtime вроде `@lite-fsm/entities` должны подключаться через plugins.

Архитектурная граница должна позволять в будущем вынести default runtime preset в отдельный пакет и собрать облегченный manager без `storage: "instance"`, effects, snapshot/hydrate или identity capabilities. В этом ТЗ такой облегченный public API не реализуется: `MachineManager(machines)` продолжает автоматически использовать встроенный default runtime preset.

## 2. Предусловия и зависимости

- Это ТЗ должно быть реализовано до [`tz-final.md`](./tz-final.md), потому что `@lite-fsm/entities` зависит от plugin system.
- `@lite-fsm/core` не должен импортировать внешние plugin packages.
- `MachineManager(machines)` и существующие public exports должны сохранить текущее поведение без изменений пользовательского кода.

## 3. Термины

- Plugin — value с `name`, `install(ctx)` и phantom `__capabilities` для TypeScript inference.
- Plugin capability — типовой контракт plugin-provided manager extensions, transition events, machine extensions, action meta, deps и transition extensions.
- Runtime preset — набор runtime plugins и `defaultStorageKind`, с которым создается kernel manager. Public `MachineManager` использует встроенный `defaultRuntimePreset`.
- Storage runtime — runtime-реализация конкретного `machine.storage`, например встроенный `storage: "instance"`.
- Storage runtime capability — опциональный блок storage runtime contract: effects, snapshot, identity или reactions.
- Dispatch context — runtime context одного `transition(...)`, доступный action interceptors, dispatch hooks и storage runtimes.

### 3.1. Ошибки конфигурации

Структурные ошибки plugin system являются init-time/runtime contract errors и бросаются независимо от `IS_DEV`:

- duplicate plugin names;
- duplicate storage kind;
- unknown storage kind;
- duplicate route meta key;
- unknown registered-shape `action.meta` key без route resolver;
- duplicate manager extension key;
- попытка перезаписать core manager method;
- duplicate deps/transition extension ownership;
- default storage kind отсутствует в storage registry после установки preset и пользовательских plugins;
- попытка использовать storage capability, которую runtime явно не поддерживает;
- invalid storage-specific machine config, из-за которого runtime не может безопасно продолжить.

`IS_DEV` используется только для дорогих диагностических проверок, которые не нужны для корректности production hot path.

## 4. Область работ

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

## 5. Вне области работ

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

## 6. Публичный API

### 6.1. Plugins для manager

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

type ManagerFromPlugins<
  S extends MachineStore,
  AppEvents extends AnyEvent,
  Plugins extends readonly LiteFsmPlugin[],
> = IMachineManager<S, AppEvents | PluginTransitionEvents<Plugins>> & PluginManagerExtensions<S, AppEvents, Plugins>;
```

Требования:

- `plugins` опционален.
- Отсутствие `plugins` сохраняет текущее поведение `MachineManager`.
- Порядок установки plugins соответствует порядку массива.
- `Plugins` инферится из literal tuple `options.plugins`.
- Если `plugins` передан как широкий `LiteFsmPlugin[]`, plugin-specific manager extensions могут быть недоступны в TypeScript.
- `PluginTransitionEvents<Plugins>` выводится из `Plugins[number]["__capabilities"]["transitionEvents"]`.
- `PluginManagerExtensions<S, AppEvents, Plugins>` выводится из `Plugins[number]["__capabilities"]["manager"]`.
- Duplicate plugin names вызывают clear error на manager init.
- Plugin install выполняется до compile machines.
- Plugin install не имеет доступа к mutable runtime state конкретного dispatch.

### 6.2. Встроенный default runtime preset

`MachineManager(machines)` семантически эквивалентен созданию manager через встроенный `defaultRuntimePreset`. Preset устанавливает `instanceRuntimePlugin` перед пользовательскими plugins и задает `defaultStorageKind: "instance"`. `instanceRuntimePlugin` и `defaultRuntimePreset` не являются публичными exports в этом ТЗ.

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

Требования:

- Public `MachineManager` всегда использует встроенный `defaultRuntimePreset`.
- Plugins из preset устанавливаются раньше пользовательских plugins.
- `instanceRuntimePlugin` регистрирует `storage: "instance"`.
- Machine без `storage` использует `registry.defaultStorageKind`; для public `MachineManager` это `"instance"`.
- Явное `storage: "instance"` поддерживается и эквивалентно отсутствующему `storage` в public `MachineManager`.
- `storage: "instance"` не является глобальной магией kernel manager. Kind занят потому, что `defaultRuntimePreset` регистрирует его раньше пользовательских plugins.
- Пользовательский plugin не может повторно зарегистрировать `storage: "instance"` в public `MachineManager`, потому что это duplicate storage kind.
- Kernel manager не должен напрямую импортировать instance-specific modules, кроме точки сборки `defaultRuntimePreset`.
- Standalone `Machine(...)` и `defineMachine().create(...)` поддерживают только отсутствие `storage` или `storage: "instance"`.
- Standalone runtime не поддерживает plugin-provided storage configs, потому что у него нет plugin registry, manager runtime state, routing и deps pipeline.
- Текущие reducers, effects, actors, middleware, snapshot и hydrate продолжают работать без изменений.
- Public bundle `@lite-fsm/core` импортирует только встроенный default runtime preset и не импортирует внешние plugin packages.
- Future extraction path: `instanceRuntimePlugin` должен быть реализован через те же registry и storage runtime contracts, что и внешний runtime plugin, чтобы его можно было вынести без переписывания kernel manager.

### 6.3. Plugin value и `definePlugin`

```ts
type LiteFsmPlugin<Capabilities extends PluginCapabilities = {}> = {
  readonly name: string;
  install(ctx: PluginInstallContext): void;

  readonly __capabilities?: Capabilities;
};

type ManagerExtensionCapability = {
  <S extends MachineStore, AppEvents extends AnyEvent>(): object;
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

```ts
const myPlugin = definePlugin<MyPluginCapabilities>({
  name: "my-plugin",
  install(ctx) {
    // registrations
  },
});
```

Требования:

- `name` является stable id plugin.
- `install(...)` вызывается один раз на manager init.
- Phantom capabilities используются только для TypeScript inference.
- Plugin не мутирует `machines` напрямую.
- Plugin регистрирует capabilities через `PluginInstallContext`.
- `definePlugin(...)` возвращает `LiteFsmPlugin`.
- `definePlugin(...)` сохраняет literal `name`.
- `definePlugin(...)` сохраняет phantom capabilities для manager extensions, transition events, machine extensions, deps и action meta.
- Plugin factory может возвращать `LiteFsmPlugin<Capabilities>`, где `Capabilities` выводятся из options factory.
- Manager capability может быть generic от `S extends MachineStore`, чтобы returned manager extensions типизировались через machines текущего `MachineManager(...)`.

### 6.4. `PluginInstallContext`

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

Registry-типы:

```ts
type ActionRegistry = {
  intercept(handler: ActionInterceptor): void;
};

type ActionInterceptor = (ctx: ActionInterceptorContext) => void | {
  action?: ManagerAction<AnyEvent>;
  skipDelivery?: boolean;
  stopInterceptors?: boolean;
};

type StorageRegistry = {
  register(kind: string, runtime: StorageRuntime): void;
  get(kind: string): StorageRuntime | undefined;
};

type DispatchRegistry = {
  beforeReduce(hook: DispatchHook): void;
  afterReduce(hook: DispatchHook): void;
  beforeCommit(hook: DispatchHook): void;
  beforeSubscribers(hook: DispatchHook): void;
  beforeEffects(hook: DispatchHook): void;
  afterEffects(hook: DispatchHook): void;
};

type RoutingRegistry = {
  registerMetaKey<Key extends string>(key: Key, resolver: RouteResolver<Key>): void;
};

type ManagerExtensionRegistry = {
  extend<Key extends string, Value>(key: Key, factory: (ctx: ManagerRuntimeContext) => Value): void;
};

type DepsExtensionRegistry = {
  extendDeps(factory: ScopedDepsFactory): void;
  extendTransition(factory: ScopedTransitionFactory): void;
};
```

Требования:

- Routing meta registry является частью normalization contract: registered `meta` keys сохраняются и валидируются в phase 0/2 normalization, `stripRouting` и routing resolution.
- Action interceptors выполняются после user action validation, middleware `next(...)` и post-normalization, но до выбора templates, принимающих event.
- Action interceptors выполняются в порядке регистрации.
- Action interceptor может подготовить runtime transaction, добавить plugin-owned internal operation, заменить committed public action до reduce, вернуть `skipDelivery: true` или остановить следующие interceptors через `stopInterceptors: true`.
- Если interceptor возвращает `action`, reducers, subscribers, effects, middleware post-`next` и committed public action stream видят замененный committed action.
- Если `skipDelivery !== true`, action продолжает обычный machine delivery pipeline.
- `skipDelivery: true` означает только пропуск delivery в storage reducers/templates.
- `skipDelivery: true` не останавливает следующие interceptors; цепочка останавливается только через `stopInterceptors: true`.
- `stopInterceptors: true` не отменяет уже staged plugin runtime operations.
- `stopInterceptors: true` сам по себе не пропускает delivery в machines.
- `skipDelivery` и `stopInterceptors` независимы; interceptor возвращает оба флага, если должен и пропустить delivery, и остановить следующие interceptors.
- Action с `skipDelivery: true` сохраняет plugin runtime operations и dispatch hooks, но пропускает delivery в machines.
- Public event остается в committed public action stream, даже если interceptor создал internal runtime operations.
- `StorageRegistry.register(...)` регистрирует runtime для значения `machine.storage`.
- Повторная регистрация storage kind вызывает clear error на manager init.
- Unknown `storage` при compile machines вызывает clear error.
- `storage` отсутствует -> `registry.defaultStorageKind`.
- `registry.defaultStorageKind` обязан быть зарегистрирован в `StorageRegistry` после установки preset и пользовательских plugins.
- Dispatch hooks выполняются в порядке регистрации и получают текущий dispatch context.
- `beforeReduce` hook может выполнить staged internal operations до public machine delivery.
- Hook не вызывает `transition(...)` напрямую; reentrant dispatch внутри hook запрещен.
- Ошибка dispatch hook является fatal.
- Ошибка hook до commit прерывает dispatch, и state не меняется.
- Ошибка hook после commit пробрасывается вызывающему `transition(...)`; rollback не выполняется, оставшиеся фазы не запускаются.
- `onError` не вызывается автоматически для fatal sync hook errors.
- Plugin hook, который выполняет optional external side effect и не должен ломать dispatch, обязан сам выполнить `try/catch` и вызвать `ctx.reportError(error)`.
- `DispatchContext` предоставляет internal `reportError(error)` для plugin-owned non-fatal side-effect phases.
- `reportError(error)` передает ошибку в `onError` и не меняет control flow dispatch.
- Route resolver добавляет поддержку plugin-specific `action.meta` fields и выполняется во время normalize/routing до выбора targets.
- Duplicate route meta key вызывает clear error на manager init.
- Route resolver не создает actor rows и не мутирует storage runtime state.
- Core применяет единый routing priority на уровне route constraints; отдельные storage runtimes не пересчитывают priority самостоятельно.
- Built-in priority: `actorId > registered plugin route keys в порядке регистрации > groupId > groupTag > unscoped`.
- Built-in `groupTag` является multi-runtime route constraint: каждый storage runtime сам доставляет action своим targets, соответствующим `groupTag`.
- Action meta typing расширяется через plugin capability `actionMeta`.
- Manager extension добавляется на returned manager object.
- Duplicate manager extension key вызывает clear error на manager init.
- Extension factory вызывается после compile machines и получает stable runtime context.
- Extension не перезаписывает core manager methods.
- Deps extension вызывается для каждого effect/reaction invocation.
- Deps extension получает invocation scope: source template, event, indices, phase.
- Deps extension может заменить или дополнить user deps перед вызовом effect/reaction.
- Deps extension может override только keys, явно принадлежащие этому plugin capability.
- Duplicate deps extension ownership for same key вызывает clear error на manager init.
- Transition extension добавляет методы к scoped `transition`.
- Extension object для async effect должен сохранять captured invocation scope после `await`.
- Reaction deps могут переиспользовать scope-bound objects, если reaction sync-only и это не создает allocations на steady-state hot path.
- `action.meta` остается служебным routing/sender contract, а не произвольным metadata bag.
- Пользовательские данные передаются через `payload`, а не через `meta`.
- Каждый plugin-owned `meta` key должен быть зарегистрирован через `routing.registerMetaKey(...)`.

### 6.5. Контракт `StorageRuntime`

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

type StorageReduceContext = {
  manager: ManagerRuntimeContext;
  dispatch: DispatchContext;
  template: CompiledStorageTemplate;
  runtimeState: StorageRuntimeState;
  action: ManagerAction<AnyEvent>;
};
```

Требования:

- `instanceStorageRuntime` реализует текущее поведение lite-fsm.
- Custom runtime может выбирать свою внутреннюю структуру state и не обязан использовать текущий actor object layout.
- Storage runtime полностью владеет своими runtime indexes, sidecars, effect targets, routing indexes и mutable state.
- Текущий actor sidecar становится внутренностью `instanceStorageRuntime`, а не общей структурой core manager.
- Storage runtime state хранится в manager runtime sidecar map и принадлежит storage runtime.
- Public `MachinesState` остается read model/type surface, а не обязательным mutable storage для custom runtime.
- Storage runtime обязан реализовать только `StorageRuntimeBase`.
- Optional capability block отсутствует, если runtime не поддерживает соответствующий контракт.
- Отсутствие `effects` означает, что runtime не участвует в effect phase.
- Отсутствие `reactions` означает, что runtime не участвует в reaction phase.
- Отсутствие `snapshot` означает, что durable storage snapshot для этого `storage kind` не поддержан.
- Отсутствие `identity` означает, что runtime не поддерживает lookup runtime identity через actor/entity-style identity contract.
- Runtime не должен реализовывать no-op capability methods вместо отсутствующего capability block.
- `createRuntimeState(...)` вызывается один раз на manager init для каждого registered storage kind.
- `createRuntimeState(...)` получает все compiled templates своего `storage kind`.
- Per-template runtime data хранится внутри общего `StorageRuntimeState` этого `storage kind`.
- `createPublicInitialState(...)` возвращает публичный slice, нужный для backward compatibility, selectors и `MachinesState`.
- `reduce(...)` пишет только в `runtimeState` или dispatch transaction своего runtime.
- `commit(...)` применяет staged runtime operations до subscribers.
- Storage runtime не вызывает subscribers и не запускает effects во время reduce/commit.
- Reactions являются частью storage runtime contract, а не generic dispatch hooks.
- `reactions.run(...)` выполняется после commit storage runtimes и до subscribers.
- Reactions, которым нужны данные до удаления rows, могут выполняться внутри `commit(...)` соответствующего storage runtime до collapse cleanup.
- Core manager управляет фазой effects, error wiring и deps extension pipeline.
- Конкретный storage runtime создает effect invocations и вызывает свои storage-specific effect functions через `effects.resolveInvocations(...)` и `effects.invoke(...)`.
- `snapshot.dehydrate(...)` и `snapshot.hydrate(...)` получают доступ к `runtimeState` своего storage kind.
- `snapshot.dehydrate(...)` вызывается только `dehydrate(...)` и сериализуется в top-level `snapshot.storage[kind]`.
- Если `dehydrate({ storage })` явно запрашивает runtime без `snapshot` capability, manager бросает clear error.
- Если `hydrate(...)` получает `snapshot.storage[kind]` для известного runtime без `snapshot` capability, manager бросает clear error.
- Unknown storage snapshot key игнорируется или передается в `onUnknownMachineKey`-совместимый handler по существующей политике.
- `getSnapshot()` не вызывает `StorageSnapshotRuntime.dehydrate(...)` и возвращает только public `machines` read model без `storage`.
- `identity.resolve(...)` используется только для runtime identity lookup. `instanceStorageRuntime.identity` покрывает текущее actor identity поведение.
- `MachineManager` обращается к runtime через этот контракт.
- Runtime compile выполняется один раз на manager init.
- Hot dispatch path не ищет runtime по строке внутри per-actor/per-row loop.

### 6.6. Ownership встроенного default runtime

`defaultRuntimePreset` является composition layer без собственного runtime state. Он только задает `defaultStorageKind` и порядок установки runtime plugins. Текущее поведение lite-fsm принадлежит `instanceRuntimePlugin` и `instanceStorageRuntime`, а не kernel manager.

Рекомендуемая внутренняя структура модулей:

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

Требования:

- Это ТЗ не задает новую семантику для `storage: "instance"`. Source of truth для поведения default runtime — текущая реализация `packages/core/src/MachineManager.ts` и существующие тесты.
- Перенос текущего runtime в `instanceStorageRuntime` является ownership/refactoring work: алгоритмы validate, compile, reduce, actor lifecycle, effects, snapshot/hydrate и sidecar reconciliation сохраняют поведение.
- Изменения поведения default runtime допустимы только если они прямо требуются plugin boundary contract и покрыты отдельным acceptance criterion в этом ТЗ.
- `runtime/defaultPreset.ts` является единственной точкой, где kernel assembly импортирует `instanceRuntimePlugin`.
- Kernel modules не импортируют `runtime/instance/*`.
- `instanceRuntimePlugin.install(ctx)` регистрирует `storage: "instance"` через `ctx.storage.register(...)`.
- `instanceRuntimePlugin` не мутирует `machines` напрямую и не хранит per-manager mutable state в plugin value.
- `instanceStorageRuntime.createRuntimeState(...)` создает весь mutable state для `storage: "instance"`.
- `instanceStorageRuntime.compileTemplate(...)` владеет classification текущих domain machines и actor templates для `storage: "instance"`.
- `instanceStorageRuntime` владеет текущими actor sidecar, actor identity indexes, group indexes, actor counters, actor bag cleanup и validation replacement actor records.
- `instanceStorageRuntime.reduce(...)` владеет текущей domain delivery, actor spawn, actor delivery и terminal collapse semantics для `storage: "instance"`.
- `instanceStorageRuntime.identity` владеет actor identity lookup и возвращает только kernel-compatible `RuntimeIdentity`.
- `instanceStorageRuntime.effects` владеет текущими actor-aware effects, `condition(...)`, actor transition sugar, self deps и effect target resolution.
- `instanceStorageRuntime.snapshot` владеет current instance snapshot format, domain hydrate/dehydrate hooks, snapshot actor hydrate/dehydrate hooks и skip policy для runtime actor templates.
- Kernel manager владеет только общим orchestration contract: plugin registry, preset install order, middleware wrapping, dispatch context lifecycle, action normalization, route constraint priority, storage runtime selection, root public state commit, subscribers, deps extension pipeline, error wiring, manager extensions и phase ordering.
- Kernel routing может вычислять route constraints и priority, но не читает actor records, не поддерживает actor indexes и не создает actor rows.
- Kernel manager не вызывает instance-specific helpers для actor effects, sidecar reconcile или instance snapshot. Он обращается только к `StorageRuntimeBase` и optional capability blocks.
- Shared pure helpers, которые нужны и standalone `Machine(...)`, и `instanceStorageRuntime`, должны жить вне `runtime/kernel` и `runtime/instance` либо быть явно оформлены как neutral helpers без mutable manager state.
- Future extraction path: перенос `runtime/instance/*` и `runtime/defaultPreset.ts` в отдельный пакет не должен требовать изменений в `runtime/kernel/*`, кроме import path и public packaging.

## 7. Runtime-поведение

### 7.1. Инициализация manager

```ts
function MachineManager(machines, options) {
  return createMachineManagerFactory(defaultRuntimePreset)(machines, options);
}

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

    const compiled = compileMachines(machines, registry.storage, registry.defaultStorageKind);
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
- Пользовательские plugins устанавливаются раньше compile machines.
- Compile machines резолвит `machine.storage ?? registry.defaultStorageKind`.
- Unknown storage key бросает init error.
- Отсутствующий default storage kind бросает init error.
- Returned manager содержит core API и plugin extensions.
- Manager extensions типизируются через plugin phantom types.
- `createMachineManagerFactory(...)` остается internal в этом ТЗ.

### 7.2. Пайплайн dispatch

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
    runStorageReactions(ctx); // calls only runtime.reactions?.run(...)
    notifySubscribers(ctx);
  });

  if (!ctx.committed) return middlewareResult;

  runHooks(registry.dispatch.beforeEffects, ctx);
  invokeStorageEffects(ctx); // calls only runtime.effects?.resolveInvocations(...) / invoke(...)
  runHooks(registry.dispatch.afterEffects, ctx);
}
```

Требования:

- Существующий middleware pipeline сохраняется.
- Middleware оборачивает public `transition`.
- Effects phase сохраняет текущий контракт: она выполняется после возврата всей middleware chain, а не внутри middleware `next(...)`.
- Если middleware не вызвал `next(...)`, interceptors, reducers, commit, subscribers и effects не запускаются.
- Action interceptors выполняются внутри middleware-wrapped transition после post-normalization и до выбора targets.
- Storage runtime `reduce(...)` вызывается только для templates, принимающих event.
- Storage runtime `commit(...)` вызывается один раз для touched runtimes до root commit/subscribers.
- Storage runtime reactions выполняются после commit и до subscribers только для runtimes с `reactions` capability.
- Storage runtime effects выполняются после subscribers и после middleware post-`next` code только для runtimes с `effects` capability.
- Plugin hooks не меняют порядок reducer -> commit -> subscribers -> effects, кроме явно разрешенных hook phases.
- No-op plugin не должен влиять на behavior.

## 8. TypeScript-типизация

### 8.1. Контракт typed machine extension

Plugins не меняют global `createMachine(...)` typing автоматически. Plugin packages экспортируют type-level machine extension, который application wrappers передают в `TypedCreateMachineFn`.

```ts
import { createMachine as createLiteFsmMachine, type TypedCreateMachineFn } from "@lite-fsm/core";
import type { EntityMachineExtension } from "@lite-fsm/entities";

export const createMachine: TypedCreateMachineFn<AppEvents, AppDeps, EntityMachineExtension> = createLiteFsmMachine;
```

```ts
type TypedCreateMachineFn<
  AppEvents extends AnyEvent,
  AppDeps extends object = {},
  Extensions extends MachineRuntimeExtension = {},
> = <Config>(
  cfg: CreateMachineInput<AppEvents, AppDeps, Extensions, Config>,
) => MachineConfigResult<...>;
```

Требования:

- `TypedCreateMachineFn` принимает третий generic для plugin-provided machine extensions.
- Третий generic принимает composite/union extension type, например `EntityMachineExtension | OtherExtension`.
- Core types распределяют storage-specific input по union extensions и выбирают input shape по `cfg.storage`.
- Machine typing не зависит от runtime plugin values и не требует передавать plugin tuple в `createMachine`.
- Extension может добавлять allowed `storage` values.
- Extension может определять storage-specific `CreateMachineInput` для своего `storage kind`.
- Storage-specific input может переопределять типы core fields, включая `initialContext`, `reducer` и `effects`.
- Extension может добавлять config fields для конкретного `storage`.
- Extension может добавлять internal machine events в `config`/`reducer` без добавления в `AppEvents`.
- Extension может добавлять effect/reaction config fields.
- Extension может добавлять phantom metadata к `MachineConfigResult` для downstream types.
- Extension typing применяется только в wrappers, где разработчик явно передал extension type.
- Plugin runtime все равно валидирует extended config at manager init.
- Core `createMachine` без typed wrapper сохраняет текущее поведение.

### 8.2. Return type manager и transition events

```ts
type ManagerFromPlugins<
  S extends MachineStore,
  AppEvents extends AnyEvent,
  Plugins extends readonly LiteFsmPlugin[],
> = IMachineManager<S, AppEvents | PluginTransitionEvents<Plugins>> & PluginManagerExtensions<S, AppEvents, Plugins>;

type ManagerTransitionEvents<AppEvents, Plugins> = AppEvents | PluginTransitionEvents<Plugins>;
```

Требования:

- Return type `MachineManager(...)` использует `ManagerFromPlugins<S, AppEvents, Plugins>`.
- Если пользователь не задал `AppEvents`, используется `MachineEvents<S>`, а итоговый `manager.transition(...)` принимает `MachineEvents<S> | PluginTransitionEvents<Plugins>`.
- Если пользователь явно задал `AppEvents`, итоговый `manager.transition(...)` принимает `AppEvents | PluginTransitionEvents<Plugins>`.
- `manager.entities` и другие plugin extensions доступны только если plugin добавил соответствующие capabilities.
- Без plugin extension TypeScript не показывает соответствующее поле.
- Plugin может расширить тип `manager.transition(...)`.
- Plugin transition events не подмешиваются в `createMachine<AppEvents>`.
- Machine видит plugin events только если разработчик явно добавил их в `AppEvents`.
- Plugin transition events выводятся только из plugins, переданных в текущий `MachineManager(...)`.
- Plugin manager extensions могут зависеть от `S extends MachineStore`; `PluginManagerExtensions<S, AppEvents, Plugins>` вычисляется с доступом к machines текущего manager.
- Текущее поведение `MachineEvents<S>` сохраняется без plugins.

### 8.3. Action meta, effect deps и scoped transition

```ts
type ManagerActionMeta<Plugins> = CoreActionMeta & PluginActionMeta<Plugins>;
```

```ts
type EffectDeps<AppDeps, Plugins> = AppDeps &
  PluginDeps<Plugins> & {
    transition: CoreTransition & PluginTransitionExtensions<Plugins>;
  };
```

Требования:

- Plugin может добавить typed `action.meta` fields.
- Plugin action meta только расширяет core meta через intersection, не заменяет его.
- Core keys `actorId`, `groupId`, `groupTag` и sender fields остаются доступны всегда.
- Route resolver должен быть зарегистрирован для каждого runtime-supported plugin meta key.
- Unknown plugin meta key без route resolver запрещен через registry-aware normalization.
- Plugin может типизировать дополнительные scoped deps.
- Plugin может типизировать дополнительные методы на `transition`.
- Scoped deps и scoped `transition` доступны только внутри effects/reactions.
- Manager extensions и scoped deps являются разными extension surfaces.

## 9. Snapshot, hydrate и совместимость

Требования:

- Все существующие public exports остаются совместимыми.
- `MachineManager(machines, opts)` без `plugins` работает как раньше.
- Текущие tests проходят без изменений.
- Текущие actor spawning, routing и persistence работают на `instanceStorageRuntime`.
- No external plugin-specific code попадает в обычный app bundle без импорта соответствующего plugin package.
- Current snapshot format для `storage: "instance"` сохраняется.
- Storage runtime snapshots должны round-trip через top-level `snapshot.storage[kind]` без влияния на чужие storage runtimes.
- Storage runtime без `snapshot` capability не пишет `snapshot.storage[kind]`.
- Отсутствие `storage` в snapshot сохраняет совместимость с текущими snapshots.
- `getSnapshot()` сохраняет текущий runtime read model и не включает `storage`.
- `replaceReducer` не является API мутации custom storage runtime.
- Middleware `replaceReducer` сохраняет текущий контракт для domain и `storage: "instance"` public state.
- Time travel, import и durable restore custom storage runtimes должны идти через `dehydrate(...)` / `hydrate(...)` и `snapshot.storage[kind]`.
- Появление plugin system не должно ломать существующие graph tests.
- Graph compiler не обязан поддерживать plugin-provided storage kinds в этом ТЗ; unknown storage kinds могут быть marked unsupported до отдельного graph/devtools ТЗ.

## 10. Этапы реализации

Перед началом каждого этапа фиксируется его контракт: какие public API, runtime-поведение, типы, диагностика и гарантии совместимости меняются именно в этом этапе. Реализация идет строго последовательно: этап N полностью доводится до приемки и тестового gate, только после этого начинается этап N+1.

Обязательный порядок внутри каждого этапа:

1. Уточнить scope этапа по блокам «Область работ», «Вне области работ» и «Критерии приемки».
2. Внести минимальные изменения реализации только для этого scope.
3. Добавить или обновить тесты для всех измененных контрактов этапа: runtime-поведение, типовой API, диагностика, snapshot/hydrate, обратная совместимость и сценарии ошибок.
4. Обновить тесты, которые проверяли удаленные или измененные внутренние функции, только если эти функции больше не являются владельцами поведения после рефакторинга. Такие проверки должны быть заменены тестами нового владельца поведения или тестами публичного контракта.
5. Запустить точечные проверки для затронутых пакетов и тестовых наборов этапа. Исправлять только падения, вызванные текущим этапом, и не начинать несвязанную чистку тестов.
6. После точечных проверок запустить полный набор проверок для измененных пакетов: runtime tests, type tests, `check-types` и lint, если они затрагиваются этапом. Сборка документации не является gate для этого ТЗ.
7. Зафиксировать 100% coverage по statements, branches, functions и lines для нового и измененного кода этапа. Этап не считается завершенным, если покрытие достигнуто формально, но не покрыты все сценарии использования, перечисленные в критериях приемки, error semantics и гарантиях совместимости.

Существующие тесты поведения являются регрессионным контрактом и не должны падать. Если после рефакторинга падает тест, который проверяет прежнюю внутреннюю функцию напрямую, тест обновляется под нового владельца поведения; если он проверяет пользовательское поведение, исправляется реализация, а не тест.

### Этап 1 — Plugin registry

Цель этапа: добавить минимальный plugin registry и типовую поверхность plugins без изменения runtime behavior.

**Область работ.**

- Добавить `LiteFsmPlugin`.
- Добавить `definePlugin`.
- Добавить plugin registry.
- Добавить duplicate plugin validation.
- Добавить `plugins` option в `MachineManagerOptions`.
- Добавить plugin capability phantom typing.
- Добавить internal `RuntimePreset` и `createMachineManagerFactory(...)` без изменения public exports.

**Вне области работ.**

- Storage runtime extraction.
- Public custom preset API.
- Dispatch hooks.
- Storage snapshot extension points.
- Entity-specific API.

**Критерии приемки.**

- `MachineManager(machines)` behavior unchanged.
- Plugin install order is deterministic.
- Preset plugins install before user plugins.
- Missing default storage kind fails on manager init.
- Duplicate plugin name fails on manager init.
- `MachineManager(machines, { plugins: [testPlugin()] })` returns manager typed with test plugin extensions.
- `manager.transition(...)` accepts plugin transition events only from plugins passed to this manager.

### Этап 2 — `instanceStorageRuntime`

Цель этапа: оформить текущее поведение lite-fsm как `instanceStorageRuntime`, зарегистрированный через `instanceRuntimePlugin` внутри встроенного `defaultRuntimePreset`.

**Область работ.**

- Выделить текущий runtime в `instanceStorageRuntime`.
- Зарегистрировать его через internal `instanceRuntimePlugin`.
- Собрать встроенный `defaultRuntimePreset` с `defaultStorageKind: "instance"`.
- Провести compile/reduce/snapshot machines через storage runtime contract.
- Разделить `StorageRuntimeBase` и optional capability blocks: `effects`, `snapshot`, `identity`, `reactions`.
- Разнести modules по ownership: kernel manager, default preset и `runtime/instance`.
- Добавить storage-owned runtime state sidecar.
- Оставить orchestration effect phase в kernel manager и дать storage runtime с `effects` capability создавать invocations и вызывать storage-specific effects.
- Добавить storage runtime reaction phase для runtimes с `reactions` capability.
- Перенести текущее actor identity поведение в `instanceStorageRuntime.identity`.

**Вне области работ.**

- Custom storage runtime implementations.
- Entity runtime.
- Public custom preset API.
- Изменения public reducer/effect semantics.

**Критерии приемки.**

- Existing tests проходят.
- Machine без `storage` использует `"instance"`.
- `storage: "instance"` работает явно.
- Unknown `storage` вызывает ошибку на manager init.
- Storage runtime не вызывает subscribers/effects напрямую.
- Runtime без `effects` capability не участвует в effect phase.
- Runtime без `reactions` capability не участвует в reaction phase.
- Kernel manager не импортирует `runtime/instance/*`; единственный import `instanceRuntimePlugin` находится в `runtime/defaultPreset.ts`.

### Этап 3 — Routing meta registry

Цель этапа: добавить plugin-owned routing meta и registry-aware normalization до dispatch hooks.

**Область работ.**

- Реализовать routing meta registry.
- Подключить registered meta keys к pre-normalize и post-normalize phases.
- Обновить `stripRouting`, sender normalization и route constraint resolution так, чтобы plugin-owned keys не терялись.
- Сохранить built-in priority `actorId > plugin route keys > groupId > groupTag > unscoped` с точным priority для зарегистрированных keys.
- Сохранить `groupTag` как multi-runtime route constraint.

**Вне области работ.**

- Manager extensions.
- Storage snapshot integration.
- Entity runtime.

**Критерии приемки.**

- Route resolver обрабатывает plugin meta key.
- Unknown plugin meta key без resolver бросает clear error.
- `meta.entityId` test key не теряется при middleware rewrite и post-normalization.
- `groupTag` остается доступным нескольким storage runtimes.

### Этап 4 — Dispatch hooks

Цель этапа: добавить action interceptors и dispatch hook phases, сохранив существующий middleware contract.

**Область работ.**

- Реализовать action interceptors.
- Реализовать dispatch hook registries.
- Реализовать фазу `beforeCommit`.
- Добавить internal `DispatchContext.reportError(...)`.
- Подключить hook phases к transition pipeline.
- Сохранить middleware semantics и эффект-фазу после возврата middleware chain.

**Вне области работ.**

- Manager extensions.
- Storage snapshot integration.
- Plugin-specific side effects вне hook contracts.

**Критерии приемки.**

- No-op hooks не меняют state.
- Action interceptor может пропустить machine delivery через `skipDelivery: true`.
- `skipDelivery: true` не останавливает следующие interceptors без `stopInterceptors: true`.
- `stopInterceptors: true` не пропускает machine delivery без `skipDelivery: true`.
- Interceptor может заменить committed action.
- Hooks выполняются в порядке регистрации.
- Fatal hook error semantics покрыты tests.
- Non-fatal plugin side-effect hook может передать error через `reportError(...)` без изменения control flow.

### Этап 5 — Расширения типизации machines и deps

Цель этапа: открыть типовые extension points для machine config, internal events, scoped deps, scoped transition и action meta.

**Область работ.**

- Добавить третий generic в `TypedCreateMachineFn`.
- Поддержать union/composite plugin-provided machine extensions.
- Поддержать plugin-provided storage-specific machine input shapes.
- Поддержать plugin-provided internal machine events.
- Поддержать plugin-provided scoped deps и transition extensions.
- Поддержать plugin-provided action meta typing через intersection с core meta.

**Вне области работ.**

- Runtime implementation non-core storage kinds.
- Entity lifecycle events.
- Manager object extensions.

**Критерии приемки.**

- Test plugin может добавить `storage` kind и config field через typed wrapper.
- Test plugin может добавить internal machine event без добавления в app events.
- Test plugin может добавить typed `transition.foo(...)` внутри effect.
- Test plugin может добавить typed `action.meta.foo`.
- Test plugin может переопределить core field type для своего storage-specific input shape.
- `storage: "instance"` типизируется как явный storage kind из default runtime extension.

### Этап 6 — Manager extensions

Цель этапа: добавить manager extensions на returned manager object.

**Область работ.**

- Реализовать `manager.extend(...)`.
- Слить extensions в returned manager.
- Типизировать returned manager с plugin extensions.

**Вне области работ.**

- Entity-specific `manager.entities`.
- React hooks.
- Storage snapshot extension points.

**Критерии приемки.**

- Plugin может добавить typed `manager.foo`.
- Extension не может перезаписать core manager methods.
- Duplicate extension key вызывает clear error.

### Этап 7 — Storage snapshot extension points

Цель этапа: дать storage runtimes возможность сериализовать и восстанавливать runtime state без влияния на `storage: "instance"`.

**Область работ.**

- Реализовать top-level `snapshot.storage[kind]`.
- Подключить `StorageSnapshotRuntime.dehydrate(...)` и `StorageSnapshotRuntime.hydrate(...)`.
- Добавить filter `dehydrate({ storage })`, независимый от `dehydrate({ machines })`.
- Сохранить existing snapshot format для instance runtime.
- Зафиксировать clear error для явного `dehydrate({ storage })` или `hydrate(...)` snapshot данных runtime без `snapshot` capability.

**Вне области работ.**

- Entity snapshot format.
- Devtools provider API.
- Graph/devtools metadata.

**Критерии приемки.**

- Current dehydrate/hydrate tests проходят.
- Test storage runtime snapshot round-trip проходит через `snapshot.storage[testKind]`.
- Runtime без `snapshot` capability не добавляет `snapshot.storage[kind]`.
- Unknown storage snapshot key следует той же skip/warn policy, что unknown machine keys.
- `getSnapshot()` не включает `storage`.

### Этап 8 — Документация и examples

Цель этапа: зафиксировать plugin lifecycle, contracts и минимальные examples для будущих runtime plugins.

**Область работ.**

- Задокументировать plugin lifecycle.
- Задокументировать storage runtime contract.
- Задокументировать typed `createMachine` extension pattern.
- Добавить minimal test plugin fixture.
- Задокументировать, что `@lite-fsm/entities` зависит от этого plugin system.

**Вне области работ.**

- Examples `@lite-fsm/entities`.
- Migration guide for APIs outside this ТЗ.

**Критерии приемки.**

- Docs показывают, что public `MachineManager` использует встроенный default runtime preset.
- Docs показывают plugin-provided manager extension.
- Docs показывают plugin-provided storage runtime.
- Docs фиксируют, что custom runtime presets остаются future extension point.

## 11. Тестовые ожидания

- Coverage является обязательным gate: новый и измененный код должен иметь 100% покрытие по statements, branches, functions и lines. Исключения запрещены без отдельного изменения этого ТЗ.
- 100% coverage не заменяет сценарное покрытие. Для каждого критерия приемки должны быть позитивные, негативные и граничные tests там, где сценарий имеет отдельный runtime/type-level/error-path outcome.
- Каждый этап должен добавлять или обновлять только тесты своего scope и непосредственно затронутых контрактов. Нельзя переходить к следующему этапу с падающими проверками затронутого scope или с незакрытыми coverage gaps текущего этапа.
- Текущие тесты `@lite-fsm/core` проходят без изменения пользовательских сценариев.
- Тесты поведения являются источником истины для обратной совместимости. Их нельзя переписывать под новую реализацию, если public behavior не меняется.
- Тесты, привязанные к конкретным internal functions, которые удалены или переехали при рефакторинге, обновляются на нового владельца поведения или заменяются тестами публичного контракта.
- Тесты registry покрывают install order, duplicate plugin names и no-op plugin behavior.
- Type tests покрывают `PluginTransitionEvents<Plugins>`, `PluginManagerExtensions<S, AppEvents, Plugins>`, `action.meta`, scoped deps/transition и третий generic `TypedCreateMachineFn`.
- Runtime tests покрывают unknown storage, missing default storage kind, duplicate storage kind, optional capability absence, hook ordering, `skipDelivery`, `stopInterceptors`, hook error semantics и `reportError(...)`.
- Snapshot tests покрывают current instance snapshot, storage runtime snapshot round-trip и runtime без `snapshot` capability.
- Названия новых `describe`/`it`/`test` в проекте должны быть на русском; API-термины остаются на английском.

## 12. Критерий полной готовности

Это ТЗ считается реализованным в полном объеме только когда выполнены все условия:

- Все этапы из раздела 10 имеют статус `done`: их область работ реализована, критерии приемки выполнены, а пункты «Вне области работ» не были случайно реализованы как unstable API.
- Каждое требование из разделов 2-9 либо реализовано и покрыто tests, либо явно относится к разделу «Вне области работ». Нельзя считать ТЗ завершенным при частично реализованном требовании, undocumented behavior или временном обходе.
- Все существующие behavior tests проходят без изменения пользовательских сценариев. Если internal tests были обновлены из-за переноса владельца поведения, новый тестовый слой покрывает тот же public или runtime contract.
- Все новые и измененные runtime tests, type tests, snapshot tests, `check-types` и lint проходят. Сборка документации остается запрещенной для агента и не является gate этого ТЗ.
- Coverage по новому и измененному коду равен 100% по statements, branches, functions и lines. Формальное покрытие не засчитывается, если не покрыты все позитивные, негативные, граничные и error-path сценарии из критериев приемки.
- В коде не осталось `test.only`, временных `test.skip`, незакрытых TODO/FIXME для scope этого ТЗ, `throw new Error("not implemented")`, debug logging, временных feature flags или fallback-веток, добавленных только для прохождения тестов.
- Нет мертвого кода после реализации: удалены неиспользуемые helpers, types, exports, modules, compatibility shims, unreachable branches и старые владельцы поведения, которые больше не вызываются.
- Public API остается минимальным и строго типизированным: новые exports присутствуют только если они требуются этим ТЗ, а изменения public API отражены в cheatsheets, если они затрагивают существующие правила проекта.
- Нет известных runtime/type/lint ошибок, flaky tests, непроверенных coverage gaps, незадокументированных breaking changes или открытых blockers в журнале реализации.
