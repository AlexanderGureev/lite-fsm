# lite-fsm — Plugin System Cheat Sheet

Plugin system расширяет `MachineManager` декларативными sections. Единственный публичный способ объявить plugin:

```ts
const plugin = definePlugin<PluginEvents, HostEvents>().create({
  name: "cache",
});
```

Публичного callback `install` нет. `MachineManager(..., { plugins })` принимает только values, возвращенные `definePlugin().create(...)`; structural objects отклоняются с `LITE_FSM_INVALID_PLUGIN_DEFINITION`.

Все public keys находятся в плоском namespace. Core не добавляет prefix и не переписывает ключи: `routeMeta.cacheKey` становится `action.meta.cacheKey`, `manager.cache` — `manager.cache`, `scopedDeps.trace` — `deps.trace`, `scopedTransition.refresh` — `deps.transition.refresh`. Plugin author и integrator отвечают за уникальность keys; конфликт является hard error.

## Events

Первый generic `definePlugin<PluginEvents, HostEvents>()` описывает события, которые plugin добавляет в manager-level `transition` и может эмитить через `scope.transition(...)`. Они не становятся событиями машин автоматически. Если машина должна обрабатывать событие plugin, включите его явно:

```ts
type AppPlugins = typeof cachePlugin;
type AppEvents = HostEvents | PluginManagerEvents<AppPlugins>;
```

Второй generic `HostEvents` описывает события host manager, которые plugin типизированно наблюдает в callbacks. `routeMeta`, `intercept`, `hooks`, `scopedDeps` и `scopedTransition` видят `HostEvents | PluginEvents`, но `HostEvents` не входят в `PluginManagerEvents<Plugins>`.

Если `HostEvents` не передан явно, observer contexts используют `AnyEvent`: `ctx.action`, `ctx.originalAction`, `routeMeta` `ctx.action` и `scope.event` типизируются как `ManagerAction<AnyEvent>`. При `definePlugin<PluginEvents>()` это не расширяет `PluginManagerEvents<Plugins>`; `scope.transition(...)` остается ограничен `PluginEvents`.

## Sections

| Section | Контракт |
| --- | --- |
| `routeMeta` | Объявляет routing resolver для action `meta`. Это служебный routing contract, не место для пользовательских данных. Используйте scalar keys вроде `entityId`, `cacheKey`, `documentId`, `tenantId`. Reserved keys `actorId`, `groupId`, `groupTag`, `senderActorId`, `senderGroupId`, `senderGroupTag` запрещены. |
| `manager` | Добавляет поля на returned manager. Factory вызывается один раз при создании manager после compile templates, runtime state и initial public state. |
| `intercept` | Выполняется после storage `prepareAction` и до reducer delivery. Может заменить committed action, выставить `skipDelivery` или остановить следующие interceptors. Replacement пересчитывает route. |
| `hooks` | Выполняются по фазам `beforeReduce`, `afterReduce`, `beforeCommit`, `beforeSubscribers`, `beforeEffects`, `afterEffects`. Context read-only для action; return value игнорируется. |
| `scopedDeps` | Добавляет deps только на время effect/reaction invocation. Ключ section становится ключом deps. |
| `scopedTransition` | Добавляет методы к invocation `deps.transition` и сохраняет callable core `transition(action)`. Методы не появляются на `manager.transition`. |
| `storage` | Advanced section: регистрирует storage runtime definitions из `defineStorageRuntime().create(...)`. Inline runtime objects не принимаются. |

Ошибки из `intercept` и hooks пробрасываются из `manager.transition(...)` и не вызывают `onError` автоматически. `ctx.reportError(error)` вызывает текущий `onError` и не меняет control flow.

## Route Meta

`routeMeta` resolver возвращает `string | readonly string[]`. Runtime не валидирует тип входного `value`, но валидирует результат resolver.

```ts
const routingPlugin = definePlugin<PluginEvent, HostEvent>().create({
  name: "routing",
  routeMeta: {
    cacheKey(value: string) {
      return value;
    },
    tenantId(value: string) {
      return value;
    },
  },
});
```

`PluginRouteMeta<Plugins>` возвращает raw map значений:

```ts
type Meta = PluginRouteMeta<typeof routingPlugin>;
// { readonly cacheKey: string; readonly tenantId: string }
```

Optional semantics относятся к `manager.transition(...).meta`: для manager с подключенным plugin tuple эти поля доступны как optional route meta текущего tuple.

Дубликат route meta key диагностируется с section, key и владельцами, например plugin, который первым занял `cacheKey`, и plugin, который конфликтует с ним. Reserved route keys считаются занятыми core.

## Manager Extensions

```ts
const managerPlugin = definePlugin<PluginEvent>().create({
  name: "manager-tools",
  manager: {
    cache(ctx) {
      return {
        refresh(cacheKey: string) {
          return ctx.transition({ type: "CACHE_REFRESH", payload: { cacheKey } });
        },
      };
    },
  },
});
```

