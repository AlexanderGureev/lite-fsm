# Storage runtime dispatch pipeline — ТЗ для рефакторинга

## 1. Цель

Привести storage runtime contract в `@lite-fsm/core` к чистой декларативной модели перед публичной фиксацией plugin system.

Рефакторинг должен убрать из public storage context неявную stage-машину action, заменить sentinel/side-effect протоколы на discriminated result objects и сделать scheduling storage reducers явным через `reduceScope: "template" | "bucket"`.

Обратная совместимость текущего advanced storage runtime API не требуется. Цель — понятный public contract для `defineStorageRuntime().create(...)`, предсказуемый internal pipeline и подготовка `@lite-fsm/entities` batch runtime без специальных хаков в core.

## 2. Как выполнять это ТЗ

Этап `N+1` начинается только после выполнения критерия завершения этапа `N`.

### Область работ

- `packages/core/src/runtime/kernel/storage.ts`;
- `packages/core/src/runtime/kernel/bucketRuntime.ts`;
- `packages/core/src/runtime/kernel/createMachineManagerFactory.ts`;
- `packages/core/src/runtime/instance/*`;
- `packages/core/src/pluginStorageTypes.ts`;
- `packages/core/src/pluginStorageNormalize.ts`;
- `packages/core/src/pluginTypes.ts` и `packages/core/src/plugin.ts`, если меняется публичный dispatch context;
- runtime tests в `tests/core`;
- type tests в `tests/types`;
- documentation fixture в `tests/fixtures/plugin-system-documentation.ts`;
- `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`, `PLUGIN-SYSTEM-CHEATSHEET.md`;
- связанные plugin system specs, если они описывают старый storage runtime contract.

### Вне области работ

- реализация `@lite-fsm/entities`;
- изменение snapshot format;
- изменение routing priority;
- изменение middleware API;
- изменение subscriber order;
- app-level custom runtime preset API;
- full generic typing для `TemplateData`, `RuntimeState` и `SnapshotPayload`;
- compatibility adapters для старых `beginReduce`, `STORAGE_ACTION_DROP`, `false` как reduce result или action fields в `ctx.dispatch`.

### Запрещенные команды

Агентам запрещено запускать:

- `pnpm run build`;
- `pnpm --filter @lite-fsm/docs build`;
- `pnpm run docs:build`;
- `pnpm run pages:build*`;
- любой `next build` внутри `apps/docs`.

Для package build проверки использовать `pnpm run build:packages`, если этап требует build-проверки и команда не запускает docs build.

### Общие тестовые ожидания

- Runtime-поведение покрывать Vitest.
- Public types покрывать Tstyche.
- Названия `describe`, `it`, `test` писать на русском.
- Новый и измененный чистый код должен иметь 100% coverage по statements, branches, functions и lines.
- 100% coverage не заменяет сценарные тесты: для каждого измененного контракта нужны позитивные, негативные и граничные сценарии.
- При изменении public API или public types обновлять `API-CHEATSHEET.md` и `TYPES-CHEATSHEET.md`.

## 3. Целевой public API

### Storage callback results

`STORAGE_ACTION_DROP` и boolean protocol больше не являются authoring contract.

```ts
type StorageActionStageResult =
  | void
  | { readonly type: "replace"; readonly action: ManagerAction<AnyEvent> }
  | { readonly type: "drop" };

type StorageReduceResult =
  | void
  | { readonly type: "skip" };
```

Контракты:

- `prepareAction(ctx)` возвращает `StorageActionStageResult`.
- `beforeReduce(ctx)` возвращает `StorageActionStageResult`.
- `reduce(ctx)` возвращает `StorageReduceResult`.
- `reduceBucket(ctx)` возвращает `StorageReduceResult`.
- `{ type: "drop" }` разрешен только до начала reduce: в `prepareAction` и `beforeReduce`.
- `{ type: "replace", action }` заменяет текущий action и заставляет kernel пересчитать route.
- `{ type: "skip" }` означает, что runtime не считается touched по результату reduce stage.
- `void` из reduce stage означает, что runtime touched и участвует в `commit`, `reactions` и `effects`.
- Helper constants или builders для result objects не добавляются.

