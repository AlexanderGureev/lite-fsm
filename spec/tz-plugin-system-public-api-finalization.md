# Plugin system — ТЗ для публичного API `definePlugin().create`

## 1. Цель

Доработать plugin system в `@lite-fsm/core` перед публичным релизом так, чтобы автор plugin объявлял расширения через один строго типизированный builder `definePlugin<PluginEvents, HostEvents>().create({ ... })`.

Целевой API должен убрать ручное дублирование между `Capabilities`, manifest и runtime-регистрацией. Ключи и типы должны выводиться из секций DSL: `routeMeta`, `manager`, `storage`, `scopedDeps` и `scopedTransition`. Generic `PluginEvents` используется только для событий, которые plugin добавляет в manager-level `transition`.

Черновая обратная совместимость текущего plugin API не является обязательной. Поведение существующих машин без plugins и runtime-контракты `MachineManager` должны сохраниться.

## 2. Как выполнять это ТЗ

Реализация идет по этапам. Этап `N+1` начинается только после выполнения критерия завершения этапа `N`.

Для каждого этапа:

1. Вносить минимальные изменения, достаточные для контракта этапа.
2. Добавлять runtime tests через Vitest только для измененного runtime-поведения.
3. Добавлять type tests через Tstyche для каждого измененного публичного типа.
4. Обновлять `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md` и `PLUGIN-SYSTEM-CHEATSHEET.md`, если этап меняет public API или public types.
5. Не запускать сборку документации и команды, которые транзитивно ее запускают.

Запрещенные для агента проверки:

- `pnpm run build`;
- `pnpm --filter @lite-fsm/docs build`;
- `pnpm run docs:build`;
- `pnpm run pages:build*`;
- любой `next build` внутри `apps/docs`.

Для агентной проверки пакетов использовать `pnpm run build:packages`, если этап требует build-проверки.

### Область работ

- `packages/core/src/plugin.ts`;
- `packages/core/src/createMachine.ts`;
- `packages/core/src/interfaces.ts`;
- `packages/core/src/runtime/kernel/registry.ts`;
- `packages/core/src/runtime/kernel/routing.ts`;
- `packages/core/src/runtime/kernel/storage.ts`;
- public exports из `packages/core/src/index.ts`;
- type tests в `tests/types`;
- runtime tests plugin system в `tests/core`;
- documentation fixture `tests/fixtures/plugin-system-documentation.ts`;
- `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`, `PLUGIN-SYSTEM-CHEATSHEET.md`;
- docs pages в `apps/docs`, если они уже описывают plugin system.

### Вне области работ

- `@lite-fsm/entities`;
- React hooks для plugins;
- public custom runtime presets: factories для замены `defaultRuntimePreset` и отдельный API сборки runtime preset остаются вне области работ;
- сохранение старого `definePlugin<Capabilities>({ ... })` как public authoring API;
- добавление отдельного public `createPlugin(...)` для объявления plugins;
- добавление `TypedDefinePluginFn` или app-level pre-typed helper для `definePlugin`;
- экспорт `PluginInstallContext`, registry interfaces и low-level install API из `@lite-fsm/core`;
- добавление public callable scoped factory API с явным `keys`;
- добавление standalone scoped helper functions вроде `defineScopedDeps(...)` и `defineScopedTransition(...)`;
- автоматическое добавление plugin events в `createMachine<AppEvents>(...)`;
- helper `definePlugins(...)` или отдельный lifecycle builder для связывания runtime tuple и `PluginUnion`;
- app-parametric manager extension helper, который типизирует extension от конкретного `MachineStore` или `AppEvents`;
- изменение snapshot format;
- изменение dispatch order;
- изменение routing priority;
- полная generic-типизация internal storage state/template/snapshot contexts за пределами machine extension metadata.

Storage runtime, объявленный через `defineStorageRuntime<Extension>().create(...)` и подключенный внутри plugin DSL, входит в область работ. Это не является public custom runtime preset API.

### Общие тестовые ожидания

- Тесты `describe`, `it`, `test` пишутся на русском; API identifiers остаются на английском.
- Для новых public types обязательны Tstyche тесты с позитивными и негативными сценариями.
- Для нового runtime-поведения обязательны Vitest тесты.
- Новый и измененный чистый код должен иметь 100% coverage по statements, branches, functions и lines.
- 100% coverage не считается достаточным само по себе. Для каждого этапа должна быть покрыта матрица реальных сценариев использования public API: happy path, негативные type-level контракты, runtime validation errors, composition errors, interaction между несколькими plugins, порядок выполнения, и регрессия поведения без plugins. Тесты не должны состоять из искусственных вызовов ради прохождения coverage без проверки пользовательского контракта.
- Если строка или ветка покрыта только техническим тестом ради метрики, рядом должен быть сценарный тест, который доказывает observable behavior или documented error. Исключения допустимы только для unreachable defensive branches и должны быть явно обоснованы в коде или тесте.
- Поведение без plugins должно оставаться регрессионным контрактом.

### Общие ошибки конфигурации

- Локальная validation в `definePlugin().create(...)` должна бросать `LiteFsmError` с кодом `LITE_FSM_INVALID_PLUGIN_DEFINITION`.
- `LITE_FSM_INVALID_PLUGIN_DEFINITION` используется для пустых object sections, пустой `storage` array, неизвестных top-level sections, неверного `name`, неверных entry types, неверного `intercept`, неверных `hooks` и storage definitions, не созданных через `defineStorageRuntime(...)` или internal marker.
- Существующие composition/runtime error codes должны сохраниться: `LITE_FSM_DUPLICATE_PLUGIN`, `LITE_FSM_DUPLICATE_STORAGE_KIND`, `LITE_FSM_DUPLICATE_ROUTE_META_KEY`, `LITE_FSM_DUPLICATE_MANAGER_EXTENSION_KEY`, `LITE_FSM_DUPLICATE_SCOPED_EXTENSION_KEY`, `LITE_FSM_SCOPED_EXTENSION_CORE_KEY`, `LITE_FSM_MANAGER_EXTENSION_CORE_KEY`, `LITE_FSM_MISSING_DEFAULT_STORAGE_KIND`, `LITE_FSM_MISSING_ROUTE_META_RESOLVER`, `LITE_FSM_UNKNOWN_STORAGE_KIND`.
- Ошибка неверного или пустого `kind` внутри storage definition является локальной ошибкой `LITE_FSM_INVALID_PLUGIN_DEFINITION`.

## 3. Термины

- `definePlugin<PluginEvents, HostEvents>().create({ ... })` — единственный public API для объявления plugin.
- `PluginEvents` — события, которые plugin добавляет в manager-level `transition`. Эти события не добавляются автоматически в machine `config`, reducer и effects.
- `HostEvents` — события приложения, которые plugin типизированно наблюдает в `intercept`, `hooks` и `scope.event`. Значение по умолчанию условное: если `PluginEvents` равен `never`, используется `AnyEvent`; если plugin объявил собственные события, используется `never`.
- `routeMeta` — plugin-provided служебные поля `action.meta`, которые участвуют в routing.
- `manager` — plugin-provided поля manager API.
- `storage` — plugin-provided storage runtimes и связанные storage-specific machine extensions.
- `scopedDeps` — plugin-provided deps, доступные только во время effect/reaction invocation.
- `scopedTransition` — plugin-provided методы на scoped `transition` внутри effect/reaction invocation.
- `intercept` — top-level action interceptor plugin, который может заменить action, пропустить delivery или остановить дальнейшие interceptors. Он не объявляет type-visible capabilities.
- `hooks` — top-level lifecycle hooks plugin по фазам dispatch pipeline. Они не объявляют type-visible capabilities.
- `defineStorageRuntime<Extension>().create({ kind, ... })` — advanced public builder для объявления storage runtime вместе с type-level machine extension. Он не публикует custom runtime preset API.
- `PluginUnion` — union типов plugin values, например `typeof cachePlugin | typeof tracePlugin`.
- Runtime plugin tuple — runtime array `plugins`, где порядок важен для регистрации plugins, routing keys, interceptors и hooks.

## 4. Целевой public API

### 4.1. Базовая форма `definePlugin().create`

Plugin без собственных событий:

```ts
export const tracePlugin = definePlugin().create({
  name: "trace",

  scopedDeps: {
    traceId: (scope) => () =>
      `${scope.phase}:${scope.source.storage}:${scope.source.template}:${scope.event.type}`,
  },
});
```

Plugin с manager-level событиями:

```ts
type CachePluginEvent =
  | FSMEvent<"CACHE_INVALIDATE", { key: string }>
  | FSMEvent<"CACHE_WARMED", { key: string }>;

export const cachePlugin = definePlugin<CachePluginEvent>().create({
  name: "cache",

  routeMeta: {
    cacheKey: (value: string) => String(value),
  },

  scopedTransition: {
    invalidate: (scope) => (key: string) => {
      scope.transition({ type: "CACHE_INVALIDATE", payload: { key }, meta: { cacheKey: key } });
    },
  },
});
```

Контракты:

- `definePlugin<PluginEvents, HostEvents>().create({ ... })` должен быть единственным documented API для объявления plugin.
- `PluginEvents` должен иметь default `never`.
- `HostEvents` должен иметь условный default: `[PluginEvents] extends [never] ? AnyEvent : never`.
- `definePlugin().create({ ... })` должен типизировать наблюдаемые события как `AnyEvent`, чтобы простые observer/metrics plugins не требовали явных generics.
- `definePlugin<PluginEvents>().create({ ... })` должен типизировать наблюдаемые события как `PluginEvents`, чтобы narrowing по `action.type` не загрязнялся `AnyEvent`.
- Если plugin должен типизированно наблюдать события приложения, автор явно передает второй generic: `definePlugin<PluginEvents, AppEvents>().create({ ... })`.
- `PluginEvents` должен расширять только `manager.transition(...)` после подключения plugin к manager.
- `HostEvents` не должен расширять `manager.transition(...)`; он нужен только для contextual typing внутри plugin definition.
- `PluginEvents` не должен автоматически попадать в `createMachine<AppEvents>(...)`, machine `config`, reducer или effects.
- Literal `name` должен сохраняться в возвращаемом plugin value.
- Типы capabilities должны выводиться из секций DSL. Пользователь не должен писать отдельный `Capabilities` type для обычного plugin.
- Старые формы `definePlugin<Capabilities>({ ... })` и `definePlugin<Capabilities, "name">({ ... })` должны быть удалены из public authoring API. Deprecated aliases не допускаются.
- `TypedDefinePluginFn` не добавляется в public API первого релиза; app-level pre-typing plugin definitions остается вне области работ.

### 4.2. Секции DSL и вывод capabilities

Целевая форма:

```ts
type CacheMachineExtension = {
  readonly input: {
    readonly cachePolicy?: "memory" | "network-first";
  };
  readonly effectDeps: {
    readonly cache: CacheEffectDeps;
  };
};

const cacheStorage = defineStorageRuntime<CacheMachineExtension>().create({
  kind: "cache",
  validateTemplate(ctx) {},
  compileTemplate(ctx) {
    return {};
  },
  createRuntimeState(ctx) {},
  createPublicInitialState(ctx) {},
  acceptsEvent(ctx) {},
  reduce(ctx) {},
  commit(ctx) {},
});

export const cachePlugin = definePlugin<CachePluginEvent>().create({
  name: "cache",

  routeMeta: {
    cacheKey: (value: string) => String(value),
  },

  manager: {
    cache: (ctx) => ({
      getSchemaVersion: () => ctx.schemaVersion,
    }),
  },

  storage: [cacheStorage],

  scopedDeps: {
    cacheTrace: (scope) => () => scope.event.type,
  },

  scopedTransition: {
    invalidate: (scope) => (key: string) => {
      scope.transition({ type: "CACHE_INVALIDATE", payload: { key } });
    },
  },

  intercept(ctx) {
    if (ctx.action.type === "CACHE_INVALIDATE") {
      return { skipDelivery: true };
    }
  },

  hooks: {
    afterEffects(ctx) {
      if (ctx.action.type === "CACHE_INVALIDATE") {
        ctx.reportError(new Error("cache invalidated"));
      }
    },
  },
});
```

Capabilities выводятся так:

- `managerEvents` — из generic `PluginEvents`;
- `routeMeta` — из keys и первого параметра resolver в `routeMeta`;
- `manager` — из keys и return type factories в `manager`;
- `machineExtension` — из storage definitions секции `storage`;
- `scopedDeps` — из keys и return type builders в `scopedDeps`;
- `scopedTransition` — из keys и return type builders в `scopedTransition`.

Object section, если она передана, должна быть non-empty object. Пустой object в `routeMeta`, `manager`, `scopedDeps`, `scopedTransition` или `hooks` должен бросать `LITE_FSM_INVALID_PLUGIN_DEFINITION`. `storage`, если передана, должна быть non-empty array storage definitions.

### 4.3. `routeMeta`

`routeMeta` объявляется объектом resolver functions:

```ts
routeMeta: {
  entityId: (value: string) => value,
  tenantId: (value: string | readonly string[]) => value,
}
```

Контракты:

- Object key является public route meta key.
- Тип первого параметра resolver является типом значения `action.meta[key]`.
- Resolver должен возвращать `string | readonly string[]`.
- Поля `routeMeta` в `manager.transition(...).meta` должны быть optional.
- `routeMeta` расширяет только `action.meta`; пользовательские данные остаются в `payload`.
- `PluginRouteMeta<PluginUnion>` возвращает raw map объявленных route meta значений, например `{ cacheKey: string }`; optional semantics применяется в `manager.transition(...).meta` через `CoreActionMeta & Partial<PluginRouteMeta<PluginUnion>>`.
- Runtime автоматически регистрирует route resolvers из секции `routeMeta`.
- Runtime не валидирует фактический тип `action.meta[key]` перед вызовом resolver. Тип первого параметра resolver является compile-time контрактом typed `manager.transition(...)`; runtime валидирует только результат resolver.
- Duplicate route key между plugins бросает clear error.
- Routing priority не меняется: `actorId` → registered plugin route keys в порядке регистрации → `groupId` → `groupTag` → unscoped.
- `registerMetaKey(...)` не должен быть public API.
- `ctx.routing.registerRouteMeta(...)` не должен использоваться в public examples основного DSL.

Документация должна рекомендовать простые scalar keys вроде `entityId`, `cacheKey`, `documentId`, `tenantId`. Пример `auditTarget` не должен быть базовым примером.

### 4.4. Plugin events и machine events

`PluginEvents` расширяет manager-level `transition`, но не меняет типы машин.

Пример manager-level typing:

```ts
type AppPlugins = typeof cachePlugin | typeof tracePlugin;

type ManagerEvents = AppEvent | PluginManagerEvents<AppPlugins>;

const manager = MachineManager(machines, {
  plugins: [cachePlugin, tracePlugin],
});

manager.transition({ type: "CACHE_INVALIDATE", payload: { key: "user:1" } });
```

Если machine должна обрабатывать plugin event в `config`, reducer или effects, приложение явно включает event в `AppEvents`:

```ts
type AppEvents = DomainEvent | PluginManagerEvents<AppPlugins>;

const createAppMachine: TypedCreateMachineFn<
  AppEvents,
  AppDeps,
  PluginMachineExtensions<AppPlugins>
> = createMachine;
```

Контракты:

- `PluginManagerEvents<PluginUnion>` должен возвращать union events из `definePlugin<PluginEvents>().create(...)`.
- `createMachine<DomainEvent>({ ... })` не принимает plugin event, если приложение не включило его в `DomainEvent`.
- Runtime не обязан валидировать полноту `PluginEvents`, потому что event union является type-level контрактом.

### 4.5. `scopedDeps` и `scopedTransition`

Scoped extensions объявляются inline object definitions:

```ts
type FlowPluginEvent = FSMEvent<"DONE", { id: string }>;

definePlugin<FlowPluginEvent>().create({
  name: "flow",

  scopedDeps: {
    traceId: (scope) => () => scope.event.type,
  },

  scopedTransition: {
    finish: (scope) => (id: string) => {
      scope.transition({ type: "DONE", payload: { id } });
    },
  },
});
```

Контракты:

- Не должно быть public `keys`.
- Не должно быть public `Object.assign(..., { keys: [...] })`.
- `scope` должен получать contextual typing.
- Keys выводятся из object keys.
- `scopedDeps` value builder имеет форму `(scope) => depValue`.
- `scopedTransition` value builder имеет форму `(scope) => method`.
- `scope.event` внутри plugin должен иметь тип `ManagerAction<HostEvents | PluginEvents>`.
- `scope.transition(...)` внутри plugin должен принимать `ManagerAction<PluginEvents>`.
- `scopedTransition` не должен отправлять `HostEvents`, если эти events не включены в `PluginEvents`; plugin-owned helper отправляет только plugin-owned events.
- `EffectDeps<AppDeps, PluginUnion>["transition"]` должен сохранять callable core `transition(action)` и добавлять scoped methods через intersection. В effects/reactions одновременно доступны `transition({ type: "DONE" })` и `transition.finish(id)`, но `manager.transition.finish(...)` остается type error.
- Command-style методы `scopedTransition` должны иметь возможность возвращать `void`.
- Методы `scopedTransition` должны иметь возможность возвращать `ManagerAction<PluginEvents>`, если method реально возвращает результат `scope.transition(...)`.
- Runtime ownership diagnostics для duplicate scoped keys сохраняются.
- Попытка заменить core/app dep key остается runtime error.

