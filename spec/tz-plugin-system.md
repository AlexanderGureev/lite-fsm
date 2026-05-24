# Plugin system и pluggable runtimes для lite-fsm — ТЗ

## 1. Цель

Реализовать в `@lite-fsm/core` plugin system, которая позволяет подключать новые runtime capabilities без встраивания их в core. Текущее поведение lite-fsm должно стать встроенным default runtime, а внешние runtime вроде `@lite-fsm/entities` должны подключаться через plugins.

## 2. Предусловия и зависимости

- Это ТЗ должно быть реализовано до [`tz-final.md`](./tz-final.md), потому что `@lite-fsm/entities` зависит от plugin system.
- `@lite-fsm/core` не должен импортировать plugin packages.
- `MachineManager(machines)` и существующие public exports должны сохранить текущее поведение без изменений пользовательского кода.

## 3. Термины

- Plugin — value с `name`, `install(ctx)` и phantom `__capabilities` для TypeScript inference.
- Plugin capability — типовой контракт plugin-provided manager extensions, transition events, machine extensions, action meta, deps и transition extensions.
- Storage runtime — runtime-реализация конкретного `machine.storage`, например встроенный `storage: "instance"`.
- Dispatch context — runtime context одного `transition(...)`, доступный action interceptors, dispatch hooks и storage runtimes.

## 4. Область работ

- `MachineManager(..., { plugins })`.
- Встроенный `coreRuntimePlugin()`, установленный автоматически первым.
- Registry для plugins, actions, storage runtimes, dispatch hooks, routing meta, manager extensions и deps/transition extensions.
- Storage runtime contract для `storage: "instance"` и будущих custom runtimes.
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
- Duplicate plugin names в `IS_DEV` вызывают clear error.
- Plugin install выполняется до compile machines.
- Plugin install не имеет доступа к mutable runtime state конкретного dispatch.

### 6.2. Встроенный core runtime

```ts
MachineManager(machines);
```

эквивалентно:

```ts
MachineManager(machines, {
  plugins: [coreRuntimePlugin()],
});
```

`coreRuntimePlugin()` не требуется импортировать или передавать вручную.

Требования:

- Core runtime plugin всегда установлен первым.
- Core runtime plugin регистрирует `storage: "instance"`.
- Machine без `storage` использует `storage: "instance"`.
- Текущие reducers, effects, actors, middleware, snapshot и hydrate продолжают работать без изменений.
- Public bundle `@lite-fsm/core` не импортирует внешние plugins.

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
  handled?: boolean;
  continue?: boolean;
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

- Action interceptors выполняются после user action validation и до выбора templates, принимающих event.
- Action interceptors выполняются в порядке регистрации.
- Action interceptor может подготовить runtime transaction, добавить plugin-owned internal operation, заменить action до normalize/reduce, вернуть `handled: true` или остановить следующие interceptors через `continue: false`.
- Если `handled !== true`, action продолжает обычный machine delivery pipeline.
- Handled action сохраняет plugin runtime operations и dispatch hooks, но пропускает delivery в machines.
- Public event остается в event log, даже если interceptor создал internal runtime operations.
- `StorageRegistry.register(...)` регистрирует runtime для значения `machine.storage`.
- Повторная регистрация storage kind в `IS_DEV` вызывает clear error.
- Unknown `storage` при compile machines вызывает clear error.
- `storage` отсутствует -> `"instance"`.
- Dispatch hooks выполняются в порядке регистрации и получают текущий dispatch context.
- `beforeReduce` hook может выполнить staged internal operations до public machine delivery.
- Hook не вызывает `transition(...)` напрямую; reentrant dispatch внутри hook запрещен.
- Ошибка hook прерывает dispatch до commit, если commit еще не выполнен.
- Для hooks после commit ошибка идет через `onError`.
- Plugin hook, который выполняет external side effects до commit, должен сам catch/report errors и не должен полагаться на rollback.
- `DispatchContext` предоставляет internal `reportError(error)` для plugin-owned non-fatal side-effect phases.
- Route resolver добавляет поддержку plugin-specific `action.meta` fields и выполняется во время normalize/routing до выбора targets.
- Duplicate route meta key в `IS_DEV` вызывает clear error.
- Route resolver не создает actor rows.
- Action meta typing расширяется через plugin capability `actionMeta`.
- Manager extension добавляется на returned manager object.
- Duplicate manager extension key в `IS_DEV` вызывает clear error.
- Extension factory вызывается после compile machines и получает stable runtime context.
- Extension не перезаписывает core manager methods.
- Deps extension вызывается для каждого effect/reaction invocation.
- Deps extension получает invocation scope: source template, event, indices, phase.
- Deps extension может заменить или дополнить user deps перед вызовом effect/reaction.
- Deps extension может override только keys, явно принадлежащие этому plugin capability.
- Duplicate deps extension ownership for same key в `IS_DEV` вызывает clear error.
- Transition extension добавляет методы к scoped `transition`.
- Extension object для async effect должен сохранять captured invocation scope после `await`.
- Reaction deps могут переиспользовать scope-bound objects, если reaction sync-only и это не создает allocations на steady-state hot path.
- `action.meta` остается служебным routing/sender contract, а не произвольным metadata bag.
- Пользовательские данные передаются через `payload`, а не через `meta`.
- Каждый plugin-owned `meta` key должен быть зарегистрирован через `routing.registerMetaKey(...)`.