### Storage callback contexts

Action stages не хранятся в `ctx.dispatch`.

Action-related contexts получают:

```ts
type StoragePrepareActionContext = {
  readonly action: ManagerAction<AnyEvent>;
  readonly originalAction: ManagerAction<AnyEvent>;
  // ...
};
```

Такой же contract действует для `StorageBeforeReduceContext`, `StorageReduceContext`, `StorageReduceBucketContext`, `StorageCommitContext`, `StorageReactionContext`, `ResolveEffectInvocationsContext` и `StorageEffectInvocationContext`.

Контексты после `intercept` получают final committed action. Storage runtime не читает final action из `ctx.dispatch`.

`StorageDispatchContext` становится public view на shared per-dispatch ledger:

```ts
type StorageDispatchContext = {
  readonly options: unknown;
  readonly runtime: Map<string, unknown>;
  readonly route: RouteConstraint;
  readonly prevState: Record<string, unknown>;
  nextState: Record<string, unknown>;
  readonly skipDelivery: boolean;
  reportError(error: unknown): void;
};
```

Контракты:

- `ctx.dispatch` не содержит `originalAction`, `preparedAction`, `action`, `committedAction` или `dropped`.
- `ctx.action` является action текущей фазы.
- `ctx.originalAction` является исходным action, переданным в `manager.transition(...)`.
- В `commit`, `reactions` и `effects` `ctx.action` является final committed action после `prepareAction`, middleware, `beforeReduce` и `intercept`.
- `dispatch.route` read-only для storage authors и всегда соответствует текущему `ctx.action`.
- `dispatch.prevState` read-only.
- `dispatch.nextState` остается mutable root state accumulator.
- `dispatch.skipDelivery` read-only и меняется только через `intercept` result.
- `dispatch.runtime` остается shared mutable map для storage/plugin per-dispatch state.
- `prepareAction` и `beforeReduce` не должны менять `dispatch.nextState`; для staged per-dispatch данных используется `dispatch.runtime`.
- `reduce`, `reduceBucket` и `commit` являются фазами, где storage runtime может заменить `dispatch.nextState`.
- touched runtimes являются internal scheduler state и не входят в public storage context.

### Reduce scope

Storage runtime явно объявляет scheduling policy:

```ts
type StorageRuntime =
  | {
      readonly reduceScope?: "template";
      acceptsEvent(ctx: AcceptsEventContext): boolean;
      reduce(ctx: StorageReduceContext): StorageReduceResult;
    }
  | {
      readonly reduceScope: "bucket";
      reduceBucket(ctx: StorageReduceBucketContext): StorageReduceResult;
    };
```

Контракты:

- `reduceScope` по умолчанию равен `"template"`.
- `"template"` означает, что kernel выполняет `templates × acceptsEvent → reduce`.
- `"bucket"` означает, что kernel вызывает storage reducer один раз на bucket, а storage runtime сам выбирает templates, rows и batches.
- Для `"bucket"` core не вызывает `acceptsEvent`.
- Для `"bucket"` context содержит `templates: readonly CompiledStorageTemplate[]`.
- `reduceScope: "bucket"` не принимает `acceptsEvent` и `reduce`.
- `reduceScope: "template"` не принимает `reduceBucket`.
- `reduceScope: "bucket"` предназначен для агрегирующих runtimes: `instance`, будущий `entity` runtime и storage с собственными индексами.

### Dispatch order

Middleware не является набором отдельных kernel hooks. Middleware оборачивает inner transition:

```ts
const middleware = () => (next) => (action) => {
  // before next
  const result = next(action);
  // after next
  return result;
};
```

Код до `next(action)` выполняется до входа в следующий middleware или core transition. Код после `next(action)` выполняется после возврата из core transition, в обратном порядке middleware chain, до effects phase.

Целевой порядок одного `manager.transition(action)`:

1. `assertUserAction(rawAction)`.
2. Создание private dispatch lifecycle state.
3. Storage `prepareAction` chain.
4. Middleware chain до `next(action)`.
5. Storage `beforeReduce` chain.
6. Plugin `intercept` chain.
7. Dispatch hooks `beforeReduce`.
8. Storage reduce stage или skip delivery.
9. Dispatch hooks `afterReduce`.
10. Dispatch hooks `beforeCommit`.
11. Storage `commit` для touched runtimes.
12. State commit.
13. Dispatch hooks `beforeSubscribers`.
14. Storage reactions для touched runtimes.
15. Subscribers.
16. Middleware post-`next` code, в обратном порядке middleware chain.
17. Dispatch hooks `beforeEffects`.
18. Storage effects для touched runtimes.
19. Dispatch hooks `afterEffects`.

Drop semantics:

- drop в `prepareAction` или `beforeReduce` является silent no-op;
- drop в `prepareAction` происходит до middleware, поэтому middleware chain не запускается;
- drop в `beforeReduce` происходит внутри `next(action)`, поэтому middleware post-`next` code выполняется в обратном порядке и получает исходный public action как `result`;
- reducers, interceptors после drop, hooks, commit, reactions, subscribers и effects не запускаются;
- state не меняется;
- `manager.transition(rawAction)` возвращает исходный public action;
- drop после начала reduce не поддерживается.

Replacement semantics:

- `prepareAction` replacement влияет на action, который попадает в middleware;
- `beforeReduce` replacement нормализует action после middleware и до public interceptors;
- `intercept` replacement является финальным public replacement для reducers, reactions, subscribers, effects и return value;
- каждый replacement пересчитывает route;
- replacement не останавливает chain, следующий storage/plugin получает уже замененный action.

Skip delivery semantics:

- `skipDelivery` выставляется только через plugin `intercept` result;
- при `skipDelivery` storage reduce stage не выполняется и `dispatch.nextState` остается равен `prevState`;
- dispatch hooks `afterReduce`, `beforeCommit` и `beforeSubscribers` выполняются;
- storage `commit`, `reactions` и `effects` не запускаются, если runtime не был touched до skip delivery;
- subscribers выполняются для final committed action;
- middleware post-`next` code выполняется и получает final committed action как `result`.

## 4. Целевая runtime-архитектура

Core kernel владеет private `DispatchLifecycleState`. Public `StorageDispatchContext` является view на допустимые поля и не раскрывает mutable action stages.

`DispatchLifecycleState` хранит internal-only поля dispatch lifecycle:

- `originalAction`;
- current action;
- current route;
- `skipDelivery`;
- `prevState`;
- `nextState`;
- touched runtime kinds;
- middleware `nextCalled`;
- private per-dispatch runtime map;
- drop/return outcome.

Storage callbacks получают только public `StorageDispatchContext`. Implementation может использовать один internal object с public typed view, но public callback types не должны раскрывать internal-only fields.

`bucketRuntime` является scheduler:

- `prepareAction` и `beforeReduce` итерируют buckets в registration order и применяют action-stage results;
- `reduce` выбирает branch по `reduceScope`;
- `template` branch итерирует templates и вызывает `acceptsEvent`/`reduce`;
- `bucket` branch вызывает `reduceBucket` один раз;
- touched runtimes определяются только reduce stage;
- `commit`, `reactions` и `effects` работают только по touched runtimes.

`instance` runtime объявляет `reduceScope: "bucket"` и больше не использует `instanceDispatch.reduced` как защиту от повторных calls. Post-middleware normalization переносится в `beforeReduce` и возвращает `{ type: "replace" }` или `{ type: "drop" }`.

`entities` не реализуется в этом ТЗ, но новый contract должен позволять будущему entity runtime выполнять собственный batch scheduler без core scan всех templates на каждый event.

## 5. Этапы реализации

### Этап 1 — Result protocol и storage context contract

#### Цель

Заменить sentinel/boolean storage callback protocol на object result protocol и убрать action stages из public `StorageDispatchContext` types.

#### Зависит от

- Текущая реализация plugin system и `defineStorageRuntime().create(...)`.

#### Контракт этапа