`ScopedDepsFactory` и `ScopedTransitionFactory` являются internal representation. Они не должны экспортироваться из public entrypoint `@lite-fsm/core` и не должны использоваться в public examples.

### 4.6. `storage` и `PluginMachineExtensions`

Storage-specific machine extensions объявляются через `defineStorageRuntime<Extension>().create(...)` и подключаются в секцию `storage` plugin:

```ts
type CacheMachineExtension = {
  readonly input: {
    readonly cachePolicy?: "memory" | "network-first";
  };
  readonly effectDeps: {
    readonly cache: CacheEffectDeps;
  };
};

const cacheStorage = defineStorageRuntime<CacheMachineExtension>().create({
  kind: "cache",
  validateTemplate(ctx) {},
  compileTemplate(ctx) {
    return {};
  },
  createRuntimeState(ctx) {},
  createPublicInitialState(ctx) {},
  acceptsEvent(ctx) {},
  reduce(ctx) {},
  commit(ctx) {},
});

export const cachePlugin = definePlugin<CachePluginEvent>().create({
  name: "cache",

  storage: [cacheStorage],
});
```

Контракты:

- `kind` внутри `defineStorageRuntime(...).create({ kind })` является storage kind и единственным источником имени storage.
- `CacheMachineExtension` не должен повторять `storage: "cache"`.
- `defineStorageRuntime<Extension>().create(definition)` связывает runtime storage registration и type-level machine extension.
- Builder-style форма нужна, чтобы explicit `Extension` не ломал вывод literal `kind`.
- `defineStorageRuntime(...).create(definition)` должен проверять, что `kind` является непустой строкой, и возвращать opaque storage definition.
- Возвращаемый storage definition является opaque value для plugin DSL. Он не является public `StorageRuntime` и не должен использоваться вне `definePlugin().create({ storage: [...] })`.
- `defineStorageRuntime().create(...)` без explicit `Extension` должен сохранять literal `kind` и давать machine extension `{ storage: Kind }`, а не `never`.
- `defineStorageRuntime(...)` является public stable builder, но storage runtime authoring нужно документировать как advanced API: runtime владеет private state, snapshot/hydration payload, routing participation, commit/reaction/effect behavior.
- `PluginMachineExtensionInput` должен поддерживать только ключи `input`, `internalEvents`, `reducerContext`, `effectDeps`, `reactionDeps`, `resultMetadata` и `publicState`.
- `PluginMachineExtensionInput` не должен принимать ключ `storage`; storage kind выводится из `definition.kind`.
- Unknown keys в `PluginMachineExtensionInput` должны давать type error.
- `defineStorageRuntime(...)` является единственным public способом объявить typed storage runtime для plugin DSL.
- `defineStorageRuntime().create(...)` должен давать contextual typing для storage runtime methods. Named context types для storage runtime methods не являются documented public helpers.
- `validateTemplate(ctx)` и `compileTemplate(ctx)` должны видеть `ctx.machine` как machine config для данного storage kind с input из `Extension["input"]`. Остальные runtime contexts, включая runtime state, compiled template data и snapshot payload, остаются широкими `unknown`/internal types.
- Public `compileTemplate(ctx)` не должен возвращать `key` или `kind`. Он возвращает только template payload, например `void` или `{ data?: unknown }`. Builder нормализует результат во внутренний `CompiledStorageTemplate` с `key: ctx.key` и `kind: definition.kind`.
- Дополнительные public generics для `TemplateData`, `RuntimeState` и `SnapshotPayload` не добавляются в первом релизе. Более строгая типизация storage internals остается future work.
- Если storage definition объявляет `effectDeps` или `reactionDeps`, runtime implementation обязан фактически добавить эти deps при invocation. Core типизирует контракт, но не валидирует автоматическое соответствие runtime behavior и `Extension`.
- `routeMetaKeys` остается runtime field storage definition. Composition validation `missing route resolver, required by storage runtime` должна проверять эти keys после регистрации storage definitions.
- Несовпадение compiled template `kind` и storage definition `kind` невозможно через public `defineStorageRuntime(...)`; runtime error `LITE_FSM_INVALID_STORAGE_RUNTIME` сохраняется только для internal storage entries.
- Секция plugin `storage` является readonly array storage definitions, например `storage: [cacheStorage]`. Object form `storage: { cache: ... }` не является public API.
- `PluginMachineExtensions<typeof cachePlugin>` должен возвращать union normalized machine extensions вида `{ storage: "cache" } & CacheMachineExtension`.
- Plugin с несколькими storage definitions должен давать union machine extensions по всем definitions. Plugin без секции `storage` должен давать `never`.
- `TypedCreateMachineFn<AppEvents, AppDeps, PluginMachineExtensions<AppPlugins>>` должен принимать все storage kinds из plugin union и отклонять unknown storage kind.
- Duplicate storage kind между registered storage definitions бросает clear error.
- Duplicate storage kind внутри одного plugin является локальной ошибкой `LITE_FSM_INVALID_PLUGIN_DEFINITION`.
- Duplicate storage kind между разными plugins или между preset и user plugin является composition error `LITE_FSM_DUPLICATE_STORAGE_KIND`.
- Missing runtime storage для declared storage kind невозможен по конструкции DSL.

### 4.7. `manager`

Manager extensions объявляются объектом factories:

```ts
manager: {
  cache: (ctx) => ({
    getSchemaVersion: () => ctx.schemaVersion,
    invalidate: (key: string) => ctx.transition({ type: "CACHE_INVALIDATE", payload: { key } }),
  }),
},
```

Контракты:

- Object key является manager extension key.
- Return type factory является public type поля manager.
- Duplicate manager key между plugins бросает clear error.
- `ctx` должен соответствовать существующему широкому `ManagerRuntimeContext`; `ctx.transition(...)` внутри manager factory остается типизирован как `ManagerAction<AnyEvent>`.
- App-parametric manager extension factories, которым нужно зависеть от конкретного `MachineStore` или `AppEvents`, находятся вне области работ. Этап реализации должен сохранить строгую типизацию return object factories и вынести точную app-parametric типизацию `ctx` в future work.

### 4.8. `intercept` и `hooks`

`intercept` и `hooks` предназначены только для runtime lifecycle behavior. Они не объявляют type-visible capabilities и не дают доступ к registries.

```ts
intercept(ctx) {
  if (ctx.action.type === "IGNORED") {
    return { skipDelivery: true };
  }
},

hooks: {
  afterEffects(ctx) {
    if (ctx.action.type === "IGNORED") {
      ctx.reportError(new Error("ignored action"));
    }
  },
},
```

Контракты:

- `intercept`, если задан, должен быть function.
- `intercept(ctx)` получает contextual action context с `action`, `originalAction`, `skipDelivery`, `options`, `runtime` и `reportError(...)`.
- `ctx.action` и `ctx.originalAction` имеют тип `ManagerAction<HostEvents | PluginEvents>`.
- `intercept(ctx)` может вернуть `void` или object с полями `action`, `skipDelivery`, `stopInterceptors`.
- `action`, если возвращен из `intercept`, должен иметь тип `ManagerAction<HostEvents | PluginEvents>`.
- `skipDelivery: true` сохраняет текущее runtime-поведение action interception: action не доставляется в machines.
- `stopInterceptors: true` останавливает выполнение следующих interceptors после текущего plugin.
- `hooks`, если задан, должен быть plain non-empty object.
- `hooks` может содержать только известные фазы: `beforeReduce`, `afterReduce`, `beforeCommit`, `beforeSubscribers`, `beforeEffects`, `afterEffects`.
- Значения `hooks` должны быть functions.
- Hook получает тот же contextual action context, что и `intercept`.
- Hooks не получают API для замены action, пропуска delivery или остановки pipeline. Если hook возвращает значение, runtime обязан его игнорировать.
- `intercept` и `hooks` не должны давать доступ к `routing`, `manager`, `deps` или `storage`, чтобы не появлялся второй способ объявлять capabilities.
- Context type для `intercept` и hooks не должен экспортироваться как public type helper.
- Ошибка из `intercept` или `hooks` пробрасывается через текущий механизм ошибок dispatch pipeline.
- Runtime order plugins сохраняется: `intercept` и hooks выполняются в порядке runtime plugin tuple.

