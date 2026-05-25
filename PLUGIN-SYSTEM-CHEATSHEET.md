# lite-fsm — Plugin System Cheat Sheet

Короткий справочник по plugin system в `@lite-fsm/core`: что можно расширять, зачем это нужно и какие контракты важно сохранить. Полные runtime/type справочники: [`API-CHEATSHEET.md`](API-CHEATSHEET.md) и [`TYPES-CHEATSHEET.md`](TYPES-CHEATSHEET.md).

## Модель

Plugin — объект с `name` и `install(ctx)`. Типовые возможности задаются через generic `definePlugin<Capabilities, Name>(...)`.

```ts
import { MachineManager, definePlugin } from "@lite-fsm/core";

const plugin = definePlugin({
  name: "audit",
  install(ctx) {
    // registry calls
  },
});

const manager = MachineManager(machines, {
  plugins: [plugin] as const,
});
```

`MachineManager(...)` всегда сначала устанавливает встроенный default runtime preset с `storage: "instance"`, затем пользовательские plugins в порядке массива. Plugin действует только на текущий manager. Глобально `createMachine<AppEvents>(...)` не получает plugin-specific поля, события или deps.

`as const` сохраняет typed tuple. Если передать широкий `LiteFsmPlugin[]`, TypeScript не обязан показывать plugin-specific поля manager, `action.meta`, transition events и scoped deps.

## Что Можно Расширять

| Возможность                                                   | Registry / type-level key                                                | Зачем нужно                                                                                 |
| ------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Добавить методы или namespace на returned manager             | `ctx.manager.extend(...)`, `PluginCapabilities["manager"]`               | Публичные plugin tools: `manager.entities`, `manager.audit`, selectors, commands, debug API |
| Добавить события, которые принимает `manager.transition(...)` | `PluginCapabilities["transitionEvents"]`                                 | Runtime commands и служебные события без добавления в пользовательский `AppEvents`          |
| Добавить служебный routing key в `action.meta`                | `ctx.routing.registerMetaKey(...)`, `PluginCapabilities["actionMeta"]`   | Адресация событий в custom runtime: entity id, document id, shard id                        |
| Добавить storage-specific config в `createMachine` wrapper    | `PluginCapabilities["machine"]`, `TypedCreateMachineFn<..., Extensions>` | Машины с `storage: "custom"` и собственными обязательными полями конфигурации               |
| Зарегистрировать storage runtime                              | `ctx.storage.register(kind, runtime)`                                    | Новый способ хранения и обработки slice-ов: entities, external store, derived runtime       |
| Переписать или пропустить delivery события                    | `ctx.actions.intercept(...)`                                             | Normalize legacy actions, runtime-only commands, synthetic routing                          |
| Подписаться на фазы dispatch                                  | `ctx.dispatch.beforeReduce(...)` и другие hooks                          | Диагностика, transaction staging, metrics, runtime coordination                             |
| Добавить deps в effect/reaction invocation                    | `ctx.deps.extendDeps(...)`, `PluginCapabilities["deps"]`                 | Scoped helpers, trace ids, runtime clients, context текущей machine/actor                   |
| Добавить методы на scoped `transition`                        | `ctx.deps.extendTransition(...)`, `PluginCapabilities["transition"]`     | Удобные команды внутри effects: `transition.finish(id)`                                     |
| Поддержать snapshots custom runtime                           | `runtime.snapshot`                                                       | `dehydrate()` / `hydrate()` для storage-owned данных через `snapshot.storage[kind]`         |

## `definePlugin`

```ts
import { definePlugin, type FSMEvent } from "@lite-fsm/core";

type AuditCapabilities = {
  transitionEvents: FSMEvent<"AUDIT_FLUSH">;
  actionMeta: { auditTarget: string };
  manager: {
    audit: {
      keys(): readonly string[];
    };
  };
};

export const auditPlugin = definePlugin<AuditCapabilities, "audit">({
  name: "audit",
  install(ctx) {
    ctx.routing.registerMetaKey("auditTarget", (value) => String(value));
    ctx.manager.extend("audit", (runtime) => ({
      keys: () => Object.keys(runtime.config),
    }));
  },
});
```

`PluginCapabilities` — типовой контракт. Runtime-поведение появляется только через регистрации в `install(ctx)`. Если capability обещает `actionMeta`, plugin должен зарегистрировать соответствующий route resolver, когда runtime использует этот key для routing.