- В `storage.ts` добавлены `StorageActionStageResult`, `StorageReduceResult`, `StorageBeforeReduceContext`, `StorageReduceBucketContext`.
- `StoragePrepareActionResult` больше не равен `ManagerAction | typeof STORAGE_ACTION_DROP`.
- `STORAGE_ACTION_DROP` удален из public/internal storage callback contract. Если symbol временно остается в коде до следующих этапов, он не используется в новых public types.
- `StorageDispatchContext` больше не содержит `originalAction`, `preparedAction`, `action`, `committedAction` и `dropped`.
- Все action-related storage contexts получают `readonly action` и `readonly originalAction`.
- `StorageCommitContext`, `ResolveEffectInvocationsContext` и `StorageEffectInvocationContext` получают `readonly action` и `readonly originalAction`.
- `route`, `prevState` и `skipDelivery` read-only в public/context types.
- `nextState` и `runtime` остаются доступными storage runtimes.
- `beginReduce` переименован в `beforeReduce` в internal и public storage runtime types.
- `PluginStorageRuntime` в `pluginStorageTypes.ts` принимает `beforeReduce`, но не принимает `beginReduce`.
- Public `DispatchContext` для plugin intercept/hooks сохраняет `action`, `originalAction`, `skipDelivery`, `options`, `runtime` и `reportError(error)`, но не получает storage-only stage fields.

#### Не делать в этом этапе

- Не менять dispatch order.
- Не добавлять `reduceScope`.
- Не мигрировать `instance` runtime.
- Не оставлять compatibility overloads для `beginReduce`, `false` или `STORAGE_ACTION_DROP`.

#### Тесты этапа

- Type tests проверяют, что inline `defineStorageRuntime().create(...)` принимает `beforeReduce` с object result.
- Type tests проверяют, что `beginReduce` не принимается.
- Type tests проверяют, что `ctx.dispatch.originalAction`, `preparedAction`, `action`, `committedAction` и `dropped` недоступны.
- Type tests проверяют, что `ctx.action` и `ctx.originalAction` доступны в `prepareAction`, `beforeReduce`, `reduce`, `reactions.run` и `effects.resolveInvocations`.
- Type tests проверяют, что `ctx.action` и `ctx.originalAction` доступны в `commit` и `effects.invoke`.
- Type tests проверяют, что `dispatch.route`, `dispatch.prevState` и `dispatch.skipDelivery` read-only, а `dispatch.nextState` mutable.
- Runtime validation в `defineStorageRuntime().create(...)` бросает `LITE_FSM_INVALID_PLUGIN_DEFINITION` для `beginReduce` и неизвестных result-related fields, если TypeScript был обойден.

#### Критерий завершения

- Focused type tests и runtime validation tests этапа проходят.
- Измененные type contracts не требуют named context imports в public examples.
- Старые sentinel/boolean contracts не остаются в public storage builder typing.

### Этап 2 — Action pipeline и drop/replacement semantics

#### Цель

Переписать `createMachineManagerFactory` и `bucketRuntime` на private action lifecycle state, object results и явный порядок `prepareAction -> middleware -> beforeReduce -> intercept`.

#### Зависит от

- Этап 1.

#### Контракт этапа

- Kernel хранит исходный action и текущий action во private lifecycle state, а не в public `StorageDispatchContext`.
- Internal `DispatchLifecycleState` отделен от public `StorageDispatchContext` view; callbacks не получают direct access к private action, touched или drop fields.
- `bucketRuntime.prepareAction(...)` принимает current action и возвращает action-stage outcome.
- `bucketRuntime.beforeReduce(...)` принимает current action и возвращает action-stage outcome.
- `prepareAction` chain продолжает loop после `{ type: "replace" }`; следующие runtimes видят замененный action.
- `beforeReduce` chain продолжает loop после `{ type: "replace" }`; следующие runtimes видят замененный action.
- `{ type: "drop" }` в `prepareAction` или `beforeReduce` немедленно останавливает текущий dispatch.
- Drop возвращает исходный public action из `manager.transition(...)`.
- Drop в `prepareAction` не запускает middleware.
- Drop в `beforeReduce` возвращается из inner transition так, что middleware post-`next` code выполняется и получает raw action result.
- Drop не запускает interceptors, hooks, reducers, commit, reactions, subscribers или effects.
- `beforeReduce` выполняется до plugin `intercept`.
- `beforeReduce` не помечает runtime touched.
- `prepareAction` не помечает runtime touched.
- `prepareAction` и `beforeReduce` не мутируют `dispatch.nextState`; staged data записывается в `dispatch.runtime`.
- `intercept` replacement пересчитывает route и становится финальным action для reducer/subscribers/effects/return value.
- `skipDelivery` меняется только через `intercept` result.
- При `skipDelivery` storage reduce не выполняется, touched runtimes не появляются только из-за pre-reduce phases, subscribers выполняются для final committed action, effects не запускаются.

