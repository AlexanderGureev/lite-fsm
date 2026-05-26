# Журнал реализации ТЗ plugin system public API hardening

Этот файл фиксирует краткий прогресс реализации ТЗ:

- [`tz-precommit-transition-guard.md`](./tz-precommit-transition-guard.md)

Цель журнала — дать следующему агенту точку продолжения после сброса контекста. Журнал не заменяет ТЗ, не является changelog и не должен подробно пересказывать diff.

## Правила ведения

- Перед продолжением работы прочитать ТЗ и этот журнал.
- Продолжать первый этап со статусом не `done`.
- Не переходить к следующему этапу, если текущий этап не прошел gate из ТЗ.
- Если этап имеет статус `blocked`, не продолжать следующий этап до ручного решения блокера и обновления статуса.
- Обновлять журнал в конце каждого этапа и после значимого промежуточного результата, если этап большой.
- Записи держать короткими: что сделано, какие файлы/модули затронуты, какие проверки запускались, какие риски остались.
- Не фиксировать каждую мелкую правку тестов. Фиксировать закрытие сценариев, coverage gaps, перенос ownership поведения и важные решения.
- Для нового и измененного чистого кода требуется 100% coverage по statements/branches/functions/lines.
- 100% coverage не считается достаточным без сценарных тестов: guarded phases, invalid callback results, invalid replacement actions, owner diagnostics, storage route meta typing, observed events typing, subscriber/effect reentrant semantics и regression без plugins.
- Агент не запускает docs build и команды, которые транзитивно запускают docs build.
- При изменении public API или public types обновлять `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md` и `PLUGIN-SYSTEM-CHEATSHEET.md`.
- Это ТЗ не добавляет `defineStorageBackedPlugin`, очередь dispatch, `defer`, `enqueue`, scheduler API или `@lite-fsm/entities`.

## Статусы

- `not started` — этап еще не начат.
- `in progress` — этап начат, но критерии приемки или test/coverage gate еще не закрыты.
- `done` — этап реализован, критерии приемки выполнены, проверки и coverage gate закрыты.
- `blocked` — продолжение невозможно без решения, которое должен принять человек.

## Текущий указатель

- Активное ТЗ: `tz-precommit-transition-guard.md`
- Активный этап: Финальная проверка раздела 6 ТЗ
- Статус: `done`
- Следующее действие: цель готова к ревью.

## Сводка по этапам

| Этап | Название | Статус | Последнее обновление |
| --- | --- | --- | --- |
| 1 | Guard primitive и dispatch hook migration | `done` | 2026-05-26 |
| 2 | Guard для plugin interceptors | `done` | 2026-05-26 |
| 3 | Guard для storage callbacks до subscribers | `done` | 2026-05-26 |
| 4 | Runtime validation callback protocols | `done` | 2026-05-26 |
| 5 | Typed binding для отдельно объявленных storage runtimes | `done` | 2026-05-26 |
| 6 | Рефакторинг, чистка и полировка | `done` | 2026-05-26 |
| 7 | Документация, errors и release checks | `done` | 2026-05-26 |

## Шаблон записи

Копировать шаблон в раздел нужного этапа.

```md
### YYYY-MM-DD — Этап N — Название

- Статус: `in progress | done | blocked`
- Scope: кратко какие пункты этапа закрывались.
- Реализация: ключевые модули и решения, без подробного diff.
- Тесты: какие runtime/type/documentation fixture tests добавлены или обновлены.
- Проверки: команды и результат.
- Coverage: статус 100% coverage по новому и измененному коду; если не закрыто, перечислить gaps.
- Сценарии: какие реальные public API сценарии и негативные контракты покрыты.
- Совместимость: какие behavior tests подтвердили сохранение public behavior.
- Открыто: конкретные риски, TODO или blocker.
- Следующее действие: один короткий следующий шаг.
```

## Ход реализации

### Этап 1 — Guard primitive и dispatch hook migration

Статус: `done`

Записи:

### 2026-05-26 — Этап 1 — Guard primitive и dispatch hook migration

