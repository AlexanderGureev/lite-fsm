# Plugin system: готовность публичного API — ТЗ для реализации

## 1. Цель

Закрыть критические пробелы runtime и публичного API plugin system перед стабильным релизом.

ТЗ покрывает три обязательных направления:

1. Запретить reentrant `manager.transition(...)` из plugin/storage фаз, которые выполняются до безопасной публикации текущего dispatch, чтобы вложенный dispatch не мог быть закоммичен и затем перезаписан внешним dispatch от устаревшего `prevState` или смешать `action` внешнего dispatch с `state` вложенного dispatch до subscribers.
2. Сделать runtime validation публичных callback protocols строгой и диагностируемой: некорректные result shapes, replacement actions и reserved system actions должны приводить к `LiteFsmError`, а не к silent no-op.
3. Добавить прозрачный typed binding для storage-backed plugin authoring, чтобы TypeScript связывал storage `routeMetaKeys`, plugin `routeMeta`, observed events и machine extension без ручного дублирования контракта автором plugin.

Изменение должно сохранить существующую модель:

- `transition(...)` из subscribers остается разрешен;
- `transition(...)` из effects остается разрешен;
- `transition(...)` из dispatch hooks остается запрещен, как сейчас;
- middleware semantics не меняется;
- корректные существующие plugin/storage callbacks не меняют behavior.

## 2. Как выполнять это ТЗ

### Область работ

- `packages/core/src/runtime/kernel/createMachineManagerFactory.ts`;
- `packages/core/src/runtime/kernel/bucketRuntime.ts`;
- `packages/core/src/runtime/kernel/registry.ts`, если нужно сохранить owner metadata для runtime diagnostics;
- `packages/core/src/pluginTypes.ts`;
- `packages/core/src/plugin.ts`;
- `packages/core/src/pluginStorageTypes.ts`;
- `packages/core/src/pluginStorage.ts`;
- `packages/core/src/pluginStorageNormalize.ts`;
- `packages/core/src/managerNormalize.ts`, только если общий action validation helper переносится туда;
- `packages/core/src/utils.ts`, если добавляются новые `LiteFsmError` codes;
- связанные runtime tests в `tests/core`;
- связанные type tests в `tests/types`, если добавляется typed storage binding или меняется exported type surface;
- `API-CHEATSHEET.md`, `PLUGIN-SYSTEM-CHEATSHEET.md` и `TYPES-CHEATSHEET.md`, если меняется публичный runtime/type/error contract.

### Вне области работ

- Очередь отложенных dispatch.
- Новый public `defer`, `enqueue` или scheduler API.
- Изменение middleware behavior.
- Изменение subscriber/effect reentrant semantics.
- Изменение entity runtime ТЗ, кроме отдельной синхронизации документации после принятия этого контракта.
- Полная переработка storage runtime DSL.
- Удаление низкоуровневого `defineStorageRuntime(...)`: typed binding должен быть additive или совместимым layer.
- Runtime type-check payload values route meta: resolver value остается user-defined contract; runtime валидирует только callback protocol и resolver result.

### Запрещенные проверки

Агенту запрещено запускать:

- `pnpm run build`;
- `pnpm --filter @lite-fsm/docs build`;
- `pnpm run docs:build`;
- `pnpm run pages:build*`;
- любой `next build` внутри `apps/docs`.

Если нужна build-проверка пакетов, использовать `pnpm run build:packages`.

## 3. Целевой public API

### Transition guard

Новый пользовательский API для guard не добавляется.

Runtime contract меняется:

- `manager.transition(...)` должен бросать clear error, если вызван из guarded dispatch phase.
- Ошибка не должна вызывать `onError` автоматически.
- Ошибка должна прервать текущий dispatch по текущей fail-fast semantics.
- Вложенный dispatch не должен начинаться: action не проходит normalize, middleware, interceptors, reducers, subscribers или effects.

Рекомендуемый error surface для guard:

```ts
new LiteFsmError(
  "LITE_FSM_REENTRANT_TRANSITION_FORBIDDEN",
  "[lite-fsm] transition cannot be called during dispatch phase '<phase>'."
)
```

Guard error должен быть `LiteFsmError` с кодом `LITE_FSM_REENTRANT_TRANSITION_FORBIDDEN`.

### Callback protocol validation

Публичные callback protocols должны валидироваться на runtime boundary.

Новые обязательные error codes:

```ts
type LiteFsmErrorCode =
  | "LITE_FSM_REENTRANT_TRANSITION_FORBIDDEN"
  | "LITE_FSM_INVALID_PLUGIN_CALLBACK_RESULT"
  | "LITE_FSM_INVALID_STORAGE_CALLBACK_RESULT"
  | "LITE_FSM_INVALID_REPLACEMENT_ACTION"
  // existing codes
```

