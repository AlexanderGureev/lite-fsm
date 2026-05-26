# Журнал реализации ТЗ storage runtime dispatch pipeline

Этот файл фиксирует краткий прогресс реализации ТЗ:

- [`tz-storage-runtime-dispatch-refactor.md`](./tz-storage-runtime-dispatch-refactor.md)

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
- 100% coverage не считается достаточным без сценарных тестов: happy path, негативные type-level контракты, runtime validation, ordering, drop/replacement semantics, middleware interaction и регрессия без plugins.
- Агент не запускает docs build и команды, которые транзитивно запускают docs build.
- При изменении public API или public types обновлять `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md` и `PLUGIN-SYSTEM-CHEATSHEET.md`.
- Это ТЗ не реализует `@lite-fsm/entities`; `reduceScope: "bucket"` должен только подготовить core storage contract для будущего entity runtime.

## Статусы

- `not started` — этап еще не начат.
- `in progress` — этап начат, но критерии приемки или test/coverage gate еще не закрыты.
- `done` — этап реализован, критерии приемки выполнены, проверки и coverage gate закрыты.
- `blocked` — продолжение невозможно без решения, которое должен принять человек.

## Текущий указатель

- Активное ТЗ: `tz-storage-runtime-dispatch-refactor.md`
- Активный этап: Этап 7 — Финальная проверка и coverage gate
- Статус: `done`
- Следующее действие: главный агент может выполнить финальное ревью полной готовности по разделу 6 ТЗ.

## Сводка по этапам

| Этап | Название | Статус | Последнее обновление |
| --- | --- | --- | --- |
| 1 | Result protocol и storage context contract | `done` | 2026-05-26 |
| 2 | Action pipeline и drop/replacement semantics | `done` | 2026-05-26 |
| 3 | `reduceScope` и bucket-level scheduling | `done` | 2026-05-26 |
| 4 | Миграция `instance` storage runtime | `done` | 2026-05-26 |
| 5 | Public storage builder validation и documentation fixtures | `done` | 2026-05-26 |
| 6 | Рефакторинг, чистка и полировка | `done` | 2026-05-26 |
| 7 | Финальная проверка и coverage gate | `done` | 2026-05-26 |

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

### Этап 1 — Result protocol и storage context contract

Статус: `done`

Записи:

### 2026-05-26 — Этап 1 — Result protocol и storage context contract

- Статус: `done`
- Scope: обновлен public/internal storage context contract без перехода к `reduceScope` и без изменения dispatch order.
- Реализация: добавлены `StorageActionStageResult`, `StorageReduceResult`, `StorageBeforeReduceContext`, `StorageReduceBucketContext`; `StorageDispatchContext` сужен до public view, private stage fields вынесены в lifecycle type; `beginReduce` заменен на `beforeReduce`; public builder typing больше не принимает `false`, raw action или `STORAGE_ACTION_DROP`.
- Тесты: обновлены runtime validation tests для `beforeReduce`, запрета `beginReduce` и result-related fields; добавлен focused runtime test object result protocol; обновлены Tstyche tests storage context/result protocol.
- Проверки: `pnpm --filter @lite-fsm/core check-types`, `pnpm exec tsc --noEmit -p tsconfig.test.json`, `pnpm exec tstyche tests/types/plugin-system-stage7.tst.ts`, focused Vitest storage/runtime tests, `pnpm run check-types`, `pnpm run lint`.
- Coverage: `pluginStorageNormalize.ts` covered at 100% statements/branches/functions/lines with focused coverage. Broader focused runtime coverage over touched runtime files fails global 100% threshold because existing non-stage branches remain uncovered.
- Сценарии: `beforeReduce` object result принимается type/runtime, `beginReduce` отклоняется type/runtime, `ctx.dispatch` не раскрывает action stage fields, `ctx.action`/`ctx.originalAction` доступны в storage callbacks, read-only dispatch fields проверены type-level.
- Совместимость: focused runtime tests подтвердили сохранение routing, storage ordering, runtime preset и nested runtime ownership сценариев.
- Открыто: Stage 2 должен перенести action lifecycle в private state полностью и убрать оставшиеся internal sentinel/private action fields из active pipeline.
- Следующее действие: начать этап 2 с private action lifecycle и drop/replacement semantics.