## Manager Extension

Добавляет поле на объект, который возвращает `MachineManager(...)`.

```ts
type AuditCapabilities = {
  manager: {
    audit: {
      state(): unknown;
      machineKeys(): readonly string[];
    };
  };
};

const auditPlugin = definePlugin<AuditCapabilities, "audit">({
  name: "audit",
  install(ctx) {
    ctx.manager.extend("audit", (runtime) => ({
      state: runtime.getState,
      machineKeys: () => Object.keys(runtime.config),
    }));
  },
});

const manager = MachineManager({ counter }, { plugins: [auditPlugin] as const });

manager.audit.machineKeys();
manager.audit.state();
```

Factory получает stable `ManagerRuntimeContext`: `config`, `options`, `schemaVersion`, `getState`, `transition`, `onTransition`, `getDependencies`. `config` нужно считать read-only. Extension не может перезаписать core methods вроде `transition`, `getState`, `hydrate`, `dehydrate`, `setDependencies`.

В прикладном коде обычно достаточно обычного object capability, как в примере выше. Более сложный вариант нужен авторам библиотечных plugins, когда extension должен типизироваться от конкретного `MachineManager({ ... })`: знать ключи текущих машин и принимать только события текущего manager.

```ts
import type {
  ManagerAction,
  ManagerExtensionAppEvents,
  ManagerExtensionCapability,
  ManagerExtensionStore,
} from "@lite-fsm/core";

interface ToolsCapability extends ManagerExtensionCapability {
  __liteFsmManagerExtension(): {
    tools: {
      firstKey: keyof ManagerExtensionStore<this>;
      send(action: ManagerAction<ManagerExtensionAppEvents<this>>): unknown;
    };
  };
}

const toolsPlugin = definePlugin<{ manager: ToolsCapability }, "tools">({
  name: "tools",
  install(ctx) {
    ctx.manager.extend("tools", (runtime) => ({
      firstKey: Object.keys(runtime.config)[0],
      send: runtime.transition,
    }));
  },
});
```

`ManagerExtensionStore<this>` подставляет store текущего manager, поэтому `firstKey` становится union ключей из `MachineManager({ counter, auth })`. `ManagerExtensionAppEvents<this>` подставляет union событий текущего manager, поэтому `send(...)` не принимает чужие события. Это type-level адаптер для reusable plugins; runtime-регистрация всё равно делается обычным `ctx.manager.extend(...)`.

## Transition Events

Plugin может расширить только `manager.transition(...)`. Эти события не становятся допустимыми в machine `config`, reducer или effects обычного `createMachine<AppEvents>(...)`.

```ts
type AuditFlush = FSMEvent<"AUDIT_FLUSH">;

const auditPlugin = definePlugin<{ transitionEvents: AuditFlush }, "audit">({
  name: "audit",
  install(ctx) {
    ctx.actions.intercept(({ action }) => {
      if (action.type === "AUDIT_FLUSH") {
        return { skipDelivery: true };
      }
    });
  },
});

const manager = MachineManager({ counter }, { plugins: [auditPlugin] as const });

manager.transition({ type: "AUDIT_FLUSH" });
```

Используй это для runtime commands: flush, sync, spawn orchestration, external runtime handshake. Не используй для доменных событий машины, которые должны быть явно описаны в `AppEvents`.

## Action Meta И Routing

`action.meta` — служебный routing/sender contract. Пользовательские данные должны идти в `payload`.

```ts
type EntityRouteCapabilities = {
  actionMeta: {
    entityId: string;
  };
};

const entityRoutePlugin = definePlugin<EntityRouteCapabilities, "entity-route">({
  name: "entity-route",
  install(ctx) {
    ctx.routing.registerMetaKey("entityId", (value) => String(value));
  },
});

manager.transition({
  type: "PATCH",
  payload: { title: "Draft" },
  meta: { entityId: "todo:1" },
});
```

Приоритет routing фиксирован: `actorId` → registered plugin keys в порядке регистрации → `groupId` → `groupTag` → unscoped. Если action содержит несколько route keys, используется первый по приоритету, не intersection. Unknown `meta` keys не участвуют в routing.

Storage runtime может объявить `routeMetaKeys`; тогда plugin обязан зарегистрировать resolver для каждого key до init manager.

## Action Interceptors

Interceptor выполняется после middleware `next(...)` и post-normalization, но до reducers/storage delivery.