Storage callback result errors должны использовать `LITE_FSM_INVALID_STORAGE_CALLBACK_RESULT`, потому что это ошибка публичного callback protocol, а не registration/runtime capability.

Diagnostics должны включать owner:

- для plugin interceptor: `plugin '<name>' intercept`;
- для storage callback: `storage runtime '<kind>' <phase>`;
- для replacement action: источник replacement (`plugin '<name>' intercept`, `storage runtime '<kind>' prepareAction`, `storage runtime '<kind>' beforeReduce`).

Ошибки validation:

- пробрасываются из текущего public вызова (`transition`, `MachineManager(...)`, `dehydrate`, если scope будет расширен);
- не вызывают `onError` автоматически;
- прерывают текущий dispatch fail-fast;
- не должны запускать следующие phases после invalid result.

### Typed storage-backed plugin binding

Основным API для сборки plugin остается `definePlugin(...)`. Новый `defineStorageBackedPlugin` не добавляется.

Для отдельно объявленных storage runtimes нужно усилить `defineStorageRuntime<Extension>()` runtime-only типами:

- `observedEvents` — union событий, которые видят storage callbacks;
- `routeMeta` — raw route meta map, ключи которого доступны в `routeMetaKeys`.

Эти поля являются type contract и не попадают в `PluginMachineExtensions<Plugins>`.

`definePlugin(...).create(...)` должен дополнительно проверять связь между подключенными storage definitions и своим `routeMeta`:

- если storage definition объявляет `Extension["routeMeta"]`, каждый `routeMetaKeys` должен быть ключом этого map;
- каждый required `routeMetaKeys` подключенного storage должен быть объявлен в plugin `routeMeta`;
- raw value type plugin resolver выводится из первого параметра resolver, как сейчас в `PluginRouteMeta`;
- если resolver `value` не аннотирован, raw value считается `unknown`, и это допустимо только если storage requirement также допускает `unknown`.

Целевой сценарий authoring для большого storage runtime:

```ts
type CacheEvents = { type: "CACHE_REFRESH"; payload: { key: string } };
type HostEvents = { type: "LOAD" } | { type: "RESET" };
type CacheStorage<ObservedEvents extends AnyEvent = HostEvents | CacheEvents> = {
  readonly input: { readonly ttl: number };
  readonly publicState: { readonly ready: boolean };
  readonly runtimeState: { readonly commits: number };
  readonly observedEvents: ObservedEvents;
  readonly routeMeta: { readonly cacheKey: string };
};

const cacheStorage = defineStorageRuntime<CacheStorage>().create({
  kind: "cache",
  routeMetaKeys: ["cacheKey"],
  acceptsEvent(ctx) {
    ctx.action satisfies ManagerAction<HostEvents | CacheEvents>;
    return ctx.action.type === "CACHE_REFRESH";
  },
  // остальные callbacks получают CacheStorage state/template typing
});

const cachePlugin = definePlugin<CacheEvents, HostEvents>().create({
  name: "cache",
  routeMeta: {
    cacheKey(value: string, ctx) {
      ctx.action satisfies ManagerAction<HostEvents | CacheEvents>;
      return value;
    },
  },
  storage: [cacheStorage],
});
```

Для reusable storage использовать factory:

```ts
const createCacheStorage = <ObservedEvents extends AnyEvent>() =>
  defineStorageRuntime<CacheStorage<ObservedEvents>>().create({
    kind: "cache",
    routeMetaKeys: ["cacheKey"],
    // ...
  });
```

Контракт: route meta keys являются `keyof Extension["routeMeta"]`, storage callbacks видят `ManagerAction<Extension["observedEvents"]>`, а machine extension продолжает выводиться в `PluginMachineExtensions<typeof cachePlugin>`.

## 4. Целевая архитектура

### Guard state

В `createMachineManagerFactory(...)` ввести manager-local guard state:

```ts
type TransitionGuardPhase =
  | "storage.prepareAction"
  | "storage.beforeReduce"
  | "storage.acceptsEvent"
  | "storage.reduce"
  | "storage.reduceBucket"
  | "storage.commit"
  | "storage.reactions"
  | "plugin.intercept"
  | `hook.${DispatchHookPhase}`;

let transitionGuardPhase: TransitionGuardPhase | null = null;
```

Guard должен быть stack-safe:

- helper `withTransitionGuard(phase, run)` сохраняет предыдущую фазу;
- устанавливает текущую фазу перед callback;
- восстанавливает предыдущую фазу в `finally`;
- корректно работает при ошибках callback;
- не хранит state в global/module scope.

### Guarded phases

Guard обязателен для:

- storage `prepareAction`;
- storage `beforeReduce`;
- storage `acceptsEvent`;
- storage `reduce`;
- storage `reduceBucket`;
- storage `commit`;
- storage `reactions`;
- plugin `intercept`;
- всех dispatch hook phases, чтобы сохранить текущий запрет `transition(...)` из hooks.

Guard не ставится на:

- middleware callback до или после `next`;
- subscribers;
- storage effects `resolveInvocations`;
- storage effects `invoke`;
- public manager extensions вне активного dispatch.

### Bucket runtime integration

`bucketRuntime` сейчас напрямую вызывает storage callbacks. Чтобы guard не размазывался по storage runtime, `createBucketRuntime(...)` должен получить callback runner:

```ts
type GuardedCallbackRunner = <Result>(
  phase: TransitionGuardPhase,
  run: () => Result,
) => Result;
```

`bucketRuntime` использует runner вокруг каждого guarded storage callback. Если перенос типа в отдельный internal module лучше для циклических импортов, сделать его internal-only.

### Transition entrypoint

В начале `transition(action, options)` проверить guard до `assertUserAction(action)`:

```ts
if (transitionGuardPhase) {
  throwTransitionGuardError(transitionGuardPhase);
}
```

Проверка до normalize важна: запрещенный nested transition не должен запускать storage `prepareAction`, middleware или любые side effects нового dispatch.

### Atomicity boundary

Guard не делает rollback пользовательских side effects, выполненных callback до попытки nested transition. Контракт только запрещает старт nested dispatch и сохраняет state manager от stale overwrite.

Storage/plugin authors должны использовать:

- return protocol текущей фазы (`replace`, `drop`, `skip`, `skipDelivery`);
- `dispatch.runtime` для staged data;
- internal storage state, применяемый в commit;
- public `transition(...)` только после safe boundary: subscriber или effect.

### Callback protocol validation architecture

Validation должна жить на runtime boundary, где callback result впервые интерпретируется.

Storage callbacks:

- `pluginStorageNormalize.ts` валидирует результат public `compileTemplate(ctx)` до `Object.assign(...)`;
- `bucketRuntime.ts` валидирует результаты `prepareAction`, `beforeReduce`, `acceptsEvent`, `reduce` и `reduceBucket`;
- `prepareAction` и `beforeReduce` используют общий validator для action stage result;
- `reduce` и `reduceBucket` используют общий validator для reduce result;
- `acceptsEvent` должен вернуть строго `boolean`; truthy/falsy coercion не является публичным контрактом.

Plugin callbacks:

- `registry.ts` должен сохранять owner metadata для interceptor, а не только function reference;
- `createMachineManagerFactory.ts` валидирует result каждого interceptor до применения `action`, `skipDelivery` или `stopInterceptors`;
- `hooks` по-прежнему игнорируют return value, потому что их публичный контракт — side-effect callback без control protocol.

Action replacement:

- replacement action должен быть объектом с `type: string`;
- `type` не должен начинаться с `@@lite-fsm/`;
- invalid или reserved replacement action бросает `LITE_FSM_INVALID_REPLACEMENT_ACTION`;
- validation выполняется до `setCurrentAction(...)` и до `resolveRoute(...)`;
- после replacement route пересчитывается как сейчас.

Strict shape rules:

- `compileTemplate(ctx)` принимает только `undefined` или plain object с единственным публичным полем `data`;
- `compileTemplate(ctx)` не принимает `key`, `kind`, arrays, `null`, primitives или unknown fields;
- `prepareAction(ctx)` и `beforeReduce(ctx)` принимают только `undefined`, `{ type: "drop" }` или `{ type: "replace", action }`;
- `{ type: "replace" }` без `action`, `{ type: "drop", action }`, unknown `type`, unknown fields и non-object values являются ошибкой;
- `reduce(ctx)` и `reduceBucket(ctx)` принимают только `undefined` или `{ type: "skip" }`;
- `intercept(ctx)` принимает только `undefined` или plain object с known fields `action`, `skipDelivery`, `stopInterceptors`;
- `{}` из `intercept(ctx)` является валидным no-op, потому что public type допускает object result с optional fields;
- `skipDelivery` и `stopInterceptors`, если присутствуют, должны быть boolean;
- unknown fields в callback result являются ошибкой, чтобы старый runtime не молча игнорировал протокол новой версии.