### 2026-05-26 — Этап 1 — Result protocol test gates

- Статус: `done`
- Scope: закрыты review gaps только по тестовым gate этапа 1 без изменения dispatch order, `reduceScope` или instance runtime.
- Тесты: Tstyche явно проверяет `ctx.originalAction` в `acceptsEvent`; добавлены негативные type tests для старых result contracts `prepareAction -> ctx.action`, `beforeReduce -> false`, `reduce -> false`; runtime validation покрывает все удаленные result-related fields `prepareActionResult`, `beforeReduceResult`, `reduceResult`, `reduceBucketResult` и сохраняет reject для `beginReduce`.
- Проверки: `pnpm exec tstyche tests/types/plugin-system-stage7.tst.ts` — pass; `pnpm exec vitest run tests/core/plugin-system-stage7.test.ts` — pass.
- Coverage: новых runtime веток нет; расширен сценарный validation gate для существующей ветки unknown fields.
- Открыто: нет дополнительных gaps по корректирующей задаче.
- Следующее действие: передать главному агенту результат focused проверок.

### Этап 2 — Action pipeline и drop/replacement semantics

Статус: `done`

Записи:

### 2026-05-26 — Этап 2 — Action pipeline и drop/replacement semantics

- Статус: `done`
- Scope: реализован private action lifecycle state и object outcomes для `prepareAction`/`beforeReduce` без `reduceScope`, bucket scheduling и изменения public middleware/subscriber/actor API.
- Реализация: `createMachineManagerFactory` хранит original/current action, route, drop, touched и `skipDelivery` во внутреннем lifecycle; storage callbacks получают отдельный `StorageDispatchContext` view без action/touched/drop fields; plugin interceptors/hooks получают отдельный `DispatchContext` view; `bucketRuntime.prepareAction` и `bucketRuntime.beforeReduce` возвращают `{ type: "continue", action } | { type: "drop" }` и пересчитывают route на replacement; instance runtime больше не кастует storage dispatch к lifecycle и передает staged committed action через `dispatch.runtime`.
- Тесты: добавлен focused runtime suite `tests/core/storage-runtime-dispatch-pipeline.test.ts` для prepare/before replacement chains, drop semantics, middleware interaction, final intercept action, `skipDelivery`, private dispatch view и regression по `dispatch.nextState` staging; обновлен internal instance runtime contract test в `tests/core/runtime-preset.test.ts`.
- Проверки: `pnpm exec vitest run tests/core/storage-runtime-dispatch-pipeline.test.ts tests/core/plugin-system-stage5.test.ts tests/core/plugin-system-stage7.test.ts tests/core/dispatch-hooks.test.ts tests/core/plugins.test.ts tests/core/runtime-preset.test.ts` — pass; `pnpm exec vitest run tests/core/plugin-system-stage4.test.ts tests/core/plugin-system-stage5.test.ts tests/core/plugin-system-stage7.test.ts tests/core/plugin-system-stage8.test.ts tests/core/routing-registry.test.ts tests/core/runtime-ownership.test.ts tests/core/runtime-preset.test.ts tests/core/storage-runtime-dispatch-pipeline.test.ts` — pass; `pnpm exec vitest run tests/core` — pass; `pnpm run check-types` — pass; `pnpm run lint` — pass.
- Coverage: focused coverage command over changed runtime files passed tests but failed global 100% thresholds: statements 86.63%, branches 71.42%, functions 80.58%, lines 87.99%. Gaps are legacy/non-stage branches in `instance/manager.ts` snapshot/hydration/identity paths, `bucketRuntime.ts` skip/condition branches, and `createMachineManagerFactory.ts` snapshot/hydrate/dehydrate/setDependencies branches; Stage 2 action lifecycle paths are covered by scenario tests.
- Сценарии: replacement в `prepareAction` видит middleware, multiple replacements chain, `beforeReduce` идет после middleware и до interceptors, drop в `prepareAction` не запускает middleware, drop в `beforeReduce` возвращает raw action через middleware post-next, drop не запускает interceptors/hooks/reduce/commit/reactions/subscribers/effects, intercept replacement является final action, `skipDelivery` не запускает storage reduce/effects и сохраняет subscribers/middleware result.
- Совместимость: existing tests для interceptors/hooks/middleware order, runtime preset, routing registry, runtime ownership, plugin stage 4/5/7/8 и full `tests/core` подтверждают сохранение user-facing order и actor replacement reconcile.
- Открыто: общий coverage gate по крупным runtime файлам остается непригоден как focused Stage 2 gate из-за legacy branches; Stage 3 не начат.
- Следующее действие: главный агент может ревьюить Этап 2 и отдельно разрешить переход к Этапу 3.