Семантика replacement action для `intercept`:

- Replacement `action` обновляет `ctx.action` для следующих interceptors, hooks, reducer, effects и subscribers.
- `ctx.originalAction` остается исходным action, переданным в `manager.transition(...)`; если storage runtime выполнил `prepareAction`, подготовленный action виден через `ctx.action`, а исходный action остается в `ctx.originalAction`.
- Route пересчитывается по replacement action сразу после замены.
- Если interceptor возвращает одновременно `action` и `stopInterceptors: true`, replacement применяется, а следующие interceptors не выполняются.
- Hooks видят финальный `ctx.action` после interceptors и не могут изменить его.

### 4.9. Plugin helper types

Type helpers для capabilities должны принимать `PluginUnion` и runtime tuple. Документация должна рекомендовать `PluginUnion` как переносимый формат для app-level aliases, но не должна запрещать tuple, если он уже объявлен рядом с `MachineManager(...)`.

```ts
type AppPlugins = typeof cachePlugin | typeof tracePlugin;

type AppDeps = EffectDeps<BaseDeps, AppPlugins>;

type AppMachineExtensions = PluginMachineExtensions<AppPlugins>;
```

Если runtime tuple уже существует, helper types должны принять его напрямую:

```ts
const plugins = [cachePlugin, tracePlugin] as const;

type AppPlugins = (typeof plugins)[number];

type AppDepsFromUnion = EffectDeps<BaseDeps, AppPlugins>;
type AppDepsFromTuple = EffectDeps<BaseDeps, typeof plugins>;
```

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

- `PluginMachineExtensions<CachePlugin | EntityPlugin>` возвращает union machine extensions этих plugins.
- `PluginMachineExtensions<readonly [CachePlugin, EntityPlugin]>` возвращает тот же union machine extensions, что и `PluginMachineExtensions<CachePlugin | EntityPlugin>`.
- `PluginMachineExtensions<TracePlugin>` возвращает `never`, если plugin не объявляет `storage`.
- `EffectDeps<AppDeps, PluginUnion>` добавляет `scopedDeps` и `scopedTransition` из plugin union.
- `EffectDeps<BaseDeps, readonly [...]>` и `PluginMachineExtensions<readonly [...]>` должны нормализовать tuple через `[number]`.
- Если у приложения есть runtime tuple, union получается стандартным способом: `(typeof plugins)[number]`.
- `MachineManager(machines, { plugins })` продолжает принимать runtime array/tuple и выводить manager capabilities из runtime plugin array.
- Внутренние типы `MachineManagerOptions`, `ManagerFromPlugins`, `ManagerTransitionEvents`, `ManagerActionMeta`, `MachineDependencies` и связанные aliases должны использовать ту же normalization-модель для runtime tuple.
- Runtime tuple отвечает за порядок выполнения plugins; helper types извлекают только members и игнорируют порядок.

### 4.10. Минимальная public surface

`@lite-fsm/core` должен экспортировать только один способ объявить plugin capabilities:

```ts
definePlugin<PluginEvents, HostEvents>().create({ ... })
```

Public runtime helpers:

```ts
definePlugin;
defineStorageRuntime;
```

Public type helpers:

```ts
type PluginManagerEvents<Plugin>;
type PluginRouteMeta<Plugin>;
type PluginScopedDeps<Plugin>;
type PluginScopedTransition<Plugin>;
type PluginManagerExtensions<Plugin>;
type PluginMachineExtensions<Plugin>;
type EffectDeps<AppDeps, Plugin>;
```

Не экспортировать из `@lite-fsm/core`:

- `createPlugin`;
- старые direct-call overloads `definePlugin(plugin)`;
- `PluginCapabilities`;
- `PluginInstallContext`;
- `PluginSetupContext`;
- `createPluginStorage`;
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
- старые helper types `PluginTransitionEvents`, `PluginActionMeta`, `PluginDeps`, `PluginTransitionExtensions`.
- `LiteFsmPlugin` как documented authoring type.
- named storage runtime context types для `validateTemplate`, `compileTemplate`, `reduce`, `commit`, effects, reactions, snapshot и identity.

Если реализации нужен opaque plugin type для внутренних constraints или declaration emit, он не должен быть documented authoring API. Пользовательские examples должны использовать `typeof plugin`, а не ручную аннотацию `LiteFsmPlugin`.
Если declaration emit требует экспортировать carrier или context types, эти exports не должны быть documented authoring API. Public examples должны полагаться на contextual typing inline methods.

### 4.11. Целевая внутренняя архитектура

Внутренняя архитектура должна быть декларативной. `definePlugin().create(definition)` должен возвращать normalized plugin value, в котором runtime-регистрации выводятся из `definition`, а не пишутся пользователем вручную.

Старую модель user-authored `install(ctx)` нужно удалить из целевой архитектуры. `PluginInstallContext`, mutable registry context, `assertInstallOpen`, registry interfaces и `plugin.install(ctx)` не должны оставаться центральным механизмом установки plugin. Если текущий код проще заменить новой registry pipeline, этап реализации должен удалить старую логику и написать новый слой регистрации поверх normalized entries.

Internal normalized registration path должен появиться до публичной `storage` DSL. Встроенный `instance` storage должен регистрироваться через internal normalized storage entry и `addPlugin(normalizedPlugin)`, а не через legacy `instanceRuntimePlugin.install(ctx)`. Публичный `defineStorageRuntime(...)` появляется только на этапе `storage`, но его internal representation должна переиспользовать тот же normalized storage entry path.

Целевой internal shape:

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

`Normalized*Entry` types являются internal. Entries должны хранить данные, достаточные для diagnostics ownership: plugin name, key/kind, factory/resolver/runtime и исходную секцию. Storage entries должны хранить `pluginName` как owner и `kind` как конфликтующий key; internal `instance` storage должен иметь stable owner `@lite-fsm/core/instance-runtime`.

Целевой pipeline:

1. `definePlugin<PluginEvents, HostEvents>()` создает typed builder.
2. `.create(definition)` выполняет локальную validation `definition`.
3. `.create(definition)` нормализует sections в internal representation:
   - `storage` entries;
   - `routeMeta` resolvers;
   - `scopedDeps` builders с ownership keys;
   - `scopedTransition` builders с ownership keys;
   - `manager` factories;
   - `intercept`;
   - `hooks`.
4. `MachineManager` регистрирует preset plugins, затем user plugins в runtime tuple order.
5. Для каждого plugin registry применяет normalized entries в фиксированном порядке: `storage`, `routeMeta`, `scopedDeps`, `scopedTransition`, `manager`, `intercept`, `hooks`. Storage definitions внутри plugin применяются в порядке массива `storage`.
6. После регистрации всех plugins registry выполняет cross-plugin validation: duplicate ownership, default storage, storage-required route resolvers.
7. Только после validation manager компилирует machine templates.

Registry должен иметь явный метод уровня `addPlugin(normalizedPlugin)`, который применяет normalized entries и сохраняет plugin order для interceptors/hooks. Legacy adapter поверх старого `install(ctx)` не допускается, если он заставляет поддерживать два пути регистрации, дублировать validation или сохранять публично неиспользуемые context types.

### 4.12. Границы validation

Локальная validation выполняется синхронно в `.create(definition)`:

- `name` должен быть непустой строкой;
- object section (`routeMeta`, `manager`, `scopedDeps`, `scopedTransition`, `hooks`), если задана, должна быть plain non-empty object;
- `storage`, если задана, должна быть readonly non-empty array storage definitions;
- unknown top-level section должен быть type-level error для object literals и runtime error `LITE_FSM_INVALID_PLUGIN_DEFINITION` для значений, которые обходят типы;
- `routeMeta` entries должны быть functions;
- `manager` entries должны быть functions;
- `scopedDeps` entries должны быть functions;
- `scopedTransition` entries должны быть functions;
- `storage` entries должны быть результатом `defineStorageRuntime(...).create(...)` или другим internal storage definition marker;
- storage definition `kind` должен быть непустой строкой;
- `intercept`, если задан, должен быть function;
- `hooks`, если задан, должен быть plain non-empty object;
- `hooks` может содержать только известные phase keys;
- `hooks` values должны быть functions.

`definePlugin().create({ name: "x", install() {} })` должен быть запрещен type-level для object literal и должен бросать `LITE_FSM_INVALID_PLUGIN_DEFINITION`, если definition передан через `unknown`, `any` или переменную с обходом excess property checks.

Duplicate storage kind внутри одного plugin должен бросать `LITE_FSM_INVALID_PLUGIN_DEFINITION` в `definePlugin().create(...)`.

Локальная validation в `defineStorageRuntime().create(definition)`:

- `kind` должен быть непустой строкой;
- definition должен содержать обязательные runtime methods storage runtime;
- unknown top-level fields, не входящие в storage runtime contract, должны быть type-level error для object literals и runtime error `LITE_FSM_INVALID_PLUGIN_DEFINITION` для значений, которые обходят типы.
- `defineStorageRuntime().create(definition)` возвращает opaque storage definition, а не public callable или registrable runtime object.

Composition/runtime validation выполняется при создании `MachineManager(...)` после регистрации preset plugins и user plugins:

- duplicate plugin names;
- duplicate storage kinds между registered storage definitions;
- duplicate route meta keys;
- duplicate manager extension keys;
- duplicate scoped dep keys;
- duplicate scoped transition keys;
- попытка занять core manager/scoped keys;
- missing default storage kind;
- missing route resolver, required by storage runtime;
- unknown storage kind в machine config.

Локальные ошибки plugin definition не должны откладываться до первого `MachineManager(...)`, если они не зависят от других plugins или machines. Ошибки композиции не должны бросаться в `.create(...)`, потому что зависят от runtime tuple и preset plugins.

## 5. Этапы реализации

### Этап 1 — `definePlugin<PluginEvents, HostEvents>().create(...)` и inferred capabilities

#### Цель

Ввести object DSL как единственный основной способ объявления type-visible plugin capabilities.

#### Зависит от

Нет зависимостей.

#### Контракт этапа

Заменить старый `definePlugin(...)` на builder-style public API:

```ts
type DefaultPluginHostEvents<PluginEvents extends AnyEvent> = [PluginEvents] extends [never] ? AnyEvent : never;

function definePlugin<
  PluginEvents extends AnyEvent = never,
  HostEvents extends AnyEvent = DefaultPluginHostEvents<PluginEvents>,
>(): {
  create<const Definition extends PluginDefinition<PluginEvents, HostEvents>>(
    definition: Definition,
  ): InternalPluginValue<InferPluginCapabilities<PluginEvents, HostEvents, Definition>> & {
    readonly name: Definition["name"];
  };
};
```

`DefaultPluginHostEvents`, `PluginDefinition`, `InferPluginCapabilities` и `InternalPluginValue` в примере означают непубличные implementation types. Пользователь не должен импортировать или вручную аннотировать эти типы.

Точная внутренняя сигнатура может отличаться, но public behavior должен совпадать:

- `definePlugin().create({ name: "x" })` сохраняет `name: "x"`.
- `definePlugin<PluginEvents>().create({ ... })` сохраняет `PluginEvents` как `managerEvents`.
- `definePlugin<PluginEvents, HostEvents>().create({ ... })` использует `HostEvents` только для contextual typing внутри plugin definition.
- `definePlugin().create({ ... })` типизирует `intercept`, `hooks` и `scope.event` через `AnyEvent`.
- `definePlugin<PluginEvents>().create({ ... })` типизирует `intercept`, `hooks` и `scope.event` через `PluginEvents`; `AnyEvent` не должен ломать narrowing plugin-owned events.
- `TypedDefinePluginFn` и app-level pre-typed plugin definition helper не добавляются.
- Capabilities выводятся из DSL sections, а не передаются отдельным `Capabilities` generic.
- Старые capability names `transitionEvents`, `machine`, `actionMeta`, `deps`, `transition` удаляются из public examples и public type tests.
- Новые inferred capability names: `managerEvents`, `machineExtension`, `routeMeta`, `scopedDeps`, `scopedTransition`, `manager`.
- Старые формы `definePlugin<Capabilities>({ ... })`, `definePlugin<Capabilities>()({ ... })` и `definePlugin<Capabilities, "name">({ ... })` должны быть удалены из public exports или оставлены только во внутреннем модуле, недоступном из `@lite-fsm/core`.
- Public plugin value не должен требовать и содержать user-authored `install(ctx)`.
- `PluginInstallContext`, `PluginSetupContext`, internal definition/capability carrier types и registry interfaces не должны быть public exports из `@lite-fsm/core`.
- Этап должен ввести internal `NormalizedPlugin` и registry method `addPlugin(normalizedPlugin)`, достаточные для no-op plugins и internal storage entries.
- Встроенный `instance` storage должен быть переведен на internal normalized storage entry. `MachineManager(machines)` без пользовательских plugins должен продолжить работать без legacy `plugin.install(ctx)`.
- Type-level DSL shape и extraction helper types должны быть заложены для секций `routeMeta`, `manager`, `scopedDeps`, `scopedTransition`, `intercept` и `hooks`. Public storage type inference вводится в Этапе 4 вместе с `defineStorageRuntime(...)`.
- Public `defineStorageRuntime(...)` и пользовательская `storage` DSL откладываются до Этапа 4; internal storage entry для `instance` использует тот же normalized path, который затем переиспользует `defineStorageRuntime(...)`.

#### Не делать в этом этапе

- Не реализовывать runtime registration пользовательских DSL sections, кроме internal normalized `instance` storage path.
- Не менять dispatch order.
- Не менять public storage runtime behavior, snapshot format или compile semantics.
- Не добавлять `definePlugins(...)`.

#### Тесты этапа

Type tests:

- `definePlugin().create({ name: "trace" })` сохраняет literal `name`.
- `definePlugin<CachePluginEvent>().create({ name: "cache" })` дает `PluginManagerEvents<typeof cachePlugin> = CachePluginEvent`.
- `definePlugin<CachePluginEvent>().create(...)` позволяет внутри `intercept`, `hooks` и `scope.event` сузить `ctx.action.payload` по `type` без загрязнения `AnyEvent`.
- `definePlugin().create(...)` без `PluginEvents` сохраняет широкий observer context `ManagerAction<AnyEvent>`.
- `definePlugin<CachePluginEvent, AppEvent>().create(...)` типизирует `intercept`, `hooks` и `scope.event` через `AppEvent | CachePluginEvent`.
- `routeMeta` key и value type выводятся из resolver.
- `scopedDeps` key и value type выводятся из builder.
- `scopedTransition` key и method type выводятся из builder.
- `manager` key и return type выводятся из factory.
- Старые capability keys не принимаются как documented capability shape.
- Старый direct-call overload `definePlugin({ ... })` недоступен из `@lite-fsm/core`.
- Unknown top-level section, включая legacy `install`, не принимается в object literal definition.
- `PluginInstallContext`, `PluginSetupContext`, `PluginCapabilities`, `PluginDefinition`, `InferPluginCapabilities`, `InternalPluginValue`, `RoutingRegistry`, `ManagerExtensionRegistry`, `DepsExtensionRegistry`, `ActionRegistry`, `DispatchRegistry`, `ScopedDepsFactory`, `ScopedTransitionFactory` и `TypedDefinePluginFn` не импортируются из `@lite-fsm/core`.

Runtime tests:

- `definePlugin().create({ name: "x" })` возвращает plugin value, который можно передать в `MachineManager(..., { plugins })` без изменения поведения no-op plugin.
- `MachineManager(machines)` без пользовательских plugins использует internal normalized `instance` storage и не зависит от legacy `install(ctx)`.
- `definePlugin().create({ name: "x", install() {} } as unknown as ...)` бросает `LITE_FSM_INVALID_PLUGIN_DEFINITION`.

#### Критерий завершения

- Tstyche tests этапа проходят.
- No-op plugin через `definePlugin().create({ name })` не меняет manager behavior.
- Default `instance` storage регистрируется через `addPlugin(normalizedPlugin)`.
- Public exports содержат builder-style `definePlugin`.
- Public exports не содержат `createPlugin`.
- Public exports не содержат старые plugin authoring/registry types.
- Cheatsheets показывают `definePlugin().create(...)` как целевой API, если этап меняет examples.

### Этап 2 — Declarative runtime registration для `routeMeta`, `manager`, `intercept` и `hooks`

#### Цель

Сделать runtime-регистрацию route meta resolvers, manager extensions, action interceptors и dispatch hooks производной от object DSL.

#### Зависит от

Этап 1.

#### Контракт этапа

`definePlugin().create(...)` должен генерировать normalized internal registration plan:

- регистрировать `routeMeta` resolvers в порядке object keys;
- регистрировать `manager` factories в порядке object keys;
- регистрировать `intercept`, если plugin его объявил;
- регистрировать `hooks` по известным phase keys, если plugin их объявил;
- сохранять runtime plugin order между plugins.

Registry должен применять этот plan напрямую через normalized entries. Этап должен удалить старый `install(ctx)` путь для plugin authoring и не добавлять internal adapter, который сохраняет старый mutable install context как основной механизм.