Ключ `cache` становится полем returned manager. Дубликаты между plugins диагностируются как `LITE_FSM_DUPLICATE_MANAGER_EXTENSION_KEY` с владельцами конфликта; попытка занять core method — как `LITE_FSM_MANAGER_EXTENSION_CORE_KEY`.

## Dispatch Pipeline

`intercept` видит `ctx.action` после storage `prepareAction` и `ctx.originalAction` из исходного `manager.transition(...)`.

Storage runtime action stages используют object result protocol: `prepareAction(ctx)` и `beforeReduce(ctx)` возвращают `void | { type: "replace"; action } | { type: "drop" }`, а `reduce(ctx)` и `reduceBucket(ctx)` возвращают `void | { type: "skip" }`. В storage context action читается как `ctx.action`, исходный action — как `ctx.originalAction`; `ctx.dispatch` не содержит action stage fields.

`ctx.dispatch.options`, `route`, `prevState` и `skipDelivery` доступны только для чтения. `ctx.dispatch.runtime` — mutable `Map` для per-dispatch данных storage runtime. `ctx.dispatch.nextState` — mutable root accumulator; заменяйте его иммутабельно: `ctx.dispatch.nextState = { ...ctx.dispatch.nextState, [key]: value }`. `prepareAction` и `beforeReduce` не должны менять `nextState`; используйте для staged данных `dispatch.runtime`.

```ts
const dispatchPlugin = definePlugin<PluginEvent, HostEvent>().create({
  name: "dispatch",
  intercept(ctx) {
    if (ctx.action.type !== "CACHE_REFRESH") return;
    return { skipDelivery: false };
  },
  hooks: {
    beforeEffects(ctx) {
      if (ctx.action.type === "CACHE_REFRESH") ctx.reportError(new Error("observed"));
    },
  },
});
```

Hooks получают финальный action после interceptors. Они не заменяют action, не пропускают delivery и не останавливают pipeline.

## Scoped Deps

```ts
const scopedPlugin = definePlugin<PluginEvent, HostEvent>().create({
  name: "scoped",
  scopedDeps: {
    currentCache(scope) {
      return {
        template: scope.source.template,
        eventType: scope.event.type,
      };
    },
  },
  scopedTransition: {
    refresh(scope) {
      return (cacheKey: string) => scope.transition({ type: "CACHE_REFRESH", payload: { cacheKey } });
    },
  },
});
```

При явном `HostEvents` `scope.event` типизируется как `ManagerAction<HostEvents | PluginEvents>`; без второго generic — как `ManagerAction<AnyEvent>`. `scope.transition(...)` принимает только `ManagerAction<PluginEvents>`.

Для effects используйте `EffectDeps<AppDeps, Plugins>`:

```ts
type AppDeps = EffectDeps<{ api: Api }, typeof scopedPlugin>;
```

Фактический `deps.transition` в invocation остается callable core `transition(action)` и дополнительно получает методы из `scopedTransition`.

## Storage Runtime

Storage runtime — advanced contract для новых storage kinds и machine extensions.

```ts
type CacheExtension = {
  readonly input: {
    readonly ttlMs: number;
    readonly initialContext: { readonly value: string };
  };
  readonly effectDeps: { readonly cacheReader: { read(key: string): string } };
  readonly reactionDeps: { readonly cacheLog: { record(entry: string): void } };
  readonly publicState: { readonly ready: boolean; readonly value: string };
  runtimeState: { commits: number };
  readonly templateData: { readonly initialValue: string };
  readonly snapshotData: { readonly commits: number };
  readonly invocation: { readonly cacheKey: string };
  readonly identity: { readonly cacheKey: string };
};

const cacheStorage = defineStorageRuntime<CacheExtension>().create({
  kind: "document-cache",
  routeMetaKeys: ["cacheKey"],
  validateTemplate(ctx) {
    void ctx.machine.ttlMs;
  },
  compileTemplate(ctx) {
    return { data: { initialValue: ctx.machine.initialContext.value } };
  },
  createRuntimeState(ctx) {
    void ctx.templates;
    return { commits: 0 };
  },
  createPublicInitialState(ctx) {
    return { ready: false, value: ctx.template.data?.initialValue ?? "" };
  },
  acceptsEvent(ctx) {
    return ctx.action.type === "CACHE_REFRESH";
  },
  reduce(ctx) {
    ctx.dispatch.nextState = {
      ...ctx.dispatch.nextState,
      [ctx.template.key]: { ready: true, value: ctx.action.type },
    };
  },
  commit() {},
  effects: {
    condition(ctx) {
      return Promise.resolve(ctx.predicate({ type: "CACHE_REFRESH", payload: { cacheKey: "probe" } }));
    },
    resolveInvocations(ctx) {
      return [{ cacheKey: ctx.action.type }];
    },
    invoke(ctx) {
      void ctx.invocation.cacheKey;
    },
  },
  snapshot: {
    dehydrate(ctx) {
      return {
        snapshot: { commits: ctx.state.commits },
      };
    },
    hydrate(ctx) {
      void ctx.machines;
      void ctx.snapshot;
      return { nextState: ctx.baseState, changed: false };
    },
  },
  identity: {
    resolve() {
      return undefined;
    },
  },
  reactions: {
    run() {},
  },
});

const cachePlugin = definePlugin().create({
  name: "cache-storage",
  storage: [cacheStorage],
});
```

