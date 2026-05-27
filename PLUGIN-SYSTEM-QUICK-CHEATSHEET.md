# lite-fsm — краткая шпаргалка по системе плагинов

Система плагинов расширяет `MachineManager` декларативными разделами. Плагин объявляется через `definePlugin(...).create(...)`:

```ts
const plugin = definePlugin<PluginEvents, HostEvents>().create({
  name: "example",
});
```

`MachineManager(..., { plugins })` подключает значения, созданные этим API.

## Модель

- `PluginEvents` — события, которые плагин добавляет в `manager.transition(...)` и может отправлять через `ctx.transition(...)` или `scope.transition(...)`.
- `HostEvents` — события приложения, которые плагин типизированно наблюдает в обработчиках. Они не входят в `PluginManagerEvents<Plugins>`.
- Разделы плагина добавляют маршрутизацию, поля менеджера, обработчики action, зависимости effects и storage runtime.

## Возможности

| Раздел | Что добавляет | Контракт |
| --- | --- | --- |
| `routeMeta` | Ключи маршрутизации в `action.meta` | Resolver преобразует значение meta в `string | readonly string[]`. |
| `manager` | Методы и поля менеджера | Фабрика вызывается один раз. `ctx.transition(...)` принимает только `PluginEvents`. |
| `intercept` | Управление action до доставки в машины | Может вернуть `{ action }`, `{ skipDelivery }`, `{ stopInterceptors }` или `{}`. |
| `hooks` | Наблюдение фаз обработки action | Доступные фазы: `beforeReduce`, `afterReduce`, `beforeCommit`, `beforeSubscribers`, `beforeEffects`, `afterEffects`. Возвращаемое значение игнорируется. |
| `scopedDeps` | Зависимости для `effects` и `reactions` | Фабрика вызывается для каждого effect или reaction и получает `scope.event`, `scope.source`, `scope.phase`, `scope.indices`. |
| `scopedTransition` | Методы на `deps.transition` в `effects` и `reactions` | Функция `transition(action)` сохраняется; раздел добавляет к ней именованные методы. |
| `storage` | Новые storage runtime | Расширенный API через `defineStorageRuntime().create(...)`: состояние, reducer, effects, reactions, snapshot, identity. |

## Типы

| Тип | Назначение |
| --- | --- |
| `PluginManagerEvents<Plugins>` | События, которые добавляет текущий набор плагинов |
| `PluginRouteMeta<Plugins>` | Значения `routeMeta` |
| `PluginManagerExtensions<Plugins>` | Поля, добавленные через `manager` |
| `PluginScopedDeps<Plugins>` | Зависимости из `scopedDeps` |
| `PluginScopedTransition<Plugins>` | Методы из `scopedTransition` |
| `PluginMachineExtensions<Plugins>` | Поля storage runtime, доступные в описании машины |
| `EffectDeps<AppDeps, Plugins>` | `AppDeps`, дополненные `scopedDeps` и `scopedTransition` |

Для точного вывода типов передавайте список плагинов напрямую или сохраняйте его без расширения до общего `LiteFsmPlugin[]`:

```ts
const manager = MachineManager(machines, { plugins: [plugin] });
```

## Жизненный цикл action

Один вызов `manager.transition(action)` проходит общую цепочку обработки. Плагины встраиваются в нее через storage runtime, `intercept`, `hooks`, `reactions` и `scopedDeps` для effects.

```txt
raw action
  -> storage.prepareAction
  -> middleware: код до next(action)
  -> storage.beforeReduce
  -> plugin intercept
  -> hooks.beforeReduce
  -> storage reduce
  -> hooks.afterReduce
  -> hooks.beforeCommit
  -> storage commit
  -> hooks.beforeSubscribers
  -> storage reactions
  -> subscribers
  -> middleware: код после next(action)
  -> hooks.beforeEffects
  -> effects
  -> hooks.afterEffects
```

| Фаза | Назначение |
| --- | --- |
| `storage.prepareAction` | Ранняя подготовка action до middleware: замена или отмена dispatch. |
| `middleware` до `next(action)` | Обертка вокруг основной обработки: логирование, devtools, внешние политики. |
| `storage.beforeReduce` | Последняя storage-подготовка action перед plugin interceptors и reducer. |
| `plugin intercept` | Замена action, пропуск доставки в машины или остановка следующих interceptors. |
| `hooks.beforeReduce` / `hooks.afterReduce` | Наблюдение до и после reducer без изменения action. |
| `storage reduce` | Изменение root state силами storage runtime. |
| `hooks.beforeCommit` / `storage commit` | Финализация внутреннего состояния storage runtime перед публикацией state. |
| `hooks.beforeSubscribers` / `reactions` / `subscribers` | Синхронные реакции на опубликованный state. |
| `middleware` после `next(action)` | Завершение middleware после commit и subscribers. |
| `hooks.beforeEffects` / `effects` / `hooks.afterEffects` | Побочные эффекты после завершения middleware-цепочки. |