Если `assertInstallOpen`, `installingPlugin`, `PluginInstallContext`, `ActionRegistry`, `DispatchRegistry`, `RoutingRegistry`, `ManagerExtensionRegistry` или `DepsExtensionRegistry` остаются в runtime после этапа, они должны иметь единственного реального владельца. Типы и функции, нужные только для старой install-модели, нужно удалить.

```ts
type PluginActionContext<
  PluginEvents extends AnyEvent = never,
  HostEvents extends AnyEvent = [PluginEvents] extends [never] ? AnyEvent : never,
> = {
  readonly action: ManagerAction<HostEvents | PluginEvents>;
  readonly originalAction: ManagerAction<HostEvents | PluginEvents>;
  readonly skipDelivery: boolean;
  readonly options: unknown;
  readonly runtime: Map<string, unknown>;
  reportError(error: unknown): void;
};
```

`PluginActionContext` в примере является internal contextual type. Он не должен экспортироваться из `@lite-fsm/core`.

Runtime-поведение:

- Duplicate route key бросает clear error.
- Duplicate manager key бросает clear error.
- Empty `routeMeta` object бросает `LITE_FSM_INVALID_PLUGIN_DEFINITION` в `.create(...)`.
- Empty `manager` object бросает `LITE_FSM_INVALID_PLUGIN_DEFINITION` в `.create(...)`.
- Empty `hooks` object бросает `LITE_FSM_INVALID_PLUGIN_DEFINITION` в `.create(...)`.
- Unknown hook phase бросает `LITE_FSM_INVALID_PLUGIN_DEFINITION` в `.create(...)`.
- `intercept` выполняется в plugin order.
- `intercept` может заменить action.
- `intercept` может вернуть `skipDelivery: true`.
- `intercept` может вернуть `stopInterceptors: true`.
- Replacement action из `intercept` обновляет `ctx.action` и route для следующих interceptors, hooks, reducer, effects и subscribers; `ctx.originalAction` остается исходным action, переданным в `manager.transition(...)`.
- Hooks выполняются по dispatch phase и внутри фазы в plugin order.
- Hooks не получают API для замены action, пропуска delivery или остановки pipeline. Возвращаемое значение hook runtime игнорирует.
- Ошибка из `intercept` или hook пробрасывается через dispatch error pipeline.
- Routing priority не меняется.
- `routeMeta` поля в `manager.transition(...).meta` optional.

#### Не делать в этом этапе

- Не реализовывать scoped deps/transition.
- Не реализовывать storage DSL.
- Не менять routing priority.

#### Тесты этапа

Type tests:

- `manager.transition(...)` принимает `meta.cacheKey`, если plugin объявил `routeMeta.cacheKey`.
- `meta.cacheKey` optional.
- `meta.cacheKey` имеет тип первого параметра resolver.
- `intercept(ctx)` и hooks получают contextual action type `ManagerAction<HostEvents | PluginEvents>`.
- `intercept(ctx)` и hooks не имеют доступа к `routing`, `manager`, `deps` и `storage`.
- `intercept(ctx)` позволяет вернуть replacement action типа `ManagerAction<HostEvents | PluginEvents>`.
- Hooks context не содержит API для replacement action, `skipDelivery` mutation или остановки pipeline.
- `manager.cache` получает return type из manager factory.
- `manager` factory получает широкий `ManagerRuntimeContext`; `ctx.transition(...)` внутри factory принимает `ManagerAction<AnyEvent>`.

Runtime tests:

- `routeMeta` resolver участвует в routing.
- `routeMeta` resolver получает фактическое `meta[key]` без runtime validation input type; invalid resolver result бросает существующую route resolver error.
- Duplicate route key между plugins бросает duplicate route error.
- Empty `routeMeta: {}` бросает `LITE_FSM_INVALID_PLUGIN_DEFINITION` при `definePlugin().create(...)`.
- Manager extension доступен на manager instance.
- Duplicate manager key между plugins бросает duplicate manager key error.
- `intercept` регистрируется и выполняется в plugin order.
- `intercept` может заменить action.
- Replacement action пересчитывает route и виден следующим interceptors, hooks, reducer, effects и subscribers.
- Replacement action вместе со `stopInterceptors: true` применяется до остановки следующих interceptors.
- `intercept` с `skipDelivery: true` не доставляет action в machines.
- `intercept` с `stopInterceptors: true` останавливает следующие interceptors.
- Hooks регистрируются и выполняются по phase order и plugin order.
- Возвращаемое значение hook игнорируется runtime.
- Transition из hook остается запрещенным текущим runtime guard.
- Ошибка из `intercept` или hook пробрасывается через dispatch error pipeline.

#### Критерий завершения

- Tstyche tests этапа проходят.
- Runtime tests route meta, manager extension, intercept и hooks проходят.
- Public examples не используют `ctx.routing.registerMetaKey(...)`.
- Public examples не используют `ctx.routing.registerRouteMeta(...)` для основного DSL.

### Этап 3 — `scopedDeps` и `scopedTransition` без `keys` и casts

#### Цель

Сделать scoped extensions частью object DSL и убрать `Object.assign(...)`, `{ keys: [...] }`, `as const`, ручную аннотацию `scope` и `as ManagerAction<...>`.

#### Зависит от

Этапы 1-2.

#### Контракт этапа

`definePlugin().create(...)` должен регистрировать scoped sections:

```ts
definePlugin<FlowPluginEvent>().create({
  name: "flow",

  scopedDeps: {
    traceId: (scope) => () => scope.event.type,
  },

  scopedTransition: {
    finish: (scope) => (id: string) => {
      scope.transition({ type: "FLOW_DONE", payload: { id } });
    },
  },
});
```

Контракты:

- Keys scoped extensions выводятся из object keys.
- `scope` получает contextual type.
- Empty `scopedDeps` object бросает `LITE_FSM_INVALID_PLUGIN_DEFINITION` в `.create(...)`.
- Empty `scopedTransition` object бросает `LITE_FSM_INVALID_PLUGIN_DEFINITION` в `.create(...)`.
- Duplicate scoped keys между plugins бросают существующий ownership error.
- `scope.event` имеет тип `ManagerAction<HostEvents | PluginEvents>`.
- `scope.transition(...)` принимает `ManagerAction<PluginEvents>`.
- `scope.transition(...)` не принимает `HostEvents`, если эти events не входят в `PluginEvents`.
- `EffectDeps<AppDeps, PluginUnion>["transition"]` сохраняет callable core transition и дополняется scoped methods через intersection.
- Command-style methods могут возвращать `void`.
- Methods могут возвращать `ManagerAction<PluginEvents>`, если возвращают результат `scope.transition(...)`.
- `ScopedDepsFactory` и `ScopedTransitionFactory` не экспортируются из public entrypoint.

#### Не делать в этом этапе

- Не менять effect ordering.
- Не менять `manager.setDependencies(...)`.
- Не добавлять standalone scoped helper functions.
- Не менять `createEffect(...)`.

#### Тесты этапа

Type tests:

- Inline `scopedDeps` дает contextual type для `scope`.
- Inline `scopedTransition` дает contextual type для `scope`.
- `scope.transition({ type: ... })` внутри `definePlugin<PluginEvents>().create(...)` не требует `as ManagerAction<...>`.
- `scope.transition({ type: ... })` внутри plugin не принимает `HostEvents`, если они не включены в `PluginEvents`.
- `definePlugin().create({ ... })` без `PluginEvents` не позволяет отправить произвольный plugin event через `scope.transition`.
- `EffectDeps<BaseDeps, AppPlugins>` добавляет scoped deps и scoped transition methods из plugin union.
- В effects/reactions одновременно типизируются `transition({ type: "DONE" })` и `transition.finish(id)`.
- `manager.transition.finish(...)` остается type error.
- `ScopedDepsFactory` и `ScopedTransitionFactory` не экспортируются из `@lite-fsm/core`.

Runtime tests:

- `scopedDeps` добавляет dep в effect invocation.
- `scopedTransition` добавляет method в scoped `transition`.
- Duplicate scoped dep key между plugins бросает ownership error.
- Duplicate scoped transition key между plugins бросает ownership error.
- Empty `scopedDeps: {}` и `scopedTransition: {}` бросают `LITE_FSM_INVALID_PLUGIN_DEFINITION` при `definePlugin().create(...)`.

#### Критерий завершения

- Tstyche tests этапа проходят.
- Runtime scoped deps/transition tests проходят.
- В `PLUGIN-SYSTEM-CHEATSHEET.md` main examples не используют `Object.assign(..., { keys })`, `keys: [...] as const` или `as ManagerAction<...>`.

### Этап 4 — `defineStorageRuntime`, machine extensions и normalized helper types