```ts
const normalizePlugin = definePlugin({
  name: "normalize-actions",
  install(ctx) {
    ctx.actions.intercept(({ action }) => {
      if (action.type === "LEGACY_DONE") {
        return {
          action: { type: "DONE" },
          stopInterceptors: true,
        };
      }

      if (action.type === "RUNTIME_ONLY") {
        return { skipDelivery: true };
      }
    });
  },
});
```

Return value:

| Поле               | Контракт                                                                                            |
| ------------------ | --------------------------------------------------------------------------------------------------- |
| `action`           | заменяет committed action для reducers, subscribers, effects, middleware post-`next` и return value |
| `skipDelivery`     | пропускает machine/storage reduce, но не останавливает следующие interceptors/hooks                 |
| `stopInterceptors` | останавливает только следующие interceptors                                                         |

## Dispatch Hooks

Hooks позволяют выполнить код на фазах dispatch. Они не возвращают action и не должны вызывать `transition(...)`: core бросит ошибку при dispatch из hook.

```ts
const metricsPlugin = definePlugin({
  name: "metrics",
  install(ctx) {
    ctx.dispatch.beforeReduce((dispatch) => {
      dispatch.runtime.set("metrics.startedAt", performance.now());
    });

    ctx.dispatch.afterEffects((dispatch) => {
      const startedAt = dispatch.runtime.get("metrics.startedAt") as number | undefined;
      if (startedAt !== undefined) {
        console.debug(dispatch.action.type, performance.now() - startedAt);
      }
    });
  },
});
```

Фазы: `beforeReduce`, `afterReduce`, `beforeCommit`, `beforeSubscribers`, `beforeEffects`, `afterEffects`. Hook error является fatal. `dispatch.reportError(error)` вызывает `options.onError`, но не меняет control flow.

## Scoped Deps

`ctx.deps.extendDeps(...)` добавляет deps только на время конкретного effect/reaction invocation. Эти deps не передаются через `manager.setDependencies(...)`.

```ts
import {
  createMachine,
  definePlugin,
  type EffectDeps,
  type FSMEvent,
  type ScopedDepsFactory,
  type TypedCreateMachineFn,
} from "@lite-fsm/core";

type Start = FSMEvent<"START">;
type Done = FSMEvent<"DONE", { id: string }>;
type AppEvent = Start | Done;

type TraceCapabilities = {
  deps: {
    traceId(): string;
  };
};

const traceDeps: ScopedDepsFactory<TraceCapabilities["deps"]> = Object.assign(
  (scope) => ({
    traceId: () => `${scope.phase}:${scope.source.storage}:${scope.source.template}:${scope.event.type}`,
  }),
  { keys: ["traceId"] as const },
);

const tracePlugin = definePlugin<TraceCapabilities, "trace">({
  name: "trace",
  install(ctx) {
    ctx.deps.extendDeps(traceDeps);
  },
});

type Plugins = readonly [typeof tracePlugin];
type AppDeps = EffectDeps<{ api: { load(): Promise<string> } }, Plugins>;

const createAppMachine: TypedCreateMachineFn<AppEvent, AppDeps> = createMachine;

const machine = createAppMachine({
  config: { IDLE: { START: "LOADING" }, LOADING: { DONE: "IDLE" } },
  initialState: "IDLE",
  initialContext: { value: "" },
  effects: {
    LOADING: async ({ api, traceId, transition }) => {
      const id = await api.load();
      console.debug(traceId());
      transition({ type: "DONE", payload: { id } });
    },
  },
});
```

`factory.keys` объявляет owned keys. Runtime проверяет duplicate ownership, empty keys, попытку заменить core/app dep и попытку вернуть key без ownership.

`scope` содержит `{ source, event, indices, phase, transition }`. Для domain effect `indices` обычно пустой; для actor effect там есть `actorId`, `groupId`, `groupTag`; для storage reaction runtime сам передает свои индексы.

## Scoped Transition Methods

`ctx.deps.extendTransition(...)` добавляет методы на scoped `transition` внутри effects/reactions.