- Статус: `done`
- Scope: заменен hook-only boolean guard на manager-local phase guard только для dispatch hooks; plugin interceptors и storage callbacks не менялись.
- Реализация: `createMachineManagerFactory.ts` хранит `transitionGuardPhase`, выполняет каждый hook через `withTransitionGuard("hook.<phase>", ...)` и бросает `LiteFsmError` до `assertUserAction(...)`; добавлен код `LITE_FSM_REENTRANT_TRANSITION_FORBIDDEN`.
- Тесты: обновлены runtime tests для `beforeReduce`, `beforeEffects`, `afterEffects`, сброса guard после ошибки, no-plugin regression и разрешенных transitions из subscribers/effects; добавлен type test для нового `LiteFsmError` code.
- Проверки: `pnpm exec vitest run tests/core/dispatch-hooks.test.ts tests/core/plugin-system-stage5.test.ts`; `pnpm exec tstyche tests/types/regression-matrix.tst.ts`; `pnpm --filter @lite-fsm/core check-types`; `pnpm exec tsc --noEmit -p tsconfig.test.json`; `pnpm run test:coverage`; `pnpm run lint` — все успешно.
- Coverage: `pnpm run test:coverage` показал 100% statements/branches/functions/lines.
- Сценарии: nested `transition(...)` из hooks запрещен с phase diagnostic; invalid nested action внутри hook не доходит до user action validation; следующий обычный transition после guard error работает.
- Совместимость: transitions без plugins, из subscribers и из effects остаются разрешены; public docs обновлены в `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`, `PLUGIN-SYSTEM-CHEATSHEET.md`.
- Открыто: guard для plugin interceptors и storage callbacks намеренно не реализован в этом этапе.
- Следующее действие: отдельным заданием выполнить Этап 2.

### Этап 2 — Guard для plugin interceptors

Статус: `done`

Записи:

### 2026-05-26 — Этап 2 — Guard для plugin interceptors

- Статус: `done`
- Scope: закрыт запрет nested `transition(...)` только для plugin `intercept(ctx)`; storage callbacks, middleware, subscribers/effects, snapshot/hydrate и queue/defer API не менялись.
- Реализация: `createMachineManagerFactory.ts` расширяет phase guard значением `plugin.intercept` и выполняет каждый interceptor через `withTransitionGuard("plugin.intercept", ...)`; guard error бросается до `assertUserAction(...)` nested dispatch.
- Тесты: `plugin-system-stage5.test.ts` покрывает nested transition из interceptor через внешний manager reference и через manager extension, fail-fast без изменения state, отсутствие запуска nested middleware/interceptors/reducers/subscribers/effects, сброс guard после ошибки, `ctx.reportError(...)` без изменения control flow и сохранение обычного interceptor replacement/ordering behavior.
- Проверки: `pnpm exec vitest run tests/core/plugin-system-stage5.test.ts`; `git diff --check`; `pnpm run test:coverage` — все успешно.
- Coverage: `pnpm run test:coverage` показал 100% statements/branches/functions/lines.
- Сценарии: nested action не стартует и не доходит до dispatch pipeline; guard diagnostic содержит `plugin.intercept`; следующий обычный dispatch после ошибки выполняется.
- Совместимость: существующие replacement, `skipDelivery`, `stopInterceptors`, reportError и ordering tests в `plugin-system-stage5` проходят.
- Открыто: guard для storage callbacks намеренно не реализован в этом этапе.
- Следующее действие: отдельным заданием выполнить Этап 3.

### Этап 3 — Guard для storage callbacks до subscribers

Статус: `done`

Записи:

### 2026-05-26 — Этап 3 — Guard для storage callbacks до subscribers