#### Не делать в этом этапе

- Не добавлять `reduceScope`.
- Не менять middleware API.
- Не менять dispatch hook phase names.
- Не менять subscriber order.

#### Тесты этапа

- Runtime test: `prepareAction` replacement попадает в middleware и interceptors, `originalAction` сохраняет raw action.
- Runtime test: несколько `prepareAction` replacements применяются последовательно в порядке storage registration.
- Runtime test: `beforeReduce` replacement выполняется после middleware и до interceptors.
- Runtime test: несколько `beforeReduce` replacements применяются последовательно.
- Runtime test: drop в `prepareAction` является silent no-op и возвращает raw action.
- Runtime test: drop в `beforeReduce` является silent no-op и возвращает raw action.
- Runtime test: drop в `prepareAction` не запускает middleware before/after code.
- Runtime test: drop в `beforeReduce` запускает middleware after-`next` code с raw action result.
- Runtime test: drop не вызывает interceptors, hooks, reduce, commit, reactions, subscribers и effects.
- Runtime test: `intercept` replacement остается финальным committed action для reducer, subscribers, effects, middleware post-`next` и return value.
- Runtime test: `skipDelivery` после interceptor не запускает storage reduce и не запускает effects.
- Runtime test: `skipDelivery` после interceptor сохраняет subscribers и middleware after-`next` result для final committed action.
- Regression test: mutation `dispatch.nextState` из `prepareAction` или `beforeReduce` не используется как supported behavior; examples и internal runtimes используют `dispatch.runtime` для staged data.

#### Критерий завершения

- Focused dispatch pipeline tests проходят.
- Существующие tests для interceptors/hooks/middleware order обновлены под новый internal contract без изменения user-facing order.
- В коде нет записи в public `dispatch.dropped` или `dispatch.committedAction`.

### Этап 3 — `reduceScope` и bucket-level scheduling

#### Цель

Добавить декларативный scheduling policy для storage reducers и убрать необходимость runtime-local one-shot flags.

#### Зависит от

- Этапы 1-2.

#### Контракт этапа

- `StorageRuntime` поддерживает `readonly reduceScope?: "template" | "bucket"`.
- Отсутствующий `reduceScope` равен `"template"`.
- Для `"template"` runtime обязан объявить `acceptsEvent(ctx)` и `reduce(ctx)`.
- Для `"bucket"` runtime обязан объявить `reduceBucket(ctx)`.
- Для `"bucket"` runtime не объявляет `acceptsEvent` или `reduce`; core не вызывает `acceptsEvent`.
- `StorageReduceBucketContext` содержит `templates`, `action`, `originalAction`, `state`, `manager` и `dispatch`.
- `bucketRuntime.reduce(...)` выбирает branch по `reduceScope`.
- Template branch сохраняет текущую модель `templates × acceptsEvent → reduce`.
- Bucket branch вызывает `reduceBucket` один раз на bucket.
- `void` из `reduce` или `reduceBucket` помечает runtime touched.
- `{ type: "skip" }` из `reduce` или `reduceBucket` не помечает runtime touched.
- `drop` и `replace` из reduce stage не поддерживаются type-level и runtime validation.
- Runtime validation отклоняет несогласованные shapes: `reduceScope: "bucket"` без `reduceBucket`, `reduceScope: "bucket"` с `acceptsEvent` или `reduce`, `reduceScope: "template"` без `acceptsEvent`/`reduce`, `reduceScope: "template"` с `reduceBucket`, неизвестное значение `reduceScope`.
- Public builder validation не принимает `reduceBucket` как replacement для `"template"` без явного `reduceScope: "bucket"` и не принимает template callbacks в bucket scope.