```ts
import type { ManagerAction, ScopedTransitionFactory } from "@lite-fsm/core";

type FlowCapabilities = {
  transition: {
    finish(id: string): ManagerAction<AppEvent>;
  };
};

const flowTransition: ScopedTransitionFactory<FlowCapabilities["transition"]> = Object.assign(
  (scope) => ({
    finish: (id: string) => scope.transition({ type: "DONE", payload: { id } } as ManagerAction<AppEvent>),
  }),
  { keys: ["finish"] as const },
);

const flowPlugin = definePlugin<FlowCapabilities, "flow">({
  name: "flow",
  install(ctx) {
    ctx.deps.extendTransition(flowTransition);
  },
});
```

Методы доступны только в deps effects/reactions, если машина типизирована через `EffectDeps<AppDeps, readonly [typeof flowPlugin]>`. Они не появляются на `manager.transition`.

## Machine Runtime Extensions

`MachineRuntimeExtension` типизирует storage-specific поля machine config. Это нужно, когда plugin вводит `storage: "custom"` и свой input contract.

```ts
import { createMachine, type FSMEvent, type TypedCreateMachineFn } from "@lite-fsm/core";

type AppEvent = FSMEvent<"REFRESH">;

type CacheStorageExtension = {
  storage: "cache";
  input: {
    cache: { key: string };
  };
  internalEvents: FSMEvent<"CACHE_HIT", { key: string }>;
  reducerContext: { cacheKey: string };
  effectDeps: { readCache(key: string): unknown };
  reactionDeps: { writeCache(key: string, value: unknown): void };
  resultMetadata: { kind: "cache" };
  publicState: {
    state: "READY";
    context: { key: string; value: unknown };
  };
};

const createAppMachine: TypedCreateMachineFn<AppEvent, {}, CacheStorageExtension> = createMachine;

const cachedUser = createAppMachine({
  storage: "cache",
  cache: { key: "user:1" },
  config: {
    READY: {
      REFRESH: "READY",
      CACHE_HIT: "READY",
    },
  },
  initialState: "READY",
  initialContext: { key: "user:1", value: undefined },
});
```

Ключи extension:

| Ключ                          | Что типизирует                                                                                                   |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `storage`                     | storage kind; обязателен для непустого extension                                                                 |
| `input`                       | дополнительные поля config и переопределения `initialContext`, `reducer`, `effects`                              |
| `internalEvents`              | события, допустимые внутри config/reducer/effects этой storage machine, но не в public `manager.transition(...)` |
| `reducerContext`              | дополнительные поля третьего аргумента reducer; фактически передает их storage runtime                           |
| `effectDeps` / `reactionDeps` | deps, которыми владеет storage runtime; они исключаются из `setDependencies(...)`                                |
| `resultMetadata`              | типовая metadata для plugin helpers через `MachineResultMetadata<M>`                                             |
| `publicState`                 | override типа `MachinesState<S>[key]`                                                                            |

Extension только типизирует API. Runtime обязан отдельно зарегистрировать storage kind, валидировать machine config и реально предоставить reducer/effect deps.

## Storage Runtime

Storage runtime владеет машинами с конкретным `machine.storage`. Через него plugin может полностью заменить способ reduce/commit/snapshot для своих machines.

```ts
import { definePlugin, type PluginInstallContext } from "@lite-fsm/core";

type StorageRuntime = Parameters<PluginInstallContext["storage"]["register"]>[1];

const readCacheKey = (machine: unknown): string => {
  const key = (machine as { cache?: { key?: unknown } }).cache?.key;
  if (typeof key === "string" && key.length > 0) return key;
  throw new Error("[cache] machine requires cache.key.");
};

const cacheRuntime: StorageRuntime = {
  kind: "cache",
  routeMetaKeys: ["cacheKey"],

  validateTemplate({ machine }) {
    readCacheKey(machine);
  },

  compileTemplate({ key, machine }) {
    return { key, kind: "cache", data: { key: readCacheKey(machine) } };
  },

  createRuntimeState({ templates }) {
    return {
      templates,
      values: new Map<string, unknown>(),
    };
  },

  createPublicInitialState({ template }) {
    const { key } = template.data as { key: string };
    return { state: "READY", context: { key, value: undefined } };
  },

  acceptsEvent({ action, dispatch, template }) {
    if (action.type !== "REFRESH") return false;
    if (dispatch.route.scope === "unscoped") return true;
    if (dispatch.route.scope !== "plugin" || dispatch.route.key !== "cacheKey") return false;

    const { key } = template.data as { key: string };
    return dispatch.route.targetSet.includes(key);
  },

  reduce({ template, dispatch }) {
    const { key } = template.data as { key: string };

    dispatch.nextState = {
      ...dispatch.nextState,
      [template.key]: {
        state: "READY",
        context: { key, value: Date.now() },
      },
    };
  },

  commit({ state, dispatch }) {
    const runtime = state as { templates: readonly { key: string; data?: unknown }[]; values: Map<string, unknown> };

    for (const template of runtime.templates) {
      const { key } = template.data as { key: string };
      const slice = dispatch.nextState[template.key] as { context?: { value?: unknown } } | undefined;
      runtime.values.set(key, slice?.context?.value);
    }
  },
};

export const cachePlugin = definePlugin<{ actionMeta: { cacheKey: string }; machine: CacheStorageExtension }, "cache">({
  name: "cache",
  install(ctx) {
    ctx.routing.registerMetaKey("cacheKey", (value) => String(value));
    ctx.storage.register("cache", cacheRuntime);
  },
});
```