#### Цель

Связать storage runtime и storage-specific machine extension в одном storage DSL definition и перевести public helper types на normalization-модель, которая принимает `PluginUnion` и runtime tuple.

#### Зависит от

Этапы 1-3.

#### Контракт этапа

Добавить public builder для typed storage runtime:

```ts
function defineStorageRuntime<Extension extends PluginMachineExtensionInput = {}>(): {
  create<const Definition extends StorageRuntimeDefinition>(
    definition: Definition,
  ): PluginStorageRuntime<Definition["kind"], Extension>;
};
```

`StorageRuntimeDefinition` и `PluginStorageRuntime` в примере означают непубличные implementation types. Точная внутренняя сигнатура может отличаться, но public behavior должен совпадать:

- `defineStorageRuntime<Extension>().create({ kind, ...runtime })` является единственным public способом объявить typed storage runtime для plugin DSL.
- `defineStorageRuntime<Extension>().create({ kind, ...runtime })` является advanced public API: документация должна отделять storage runtime authoring от базовых plugin extensions.
- Builder-style форма должна сохранять literal `kind`, даже если пользователь явно передал `Extension`.
- Storage definition `kind` является storage kind и единственным источником имени storage.
- Секция plugin `storage` принимает readonly array storage definitions: `storage: [cacheStorage]`.
- Object form `storage: { cache: cacheStorage }` должен отклоняться как public DSL.
- `defineStorageRuntime(...).create(definition)` валидирует непустой `kind` и базовую форму runtime definition до создания opaque storage definition.
- Возвращаемое значение является opaque storage definition для `definePlugin().create({ storage: [...] })`; оно не является public `StorageRuntime` и не должно использоваться как standalone preset/runtime API.
- `defineStorageRuntime().create(...)` без explicit `Extension` дает machine extension `{ storage: Kind }`.
- Machine extension type не повторяет `storage`.
- `PluginMachineExtensionInput` принимает только `input`, `internalEvents`, `reducerContext`, `effectDeps`, `reactionDeps`, `resultMetadata` и `publicState`; ключ `storage` и unknown keys должны отклоняться.
- `validateTemplate(ctx)` и `compileTemplate(ctx)` получают contextual `ctx.machine` с input из `Extension["input"]`; state/template/snapshot contexts остаются широкими internal types.
- Public `compileTemplate(ctx)` возвращает только template payload (`void` или `{ data?: unknown }`). Public author не возвращает `key` и `kind`; builder подставляет `key: ctx.key` и `kind: definition.kind` во внутренний compiled template.
- Public `defineStorageRuntime` в первом релизе не принимает generics для `TemplateData`, `RuntimeState` и `SnapshotPayload`.
- Storage runtime implementation отвечает за фактическое добавление deps, объявленных в `effectDeps` и `reactionDeps`.
- `routeMetaKeys` остается runtime field storage definition и участвует в существующей validation missing route resolver.
- Несовпадение compiled template `kind` и storage definition `kind` невозможно через public builder; `LITE_FSM_INVALID_STORAGE_RUNTIME` сохраняется для internal storage entries.
- `PluginMachineExtensions<PluginUnion>` возвращает normalized union `{ storage: StorageKind } & Extension`.
- Plugin с несколькими storage definitions возвращает union по всем definitions.
- `PluginMachineExtensions<PluginUnion>` и `PluginMachineExtensions<readonly [...]>` возвращают одинаковый union members.
- `EffectDeps<BaseDeps, PluginUnion>` и `EffectDeps<BaseDeps, readonly [...]>` возвращают одинаковые scoped deps и scoped transition methods.
- Runtime `MachineManager(..., { plugins })` продолжает принимать array/tuple и сохраняет plugin order.
- Public custom runtime presets остаются вне области работ: этап не добавляет API для замены `defaultRuntimePreset`.

Обновить public helper types:

```ts
type PluginManagerEvents<Plugin>;
type PluginRouteMeta<Plugin>;
type PluginScopedDeps<Plugin>;
type PluginScopedTransition<Plugin>;
type PluginManagerExtensions<Plugin>;
type PluginMachineExtensions<Plugin>;
type EffectDeps<AppDeps, Plugin>;
```

Runtime-поведение:

- `definePlugin().create(...)` регистрирует storage runtimes из секции `storage`.
- Duplicate storage kind между registered storage definitions бросает clear error.
- Duplicate storage kind внутри одного plugin бросает `LITE_FSM_INVALID_PLUGIN_DEFINITION`.
- Empty `storage: []` бросает `LITE_FSM_INVALID_PLUGIN_DEFINITION` в `.create(...)`.
- Object form `storage: { cache: ... }` бросает `LITE_FSM_INVALID_PLUGIN_DEFINITION` в `.create(...)`.
- Storage definition, не созданный через `defineStorageRuntime(...).create(...)` или internal marker, бросает `LITE_FSM_INVALID_PLUGIN_DEFINITION`.
- Storage definition с пустым `kind` бросает `LITE_FSM_INVALID_PLUGIN_DEFINITION`.
- Missing storage runtime для declared storage kind невозможен по конструкции.

#### Не делать в этом этапе

- Не добавлять отдельный lifecycle builder API.
- Не добавлять `definePlugins(...)`.
- Не менять snapshot format.
- Не менять plugin order.

#### Тесты этапа

Type tests:

- `PluginMachineExtensions<typeof cachePlugin>` равен normalized cache machine extension.
- `PluginMachineExtensions<typeof cachePlugin | typeof entityPlugin>` равен union extensions.
- `PluginMachineExtensions<typeof tracePlugin>` равен `never`.
- Plugin с двумя storage definitions дает union двух normalized extensions.
- Storage definition без explicit `Extension` дает `{ storage: kind }`, а не `never`.
- `TypedCreateMachineFn` с `PluginMachineExtensions<AppPlugins>` принимает все declared `storage` kinds и отклоняет unknown storage kind.
- Machine extension input type не содержит ручной `storage` literal.
- `PluginMachineExtensionInput` отклоняет ключ `storage` и unknown keys.
- `defineStorageRuntime<Extension>().create({ kind: "cache", ... })` сохраняет literal `kind`.
- `defineStorageRuntime().create({ kind: "plain", ... })` сохраняет literal `kind`.
- `validateTemplate(ctx)` и `compileTemplate(ctx)` получают contextual `ctx.machine` с input из `Extension["input"]`.
- `compileTemplate(ctx)` в public builder не принимает return value с ручными `key` или `kind`.
- Public examples не импортируют named storage context types для runtime methods.
- `definePlugin().create({ storage: [cacheStorage] })` выводит machine extension из `cacheStorage`.
- Object form `storage: { cache: cacheStorage }` не принимается.
- Tuple input в `EffectDeps<BaseDeps, readonly [...]>` принимается и нормализуется через `[number]`.
- Tuple input в `PluginMachineExtensions<readonly [...]>` принимается и нормализуется через `[number]`.
- `(typeof plugins)[number]` работает как input для `PluginMachineExtensions`.
- Внутренние manager aliases используют ту же normalization-модель для runtime tuple.

Runtime tests:

- Storage runtime из plugin `storage` section регистрируется.
- Duplicate storage kind между registered storage definitions бросает duplicate storage error.
- Duplicate storage kind внутри одного plugin бросает `LITE_FSM_INVALID_PLUGIN_DEFINITION`.
- Empty `storage: []` бросает `LITE_FSM_INVALID_PLUGIN_DEFINITION` при `definePlugin().create(...)`.
- Object form `storage: { cache: ... }` бросает `LITE_FSM_INVALID_PLUGIN_DEFINITION`.
- Empty storage definition `kind` бросает `LITE_FSM_INVALID_PLUGIN_DEFINITION`.
- Invalid storage entry marker бросает `LITE_FSM_INVALID_PLUGIN_DEFINITION`.
- Mismatched compiled template `kind` и storage definition `kind` бросает `LITE_FSM_INVALID_STORAGE_RUNTIME` только для internal storage entries, если такой path остается в реализации.
- `routeMetaKeys` storage definition участвует в validation missing route resolver.

#### Критерий завершения

- Tstyche tests этапа проходят.
- Runtime storage plugin tests проходят.
- Cheatsheets показывают `defineStorageRuntime<Extension>().create({ kind, ... })` и `storage: [cacheStorage]`.
- Cheatsheets показывают `type AppPlugins = typeof cachePlugin | typeof tracePlugin`.
- Cheatsheets не требуют ручного указания `CacheStorageExtension` рядом с runtime plugin array.

### Этап 5 — Документация, examples и final verification

#### Цель