### 6.5. Контракт `StorageRuntime`

```ts
type StorageRuntime = {
  readonly kind: string;

  validateTemplate(ctx: ValidateTemplateContext): void;
  compileTemplate(ctx: CompileTemplateContext): CompiledStorageTemplate;
  createRuntimeState(ctx: CreateRuntimeStateContext): StorageRuntimeState;
  createPublicInitialState(ctx: CreatePublicInitialStateContext): unknown;

  acceptsEvent(ctx: AcceptsEventContext): boolean;
  reduce(ctx: StorageReduceContext): void;
  commit(ctx: StorageCommitContext): void;
  runReactions?(ctx: StorageReactionContext): void;

  resolveEffectInvocations(ctx: ResolveEffectInvocationsContext): StorageEffectInvocation[];
  invokeEffect(ctx: StorageEffectInvocationContext): void;

  snapshot(ctx: StorageSnapshotContext): unknown;
  hydrate(ctx: StorageHydrateContext): void;
  resolveActor(ctx: ResolveActorContext): RuntimeActor | undefined;
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
- Storage runtime state хранится в manager runtime sidecar и принадлежит storage runtime.
- Public `MachinesState` остается read model/type surface, а не обязательным mutable storage для custom runtime.
- `createRuntimeState(...)` вызывается один раз на manager init для каждого registered storage kind.
- `createRuntimeState(...)` получает все compiled templates своего `storage kind`.
- Per-template runtime data хранится внутри общего `StorageRuntimeState` этого `storage kind`.
- `createPublicInitialState(...)` возвращает публичный slice, нужный для backward compatibility, selectors и `MachinesState`.
- `reduce(...)` пишет только в `runtimeState` или dispatch transaction своего runtime.
- `commit(...)` применяет staged runtime operations до subscribers.
- Storage runtime не вызывает subscribers и не запускает effects во время reduce/commit.
- Reactions являются частью storage runtime contract, а не generic dispatch hooks.
- `runReactions(...)` выполняется после commit storage runtimes и до subscribers.
- Reactions, которым нужны данные до удаления rows, могут выполняться внутри `commit(...)` соответствующего storage runtime до collapse cleanup.
- Core manager управляет фазой effects, error wiring и deps extension pipeline.
- Конкретный storage runtime создает effect invocations и вызывает свои storage-specific effect functions через `resolveEffectInvocations(...)` и `invokeEffect(...)`.
- `snapshot(...)` и `hydrate(...)` получают доступ к `runtimeState` своего storage kind.
- `snapshot(...)` сериализуется в top-level `snapshot.storage[kind]`.
- `hydrate(...)` получает `snapshot.storage[kind]`; unknown storage snapshot key игнорируется или передается в `onUnknownMachineKey`-совместимый handler по существующей политике.
- `MachineManager` обращается к runtime через этот контракт.
- Runtime compile выполняется один раз на manager init.
- Hot dispatch path не ищет runtime по строке внутри per-actor/per-row loop.

## 7. Runtime-поведение

### 7.1. Инициализация manager

```ts
function MachineManager(machines, options) {
  const registry = createPluginRegistry();

  registry.install(coreRuntimePlugin());

  for (const plugin of options.plugins ?? []) {
    registry.install(plugin);
  }

  const compiled = compileMachines(machines, registry.storage);
  const runtime = createManagerRuntime(compiled, registry);
  const manager = createBaseManager(runtime);

  for (const extension of registry.managerExtensions) {
    manager[extension.key] = extension.factory(runtime);
  }

  return manager;
}
```

Требования:

- Plugins устанавливаются раньше compile machines.
- Compile machines резолвит `machine.storage ?? "instance"`.
- Unknown storage key бросает init error.
- Returned manager содержит core API и plugin extensions.
- Manager extensions типизируются через plugin phantom types.

### 7.2. Пайплайн dispatch

```ts
function transition(action) {
  const ctx = createDispatchContext(action);

  runInterceptors(registry.actions, ctx);

  runHooks(registry.dispatch.beforeReduce, ctx);

  if (!ctx.handled) {
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

  runHooks(registry.dispatch.beforeEffects, ctx);
  invokeStorageEffects(ctx);
  runHooks(registry.dispatch.afterEffects, ctx);
}
```

Требования:

- Существующий middleware pipeline сохраняется.
- Middleware оборачивает public `transition`.
- Action interceptors выполняются внутри middleware-wrapped transition до выбора targets.
- Storage runtime `reduce(...)` вызывается только для templates, принимающих event.
- Storage runtime `commit(...)` вызывается один раз для touched runtimes до root commit/subscribers.
- Storage runtime reactions выполняются после commit и до subscribers.
- Storage runtime effects выполняются после subscribers.
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
- Route resolver должен быть зарегистрирован для каждого runtime-supported plugin meta key.
- Unknown plugin meta key без route resolver запрещен в `IS_DEV`.
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
- No plugin-specific code попадает в обычный app bundle без импорта plugin package.
- Current snapshot format для `storage: "instance"` сохраняется.
- Storage runtime snapshots должны round-trip через top-level `snapshot.storage[kind]` без влияния на чужие storage runtimes.
- Отсутствие `storage` в snapshot сохраняет совместимость с текущими snapshots.

## 10. Этапы реализации

### Этап 1 — Plugin registry

Цель этапа: добавить минимальный plugin registry и типовую поверхность plugins без изменения runtime behavior.

**Область работ.**

- Добавить `LiteFsmPlugin`.
- Добавить `definePlugin`.
- Добавить plugin registry.
- Добавить duplicate plugin validation.
- Добавить `plugins` option в `MachineManagerOptions`.
- Добавить plugin capability phantom typing.

**Вне области работ.**

- Storage runtime extraction.
- Dispatch hooks.
- Storage snapshot extension points.
- Entity-specific API.

**Критерии приемки.**

- `MachineManager(machines)` behavior unchanged.
- Plugin install order is deterministic.
- Duplicate plugin name fails in `IS_DEV`.
- `MachineManager(machines, { plugins: [testPlugin()] })` returns manager typed with test plugin extensions.
- `manager.transition(...)` accepts plugin transition events only from plugins passed to this manager.

### Этап 2 — `instanceStorageRuntime`

Цель этапа: оформить текущее поведение lite-fsm как `instanceStorageRuntime`, установленный встроенным `coreRuntimePlugin()`.

**Область работ.**

- Выделить текущий runtime в `instanceStorageRuntime`.
- Зарегистрировать его через встроенный `coreRuntimePlugin`.
- Провести compile/reduce/snapshot machines через storage runtime contract.
- Добавить storage-owned runtime state sidecar.
- Оставить orchestration effect phase в core manager и дать storage runtime создавать invocations и вызывать storage-specific effects.
- Добавить storage runtime reaction phase.

**Вне области работ.**

- Custom storage runtime implementations.
- Entity runtime.
- Изменения public reducer/effect semantics.

**Критерии приемки.**

- Existing tests проходят.
- Machine без `storage` использует `"instance"`.
- `storage: "instance"` работает явно.
- Unknown `storage` вызывает ошибку на manager init.
- Storage runtime не вызывает subscribers/effects напрямую.

### Этап 3 — Dispatch hooks

Цель этапа: добавить action interceptors и dispatch hook phases, сохранив существующий middleware contract.

**Область работ.**

- Реализовать action interceptors.
- Реализовать dispatch hook registries.
- Реализовать фазу `beforeCommit`.
- Добавить internal `DispatchContext.reportError(...)`.
- Подключить hook phases к transition pipeline.
- Сохранить middleware semantics.

**Вне области работ.**

- Routing meta registry.
- Manager extensions.
- Storage snapshot integration.
- Plugin-specific side effects вне hook contracts.

**Критерии приемки.**

- No-op hooks не меняют state.
- Action interceptor может пометить action как handled или продолжить dispatch.
- Hooks выполняются в порядке регистрации.
- Hook error semantics покрыты tests.
- Non-fatal plugin side-effect hook может передать error без abort committed cleanup.

### Этап 4 — Расширения типизации machines и deps

Цель этапа: открыть типовые extension points для machine config, internal events, scoped deps, scoped transition и action meta.

**Область работ.**

- Добавить третий generic в `TypedCreateMachineFn`.
- Поддержать plugin-provided storage-specific machine input shapes.
- Поддержать plugin-provided internal machine events.
- Поддержать plugin-provided scoped deps и transition extensions.
- Поддержать plugin-provided action meta typing.

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

### Этап 5 — Routing и manager extensions

Цель этапа: добавить plugin-owned routing meta и manager extensions на returned manager object.

**Область работ.**

- Реализовать routing meta registry.
- Реализовать `manager.extend(...)`.
- Слить extensions в returned manager.
- Типизировать returned manager с plugin extensions.

**Вне области работ.**

- Entity-specific route `entityId`.
- React hooks.
- Storage snapshot extension points.

**Критерии приемки.**

- Route resolver обрабатывает plugin meta key.
- Plugin может добавить typed `manager.foo`.
- Extension не может перезаписать core manager methods.
- Duplicate extension key вызывает ошибку в `IS_DEV`.

### Этап 6 — Storage snapshot extension points

Цель этапа: дать storage runtimes возможность сериализовать и восстанавливать runtime state без влияния на `storage: "instance"`.

**Область работ.**

- Реализовать top-level `snapshot.storage[kind]`.
- Подключить `StorageRuntime.snapshot(...)` и `StorageRuntime.hydrate(...)`.
- Добавить filter `dehydrate({ storage })`, независимый от `dehydrate({ machines })`.
- Сохранить existing snapshot format для instance runtime.

**Вне области работ.**

- Entity snapshot format.
- Devtools provider API.
- Graph/devtools metadata.

**Критерии приемки.**

- Current dehydrate/hydrate tests проходят.
- Test storage runtime snapshot round-trip проходит через `snapshot.storage[testKind]`.
- Unknown storage snapshot key следует той же skip/warn policy, что unknown machine keys.

### Этап 7 — Документация и examples

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

- Docs показывают, что default runtime является built-in.
- Docs показывают plugin-provided manager extension.
- Docs показывают plugin-provided storage runtime.

## 11. Тестовые ожидания

- Текущие тесты `@lite-fsm/core` проходят без изменения пользовательских сценариев.
- Тесты registry покрывают install order, duplicate plugin names и no-op plugin behavior.
- Type tests покрывают `PluginTransitionEvents<Plugins>`, `PluginManagerExtensions<S, AppEvents, Plugins>`, `action.meta`, scoped deps/transition и третий generic `TypedCreateMachineFn`.
- Runtime tests покрывают unknown storage, duplicate storage kind, hook ordering, handled actions, `continue: false`, hook error semantics и `reportError(...)`.
- Snapshot tests покрывают current instance snapshot и storage runtime snapshot round-trip.
- Названия новых `describe`/`it`/`test` в проекте должны быть на русском; API-термины остаются на английском.