Базовый runtime contract:

| Метод / поле                    | Назначение                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------- |
| `kind`                          | storage kind; должен совпадать с registered kind                                |
| `routeMetaKeys?`                | meta keys, которые runtime требует для routing                                  |
| `validateTemplate(ctx)`         | init-time validation storage-specific machine config                            |
| `compileTemplate(ctx)`          | превращает machine config в compiled template; returned `kind` должен совпадать |
| `createRuntimeState(ctx)`       | создает private runtime state для этого storage kind                            |
| `createPublicInitialState(ctx)` | создает public slice в `manager.getState()`                                     |
| `prepareAction?(ctx)`           | может заменить action или вернуть drop symbol внутри runtime contract           |
| `beginReduce?(ctx)`             | optional staged work перед delivery                                             |
| `acceptsEvent(ctx)`             | решает, получает ли template это событие                                        |
| `reduce(ctx)`                   | пишет следующий public root state через `dispatch.nextState`                    |
| `commit(ctx)`                   | фиксирует private runtime state после successful reduce                         |

Опциональные blocks:

| Block       | Что дает                                                                          |
| ----------- | --------------------------------------------------------------------------------- |
| `effects`   | `condition`, `resolveInvocations`, `invoke` для storage-owned effects             |
| `reactions` | post-commit reactions до subscribers                                              |
| `snapshot`  | `dehydrate` / `hydrate` через `snapshot.storage[kind]`                            |
| `identity`  | runtime identity resolution для capabilities, которым нужна собственная адресация |

## Snapshots Custom Runtime

`getSnapshot()` возвращает runtime state только в `machines` envelope и не вызывает storage `dehydrate`. Storage-owned payload живет в `dehydrate().storage[kind]`.

```ts
const snapshot = manager.dehydrate({
  storage: ["cache"],
});

snapshot.storage?.cache;

manager.hydrate({
  machines: {},
  storage: {
    cache: {
      values: [["user:1", { name: "Ada" }]],
    },
  },
});
```

Storage runtime сам валидирует payload и решает, как применить `mode: "preview" | "commit" | "init"`. `getHydratedState(...)` вызывает hydrate в preview mode и не должен мутировать private runtime state.

## Lifecycle

| Этап                        | Что происходит                                                                 |
| --------------------------- | ------------------------------------------------------------------------------ |
| 1. Preset install           | core регистрирует встроенный `storage: "instance"`                             |
| 2. User plugin install      | `install(ctx)` вызывается один раз в порядке `options.plugins`                 |
| 3. Registry validation      | duplicate names/kinds/keys, default storage, route resolvers, ownership        |
| 4. Template validation      | каждый storage runtime валидирует свои machines                                |
| 5. Runtime init             | storage runtimes создают private state и initial public state                  |
| 6. Manager extension attach | `ctx.manager.extend(...)` добавляет поля на returned manager                   |
| 7. Transition               | prepare/interceptors/hooks/storage reduce/commit/reactions/subscribers/effects |

Registry можно менять только синхронно внутри `install(ctx)`. Сохраненный `ctx` после завершения install — ошибка контракта.

## Init Errors

Core бросает init/runtime contract errors независимо от `IS_DEV`:

| Ошибка                                | Когда возникает                                                         |
| ------------------------------------- | ----------------------------------------------------------------------- |
| duplicate plugin name                 | два plugin с одинаковым `name`                                          |
| duplicate storage kind                | два runtime зарегистрировали один `kind`                                |
| mismatched storage kind               | `runtime.kind` или compiled template `kind` не совпал с registered kind |
| unknown storage kind                  | machine использует `storage`, для которого нет runtime                  |
| missing default storage               | default kind preset не зарегистрирован                                  |
| missing route resolver                | runtime объявил `routeMetaKeys`, но plugin не зарегистрировал resolver  |
| duplicate route meta key              | повторный или reserved `action.meta` key                                |
| duplicate manager/deps/transition key | два plugin владеют одним extension key                                  |
| core key override                     | plugin пытается заменить core manager method или scoped key             |
| unowned scoped key                    | scoped factory вернула key, которого нет в `factory.keys`               |
| invalid storage config/snapshot       | runtime не может безопасно продолжить                                   |

## Ограничения

- Public API для custom runtime presets не опубликован: `MachineManager(...)` всегда использует встроенный preset.
- Отключить встроенный `storage: "instance"` через public API нельзя.
- Plugin-provided storage runtimes не поддерживаются standalone `Machine(...)` и `defineMachine().create(...)`.
- `PluginCapabilities` не проверяют runtime-регистрации автоматически. Capability и `install(ctx)` должны совпадать по смыслу.
- `action.meta` предназначен для routing/sender metadata. Domain data передается через `payload`.
- Не мутируй `machines` и `runtime.config` из plugin code.
- Не добавляй plugin-specific behavior в общий app bundle без явного импорта plugin package.

## Быстрый Выбор

| Задача                                              | Используй                                                  |
| --------------------------------------------------- | ---------------------------------------------------------- |
| Нужен `manager.entities` или `manager.audit`        | `ctx.manager.extend` + `PluginCapabilities["manager"]`     |
| Нужна адресация события по external id              | `ctx.routing.registerMetaKey` + `actionMeta`               |
| Нужна новая форма machine config                    | `MachineRuntimeExtension` + `TypedCreateMachineFn` wrapper |
| Нужно хранить slice не как обычную instance-machine | `ctx.storage.register`                                     |
| Нужно скрытое runtime событие                       | `transitionEvents` + interceptor/storage runtime           |
| Нужно преобразовать action перед reducers           | `ctx.actions.intercept`                                    |
| Нужны metrics/transaction phases                    | `ctx.dispatch.*`                                           |
| Нужен helper внутри effects/reactions               | `ctx.deps.extendDeps`                                      |
| Нужен command sugar внутри effects/reactions        | `ctx.deps.extendTransition`                                |
| Нужно сохранить private runtime data                | `runtime.snapshot` и `snapshot.storage[kind]`              |

## Полный Минимальный Пример: Cache Storage Plugin

Этот пример показывает, как части plugin system складываются в один plugin:

- `storage: "cache"` задает отдельный runtime для записей кеша.
- `cache: { key }` становится конфигурацией машины для этого storage.
- `meta.cacheKey` адресует событие в одну запись кеша.
- `CACHE_INVALIDATE` является plugin transition event и не входит в `AppEvent` машин.
- `manager.cache.read(...)` добавляется через manager extension.
- `cacheTrace()` и `transition.cacheLoaded(...)` доступны только внутри effects/reactions.
- `snapshot.storage.cache` сохраняет внутренние данные cache runtime.

```ts
import {
  MachineManager,
  createMachine,
  definePlugin,
  type EffectDeps,
  type FSMEvent,
  type ManagerAction,
  type PluginInstallContext,
  type ScopedDepsContext,
  type ScopedDepsFactory,
  type ScopedTransitionContext,
  type ScopedTransitionFactory,
  type TypedCreateMachineFn,
} from "@lite-fsm/core";

type StorageRuntime = Parameters<PluginInstallContext["storage"]["register"]>[1];

type CacheLoad = FSMEvent<"CACHE_LOAD">;
type CacheLoaded = FSMEvent<"CACHE_LOADED", { key: string; value: unknown }>;
type AppEvent = CacheLoad | CacheLoaded;

type CacheInvalidate = FSMEvent<"CACHE_INVALIDATE", { key?: string }>;
type CacheClear = FSMEvent<"CACHE_CLEAR">;
type CachePluginEvent = CacheInvalidate | CacheClear;

type CacheSlice = {
  state: "READY";
  context: {
    key: string;
    value: unknown;
  };
};

type CacheStorageExtension = {
  storage: "cache";
  input: {
    cache: {
      key: string;
    };
  };
  publicState: CacheSlice;
};

type CacheCapabilities = {
  machine: CacheStorageExtension;
  transitionEvents: CachePluginEvent;
  actionMeta: {
    cacheKey: string;
  };
  manager: {
    cache: {
      keys(): readonly string[];
      read(key: string): unknown;
    };
  };
  deps: {
    cacheTrace(): string;
  };
  transition: {
    cacheLoaded(key: string, value: unknown): ManagerAction<AppEvent>;
  };
};
```