Переписать public examples и cheatsheets под финальный API для авторов plugins.

#### Зависит от

Этапы 1-4.

#### Контракт этапа

Обновить:

- `API-CHEATSHEET.md`;
- `TYPES-CHEATSHEET.md`;
- `PLUGIN-SYSTEM-CHEATSHEET.md`;
- `tests/fixtures/plugin-system-documentation.ts`;
- docs pages, если они уже описывают plugin system.

Требования к документации:

- Писать на профессиональном русском.
- Описывать `definePlugin<PluginEvents, HostEvents>().create({ ... })` как единственный public API объявления plugin.
- Описывать `PluginEvents` как manager-level события plugin.
- Описывать `HostEvents` как события, которые plugin может типизированно наблюдать внутри definition.
- Описывать `intercept` и `hooks` как единственный public способ подключиться к dispatch lifecycle из plugin DSL.
- Явно указать, что plugin не получает public `install(ctx)` и registry context.
- Явно указать, что `PluginEvents` не добавляются автоматически в `createMachine<AppEvents>(...)`.
- Описывать `routeMeta` как служебный routing contract, не как место для пользовательских данных.
- Описывать `PluginRouteMeta<PluginUnion>` как raw map объявленных meta values; optional semantics относится к `manager.transition(...).meta`.
- Описывать `defineStorageRuntime<Extension>().create(...)` как advanced public builder для typed storage runtime, а не как public custom runtime preset API.
- Добавить отдельный блок "Когда не нужен custom storage runtime": metrics, logging, manager commands, scoped helpers, action normalization и route meta обычно не требуют storage runtime.
- Показывать storage runtime как advanced section после базовых plugin extensions, а не первым примером plugin system.
- Показывать `compileTemplate(ctx)` в public examples как возврат только template payload (`void` или `{ data?: unknown }`), без ручного `key` и `kind`.
- Показывать storage runtime methods inline с contextual typing, без ручных imports named storage context types.
- Явно указать, что `effectDeps` и `reactionDeps` в `Extension` являются type contract: runtime implementation обязан реально предоставить эти deps, core не доказывает соответствие.
- Описывать, что возвращаемое значение hook игнорируется runtime.
- Описывать, что helper types принимают `PluginUnion` и runtime tuple; `PluginUnion` остается рекомендуемым форматом для переносимых aliases.
- Для configurable и multi-instance plugins показать обычный factory pattern вокруг `definePlugin().create(...)`; не добавлять `definePluginFactory(...)`, `definePlugins(...)` или lifecycle builder. Документация должна явно описывать требования уникальности `name`, `routeMeta`, `manager`, `scopedDeps`, `scopedTransition` keys и `storage.kind`.
- Не использовать `auditTarget` как базовый пример route meta.
- Не использовать `Object.assign(..., { keys })` в main examples.
- Не использовать `as const` для scoped keys.
- Не использовать `as ManagerAction<...>` в scoped transition examples.
- Не использовать `createPluginStorage(...)`.
- Использовать `void` как основной return style для scoped transition commands.
- Не описывать low-level scoped factory API как публичный способ объявления scoped extensions.
- Показать, что runtime plugin array отвечает за plugin order, а helper types извлекают capabilities из `PluginUnion` или members runtime tuple.

Проверки:

- `pnpm run test:types`;
- focused runtime tests plugin system;
- `pnpm run check-types`, если не запускает docs build;
- `pnpm run lint`, если изменения документации/тестов требуют lint-проверки.

#### Не делать в этом этапе

- Не запускать docs build.
- Не начинать реализацию `@lite-fsm/entities`.
- Не добавлять новые runtime extension points.

#### Тесты этапа

Documentation fixture:

- должен компилироваться без `Object.assign(..., { keys })` для scoped deps/transition;
- должен использовать `definePlugin<PluginEvents>().create({ ... })`;
- должен использовать `defineStorageRuntime<Extension>().create({ kind, ... })`;
- storage example не должен возвращать `key` или `kind` из public `compileTemplate(ctx)`;
- должен использовать `routeMeta`, `manager`, `storage`, `scopedDeps`, `scopedTransition`;
- должен использовать `intercept` или `hooks`;
- должен использовать `PluginMachineExtensions<AppPlugins>`;
- должен показывать явное включение `PluginManagerEvents<AppPlugins>` в `AppEvents`, если machine обрабатывает plugin event.

Search checks:

- В public examples не осталось `registerMetaKey`.
- В public examples не осталось `actionMeta`.
- В public examples не осталось `transitionEvents`.
- В public examples не осталось `PluginInstallContext`.
- В public examples не осталось `createPluginStorage`.
- В public examples и documentation fixture не осталось imports из `@lite-fsm/core/internal/runtime/kernel/storage`.
- В public examples storage `compileTemplate(ctx)` не возвращает ручные `key` или `kind`.
- В main scoped examples не осталось `keys: [...] as const`.
- В main plugin examples не осталось старых форм `definePlugin<Capabilities>({ ... })` и `definePlugin<Capabilities>()({ ... })`.
- В public examples не осталось `createPlugin`.

#### Критерий завершения

- Все type tests проходят.
- Focused runtime tests plugin system проходят.
- Cheatsheets описывают только финальный public API.
- Запрещенные docs build команды не запускались.

## 6. Критерий полной готовности

ТЗ считается выполненным, когда:

- `definePlugin<PluginEvents, HostEvents>().create({ ... })` является единственным typed plugin authoring API.
- Default `HostEvents` условный: без `PluginEvents` используется `AnyEvent`, с объявленными `PluginEvents` используется `never`, если автор явно не передал второй generic.
- `PluginEvents` расширяет manager-level `transition`, но не меняет machine `config`, reducer и effects без явного включения в `AppEvents`.
- `HostEvents` типизирует наблюдаемые события внутри plugin definition и не расширяет `manager.transition(...)`.
- Plugin capabilities выводятся из DSL sections, а не из отдельного `Capabilities` type и manifest.
- `routeMeta` объявляется объектом resolvers и автоматически регистрируется runtime.
- `manager` объявляется объектом factories и автоматически расширяет manager instance.
- `defineStorageRuntime<Extension>().create({ kind, ... })` связывает storage runtime и machine extension в одном definition.
- `defineStorageRuntime().create(...)` без explicit `Extension` выводит `{ storage: kind }`.
- Storage definitions являются opaque values для plugin DSL и не публикуют standalone runtime/preset API.
- `PluginMachineExtensionInput` поддерживает только разрешенные machine extension blocks и не содержит `storage`.
- `defineStorageRuntime` задокументирован как advanced public API; базовые plugin examples не начинают со storage runtime.
- `validateTemplate` и `compileTemplate` получают contextual `ctx.machine` с storage input; остальные storage runtime contexts остаются широкими internal types.
- Public `compileTemplate` не возвращает `key` или `kind`; builder нормализует public payload во внутренний compiled template.
- Plugin section `storage` принимает array storage definitions, а не object map с дублирующим key.
- `scopedDeps` и `scopedTransition` объявляются inline object definitions без ручных `keys`.
- Scoped `transition` сохраняет callable core transition и дополняется plugin methods только внутри effects/reactions.
- `intercept` и `hooks` являются top-level секциями DSL и не требуют `install(ctx)` или registry context.
- Возвращаемое значение hook игнорируется runtime; hooks не имеют API для замены action или остановки pipeline.
- Внутренний plugin runtime работает через normalized entries и `addPlugin(normalizedPlugin)`, а не через legacy `plugin.install(ctx)` adapter.
- Встроенный `instance` storage регистрируется через internal normalized storage entry.
- Новые локальные ошибки plugin definition используют `LITE_FSM_INVALID_PLUGIN_DEFINITION`, а существующие composition/runtime error codes сохраняются.
- Public examples не требуют `Object.assign(...)`, `keys: [...] as const` и `as ManagerAction<...>`.
- `PluginMachineExtensions<PluginUnion>` выводит union machine extensions из plugin union.
- `EffectDeps<AppDeps, PluginUnion>` выводит scoped deps и scoped transition methods из plugin union.
- Helper types принимают и `PluginUnion`, и runtime tuple; tuple нормализуется через `[number]`.
- Configurable и multi-instance plugins покрываются обычными factory functions вокруг `definePlugin().create(...)`; отдельный factory/lifecycle API не добавлен.
- Новый и измененный чистый код имеет 100% coverage по statements, branches, functions и lines, а тесты покрывают реальные сценарии использования public API, а не только технические ветки ради метрики.
- Поведение `MachineManager(machines)` без plugins не изменилось.
- Cheatsheets и documentation fixture соответствуют финальному API.
- Запрещенные docs build команды не запускались.