### Этап 3 — `reduceScope` и bucket-level scheduling

Статус: `done`

Записи:

### 2026-05-26 — Этап 3 — `reduceScope` и bucket-level scheduling

- Статус: `done`
- Scope: реализован discriminated contract `reduceScope: "template" | "bucket"` без миграции `instance` runtime и без `@lite-fsm/entities`.
- Реализация: `StorageRuntime` и public builder types разделены на template и bucket shapes; builder validation проверяет default template scope, explicit bucket scope, несовместимые callbacks и неизвестный `reduceScope`; `bucketRuntime.reduce(...)` выбирает template или bucket branch, `reduceBucket` вызывается один раз на bucket, `acceptsEvent` не вызывается для bucket scope; reduce-stage result validation отклоняет `drop`, `replace` и любые result values кроме `void`/`{ type: "skip" }`.
- Тесты: расширен `tests/core/storage-runtime-dispatch-pipeline.test.ts` сценариями template scheduling, bucket scheduling, skip без touched runtime, запретом bucket `acceptsEvent`, invalid reduce result и default-bucket `condition`; расширен `tests/core/plugin-system-stage7.test.ts` runtime validation; расширен `tests/types/plugin-system-stage7.tst.ts` public discriminated shapes и негативные reduce result contracts.
- Проверки: `pnpm exec vitest run tests/core/storage-runtime-dispatch-pipeline.test.ts tests/core/plugin-system-stage7.test.ts` — pass; `pnpm exec tstyche tests/types/plugin-system-stage7.tst.ts` — pass; `pnpm run check-types` — pass; `pnpm run lint` — pass.
- Coverage: `pnpm exec vitest run tests/core/storage-runtime-dispatch-pipeline.test.ts tests/core/plugin-system-stage7.test.ts --coverage --coverage.include=packages/core/src/runtime/kernel/bucketRuntime.ts` — 100% statements/branches/functions/lines; `pnpm exec vitest run tests/core/plugin-system-stage7.test.ts --coverage --coverage.include=packages/core/src/pluginStorageNormalize.ts` — 100% statements/branches/functions/lines.
- Сценарии: default template scope сохраняет `templates × acceptsEvent → reduce`; explicit bucket scope получает все templates bucket и reducer вызывается один раз; `{ type: "skip" }` в обоих scope не запускает `commit`, `reactions`, `effects`; invalid `reduceScope`, missing required callbacks и лишние callbacks отклоняются builder validation; `drop`/`replace` в reduce stage отклоняются type-level и runtime validation.
- Совместимость: focused tests подтвердили сохранение action lifecycle, middleware after-next, `skipDelivery`, storage builder opaque values и default storage `condition`; `instance` runtime остался template-scope и не мигрирован.
- Открыто: общий full coverage suite не запускался; focused coverage gate по измененным runtime/validation modules закрыт. Этап 4 не начинался.
- Следующее действие: главный агент может ревьюить Этап 3 и отдельно разрешить миграцию `instance` runtime в Этапе 4.