#### Не делать в этом этапе

- Не мигрировать `instance` на `reduceScope: "bucket"` до завершения generic scheduler.
- Не добавлять `entities`.
- Не добавлять performance optimizations вне scheduler branch.

#### Тесты этапа

- Runtime test: template-scope storage вызывает `acceptsEvent` и `reduce` по каждому matching template.
- Runtime test: bucket-scope storage вызывает `reduceBucket` один раз и получает все templates своего bucket.
- Runtime test: bucket-scope storage не вызывает `acceptsEvent`.
- Runtime test: `{ type: "skip" }` из template reduce не вызывает commit/reactions/effects для runtime.
- Runtime test: `{ type: "skip" }` из `reduceBucket` не вызывает commit/reactions/effects для runtime.
- Runtime validation tests покрывают invalid `reduceScope`, missing `reduceBucket`, missing `acceptsEvent` и missing `reduce`.
- Runtime validation tests покрывают лишние `acceptsEvent`/`reduce` в bucket scope и лишний `reduceBucket` в template scope.
- Type tests покрывают discriminated storage runtime shapes для `"template"` и `"bucket"`.

#### Критерий завершения

- Scheduler tests проходят.
- `bucketRuntime.ts` не содержит special-case imports или knowledge о `instance`.
- Kernel modules не импортируют runtime instance modules.

### Этап 4 — Миграция `instance` storage runtime

#### Цель

Перевести internal `instance` runtime на новый action/result/scheduling contract и удалить implementation hack `instanceDispatch.reduced`.

#### Зависит от

- Этапы 1-3.

#### Контракт этапа

- `instanceStorageRuntime` объявляет `reduceScope: "bucket"`.
- `instanceStorageRuntime` использует `beforeReduce`, а не `beginReduce`.
- `InstanceDispatchState` больше не содержит `reduced`.
- `prepareAction` выполняет pre-normalize и возвращает `{ type: "replace", action }` или `{ type: "drop" }`.
- `beforeReduce` выполняет post-middleware normalize и возвращает `{ type: "replace", action }` или `{ type: "drop" }`.
- `reduceBucket` вызывает root reduce один раз на dispatch.
- `reduceBucket` не принимает `template` и не использует one-shot boolean guard.
- `syncCommittedAction` больше не пишет в `dispatch.committedAction`.
- После plugin `intercept` replacement `reduceBucket(ctx)` получает final committed action через `ctx.action` и синхронизирует его с private instance dispatch context перед `reduceRoot`.
- Instance effect resolution читает final committed action из private instance dispatch context, а не из `dispatch.action`.
- Sender disposed case остается silent drop.
- Actor routing, spawn, dispose, sidecar commit, effect targets и replacement reconciliation сохраняют существующее public behavior.
- Instance effects используют final committed action и committed prev state после nested transitions так же, как до рефакторинга.

#### Не делать в этом этапе

- Не менять actor public API.
- Не менять sidecar data model.
- Не менять hydrate/dehydrate format.
- Не менять reducer-authoritative behavior `storage: "instance"`.

#### Тесты этапа

- Existing actor/runtime tests проходят после миграции.
- Runtime test: `instance.reduceBucket` вызывается один раз на dispatch при нескольких templates.
- Runtime test: sender disposed action dropped в `prepareAction` или `beforeReduce` без subscribers/effects.
- Runtime test: middleware replacement проходит post-normalize до interceptors.
- Runtime test: interceptor replacement после `beforeReduce` доходит до domain reducer, actor reducer, subscribers и effects.
- Runtime test: interceptor replacement после `beforeReduce` обновляет private instance committed action перед `reduceRoot` и effect target resolution.
- Runtime test: nested transitions не перетирают touched runtimes и effect prev state.
- Runtime test: state replacement actor records reconciled после commit как раньше.

#### Критерий завершения

- Все focused `instance`, actor, middleware и dispatch tests проходят.
- В `packages/core/src/runtime/instance` нет `reduced` dispatch flag.
- В `packages/core/src/runtime/instance` нет записи в `dispatch.dropped` или `dispatch.committedAction`.

### Этап 5 — Public storage builder validation и documentation fixtures

#### Цель