Scoped deps и scoped transition объявляют owned keys явно. Это нужно runtime-у, чтобы проверить дубликаты и запретить перезапись core keys.

```ts
const cacheScopedDeps: ScopedDepsFactory<CacheCapabilities["deps"]> = Object.assign(
  (scope: ScopedDepsContext) => ({
    cacheTrace: () => `${scope.phase}:${scope.source.storage}:${scope.source.template}:${scope.event.type}`,
  }),
  { keys: ["cacheTrace"] as const },
);

const cacheScopedTransition: ScopedTransitionFactory<CacheCapabilities["transition"]> = Object.assign(
  (scope: ScopedTransitionContext) => ({
    cacheLoaded: (key: string, value: unknown) =>
      scope.transition({
        type: "CACHE_LOADED",
        payload: { key, value },
        meta: { cacheKey: key },
      }) as ManagerAction<AppEvent>,
  }),
  { keys: ["cacheLoaded"] as const },
);
```

Storage runtime владеет только машинами с `storage: "cache"` и сам решает, какие события принимать.

```ts
type CacheTemplateData = { key: string };
type CacheRuntimeState = {
  templates: readonly { key: string; data?: unknown }[];
  values: Map<string, unknown>;
};
type CacheSnapshot = {
  values: Record<string, unknown>;
};

const readMachineCacheKey = (machine: unknown): string => {
  const key = (machine as { cache?: { key?: unknown } }).cache?.key;
  if (typeof key === "string" && key.length > 0) return key;
  throw new Error("[cache] machine requires cache.key.");
};

const readTemplateCacheKey = (template: { data?: unknown }): string => (template.data as CacheTemplateData).key;

const isCacheSlice = (value: unknown): value is CacheSlice =>
  typeof value === "object" &&
  value !== null &&
  (value as CacheSlice).state === "READY" &&
  typeof (value as CacheSlice).context?.key === "string";

const cacheRuntime: StorageRuntime = {
  kind: "cache",
  routeMetaKeys: ["cacheKey"],

  validateTemplate({ machine }) {
    readMachineCacheKey(machine);
  },

  compileTemplate({ key, machine }) {
    return {
      key,
      kind: "cache",
      data: { key: readMachineCacheKey(machine) } satisfies CacheTemplateData,
    };
  },

  createRuntimeState({ templates }) {
    return {
      templates,
      values: new Map(templates.map((template) => [readTemplateCacheKey(template), undefined])),
    } satisfies CacheRuntimeState;
  },

  createPublicInitialState({ template, state }) {
    const runtime = state as CacheRuntimeState;
    const key = readTemplateCacheKey(template);
    return { state: "READY", context: { key, value: runtime.values.get(key) } } satisfies CacheSlice;
  },

  acceptsEvent({ template, action, dispatch }) {
    if (action.type !== "CACHE_LOADED" && action.type !== "CACHE_CLEAR") return false;
    if (dispatch.route.scope === "unscoped") return true;
    if (dispatch.route.scope !== "plugin" || dispatch.route.key !== "cacheKey") return false;
    return dispatch.route.targetSet.includes(readTemplateCacheKey(template));
  },

  reduce({ template, action, dispatch }) {
    const key = readTemplateCacheKey(template);
    const value = action.type === "CACHE_LOADED" ? (action as ManagerAction<CacheLoaded>).payload.value : undefined;

    dispatch.nextState = {
      ...dispatch.nextState,
      [template.key]: { state: "READY", context: { key, value } } satisfies CacheSlice,
    };
  },

  commit({ state, dispatch }) {
    const runtime = state as CacheRuntimeState;
    for (const template of runtime.templates) {
      const key = readTemplateCacheKey(template);
      const slice = dispatch.nextState[template.key];
      if (isCacheSlice(slice)) runtime.values.set(key, slice.context.value);
    }
  },

  snapshot: {
    dehydrate({ state }) {
      const runtime = state as CacheRuntimeState;
      return { storage: { values: Object.fromEntries(runtime.values) } satisfies CacheSnapshot };
    },

    hydrate(ctx) {
      const runtime = ctx.state as CacheRuntimeState;
      const payload = (ctx.snapshot as { storage?: { cache?: CacheSnapshot } }).storage?.cache;
      if (!payload || typeof payload.values !== "object") {
        throw new Error("[cache] invalid cache snapshot.");
      }

      const nextState = { ...ctx.baseState };
      for (const template of runtime.templates) {
        const key = readTemplateCacheKey(template);
        const value = payload.values[key];
        nextState[template.key] = { state: "READY", context: { key, value } } satisfies CacheSlice;
        if (ctx.mode !== "preview") runtime.values.set(key, value);
      }

      return { nextState, changed: true };
    },
  },
};
```