### Этап 4 — Миграция `instance` storage runtime

Статус: `done`

Записи:

### 2026-05-26 — Этап 4 — Миграция `instance` storage runtime

- Статус: `done`
- Scope: `instance` runtime переведен на bucket-scope scheduling без изменения actor public API, sidecar model, snapshot/hydrate format и reducer-authoritative behavior `storage: "instance"`.
- Реализация: `instanceStorageRuntime` объявляет `reduceScope: "bucket"` и использует `reduceBucket`; `InstanceDispatchState.reduced` удален; `prepareAction` и `beforeReduce` возвращают object results `replace/drop`; final action после plugin `intercept` синхронизируется в private instance dispatch context перед `reduceRoot`; effects читают committed action и prev state из private instance context.
- Тесты: расширены `tests/core/storage-runtime-dispatch-pipeline.test.ts` и `tests/core/runtime-preset.test.ts` сценариями bucket-call once для instance, sender disposed drop, post-normalize перед interceptors, interceptor replacement для domain/actor/subscribers/effects, final action для target resolution, nested transitions/effect prev state, actor record replacement reconcile и direct runtime contract.
- Проверки: `pnpm exec vitest run tests/core/storage-runtime-dispatch-pipeline.test.ts tests/core/runtime-preset.test.ts` — pass; focused actor/middleware/dispatch tests — pass; `pnpm exec vitest run tests/core` — pass; `pnpm run check-types` — pass; `pnpm run lint` — pass.
- Coverage: `pnpm exec vitest run tests/core/storage-runtime-dispatch-pipeline.test.ts tests/core/runtime-preset.test.ts tests/core/MachineManager.actors.middleware.test.ts tests/core/MachineManager.actors.lifecycle.test.ts tests/core/MachineManager.actors.effects.test.ts tests/core/MachineManager.actors.routing.test.ts --coverage --coverage.include=packages/core/src/runtime/instance/storage.ts --coverage.include=packages/core/src/runtime/instance/manager.ts` — 100% statements/branches/functions/lines.
- Сценарии: `reduceBucket` вызывается один раз на dispatch при нескольких templates; sender disposed остается silent drop без subscribers/effects; middleware replacement проходит post-normalize до interceptors; interceptor replacement после `beforeReduce` доходит до root reducer, actor reducer, subscribers, effects и effect target resolution; nested transitions не перетирают outer committed prev state; state replacement actor records reconcile сохраняет canonical meta.
- Совместимость: full `tests/core`, focused actor lifecycle/routing/effects/middleware, dispatch pipeline и runtime preset подтвердили сохранение actor routing, spawn/dispose, sidecar commit, effects targets, replacement reconciliation и public dispatch order.
- Открыто: нет известных gaps по Этапу 4.
- Следующее действие: главный агент может ревьюить Этап 4 и отдельно разрешить переход к Этапу 5.

### Этап 5 — Public storage builder validation и documentation fixtures

Статус: `done`

Записи:

### 2026-05-26 — Этап 5 — Public storage builder validation и documentation fixtures