Привести public storage authoring path, examples и cheatsheets к финальному contract.

#### Зависит от

- Этапы 1-4.

#### Контракт этапа

- `defineStorageRuntime().create(...)` принимает финальный shape:
  - optional `prepareAction`;
  - optional `beforeReduce`;
  - `reduceScope`;
  - template-scope `acceptsEvent`/`reduce`;
  - bucket-scope `reduceBucket`;
  - existing capability blocks `effects`, `snapshot`, `identity`, `reactions`.
- `pluginStorageNormalize.ts` валидирует новые fields и запрещает старые.
- `PLUGIN-SYSTEM-CHEATSHEET.md` описывает object result protocol, `beforeReduce`, `reduceScope` и readonly/mutable поля `ctx.dispatch`.
- `API-CHEATSHEET.md` и `TYPES-CHEATSHEET.md` обновлены как справочники возможностей, а не changelog.
- `tests/fixtures/plugin-system-documentation.ts` использует `beforeReduce` или не использует pre-reduce hook, если пример не требует его.
- Public examples показывают immutable replacement `dispatch.nextState = { ... }`.
- Связанные specs больше не описывают `beginReduce`, `STORAGE_ACTION_DROP`, mutable `dispatch.dropped` или action stage fields как целевой API.

#### Не делать в этом этапе

- Не писать полную docs site документацию в `apps/docs`.
- Не запускать docs build.
- Не добавлять helper constants для result objects.

#### Тесты этапа

- Runtime validation tests для public storage builder покрывают unknown fields, old `beginReduce`, invalid `reduceScope`, invalid capability block shapes.
- Runtime validation tests для public storage builder покрывают forbidden template callbacks in bucket scope и forbidden `reduceBucket` in template scope.
- Documentation fixture runtime test проходит с новым API.
- Type tests для documentation examples проходят.
- Regression test проверяет, что root exports не расширены лишними storage context types, если они не нужны public examples.

#### Критерий завершения

- Cheatsheets и documentation fixture синхронизированы с финальным API.
- Focused runtime/type tests для public storage authoring проходят.
- В репозитории `rg "beginReduce|STORAGE_ACTION_DROP|committedAction|preparedAction|dispatch\\.dropped"` не находит целевой public documentation или active storage contract usage, кроме исторических логов, если они явно помечены как logs.

### Этап 6 — Рефакторинг, чистка и полировка

#### Цель

После реализации финального storage runtime API привести кодовую базу к чистому состоянию: убрать временный код, лишние типы и импорты, упростить сложные участки, устранить мусор, накопившийся после финализации plugin system и переезда storage runtime на новый API.

#### Зависит от

- Этапы 1-5.

#### Контракт этапа

- Public API, runtime order, snapshot format, routing priority и error semantics не меняются.
- В `packages/core/src/runtime/kernel/*` удалены временные compatibility helpers, dead code, старые sentinel/boolean branches и промежуточные names, оставшиеся после миграции.
- В `packages/core/src/runtime/instance/*` удалены устаревшие comments, helpers и dispatch-state fields, связанные со старым `beginReduce`, `committedAction`, `dropped`, `preparedAction` или one-shot reduce guard.
- В `packages/core/src/pluginStorageTypes.ts`, `pluginStorageNormalize.ts`, `pluginTypes.ts` и `plugin.ts` удалены неиспользуемые type aliases, imports и transitional validation paths.
- Сложные функции в dispatch pipeline и bucket scheduler упрощены без изменения поведения: выделение helper допускается только если оно снижает реальную сложность или устраняет повтор.
- Комментарии обновлены под финальный contract и не описывают удаленный протокол.
- Tests, fixtures и cheatsheets не содержат старые examples и transitional assertions, кроме исторических logs или явно помеченных regression-аудитов.
- `rg` audit по старым identifiers выполняется и все найденные active code hits либо удалены, либо документированы как допустимые internal/history hits.
- Нет временных TODO/FIXME, debug logging, unused imports, unused locals и dead branches в scope рефакторинга.

#### Не делать в этом этапе