## Архитектурные правила

- Плагины регистрируются в порядке подключения. Этот порядок определяет выполнение `intercept`, `hooks`, `scopedDeps` и `scopedTransition`.
- Все ключи плагинов находятся в одном пространстве имен. `routeMeta.cacheKey` становится `action.meta.cacheKey`, `manager.cache` — `manager.cache`, `scopedDeps.trace` — `deps.trace`, `scopedTransition.refresh` — `deps.transition.refresh`. Дубликаты ключей и попытки занять ключи ядра являются ошибкой инициализации.
- `PluginEvents` расширяют `manager.transition(...)`, но не становятся событиями машин автоматически. Если машина обрабатывает событие плагина, включите его в события приложения: `type AppEvents = HostEvents | PluginManagerEvents<AppPlugins>`.
- `routeMeta` описывает маршрутизацию, а не произвольные пользовательские данные. У одного action может быть только один активный ключ маршрутизации; после замены action маршрут вычисляется заново.
- Контекст обработчика доступен для чтения. Заменяйте или отменяйте action через возвращаемое значение соответствующей фазы: `prepareAction`, `beforeReduce`, `intercept`.
- Вложенный `manager.transition(...)` запрещен внутри `intercept`, обработчиков storage и `hooks`. Для нового action используйте подписчик или effect.
- `middleware` оборачивает reduce, commit и subscribers. Effects выполняются после выхода из middleware-цепочки.

## Правила dispatch

- `intercept` выполняется после storage `beforeReduce` и до reducer.
- Hooks получают финальный action после всех `intercept`.
- Ошибки из `intercept`, `hooks` и обработчиков storage пробрасываются из `manager.transition(...)`.
- `ctx.reportError(error)` вызывает текущий `onError`, но не останавливает и не меняет обработку action.

## Storage runtime

`defineStorageRuntime<Extension>().create(...)` объявляет opaque storage definition для `definePlugin().create({ storage: [...] })`. Используйте этот API, когда машине нужен не стандартный `instance` storage, а собственный runtime: другое публичное состояние, общий reducer, reactions, effects, snapshot или identity.

`kind` становится значением `machine.storage`. Объекты storage runtime, объявленные inline, не принимаются: раздел `storage` получает только значения из `defineStorageRuntime().create(...)`.

`Extension` разделяет:

- поля для описания машины: `input`, `internalEvents`, `reducerContext`, `effectDeps`, `reactionDeps`, `resultMetadata`, `publicState`;
- внутренние поля runtime: `runtimeState`, `templateData`, `snapshotData`, `invocation`, `identity`, `observedEvents`, `routeMeta`.

Storage runtime может:

- валидировать описание машины;
- подготовить `templateData`;
- создать внутреннее состояние и начальное публичное состояние;
- подготовить, заменить или отменить action через `prepareAction` и `beforeReduce`;
- выполнить `reduce` для одного template или `reduceBucket` для группы templates;
- выполнить commit, reactions и effects;
- участвовать в `dehydrate()` / `hydrate()`;
- вычислять identity для записей, которыми управляет runtime.

Основной протокол:

- `compileTemplate(ctx)` возвращает только `void | { data?: TemplateData }`; `key` и `kind` задает runtime.
- `prepareAction(ctx)` и `beforeReduce(ctx)` возвращают `void | { type: "replace"; action } | { type: "drop" }`.
- `reduce(ctx)` и `reduceBucket(ctx)` возвращают `void | { type: "skip" }`.
- `acceptsEvent(ctx)` должен вернуть строго boolean.
- Если `routeMetaKeys` задан, плагин обязан объявить совместимые `routeMeta` resolvers.

Минимальный пример:

```ts
import { definePlugin, defineStorageRuntime, MachineManager } from "@lite-fsm/core";
import type { FSMEvent } from "@lite-fsm/core";

type CacheHit = FSMEvent<"CACHE_HIT">;

type CacheStorageExtension = {
  readonly input: {
    readonly initialContext: { readonly value: number };
  };
  readonly templateData: { readonly value: number };
  readonly publicState: { readonly ready: boolean; readonly value: number };
  readonly observedEvents: CacheHit;
};

const cacheStorage = defineStorageRuntime<CacheStorageExtension>().create({
  kind: "cache",
  validateTemplate() {},
  compileTemplate({ machine }) {
    return { data: { value: machine.initialContext.value } };
  },
  createRuntimeState() {
    return {};
  },
  createPublicInitialState({ template }) {
    return { ready: true, value: template.data?.value ?? 0 };
  },
  acceptsEvent({ action }) {
    return action.type === "CACHE_HIT";
  },
  reduce({ template, dispatch }) {
    const current = dispatch.nextState[template.key] as CacheStorageExtension["publicState"];

    dispatch.nextState = {
      ...dispatch.nextState,
      [template.key]: { ready: true, value: current.value + 1 },
    };
  },
  commit() {},
});

const cachePlugin = definePlugin().create({
  name: "cache-plugin",
  storage: [cacheStorage],
});

const manager = MachineManager(
  {
    cache: {
      storage: "cache",
      config: { idle: { CACHE_HIT: "idle" } },
      initialState: "idle",
      initialContext: { value: 1 },
    },
  },
  { plugins: [cachePlugin] as const },
);

manager.transition({ type: "CACHE_HIT" });
manager.getState().cache; // { ready: true, value: 2 }
```

## Прикладной пример

Пример ниже добавляет ключ маршрутизации, команду менеджера, наблюдение обработки action, зависимости для effects и метод `transition.flush(...)`.

```ts
import {
  MachineManager,
  createMachine,
  definePlugin,
  type EffectDeps,
  type FSMEvent,
  type PluginManagerEvents,
  type TypedCreateMachineFn,
} from "@lite-fsm/core";

type Track = FSMEvent<"TRACK", { readonly name: string }>;
type OpenCheckout = FSMEvent<"OPEN_CHECKOUT">;
type FlushAnalytics = FSMEvent<"ANALYTICS_FLUSH", { readonly queueId: string }>;

type HostEvents = Track | OpenCheckout;
type AnalyticsSink = { record(entry: string): void };

const createAnalyticsPlugin = (sink: AnalyticsSink) =>
  definePlugin<FlushAnalytics, HostEvents>().create({
    name: "analytics",

    routeMeta: {
      analyticsQueue(value: string) {
        return value;
      },
    },

    manager: {
      analytics(ctx) {
        return {
          flush(queueId: string) {
            sink.record(`manager:${queueId}`);
            return ctx.transition({ type: "ANALYTICS_FLUSH", payload: { queueId } });
          },
        };
      },
    },

    intercept(ctx) {
      if (ctx.action.type === "TRACK") {
        sink.record(`track:${ctx.action.payload.name}`);
      }
    },

    hooks: {
      afterEffects(ctx) {
        sink.record(`afterEffects:${ctx.action.type}`);
      },
    },

    scopedDeps: {
      analytics(scope) {
        return {
          record(name: string) {
            sink.record(`${scope.source.template}:${scope.event.type}:${name}`);
          },
        };
      },
    },

    scopedTransition: {
      flush(scope) {
        return (queueId: string) =>
          scope.transition({ type: "ANALYTICS_FLUSH", payload: { queueId } });
      },
    },
  });

const trace: string[] = [];
const analyticsPlugin = createAnalyticsPlugin({
  record(entry) {
    trace.push(entry);
  },
});

type AppPlugins = typeof analyticsPlugin;
type AppEvents = HostEvents | PluginManagerEvents<AppPlugins>;
type AppDeps = EffectDeps<{}, AppPlugins>;

const createAppMachine: TypedCreateMachineFn<AppEvents, AppDeps> = createMachine;

const checkout = createAppMachine({
  config: {
    idle: { OPEN_CHECKOUT: "opened", ANALYTICS_FLUSH: "idle" },
    opened: { ANALYTICS_FLUSH: "opened" },
  },
  initialState: "idle",
  initialContext: {},
  effects: {
    opened({ analytics, transition }) {
      analytics.record("opened");
      transition.flush("checkout");
    },
  },
});

const manager = MachineManager({ checkout }, { plugins: [analyticsPlugin] });

manager.transition({ type: "OPEN_CHECKOUT" });
manager.analytics.flush("manual");
manager.transition({
  type: "TRACK",
  payload: { name: "buy" },
  meta: { analyticsQueue: "checkout" },
});
```

Что показывает пример:

- `analyticsQueue` становится типизированным ключом маршрутизации в `action.meta`;
- `manager.analytics.flush(...)` отправляет событие плагина;
- `intercept` и `hooks` наблюдают общий поток событий без изменения машин;
- effects получают `analytics` из `scopedDeps`;
- effects вызывают `transition.flush(...)` из `scopedTransition`;
- `ANALYTICS_FLUSH` доступен машинам только потому, что `AppEvents` явно включает `PluginManagerEvents<AppPlugins>`.