Validation helpers должны быть internal-only. Не добавлять public parse/validate API для callback results.

### Typed storage-backed plugin binding architecture

Typed binding должен быть усилением существующих `defineStorageRuntime(...)` и `definePlugin(...)`, без нового plugin factory.

Изменения `StorageRuntimeExtension`:

- добавить runtime-only поле `observedEvents?: AnyEvent`;
- добавить runtime-only поле `routeMeta?: object`;
- оба поля не входят в machine-facing extension и не попадают в `PluginMachineExtensions<Plugins>`;
- если `observedEvents` не задан, storage callbacks остаются на текущем fallback `ManagerAction<AnyEvent>`;
- если `routeMeta` не задан, `routeMetaKeys` остается текущим `readonly string[]`.

Изменения `defineStorageRuntime<Extension>()`:

- `routeMetaKeys` типизируется как `readonly (keyof Extension["routeMeta"] & string)[]`, если `Extension["routeMeta"]` задан;
- storage callbacks `prepareAction`, `beforeReduce`, `acceptsEvent`, `reduce`, `reduceBucket`, `commit`, `reactions.run`, `effects.resolveInvocations`, `effects.invoke`, `identity.resolve` получают `ctx.action` и `ctx.originalAction` как `ManagerAction<Extension["observedEvents"]>`;
- `condition(ctx).predicate` и route-independent contexts не должны терять текущую совместимость;
- literal `kind`, `runtimeState`, `templateData`, `publicState`, `snapshotData`, `invocation` и `identity` продолжают выводиться как сейчас.

Изменения `definePlugin().create(...)`:

- `definePlugin` остается единственной основной точкой сборки plugin;
- `storage` section принимает values из `defineStorageRuntime().create(...)`, как сейчас;
- type layer извлекает storage route meta requirements из `LiteFsmStorageRuntimeDefinition`;
- каждый `routeMetaKeys` подключенного storage должен быть объявлен в plugin `routeMeta`;
- raw value type resolver должен быть assignable к типу соответствующего storage `routeMeta` key;
- `PluginRouteMeta<typeof plugin>` продолжает выводиться из первого параметра resolver;
- `PluginManagerEvents<typeof plugin>` продолжает возвращать только `PluginEvents`, не `HostEvents`;
- `PluginMachineExtensions<typeof plugin>` продолжает выводиться из storage definitions.

Требования к compatibility:

- существующий `definePlugin().create({ storage: [defineStorageRuntime().create(...)] })` остается валидным;
- storage без `Extension["observedEvents"]` и `Extension["routeMeta"]` ведет себя как текущий low-level path;
- новая типизация не должна ухудшить существующий inference для текущих пользователей;
- configurable и multi-instance plugin factories поддерживаются без глобального state.

## 5. Этапы реализации

### Этап 1 — Guard primitive и dispatch hook migration

#### Цель

Заменить boolean `runningDispatchHook` на общий guard primitive и сохранить существующее поведение dispatch hooks.

#### Зависит от

- Текущий `MachineManager` dispatch pipeline.
- Существующие tests на запрет reentrant dispatch из hook.

#### Контракт этапа

- В `createMachineManagerFactory.ts` появляется manager-local `transitionGuardPhase`.
- `runDispatchHooks(...)` выполняет каждый hook внутри `withTransitionGuard(\`hook.${phase}\`, ...)`.
- `transition(...)` бросает guard error при установленной phase.
- После ошибки hook guard всегда сбрасывается.
- Текущий тест на reentrant dispatch внутри hook остается валидным. Если меняется текст ошибки или тип ошибки, тест обновляется на новый стабильный contract.

#### Не делать в этом этапе

- Не менять storage callback execution.
- Не менять plugin interceptors.
- Не менять subscribers/effects behavior.

#### Тесты этапа

Runtime tests:

- `transition(...)` из `beforeReduce` hook запрещен;
- после ошибки guard сбрасывается, следующий обычный `transition(...)` работает;
- `beforeEffects`/`afterEffects` hooks также не могут вызвать `transition(...)`, как и раньше.

#### Критерий завершения

- Тесты dispatch hooks проходят.
- Поведение без plugins не меняется.

### Этап 2 — Guard для plugin interceptors

#### Цель

Запретить nested `transition(...)` из `intercept(ctx)`.

#### Зависит от

- Этап 1.
- Plugin registry и interceptor ordering.

#### Контракт этапа