`Extension` содержит machine-facing поля и runtime-only поля. В `PluginMachineExtensions<Plugins>` попадают только `input`, `internalEvents`, `reducerContext`, `effectDeps`, `reactionDeps`, `resultMetadata`, `publicState` и `storage`, который builder выводит из literal `kind`. Поля `runtimeState`, `templateData`, `snapshotData`, `invocation` и `identity` доступны storage runtime, но не добавляются в machine extension.

`compileTemplate(ctx)` возвращает только `void | { data?: TemplateData }`. `key` и `kind` подставляет builder. Методы storage runtime используют contextual typing inline; при необходимости root entrypoint экспортирует `StorageRuntimeExtension`, `StorageTemplate` и public context types `Storage*Context`.

`routeMetaKeys` — runtime dependency storage runtime от action meta keys. Это `readonly string[]`; TypeScript не связывает эти строки с `routeMeta`, а runtime валидирует shape definition и результаты route resolvers.

`prepareAction(ctx)` выполняется до middleware и может вернуть `{ type: "replace", action }` или `{ type: "drop" }`. `beforeReduce(ctx)` выполняется после middleware и до public interceptors с тем же result protocol. `{ type: "drop" }` является silent no-op, а `{ type: "replace" }` пересчитывает route для следующих фаз.

`reduceScope` по умолчанию равен `"template"`: runtime объявляет `acceptsEvent(ctx)` и `reduce(ctx)`, а core вызывает reducer для каждого matching template. Для batch-обработки укажите `reduceScope: "bucket"` и объявите `reduceBucket(ctx)`: callback вызывается один раз на storage bucket и получает `ctx.templates`. В bucket scope нельзя объявлять `acceptsEvent` или `reduce`; в template scope нельзя объявлять `reduceBucket`. `reduce(ctx)` и `reduceBucket(ctx)` возвращают только `void | { type: "skip" }`; `drop` и `replace` разрешены только в `prepareAction` и `beforeReduce`.

`effectDeps` и `reactionDeps` внутри `CacheExtension` — type contract для machines этого storage kind. Runtime сам решает, какие deps передать при invocation.

`snapshot.dehydrate(ctx)` возвращает только `{ machines?, snapshot? }`: `machines` — machine snapshots текущего storage kind, `snapshot` — payload текущего storage kind для top-level `MachineManagerSnapshot.storage[kind]`. `snapshot.hydrate(ctx)` получает `ctx.machines` и `ctx.snapshot`, а не полный manager envelope.

`PluginMachineExtensions<typeof cachePlugin>` возвращает extension с `storage: "document-cache"`. Передайте его в app wrapper:

```ts
type AppPlugins = typeof cachePlugin;
type AppEvents = HostEvents | PluginManagerEvents<AppPlugins>;

const createAppMachine: TypedCreateMachineFn<
  AppEvents,
  EffectDeps<AppDeps, AppPlugins>,
  PluginMachineExtensions<AppPlugins>
> = createMachine;
```

## Configurable Plugins

Configurable и multi-instance plugins — обычные factory functions вокруг `definePlugin().create(...)`.

```ts
const createCachePlugin = (options: { readonly namespace: string }) =>
  definePlugin<PluginEvent, HostEvent>().create({
    name: `cache:${options.namespace}`,
    routeMeta: {
      [`${options.namespace}CacheKey`](value: string) {
        return `${options.namespace}:${value}`;
      },
    },
  });
```

Каждый вызов factory должен вернуть plugin с уникальным `name` и уникальными exposed keys. Multi-instance factory должна параметризовать не только `name`, но и keys в `routeMeta`, `manager`, `scopedDeps`, `scopedTransition` и storage `kind`, если несколько экземпляров могут быть установлены в один manager. Дубликаты names диагностируются как `LITE_FSM_DUPLICATE_PLUGIN`; дубликаты exposed keys показывают section, key и обоих владельцев.

## Helper Types

| Type | Контракт |
| --- | --- |
| `PluginManagerEvents<Plugins>` | Union событий из `PluginEvents`. |
| `PluginRouteMeta<Plugins>` | Raw map route meta values. |
| `PluginManagerExtensions<Plugins>` | Поля returned manager из `manager`. |
| `PluginScopedDeps<Plugins>` | Поля deps из `scopedDeps`. |
| `PluginScopedTransition<Plugins>` | Методы invocation `transition` из `scopedTransition`. |
| `PluginMachineExtensions<Plugins>` | Union machine extensions из storage definitions. |
| `EffectDeps<AppDeps, Plugins>` | App deps плюс scoped deps и scoped transition methods. |

Все helpers принимают plugin union и runtime tuple.