- Не добавлять новые public capabilities.
- Не менять public API или public types без возврата к релевантному этапу и обновления acceptance tests.
- Не менять dispatch order, middleware semantics, actor behavior, snapshot/hydrate или routing.
- Не выполнять декоративные переименования, которые не снижают сложность и не убирают legacy мусор.
- Не запускать docs build.

#### Тесты этапа

- Focused runtime regression для dispatch pipeline, storage builder validation, `reduceScope`, `instance`, middleware, hooks, reactions/effects и nested transitions.
- Focused type regression для public storage builder, exported public surface и documentation fixture.
- Static/source audit:
  - `rg "beginReduce|STORAGE_ACTION_DROP|committedAction|preparedAction|dispatch\\.dropped"` по active code/docs;
  - audit unused imports через `pnpm run lint`;
  - `git diff --check`.
- Если файлы dispatch/kernel logic стали заметно проще, добавить или сохранить tests, которые покрывают упрощенные branches.

#### Критерий завершения

- Refactor не меняет public behavior: focused runtime/type regressions проходят.
- Старый storage protocol отсутствует в active code paths и public examples.
- `pnpm run lint` проходит.
- `git diff --check` проходит.
- Оставшиеся search hits по старым identifiers находятся только в исторических logs или явно допустимых regression-аудитах.
- Журнал реализации фиксирует, какие модули очищены, какие проверки запускались и какие hits search audit оставлены осознанно.

### Этап 7 — Финальная проверка и coverage gate

#### Цель

Закрыть регрессионный риск по core runtime, public types и release-facing package checks.

#### Зависит от

- Этапы 1-6.

#### Контракт этапа

- Все затронутые runtime tests проходят.
- Все затронутые Tstyche type tests проходят.
- `pnpm run check-types` проходит.
- `pnpm run lint` проходит.
- `pnpm run build:packages` проходит, если package build требуется для проверки экспортов и команда не запускает docs build.
- Coverage нового и измененного чистого кода равен 100% по statements, branches, functions и lines.
- Запрещенные docs build команды не запускались.

#### Не делать в этом этапе

- Не вносить новые behavior changes сверх исправления найденных регрессий.
- Не добавлять `@lite-fsm/entities`.
- Не менять public API без возврата к этапам 1-5 и обновления tests/docs.
- Не выполнять новую чистку сверх исправления регрессий, найденных финальными проверками.

#### Тесты этапа

- Полный или согласованный набор core runtime tests.
- Полный или согласованный набор type tests.
- Coverage run для затронутого scope.
- Smoke/package checks, если они не запускают docs build.

#### Критерий завершения

- Все проверки этапа проходят или явно переданы пользователю, если команда запрещена агенту.
- Нет `test.only`, временных `test.skip`, debug logging или незакрытых TODO/FIXME в scope рефакторинга.
- Финальная проверка поиска не находит старый storage protocol в active code paths.

## 6. Критерий полной готовности

Рефакторинг считается завершенным только когда выполнены все условия:

- `StorageDispatchContext` больше не раскрывает mutable action stages.
- `prepareAction` и `beforeReduce` используют object result protocol `replace/drop`.
- `reduce` и `reduceBucket` используют object result protocol `skip`.
- `beginReduce`, `STORAGE_ACTION_DROP`, `dispatch.dropped`, `preparedAction` и `committedAction` удалены из active storage runtime contract.
- Drop является silent no-op только до reduce stage и возвращает исходный public action.
- Replacement semantics и route recalculation покрыты tests для `prepareAction`, `beforeReduce` и `intercept`.
- `reduceScope: "template" | "bucket"` реализован и покрыт runtime/type tests.
- `instance` runtime работает через `reduceScope: "bucket"` без local one-shot reduce flag.
- Public plugin/storage examples, cheatsheets и documentation fixture описывают новый contract.
- Этап рефакторинга, чистки и полировки завершен: legacy мусор удален, сложные участки упрощены, unused imports/dead code отсутствуют.
- Existing behavior для machines без plugins, `storage: "instance"`, middleware, interceptors, hooks, subscribers, reactions, effects, actor routing, snapshot/hydrate и nested transitions сохранен.
- Coverage нового и измененного чистого кода равен 100%.
- Запрещенные docs build команды не запускались.