- Статус: `done`
- Scope: закрыт запрет nested `transition(...)` для `prepareAction`, `beforeReduce`, `acceptsEvent`, template `reduce`, bucket `reduceBucket`, `commit` и `reactions.run`; effects, condition, snapshot/hydrate и callback result protocols не менялись.
- Реализация: `TransitionGuardPhase` расширен storage фазами; `createBucketRuntime(...)` получил internal guarded callback runner и оборачивает только guarded storage callbacks; `transition(...)` по-прежнему бросает `LiteFsmError` до `assertUserAction(...)`.
- Тесты: `storage-runtime-dispatch-pipeline.test.ts` покрывает все storage guard phases, fail-fast, отсутствие старта nested action, восстановление guard и regressions для replacement, `{ type: "skip" }`, reactions before subscribers и effects dispatch после commit; `runtime-ownership.test.ts` обновлен под новый guard contract для storage reactions.
- Проверки: `pnpm exec vitest run tests/core/storage-runtime-dispatch-pipeline.test.ts`; `pnpm exec vitest run tests/core/storage-runtime-dispatch-pipeline.test.ts tests/core/runtime-ownership.test.ts`; `pnpm exec vitest run tests/core/createMachine.dx.test.ts`; `git diff --check`; `pnpm run test:coverage` — все успешно.
- Coverage: `pnpm run test:coverage` показал 100% statements/branches/functions/lines.
- Сценарии: phases до commit не меняют public state при guard error; `commit` не запускает nested dispatch до public commit boundary; `reactions.run` может оставить committed state, но subscribers внешнего action не вызываются после guard error; следующий обычный dispatch после каждой guard error работает.
- Совместимость: storage replacements, reduce skip, ordinary reactions order и storage effects transition after commit подтверждены focused tests; strict callback result validation и owner diagnostics не добавлялись.
- Открыто: Этап 4 validation callback protocols не реализован.
- Следующее действие: отдельным заданием выполнить Этап 4.

### Этап 4 — Runtime validation callback protocols

Статус: `done`

Записи:

### 2026-05-26 — Этап 4 — Runtime validation callback protocols

- Статус: `done`
- Scope: добавлены публичные validation error codes, строгая runtime validation public result protocols для plugin `intercept`, storage `compileTemplate`, `prepareAction`, `beforeReduce`, `acceptsEvent`, `reduce`, `reduceBucket` и replacement action.
- Реализация: новый internal `callbackValidation.ts` валидирует plain object shapes, boolean results и replacement action до применения action/route recalculation; `registry.ts` хранит owner metadata для interceptors; `pluginStorageNormalize.ts`, `bucketRuntime.ts` и `createMachineManagerFactory.ts` подключают validation на первом runtime interpretation.
- Тесты: добавлен `callback-validation.test.ts` для invalid compileTemplate, storage action/reduce results, acceptsEvent, plugin interceptor results, invalid replacement actions, owner diagnostics, fail-fast и route recalculation guard; обновлены storage builder/reduce expectations и public error code type test.
- Проверки: `pnpm exec vitest run tests/core/callback-validation.test.ts tests/core/plugin-system-stage5.test.ts tests/core/plugin-system-stage7.test.ts tests/core/storage-runtime-dispatch-pipeline.test.ts`; `pnpm exec tstyche tests/types/regression-matrix.tst.ts`; `pnpm --filter @lite-fsm/core check-types`; `pnpm exec tsc --noEmit -p tsconfig.test.json`; `pnpm run test:coverage`; `pnpm run lint`; `git diff --check` — все успешно.
- Coverage: `pnpm run test:coverage` показал 100% statements/branches/functions/lines.
- Сценарии: покрыты invalid result shapes, invalid booleans, invalid/reserved replacement actions, diagnostics `plugin '<name>' intercept` и `storage runtime '<kind>' <phase>`, отсутствие `onError`, fail-fast без следующих фаз, `{}` no-op interceptor и валидные replacement/drop/skip/skipDelivery/stopInterceptors regressions.
- Совместимость: middleware semantics, subscribers/effects reentrant semantics, storage effects timing, snapshot/hydrate и typed storage binding не менялись; существующие focused suites Stage 5/7/storage pipeline проходят.
- Открыто: typed storage-backed binding остается вне scope Этапа 4.
- Следующее действие: отдельным заданием выполнить Этап 5.

### 2026-05-26 — Этап 4 — onError coverage для validation errors