- Каждый interceptor выполняется внутри `withTransitionGuard("plugin.intercept", ...)`.
- Если interceptor вызывает `manager.transition(...)` через замыкание, manager extension или любой доступный reference, runtime бросает guard error до старта nested dispatch.
- Внешний dispatch прерывается fail-fast.
- State manager не меняется, если interceptor бросил до reducer/commit.
- `ctx.reportError(...)` внутри interceptor не меняет control flow и не связан с guard.
- Replacement/skip/stopInterceptors behavior без nested transition не меняется.

#### Не делать в этом этапе

- Не добавлять очередь dispatch.
- Не разрешать `transition(...)` из interceptor через special case.

#### Тесты этапа

Runtime tests:

- interceptor вызывает `manager.transition(...)`, ошибка пробрасывается, state не меняется;
- вложенный action не проходит reducers/subscribers/effects;
- после ошибки guard сбрасывается, следующий обычный dispatch работает;
- обычный interceptor replacement продолжает работать.

#### Критерий завершения

- Tests для `plugin-system-stage5` или нового focused suite проходят.
- Existing interceptor ordering tests проходят.

### Этап 3 — Guard для storage callbacks до subscribers

#### Цель

Запретить nested `transition(...)` из storage callbacks, которые выполняются до завершения commit текущего dispatch и до публикации внешнего action subscribers.

#### Зависит от

- Этапы 1-2.
- `createBucketRuntime(...)` принимает guarded callback runner.

#### Контракт этапа

Guard применяется к:

- `prepareAction`;
- `beforeReduce`;
- `acceptsEvent`;
- `reduce`;
- `reduceBucket`;
- `commit`;
- `reactions.run`.

Для каждой фазы:

- nested `manager.transition(...)` бросает guard error;
- nested dispatch не стартует;
- внешний dispatch прерывается fail-fast;
- state не публикуется, если ошибка возникла до `state = dispatch.nextState`;
- guard сбрасывается после ошибки.

Особый контракт `commit`:

- guard запрещает nested dispatch до public commit boundary;
- runtime не обязан откатывать произвольные mutations, которые storage runtime сделал внутри собственного `commit` до попытки nested transition;
- storage runtime не должен использовать `manager.transition(...)` в `commit`; для продолжения работы нужно staged data или later effect.

Особый контракт `reactions.run`:

- storage reactions выполняются после `state = dispatch.nextState`, но до subscribers;
- nested `transition(...)` из reaction запрещен, чтобы subscribers внешнего action не получили `currentState`, уже измененный вложенным action;
- reaction errors и guard error сохраняют текущую fail-fast semantics storage reactions, если конкретный storage runtime не ловит ошибку самостоятельно и не вызывает `dispatch.reportError(...)`;
- storage runtime, которому нужна non-fatal reaction error semantics, должен ловить ошибки внутри своего `reactions.run(...)` и вызывать `dispatch.reportError(...)`.

#### Не делать в этом этапе

- Не менять result protocols `prepareAction`, `beforeReduce`, `reduce`, `reduceBucket`.
- Не менять storage snapshot/hydrate.
- Не менять `condition(...)`.
- Не менять `runEffects(...)`.

#### Тесты этапа

Runtime tests:

- `prepareAction` вызывает `ctx.manager.transition(...)`, ошибка пробрасывается, nested reducer не вызывается;
- `beforeReduce` вызывает `ctx.manager.transition(...)`, state не меняется;
- `acceptsEvent` вызывает nested transition, state не меняется;
- template `reduce` вызывает nested transition, state не меняется;
- bucket `reduceBucket` вызывает nested transition, state не меняется;
- `commit` вызывает nested transition, nested action не стартует;
- `reactions.run` вызывает nested transition, nested action не стартует и subscribers внешнего action не вызываются после guard error;
- после каждой ошибки следующий обычный dispatch работает.

Regression tests:

- storage `prepareAction` replacement до middleware работает;
- storage `beforeReduce` replacement после middleware работает;
- `{ type: "skip" }` из reducers продолжает работать;
- обычные storage reactions без nested transition выполняются до subscribers;
- storage effects могут dispatch-ить после commit через scoped transition.

#### Критерий завершения

- Runtime tests этапа проходят.
- Existing storage pipeline tests проходят.

### Этап 4 — Runtime validation callback protocols

#### Цель

Сделать публичные callback protocols строгими: invalid result не должен превращаться в no-op, а invalid replacement action не должен доходить до route resolution или reducer pipeline.

#### Зависит от

- Этапы 1-3, если validation внедряется вместе с guarded callback runner.
- Текущие storage pipeline tests.
- Текущий plugin registry.

#### Контракт этапа

Storage validation:

- `compileTemplate(ctx)` валидируется в `pluginStorageNormalize.ts` до нормализации `{ key, kind }`;
- `prepareAction(ctx)` и `beforeReduce(ctx)` валидируются в `bucketRuntime.ts`;
- `acceptsEvent(ctx)` должен вернуть строго `boolean`;
- `reduce(ctx)` и `reduceBucket(ctx)` валидируются по строгому `{ type: "skip" }` protocol;
- diagnostics содержат `storage runtime '<kind>'` и фазу callback.

Plugin validation:

- registry хранит interceptor owner;
- каждый `intercept(ctx)` result валидируется до применения;
- `action`, `skipDelivery`, `stopInterceptors` применяются только после успешной validation;
- diagnostics содержат `plugin '<name>' intercept`.

Replacement action validation:

- replacement из storage action stages и plugin interceptors должен пройти проверку user action shape;
- reserved system action после replacement запрещен;
- invalid replacement бросает `LITE_FSM_INVALID_REPLACEMENT_ACTION`;
- route пересчитывается только после успешной validation.

#### Не делать в этом этапе

- Не менять semantics корректных `replace`, `drop`, `skip`, `skipDelivery`, `stopInterceptors`.
- Не добавлять public validation API.
- Не валидировать domain payload shape событий; это ответственность пользователя и TypeScript.
- Не менять resolver value validation, кроме уже существующей проверки resolver result.

#### Тесты этапа

Runtime tests:

- `compileTemplate` возвращает primitive, `null`, array, `{ key }`, `{ kind }` или unknown field и получает `LITE_FSM_INVALID_STORAGE_CALLBACK_RESULT`;
- `prepareAction` и `beforeReduce` возвращают unknown shape, unknown `type`, `{ type: "replace" }`, `{ type: "drop", action }` или extra fields и получают `LITE_FSM_INVALID_STORAGE_CALLBACK_RESULT`;
- `prepareAction` и `beforeReduce` возвращают replacement с non-object action, missing `type`, non-string `type` или reserved `@@lite-fsm/*` action и получают `LITE_FSM_INVALID_REPLACEMENT_ACTION`;
- `acceptsEvent` возвращает truthy/falsy non-boolean value и получает `LITE_FSM_INVALID_STORAGE_CALLBACK_RESULT`;
- `reduce` и `reduceBucket` возвращают `{ type: "skip", extra: true }`, unknown `type`, `drop`, `replace` или non-object value и получают `LITE_FSM_INVALID_STORAGE_CALLBACK_RESULT`;
- `intercept` возвращает primitive, array, unknown field, non-boolean `skipDelivery`, non-boolean `stopInterceptors` или invalid replacement action и получает соответствующий `LiteFsmError`;
- invalid interceptor result не меняет `dispatch.action`, `skipDelivery`, route, state или subscribers;
- diagnostics messages содержат plugin owner или storage kind.

Regression tests:

- корректные storage replacements применяются последовательно;
- корректный interceptor replacement остается final committed action;
- `{}` из interceptor работает как no-op;
- valid `{ type: "drop" }`, `{ type: "replace", action }`, `{ type: "skip" }`, `{ skipDelivery: true }`, `{ stopInterceptors: true }` сохраняют текущее поведение.

#### Критерий завершения

- Нет silent ignore для неизвестных result shapes перечисленных callbacks.
- Invalid replacement action не доходит до `setCurrentAction(...)`.
- Все новые ошибки являются `LiteFsmError` с проверяемым `code`.
- Existing plugin/storage runtime tests обновлены и проходят.

### Этап 5 — Typed binding для отдельно объявленных storage runtimes

#### Цель

Сделать advanced storage API прозрачным для сторонних plugin authors: route meta keys, route meta resolvers, observed events и machine extension должны связываться TypeScript-ом, даже если storage runtime объявлен отдельно от plugin.

#### Зависит от

- Текущие public types `LiteFsmPlugin`, `LiteFsmStorageRuntimeDefinition`, `PluginRouteMeta`, `PluginManagerEvents`, `PluginMachineExtensions`.
- Текущий storage runtime DSL.

#### Контракт этапа

- не добавлять `defineStorageBackedPlugin`;
- расширить `StorageRuntimeExtension` runtime-only полями `observedEvents` и `routeMeta`;
- `defineStorageRuntime<Extension>()` использует `Extension["observedEvents"]` для action contexts;
- `defineStorageRuntime<Extension>()` использует `Extension["routeMeta"]` для типизации `routeMetaKeys`;
- `LiteFsmStorageRuntimeDefinition` должен хранить type-level route meta requirements, чтобы `definePlugin().create(...)` мог проверить подключенный storage;
- `definePlugin().create(...)` проверяет, что каждый storage `routeMetaKeys` объявлен в plugin `routeMeta`;
- `definePlugin().create(...)` проверяет, что raw value type resolver совместим с типом storage route meta requirement;
- route resolvers продолжают получать `ctx.action` как `ManagerAction<HostEvents | PluginEvents>`;
- результат остается обычным `LiteFsmPlugin`.