- Статус: `done`
- Scope: синхронизированы public storage authoring examples, cheatsheets, runtime/type validation tests и specs с финальным `beforeReduce`/`reduceScope` contract.
- Реализация: documentation fixture больше не использует пустой pre-reduce hook; public examples показывают immutable replacement `ctx.dispatch.nextState = { ... }`; `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md` и `PLUGIN-SYSTEM-CHEATSHEET.md` описывают object result protocol, `beforeReduce`, `reduceScope` и readonly/mutable поля `ctx.dispatch`; связанная public API spec обновлена с `beginReduce` на `beforeReduce`.
- Тесты: runtime validation `tests/core/plugin-system-stage7.test.ts` покрывает unknown fields, old `beginReduce`, invalid `reduceScope`, invalid capability block shapes, forbidden template callbacks in bucket scope и forbidden `reduceBucket` in template scope; documentation fixture runtime test проходит с новым API; type tests включают documentation examples и regression на отсутствие root storage context/result exports.
- Проверки: `pnpm exec vitest run tests/core/plugin-system-stage7.test.ts tests/core/plugin-system-documentation.test.ts` — pass; `pnpm exec tstyche tests/types/plugin-system-stage7.tst.ts tests/types/plugin-system-documentation.tst.ts tests/types/exports-surface.tst.ts` — pass; `pnpm run check-types` — pass; `pnpm run lint` — pass; `git diff --check` — pass.
- Coverage: `pnpm exec vitest run tests/core/plugin-system-stage7.test.ts --coverage --coverage.include=packages/core/src/pluginStorageNormalize.ts --coverage.reporter=text --coverage.thresholds.statements=100 --coverage.thresholds.branches=100 --coverage.thresholds.functions=100 --coverage.thresholds.lines=100` — 100% statements/branches/functions/lines.
- Сценарии: public builder принимает финальный template/bucket shape и optional capability blocks; старый `beginReduce`, invalid result-related fields и несовместимые reduce-scope callbacks отклоняются runtime/type-level; документационный storage reducer обновляет `dispatch.nextState` иммутабельной заменой.
- Совместимость: root export surface не расширен storage context/result types; documentation fixture подтвердил no-op plugin, routeMeta, manager extension, intercept/hooks, scoped deps/transition, storage runtime и plugin event.
- Открыто: `rg "beginReduce|STORAGE_ACTION_DROP|committedAction|preparedAction|dispatch\\.dropped"` находит только текущую storage refactor spec с removal/negative contract, исторический журнал, negative tests и internal bridge (`STORAGE_ACTION_DROP`/private lifecycle); target public docs/examples active storage contract usage не найден.
- Следующее действие: главный агент может ревьюить Этап 5 и отдельно разрешить переход к Этапу 6.

### Этап 6 — Рефакторинг, чистка и полировка

Статус: `done`

Записи:

### 2026-05-26 — Этап 6 — Рефакторинг, чистка и полировка

- Статус: `done`
- Scope: очищены legacy storage protocol remnants после финализации `beforeReduce`, object results и `reduceScope`; поведение dispatch order, middleware, actor routing, snapshot/hydrate и public API не менялось.
- Реализация: `STORAGE_ACTION_DROP` удален из kernel storage и normalizer переведен на internal discriminated `NormalizeActionResult`; private `dispatch.dropped` заменен lifecycle outcome; `bucketRuntime` больше не использует `prepared` intermediate names в action-stage loop; `pluginStorageNormalize.ts` больше не содержит transitional removed-fields branch; regression-аудиты в tests явно помечены.
- Тесты: добавлен focused regression на доступность `transition` options через storage/plugin dispatch context views; сохранены regression-аудиты отсутствия private action lifecycle fields в public `StorageDispatchContext` и запрета старых storage fields.
- Проверки: `pnpm exec vitest run tests/core/storage-runtime-dispatch-pipeline.test.ts` — pass; `pnpm exec vitest run tests/core` — pass; `pnpm exec tstyche tests/types/plugin-system-stage7.tst.ts tests/types/plugin-system-documentation.tst.ts tests/types/exports-surface.tst.ts` — pass; `pnpm run check-types` — pass; `pnpm run lint` — pass; `git diff --check` — pass.
- Coverage: `pnpm exec vitest run tests/core --coverage --coverage.include=packages/core/src/managerNormalize.ts --coverage.include=packages/core/src/pluginStorageNormalize.ts --coverage.include=packages/core/src/runtime/kernel/bucketRuntime.ts --coverage.include=packages/core/src/runtime/kernel/createMachineManagerFactory.ts --coverage.include=packages/core/src/runtime/kernel/storage.ts --coverage.include=packages/core/src/runtime/instance/manager.ts --coverage.include=packages/core/src/runtime/instance/storage.ts --coverage.reporter=text --coverage.thresholds.statements=100 --coverage.thresholds.branches=100 --coverage.thresholds.functions=100 --coverage.thresholds.lines=100` — 100% statements/branches/functions/lines.
- Сценарии: dispatch options проходят через final public context views; storage object result protocol, drop/replacement semantics, `reduceScope`, instance bucket scheduling, middleware/hooks/reactions/effects и nested transitions подтверждены focused/full core tests.
- Совместимость: active source/public docs не содержат `beginReduce`, `STORAGE_ACTION_DROP`, `committedAction`, `preparedAction` или `dispatch.dropped`; full `tests/core` подтверждает сохранение runtime behavior.
- Открыто: `rg "beginReduce|STORAGE_ACTION_DROP|committedAction|preparedAction|dispatch\\.dropped"` оставляет только явно допустимые regression-аудиты: `tests/types/regression-matrix.tst.ts`, `tests/types/plugin-system-stage7.tst.ts`, `tests/core/storage-runtime-dispatch-pipeline.test.ts`, `tests/core/plugin-system-stage7.test.ts`.
- Следующее действие: главный агент может ревьюить Этап 6 и отдельно разрешить переход к Этапу 7.