- Статус: `done`
- Scope: закрыт тестовый пробел по тому, что validation errors из plugin/storage callback protocols пробрасываются напрямую и не вызывают `onError` автоматически.
- Тесты: `callback-validation.test.ts` покрывает invalid plugin interceptor result и invalid storage `prepareAction` result с проверкой кода `LiteFsmError`, fail-fast, неизменного state и отсутствия вызова `onError`.
- Проверки: focused Vitest и `git diff --check` выполняются отдельно после правки.
- Открыто: нет для этого coverage gap.

### Этап 5 — Typed binding для отдельно объявленных storage runtimes

Статус: `done`

Записи:

### 2026-05-26 — Этап 5 — Typed binding для отдельно объявленных storage runtimes

- Статус: `done`
- Scope: реализована type-level связь отдельно объявленного `defineStorageRuntime<Extension>()` с plugin `routeMeta` без нового public factory и без изменения runtime representation.
- Реализация: `StorageRuntimeExtension` получил runtime-only `observedEvents` и `routeMeta`; storage callbacks с action используют `ManagerAction<Extension["observedEvents"]>` с fallback `AnyEvent`; `routeMetaKeys` ограничивается ключами `Extension["routeMeta"]`; `LiteFsmStorageRuntimeDefinition` хранит hidden type slot route meta requirements; `definePlugin().create(...)` проверяет наличие и raw value type resolver для required storage route meta keys.
- Тесты: добавлен `plugin-system-stage5-storage-binding.tst.ts`; обновлены `exports-surface.tst.ts` и `plugin-system-stage8.test.ts`.
- Проверки: focused Tstyche suites для storage/plugin/documentation types и focused Vitest `plugin-system-stage8.test.ts` выполнялись успешно; финальный набор проверок фиксируется в отчете агента.
- Coverage: runtime код не менялся по поведению; добавлен runtime regression на существующий registry path. Новый/измененный чистый runtime behavior отсутствует, coverage gate относится к существующим suites.
- Сценарии: покрыты valid/invalid `routeMetaKeys`, observed events contexts, plugin missing/incompatible route meta, unannotated `unknown`, `PluginRouteMeta`, `PluginManagerEvents`, `PluginMachineExtensions`, configurable storage factory и runtime route resolver + storage path.
- Совместимость: existing `defineStorageRuntime(...)` type suites остаются валидными; `PluginManagerEvents` продолжает исключать `HostEvents`; machine-facing extension не раскрывает `observedEvents`/`routeMeta`.
- Открыто: нет для Этапа 5.
- Следующее действие: отдельным заданием выполнить Этап 6.

### Этап 6 — Рефакторинг, чистка и полировка

Статус: `done`

Записи:

### 2026-05-26 — Этап 6 — Рефакторинг, чистка и полировка

- Статус: `done`
- Scope: очищены transitional guard/docs remnants после guard, validation и typed binding без изменения public API, dispatch order, middleware semantics, storage effects timing, subscribers/effects reentrant semantics, snapshot/hydrate.
- Реализация: `TransitionGuardPhase`, `GuardedCallbackRunner` и guard error вынесены в internal `transitionGuard.ts`; `bucketRuntime.ts` больше не зависит типом от manager factory; internal runtime route meta keys получили явный alias; active cheatsheets очищены от transitional factory wording, callback fallback wording и старого ограничения про несвязанные `routeMetaKeys`/`routeMeta`.
- Тесты: focused runtime regressions покрыли dispatch hooks, plugin/storage guard phases, callback validation, replacement validation, storage reactions/effects и subscriber/effect reentrant semantics; focused type regressions покрыли typed storage binding и exported public surface.
- Проверки: `pnpm exec vitest run tests/core/dispatch-hooks.test.ts tests/core/plugin-system-stage5.test.ts tests/core/storage-runtime-dispatch-pipeline.test.ts tests/core/callback-validation.test.ts tests/core/runtime-ownership.test.ts tests/core/plugin-system-stage8.test.ts`; `pnpm exec tstyche tests/types/plugin-system-stage5-storage-binding.tst.ts tests/types/exports-surface.tst.ts tests/types/regression-matrix.tst.ts`; `pnpm run test:coverage`; `pnpm run lint`; `git diff --check`; mandatory `rg` audit — все успешно.
- Coverage: `pnpm run test:coverage` показал 100% statements/branches/functions/lines.
- Сценарии: active code/docs больше не содержит audit hits; оставшиеся hits находятся в ТЗ, журнале и старом historical spec `spec/PLUGIN-SYSTEM-STABLE-API-TZ.md`.
- Совместимость: behavior менялся только refactor/wording cleanup; focused runtime/type regressions подтвердили сохранение guard, validation, storage runtime и typed binding контрактов.
- Открыто: нет для Этапа 6.
- Следующее действие: отдельным заданием выполнить Этап 7.