#### Не делать в этом этапе

- Не менять runtime representation plugin value.
- Не делать storage runtime обязательным для всех plugins.
- Не вводить namespace/prefix policy для plugin keys.
- Не делать runtime validation raw route meta values.
- Не добавлять новый public plugin factory.

#### Type tests этапа

Tstyche tests:

- `defineStorageRuntime<{ routeMeta: { cacheKey: string } }>()` принимает `routeMetaKeys: ["cacheKey"]`;
- `defineStorageRuntime<{ routeMeta: { cacheKey: string } }>()` отклоняет `routeMetaKeys: ["missingKey"]`;
- storage `acceptsEvent`, `reduce`, `prepareAction`, `beforeReduce`, `commit`, `reactions.run`, `effects.resolveInvocations` видят `ctx.action` как `ManagerAction<Extension["observedEvents"]>`;
- `definePlugin<CacheEvents, HostEvents>().create({ routeMeta, storage: [cacheStorage] })` проходит, если plugin объявляет все storage `routeMetaKeys`;
- plugin без required `routeMeta.cacheKey` получает type error;
- resolver `cacheKey(value: string)` совместим со storage requirement `cacheKey: string`;
- resolver `cacheKey(value: number)` не совместим со storage requirement `cacheKey: string`;
- unannotated resolver value дает `unknown`; он совместим только со storage requirement `unknown`;
- `PluginRouteMeta<typeof plugin>` возвращает declared route meta map;
- `PluginManagerEvents<typeof plugin>` возвращает только `PluginEvents`, не `HostEvents`;
- `PluginMachineExtensions<typeof plugin>` возвращает machine-facing storage extension с literal `storage`;
- storage factory `createCacheStorage<ObservedEvents>()` работает внутри configurable plugin factory;
- существующие `defineStorageRuntime(...)` type tests остаются валидными.

Runtime tests:

- plugin со storage, объявленным через усиленный `defineStorageRuntime`, проходит через тот же registry path;
- route meta resolver и storage runtime работают вместе;
- duplicate key/storage diagnostics остаются прежними.

#### Критерий завершения

- Для storage-backed plugin больше не требуется вручную держать связь `routeMetaKeys` ↔ `routeMeta` как задокументированное ограничение.
- Отдельно объявленные storage runtimes получают typed observed events без inline storage.
- Low-level API остается доступным и совместимым.
- Усиленные generics описаны в cheatsheets.

### Этап 6 — Рефакторинг, чистка и полировка

#### Цель

После реализации guard, strict validation и typed storage binding привести core plugin/runtime код к финальному состоянию: убрать временные helpers, transitional branches, устаревшие comments и дублирование validation/type logic, не меняя public behavior.

#### Зависит от

- Этапы 1-5.

#### Контракт этапа

- Public API, runtime order, middleware semantics, subscriber/effect reentrant semantics, snapshot/hydrate и routing behavior не меняются.
- `runningDispatchHook` и hook-specific guard remnants удалены; dispatch guard представлен единым manager-local primitive.
- Guard phase types, guarded callback runner и validation helpers находятся в internal modules или локальных helpers с понятным ownership; циклические imports не появляются.
- Callback result validators не дублируют shape rules между `bucketRuntime.ts`, `createMachineManagerFactory.ts` и `pluginStorageNormalize.ts`; общий helper допускается только если он реально снижает сложность.
- Replacement action validation использует один владелец проверки user action shape/reserved system action; нет параллельных несовпадающих реализаций.
- `registry.ts` хранит owner metadata для callbacks ровно там, где она нужна diagnostics; public normalized plugin shape не расширяется лишними runtime-only деталями.
- Type helpers для `observedEvents`, `routeMeta`, storage requirements и resolver compatibility имеют явные имена и не используют `_phantom` placeholders.
- `StorageRuntimeExtension` machine-facing и runtime-only поля остаются разделены; `observedEvents` и `routeMeta` не попадают в `PluginMachineExtensions<Plugins>`.
- Cheatsheets и tests не содержат старое ограничение, что `routeMetaKeys` не связан с `routeMeta`, кроме исторических logs или явно помеченных regression-аудитов.
- Комментарии описывают финальный contract, а не промежуточные решения (`defineStorageBackedPlugin`, hook-only guard, silent callback fallback).
- Нет временных TODO/FIXME, debug logging, unused imports, unused locals и dead branches в scope рефакторинга.
- `rg` audit по устаревшим identifiers и формулировкам выполняется; все найденные active code/docs hits удалены или явно признаны допустимыми regression/history hits.