Plugin связывает runtime с manager API. Здесь используются все registry из `PluginInstallContext`.

```ts
export const cachePlugin = definePlugin<CacheCapabilities, "cache">({
  name: "cache",
  install(ctx) {
    ctx.routing.registerMetaKey("cacheKey", (value) => String(value));
    ctx.storage.register("cache", cacheRuntime);

    ctx.actions.intercept(({ action }) => {
      if (action.type !== "CACHE_INVALIDATE") return;
      const cacheKey = (action.payload as { key?: string } | undefined)?.key;

      return {
        action: {
          type: "CACHE_CLEAR",
          meta: cacheKey ? { cacheKey } : undefined,
        },
        stopInterceptors: true,
      };
    });

    ctx.dispatch.beforeReduce((dispatch) => {
      dispatch.runtime.set("cache.isCacheEvent", dispatch.action.type.startsWith("CACHE_"));
    });

    ctx.dispatch.afterEffects((dispatch) => {
      if (dispatch.runtime.get("cache.isCacheEvent")) {
        // Метрики, tracing или runtime cleanup без изменения control flow.
      }
    });

    ctx.deps.extendDeps(cacheScopedDeps);
    ctx.deps.extendTransition(cacheScopedTransition);

    ctx.manager.extend("cache", (runtime) => ({
      keys: () =>
        Object.values(runtime.getState())
          .filter(isCacheSlice)
          .map((slice) => slice.context.key),
      read: (key) =>
        Object.values(runtime.getState()).find(
          (slice): slice is CacheSlice => isCacheSlice(slice) && slice.context.key === key,
        )?.context.value,
    }));
  },
});
```

Использование в приложении: wrapper фиксирует конфигурацию машины для plugin и scoped deps.

```ts
type CachePlugins = readonly [typeof cachePlugin];
type AppDeps = EffectDeps<{ fetchUser(): Promise<unknown> }, CachePlugins>;

const createAppMachine: TypedCreateMachineFn<AppEvent, AppDeps, CacheStorageExtension> = createMachine;

const userCache = createAppMachine({
  storage: "cache",
  cache: { key: "user:1" },
  config: {
    READY: { CACHE_LOADED: "READY" },
  },
  initialState: "READY",
  initialContext: { key: "user:1", value: undefined },
});

const loader = createAppMachine({
  storage: "instance",
  config: {
    IDLE: { CACHE_LOAD: "LOADING" },
    LOADING: { CACHE_LOADED: "IDLE" },
  },
  initialState: "IDLE",
  initialContext: {},
  effects: {
    LOADING: async ({ fetchUser, cacheTrace, transition }) => {
      const value = await fetchUser();
      console.debug(cacheTrace());
      transition.cacheLoaded("user:1", value);
    },
  },
});

const manager = MachineManager({ userCache, loader }, { plugins: [cachePlugin] as const });

manager.setDependencies({
  fetchUser: async () => ({ name: "Ada" }),
});

manager.transition({ type: "CACHE_LOAD" });
manager.transition({ type: "CACHE_INVALIDATE", payload: { key: "user:1" } });

manager.cache.keys();
manager.cache.read("user:1");

const snapshot = manager.dehydrate({ storage: ["cache"] });

MachineManager({ userCache, loader }, { plugins: [cachePlugin] as const, snapshot });
```

В этом примере части, специфичные для plugin, не попадают в глобальный `createMachine<AppEvent>`. Они видны только там, где приложение явно использует `cachePlugin` и wrapper `TypedCreateMachineFn<AppEvent, AppDeps, CacheStorageExtension>`.