### Этап 7 — Документация, errors и release checks

Статус: `done`

Записи:

### 2026-05-26 — Этап 7 — Документация, errors и release checks

- Статус: `done`
- Scope: зафиксирован stable contract guard, strict callback validation, replacement validation, diagnostics, subscriber/effect reentrant semantics и typed storage binding в cheatsheets; финальная приемка раздела 6 не выполнялась.
- Реализация: `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md` и `PLUGIN-SYSTEM-CHEATSHEET.md` явно описывают guarded phases, `dispatch.runtime`, return protocol текущей фазы, subscriber/effect boundary для нового action, отсутствие scheduler API в этом релизе, storage reactions до subscribers, strict unknown fields/result shapes, validation replacement до route recalculation, diagnostics owner/storage kind и путь `definePlugin(...)` + `defineStorageRuntime(...)`.
- Тесты: runtime/type tests не менялись; existing focused suites и public error code assertions используются для проверки нового documented contract.
- Проверки: `pnpm exec vitest run tests/core/dispatch-hooks.test.ts tests/core/plugin-system-stage5.test.ts tests/core/storage-runtime-dispatch-pipeline.test.ts tests/core/callback-validation.test.ts tests/core/runtime-ownership.test.ts tests/core/plugin-system-stage8.test.ts`; `pnpm run test:types`; `pnpm run check-types`; `pnpm run lint`; `pnpm run build:packages`; `pnpm run test:coverage`; `git diff --check`; `rg` audit active code/docs/tests на legacy `defineStorageBackedPlugin`, старое hook-only wording, несвязанные `routeMetaKeys`, silent callback wording и unknown callback fallback — все успешно.
- Coverage: `pnpm run test:coverage` показал 100% statements/branches/functions/lines; Этап 7 менял только cheatsheets и журнал.
- Сценарии: документация покрывает guard phases, nested dispatch non-start, errors/onError, storage reactions before subscribers, subscriber/effect reentrant semantics, strict callback validation, replacement validation и typed storage authoring.
- Совместимость: public examples не используют legacy plugin factory и не добавляют новый public API.
- Открыто: нет для Этапа 7.
- Следующее действие: финальная проверка раздела 6 ТЗ главным агентом.

## Финальная проверка раздела 6 ТЗ

### 2026-05-26 — Финальная готовность

- Статус: `done`
- Scope: главный агент проверил критерий полной готовности после закрытия всех этапов.
- Проверки: `pnpm exec vitest run tests/core/dispatch-hooks.test.ts tests/core/plugin-system-stage5.test.ts tests/core/storage-runtime-dispatch-pipeline.test.ts tests/core/callback-validation.test.ts tests/core/runtime-ownership.test.ts tests/core/plugin-system-stage8.test.ts`; `pnpm run test:types`; `pnpm run check-types`; `pnpm run lint`; `pnpm run build:packages`; `pnpm run test:coverage`; `git diff --check`; `rg` audit active code/docs/tests и public examples — все успешно.
- Coverage: `pnpm run test:coverage` показал 100% statements/branches/functions/lines.
- Сценарии: guarded phases, nested dispatch non-start, guard reset, strict callback validation, invalid replacement action before route recalculation, new `LiteFsmError` codes, typed storage binding, subscriber/effect reentrant semantics, middleware behavior и existing plugin/storage pipeline подтверждены runtime/type tests.
- Документация: `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md` и `PLUGIN-SYSTEM-CHEATSHEET.md` описывают guard, strict validation и typed storage binding; legacy `defineStorageBackedPlugin` отсутствует в active public examples.
- Ограничения: docs build и запрещенные команды не запускались.
- Открыто: нет.