#### Не делать в этом этапе

- Не добавлять новые public capabilities.
- Не менять public API или public types без возврата к релевантному этапу и обновления acceptance tests.
- Не менять dispatch order, middleware semantics, storage effects timing, subscribers или snapshot/hydrate.
- Не выполнять декоративные переименования, которые не снижают сложность и не убирают transitional code.
- Не запускать docs build.

#### Тесты этапа

- Focused runtime regression для guard phases, callback validation, replacement validation, storage reactions/effects и subscriber/effect reentrant semantics.
- Focused type regression для `defineStorageRuntime` route meta requirements, observed events, `definePlugin` storage compatibility и exported public surface.
- Static/source audit:
  - `rg "runningDispatchHook|defineStorageBackedPlugin|transition cannot be called from a dispatch hook|routeMetaKeys.*readonly string\\[\\]|silent.*callback|unknown callback result"`;
  - audit unused imports через `pnpm run lint`;
  - `git diff --check`.
- Coverage по новому и измененному чистому коду остается 100% statements/branches/functions/lines.

#### Критерий завершения

- Refactor не меняет public behavior: focused runtime/type regressions проходят.
- Transitional guard/validation/type remnants отсутствуют в active code paths.
- Старое documented limitation про несвязанные `routeMetaKeys` и `routeMeta` отсутствует в active cheatsheets.
- `pnpm run lint` проходит.
- `git diff --check` проходит.
- Оставшиеся search hits находятся только в исторических logs или явно допустимых regression-аудитах.
- Журнал реализации фиксирует, какие модули очищены, какие проверки запускались и какие hits search audit оставлены осознанно.

### Этап 7 — Документация, errors и release checks

#### Цель

Зафиксировать новый stable contract в cheatsheets и проверить затронутую область.

#### Зависит от

- Этапы 1-6.

#### Контракт этапа

Документация должна явно сказать:

- `transition(...)` запрещен в guarded plugin/storage phases;
- для текущего action нужно использовать return protocol и `dispatch.runtime`;
- для нового action нужно использовать subscriber/effect или будущий explicit scheduler;
- errors из guard пробрасываются из `manager.transition(...)` и не вызывают `onError`;
- storage reactions входят в guarded boundary до subscribers;
- subscribers/effects сохраняют текущую reentrant semantics;
- callback protocol validation является strict: unknown fields и unknown result shapes запрещены;
- replacement actions валидируются до route recalculation;
- diagnostics включают owner или storage kind;
- сторонний storage plugin authoring использует основной путь `definePlugin(...)` + усиленный `defineStorageRuntime(...)`.

Если добавлен новый `LiteFsmError` code:

- обновить `LiteFsmError["code"]`;
- обновить API/TYPES cheatsheets, если они перечисляют error surface;
- добавить runtime assertion на code в tests.

#### Не делать в этом этапе

- Не запускать docs build.
- Не менять examples entities, если entities package еще не реализован.

#### Тесты этапа

Проверки:

- focused runtime tests для changed suites;
- `pnpm run test:types`, если менялся public type/error surface;
- `pnpm run check-types`, если менялись exported types;
- `pnpm run lint`, если менялись lint-sensitive files;
- `pnpm run build:packages`, если менялся package export surface.

#### Критерий завершения

- Все проверки затронутой области проходят.
- Cheatsheets описывают guard, strict callback validation и typed storage binding без противоречий с plugin system.
- Docs build не запускался.

## 6. Критерий полной готовности

Работа считается завершенной только если:

- nested `transition(...)` запрещен во всех перечисленных guarded phases, включая storage reactions до subscribers;
- nested dispatch не стартует при guard error;
- guard всегда сбрасывается после ошибки;
- unknown callback result shapes не игнорируются;
- invalid replacement actions, включая reserved system actions, отклоняются до route recalculation;
- `LiteFsmError` codes для новых public diagnostics добавлены, проверены tests и описаны;
- storage-backed plugin authoring имеет typed path, связывающий `routeMetaKeys`, `routeMeta`, observed events и machine extension;
- этап рефакторинга, чистки и полировки завершен;
- subscribers и effects сохраняют разрешенную reentrant semantics;
- middleware behavior не изменен;
- existing plugin/storage pipeline tests проходят;
- type tests покрывают новый typed binding;
- документация обновлена;
- запрещенные docs build-команды не запускались.