### Этап 7 — Финальная проверка и coverage gate

Статус: `done`

Записи:

### 2026-05-26 — Этап 7 — Финальная проверка и coverage gate

- Статус: `done`
- Scope: закрыт финальный gate по core runtime, public type tests, package build, lint, static audit и coverage затронутого refactor scope без новых behavior changes.
- Реализация: код не менялся; обновлен только этот журнал по фактическим результатам финальной проверки.
- Тесты: полный `tests/core` подтвердил runtime behavior; полный `tstyche` подтвердил public types, documentation fixture и export surface.
- Проверки: `pnpm exec vitest run tests/core` — pass; `pnpm run check-types` — pass; `pnpm run lint` — pass; `pnpm run build:packages` — pass; `git diff --check` — pass.
- Coverage: `pnpm exec vitest run tests/core --coverage --coverage.include=packages/core/src/managerNormalize.ts --coverage.include=packages/core/src/pluginStorageNormalize.ts --coverage.include=packages/core/src/runtime/kernel/bucketRuntime.ts --coverage.include=packages/core/src/runtime/kernel/createMachineManagerFactory.ts --coverage.include=packages/core/src/runtime/kernel/storage.ts --coverage.include=packages/core/src/runtime/instance/manager.ts --coverage.include=packages/core/src/runtime/instance/storage.ts --coverage.reporter=text --coverage.thresholds.statements=100 --coverage.thresholds.branches=100 --coverage.thresholds.functions=100 --coverage.thresholds.lines=100` — 100% statements/branches/functions/lines.
- Сценарии: full core runtime suite сохраняет machines без plugins, `storage: "instance"`, middleware, interceptors, hooks, subscribers, reactions/effects, actor routing, snapshot/hydrate и nested transitions; Tstyche suite сохраняет новый storage builder contract и отсутствие лишних root exports.
- Совместимость: `pnpm run build:packages` проверил package export/build surface без docs build; docs build и запрещенные команды не запускались.
- Открыто: search audit по `beginReduce|STORAGE_ACTION_DROP|committedAction|preparedAction|dispatch\\.dropped` оставляет только явно допустимые negative/regression hits в `tests/core/plugin-system-stage7.test.ts`, `tests/core/storage-runtime-dispatch-pipeline.test.ts`, `tests/types/plugin-system-stage7.tst.ts` и `tests/types/regression-matrix.tst.ts`; active source/public examples clean. `test.only`, временные `test.skip`, `debugger`, debug logging, TODO/FIXME в scope refactor не найдены.
- Следующее действие: главный агент может выполнить итоговую проверку раздела 6 ТЗ и закрыть цель.
