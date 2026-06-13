# Журнал реализации ТЗ Entities, часть 2

ТЗ: [`tz-entities-implementation-part-2.md`](./tz-entities-implementation-part-2.md)

Цель журнала — восстановить состояние реализации после сжатия контекста. Журнал не заменяет ТЗ и не пересказывает diff.

## Правила ведения

- Перед продолжением работы прочитать ТЗ и этот журнал.
- Продолжать первый этап со статусом не `done`.
- Не переходить к следующему этапу, пока текущий этап не прошел свой `stage gate`.
- Не начинать этапы 8-15, пока часть 1 не прошла свой критерий готовности.
- Обновлять журнал после закрытия этапа, blocker или значимого промежуточного результата.
- Записи держать короткими: scope, измененные модули, проверки, coverage, риски, следующее действие.
- Не фиксировать каждую мелкую правку и не вставлять полный diff.
- Не запускать docs build и команды, которые транзитивно запускают docs build.

## Статусы

- `not started`
- `in progress`
- `done`
- `blocked`

## Текущий указатель

- Активное ТЗ: `spec/tz-entities-implementation-part-2.md`
- Активный этап: Этап 13 — Benchmarks, README/examples
- Статус: `not started`
- Следующее действие: dispatch этапа 13.

## Сводка по этапам

| Этап | Название                                                            | Статус        | Последнее обновление |
| ---- | ------------------------------------------------------------------- | ------------- | -------------------- |
| 8    | Despawn, `despawnOn` и lifecycle cleanup                            | `done`        | 2026-06-13           |
| 9    | Entity effects, entity-specific helpers и core transition helpers   | `done`        | 2026-06-13           |
| 10   | Reactions и reaction error semantics                                | `done`        | 2026-06-13           |
| 11   | Snapshot/hydrate через `snapshot.storage.entity`                    | `done`        | 2026-06-13           |
| 12   | React hooks: `useEntitySnapshot`, `useEntityCount`, `useEntityList` | `done`        | 2026-06-13           |
| 13   | Benchmarks, README/examples                                         | `not started` | 2026-06-13           |
| 14   | Рефакторинг, чистка и полировка                                     | `not started` | 2026-06-13           |
| 15   | Финальная проверка `ecs_example`                                    | `not started` | 2026-06-13           |

## Ход реализации

### 2026-06-13 — Preflight части 2

- Статус: `in progress`.
- Scope: восстановление состояния перед стартом этапа 8.
- Изменено: `spec/tz-entities-implementation-part-2-log.md`.
- Проверки: часть 1 подтверждена как `done` по `spec/tz-entities-implementation-log.md`; `git status --short` — чисто до правки журнала; staged diff отсутствует; `AGENTS.md`, ТЗ и журнал прочитаны.
- Coverage: не применимо, менялся только журнал.
- Риски: журнал части 2 содержал таблицу этапов 8-15, но в `Ход реализации` была только секция этапа 15; структура восстановлена перед dispatch.
- Следующее действие: dispatch этапа 8.

### Этап 8 — Despawn, `despawnOn` и lifecycle cleanup

Статус: `done`

Записи:

### 2026-06-13 — Этап 8 dispatch

- Статус: `in progress`.
- Исполнитель: `019ec2b2-c267-72a1-9344-31afed012b72`.
- Corrective: `0/3`.
- Baseline: до preflight рабочее дерево было чистым; на момент dispatch есть только orchestrator-owned diff в `spec/tz-entities-implementation-part-2-log.md` с восстановлением структуры журнала и этой dispatch-записью; staged diff отсутствует.
- Active scope: `packages/entities/src/runtime/compile.ts`, `packages/entities/src/runtime/lifecycle.ts`, `packages/entities/src/runtime/reduce.ts`, `packages/entities/src/runtime/state.ts`, `packages/entities/src/runtime/transaction.ts`, точечные изменения `packages/entities/src/runtime/storage.ts`, `packages/entities/src/machine-extension.ts`, `packages/entities/src/index.ts`, runtime/type tests этапа 8, `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`, `packages/entities/README.md`.
- Out of scope: `transition.despawn(...)`, entity enter-state effects, reactions, snapshot/hydrate, React hooks, benchmarks, public `manager.despawn(...)`, public routing по `actorId` к entity rows, docs build и любые команды, которые транзитивно запускают docs build.
- Следующее действие: передать исполнителю brief этапа 8.

### 2026-06-13 — Этап 8 done

- Статус: `done`.
- Исполнитель: `019ec2b2-c267-72a1-9344-31afed012b72`.
- Corrective: `0/3`.
- Baseline: до dispatch был только orchestrator-owned diff журнала; stage-owned delta не включает журнал.
- Scope: `packages/entities/src/runtime/compile.ts`, `packages/entities/src/runtime/reduce.ts`, `packages/entities/src/runtime/state.ts`, `packages/entities/src/runtime/storage.ts`, `packages/entities/src/runtime/transaction.ts`, `packages/entities/src/machine-extension.ts`, `tests/entities/entities-plugin.test.ts`, `tests/types/entities-api.tst.ts`, `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`, `packages/entities/README.md`.
- Ключевые контракты: добавлен `despawnOn`, init validation и `despawnStateMask`; `despawnOn` синхронно удаляет всю entity через scoped `ENTITY_DESPAWNED`; rows без lifecycle edge очищаются без reducer call; terminal states удаляют только actor row; `freeList`/`generation` позволяют переиспользовать id без старых rows/columns/`rowVersion`; public `manager.despawn(...)` не добавлен.
- Проверки: `pnpm exec vitest run tests/entities/entities-plugin.test.ts` — pass, 85 tests; `pnpm exec tstyche tests/types/entities-api.tst.ts` — pass, 24 tests/55 assertions; `pnpm --filter @lite-fsm/entities run check-types` — pass; `pnpm run check-types` — pass, 44 type files/481 tests/1072 assertions; `pnpm exec vitest run tests/entities/entities-plugin.test.ts --coverage '--coverage.include=packages/entities/src/**/*.ts'` — pass, 100% statements/branches/functions/lines; `pnpm run lint` — pass; `git diff --check` — pass; source audit по future APIs — only expected docs/type-test mentions of absent `manager.despawn(...)` and historical core `reactions` docs.
- Coverage: focused `packages/entities/src/**/*.ts` — 100% (`1075/1075`, `461/461`, `205/205`, `935/935`).
- Риски: docs build и запрещенные build-команды не запускались; первый coverage запуск без quotes не стартовал из-за zsh glob expansion и не является code failure.
- Следующее действие: новый dispatch этапа 9.

### Этап 9 — Entity effects, entity-specific helpers и core transition helpers

Статус: `done`

Записи:

### 2026-06-13 — Этап 9 dispatch

- Статус: `in progress`.
- Исполнитель: `019ec2c3-aaa7-77e2-9ec9-9eead04af316`.
- Corrective: `0/3`.
- Baseline: принятая дельта этапа 8 и журнал присутствуют в рабочем дереве; staged diff отсутствует. Текущий diff включает `despawnOn`, lifecycle cleanup, tests/docs этапа 8 и orchestrator-owned записи журнала.
- Active scope: `packages/entities/src/runtime/effects.ts`, `packages/entities/src/runtime/access.ts`, `packages/entities/src/runtime/compile.ts`, `packages/entities/src/runtime/reduce.ts`, `packages/entities/src/runtime/state.ts`, `packages/entities/src/runtime/storage.ts`, `packages/entities/src/runtime/transaction.ts`, точечные изменения `packages/entities/src/machine-extension.ts`, `packages/entities/src/index.ts`, runtime/type tests этапа 9, `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`, `packages/entities/README.md`.
- Out of scope: reactions, snapshot/hydrate, React hooks, benchmarks, public `manager.despawn(...)`, public routing по `actorId` к entity rows, renderer-specific integrations, Proxy-based mutation traps, docs build и любые команды, которые транзитивно запускают docs build.
- Следующее действие: передать исполнителю brief этапа 9.

### 2026-06-13 — Этап 9 review corrective 1

- Статус: `in progress`.
- Исполнитель: `019ec2c3-aaa7-77e2-9ec9-9eead04af316`.
- Corrective: `1/3`.
- Review verdict: `return_to_subagent`.
- Замечания: `invokeEntityEffect(...)` вызывает raw effect без обработки sync throw и rejected Promise; stage 9 допускает sync/async effects, а существующие core effects сообщают ошибки через `onError`, поэтому нельзя оставлять unhandled rejection или проброс из effect phase. Нужно использовать storage effect context `dispatch.reportError(...)` или эквивалентный existing channel, добавить tests для sync throw и async rejection, сохранить committed state и не запускать docs build.
- Следующее действие: исполнитель исправляет error handling entity effects, перезапускает focused runtime/type/coverage checks и возвращает `ready_for_review`.

### 2026-06-13 — Этап 9 done

- Статус: `done`.
- Исполнитель: `019ec2c3-aaa7-77e2-9ec9-9eead04af316`.
- Corrective: `1/3`.
- Baseline: принятая дельта этапа 8 была исходным состоянием; stage-owned delta этапа 9 добавляет entity effects runtime, scoped access, transition helpers, dependent `effectDeps` typing, tests/docs.
- Scope: `packages/entities/src/runtime/effects.ts`, `packages/entities/src/runtime/access.ts`, `packages/entities/src/runtime/compile.ts`, `packages/entities/src/runtime/reduce.ts`, `packages/entities/src/runtime/storage.ts`, `packages/entities/src/runtime/transaction.ts`, `packages/entities/src/machine-extension.ts`, `packages/core/src/pluginStorageTypes.ts`, `tests/entities/entities-plugin.test.ts`, `tests/types/entities-api.tst.ts`, `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`, `packages/entities/README.md`.
- Ключевые контракты: `EntityMachineExtension.effectDeps` типизирует `self`, scoped `entities` и entity transition helpers; enter-state effects запускаются через storage `effects` phase после subscribers/middleware post-`next`; effects используют final state, не запускаются для steady/rollback/despawned rows, поддерживают async captured scope и stale generation checks; `transition.entity(...)`, `transition.tag(...)`, `transition.actor(...)`, `transition.unscoped(...)` и `transition.despawn(...)` покрыты runtime/type tests; sync throw и rejected Promise из effect передаются через `onError`.
- Проверки: `pnpm exec vitest run tests/entities/entities-plugin.test.ts --reporter=dot` — pass, 99 tests; `pnpm exec tstyche tests/types/entities-api.tst.ts` — pass, 27 tests/67 assertions; `pnpm --filter @lite-fsm/entities run check-types` — pass; `pnpm exec vitest run tests/entities/entities-plugin.test.ts --coverage '--coverage.include=packages/entities/src/**/*.ts'` — pass, 100% statements/branches/functions/lines; `pnpm run check-types` — pass, 44 type files/484 tests/1084 assertions; `pnpm exec vitest run tests/core/MachineManager.actors.effects.test.ts tests/core/createEffect.test.ts tests/core/storage-runtime-dispatch-pipeline.test.ts --reporter=dot` — pass, 70 tests; `pnpm run lint` — pass; `git diff --check` — pass; source audit по future APIs — only expected docs/type-test mentions of absent `manager.despawn(...)` and existing core plugin tests/types outside active entity effect scope.
- Coverage: focused `packages/entities/src/**/*.ts` — 100% (`1297/1297`, `576/576`, `254/254`, `1125/1125`).
- Риски: docs build и запрещенные build-команды не запускались; `StorageDependentField` для `effectDeps` является core public type surface change и отражен в cheatsheets.
- Следующее действие: новый dispatch этапа 10.

### Этап 10 — Reactions и reaction error semantics

Статус: `done`

Записи:

### 2026-06-13 — Этап 10 dispatch

- Статус: `in progress`.
- Исполнитель: `019ec2db-006a-74a3-bd72-29db5718e594`.
- Corrective: `0/3`.
- Baseline: принятая дельта этапов 8-9 и журнал присутствуют в рабочем дереве; staged diff отсутствует. Текущий diff включает `despawnOn`, entity effects, dependent `effectDeps`, tests/docs этапов 8-9 и orchestrator-owned записи журнала.
- Active scope: `packages/entities/src/runtime/reactions.ts`, `packages/entities/src/runtime/access.ts`, `packages/entities/src/runtime/compile.ts`, `packages/entities/src/runtime/reduce.ts`, `packages/entities/src/runtime/storage.ts`, `packages/entities/src/runtime/transaction.ts`, точечные изменения `packages/entities/src/machine-extension.ts`, runtime/type tests этапа 10, `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`, `packages/entities/README.md`.
- Out of scope: snapshot/hydrate, React hooks, benchmarks, public event emission from reactions, reactions для `storage: "instance"`, transition helpers in reactions, public `manager.despawn(...)`, docs build и любые команды, которые транзитивно запускают docs build.
- Следующее действие: передать исполнителю brief этапа 10.

### 2026-06-13 — Этап 10 done

- Статус: `done`.
- Исполнитель: `019ec2db-006a-74a3-bd72-29db5718e594`.
- Corrective: `0/3`.
- Baseline: принятая дельта этапов 8-9 была исходным состоянием; stage-owned delta этапа 10 добавляет entity reactions runtime, lifecycle reaction phase, dependent `reactionDeps` typing, tests/docs и type-only core support для storage-specific `reactions`.
- Scope: `packages/entities/src/runtime/reactions.ts`, `packages/entities/src/runtime/compile.ts`, `packages/entities/src/runtime/reduce.ts`, `packages/entities/src/runtime/storage.ts`, `packages/entities/src/runtime/transaction.ts`, `packages/entities/src/machine-extension.ts`, `packages/core/src/createMachine.types.ts`, `packages/core/src/pluginStorageTypes.ts`, `tests/entities/entities-plugin.test.ts`, `tests/types/entities-api.tst.ts`, `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`, `packages/entities/README.md`.
- Ключевые контракты: `reactions` и `reactionDeps` доступны только для `storage: "entity"`; reactions запускаются через storage `reactions.run(...)` после cleanup и до subscribers; `ENTITY_DESPAWNED` reactions выполняются внутри lifecycle до физического cleanup и видят columns; rows без lifecycle edge cleanup-ятся без reaction; reaction deps дают read-only `self`, scoped `entities`, user deps и не дают `transition`; sync throw и обнаруженный Promise return идут через `onError` без rollback, отмены cleanup/subscribers/effects или изменения return value.
- Проверки: `pnpm exec vitest run tests/entities/entities-plugin.test.ts --reporter=dot` — pass, 105 tests; `pnpm exec vitest run tests/core/dispatch-hooks.test.ts tests/core/storage-runtime-dispatch-pipeline.test.ts tests/core/runtime-ownership.test.ts --reporter=dot` — pass, 84 tests; `pnpm exec tstyche tests/types/entities-api.tst.ts tests/types/create-machine-dependent-storage.tst.ts tests/types/exports-surface.tst.ts` — pass, 3 files/39 tests/146 assertions; `pnpm --filter @lite-fsm/entities run check-types` — pass; `pnpm --filter @lite-fsm/core run check-types` — pass; `pnpm exec vitest run tests/entities/entities-plugin.test.ts --coverage '--coverage.include=packages/entities/src/**/*.ts'` — pass, 100% statements/branches/functions/lines; `pnpm run check-types` — pass, 44 type files/487 tests/1098 assertions; `pnpm run lint` — pass; `git diff --check` — pass; source audit по future APIs — only expected docs/type-test/spec mentions and existing core plugin scoped deps/transition docs/tests.
- Coverage: focused `packages/entities/src/**/*.ts` — 100% (`1407/1407`, `632/632`, `275/275`, `1219/1219`).
- Риски: docs build и запрещенные build-команды не запускались; core changes are type-only and reflected in cheatsheets.
- Следующее действие: новый dispatch этапа 11.

### Этап 11 — Snapshot/hydrate через `snapshot.storage.entity`

Статус: `in progress`

Записи:

### 2026-06-13 — Этап 11 dispatch

- Статус: `in progress`.
- Исполнитель: `019ec2ea-da5b-79e0-a1f6-0f7ddf223711`.
- Corrective: `0/3`.
- Baseline: принятая дельта этапов 8-10 и журнал присутствуют в рабочем дереве; staged diff отсутствует. Текущий diff включает `despawnOn`, entity effects/reactions, dependent deps typing, tests/docs этапов 8-10 и orchestrator-owned записи журнала.
- Active scope: `packages/entities/src/runtime/snapshot.ts`, `packages/entities/src/runtime/state.ts`, `packages/entities/src/runtime/storage.ts`, `packages/entities/src/runtime/reduce.ts` только если нужны helpers/versions, runtime/type tests этапа 11, `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`, `packages/entities/README.md`.
- Out of scope: React hooks, DevTools/graph provider API, partial export/import entity storage, changes to existing instance snapshot format, public low-level storage handlers, docs build и любые команды, которые транзитивно запускают docs build.
- Следующее действие: передать исполнителю brief этапа 11.

### 2026-06-13 — Этап 11 review corrective 1

- Статус: `in progress`.
- Исполнитель: `019ec2ea-da5b-79e0-a1f6-0f7ddf223711`.
- Corrective: `1/3`.
- Review verdict: `return_to_subagent`.
- Замечания: hydrate validation принимает present actor row со special terminal `stateCode` (`__RESOLVED`/`__REJECTED`/`__CANCELLED`), хотя такие rows по контракту удаляются commit-ом до subscribers и не должны попадать в durable runtime. После такого hydrate row остается present, не попадает в state buckets и routed delivery по `meta.entityId` может получить invalid state path. Нужно отклонять terminal `stateCode` для `presence[entity] === 1` clear `LITE_FSM_INVALID_HYDRATION_ENVELOPE`, добавить focused test рядом с invalid snapshot cases. Дополнительно проверить, что hydrate replace не может понизить storage-level entity version относительно текущего runtime; если текущий version выше snapshot version, replace должен bump-ить entity store version.
- Следующее действие: исполнитель исправляет snapshot validation/version invalidation, перезапускает focused runtime/type/coverage checks и возвращает `ready_for_review`.

### 2026-06-13 — Этап 11 done

- Статус: `done`.
- Исполнитель: `019ec2ea-da5b-79e0-a1f6-0f7ddf223711`.
- Corrective: `1/3`.
- Baseline: принятая дельта этапов 8-10 была исходным состоянием; stage-owned delta этапа 11 добавляет durable `snapshot.storage.entity`, replace-only hydrate, preview, validation, sidecar rebuild, tests/docs.
- Scope: `packages/entities/src/runtime/snapshot.ts`, `packages/entities/src/runtime/state.ts`, `packages/entities/src/runtime/storage.ts`, `tests/entities/entities-plugin.test.ts`, `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`, `packages/entities/README.md`.
- Ключевые контракты: `dehydrate()` экспортирует durable entity payload в `storage.entity` и lightweight entity slices в `machines`; `machines` и `storage` filters независимы; hydrate с `storage.entity` валидирует schema/lengths/columns/self-consistency до мутации и replace-only заменяет runtime; hydrate без `storage.entity` сохраняет rows/columns и канонизирует public slices; legacy snapshots без `generation`/`rowVersion` поддержаны; hydrate preview не мутирует runtime; sidecars/routing/group indexes rebuild-ятся; present terminal rows rejected; entity/actor versions и rowVersion invalidated fresh.
- Проверки: `pnpm exec vitest run tests/entities/entities-plugin.test.ts --reporter=dot` — pass, 114 tests; `pnpm exec vitest run tests/core/dehydrate.test.ts tests/core/hydrate.test.ts tests/core/hydration.applySnapshot.test.ts tests/core/plugin-system-stage9.test.ts tests/core/storage-runtime-dispatch-pipeline.test.ts --reporter=dot` — pass, 5 files/104 tests; `pnpm exec tstyche tests/types/entities-api.tst.ts tests/types/plugin-system-stage9.tst.ts tests/types/runtime-api.tst.ts` — pass, 3 files/62 tests/124 assertions; `pnpm --filter @lite-fsm/entities run check-types` — pass; `pnpm --filter @lite-fsm/core run check-types` — pass; `pnpm exec vitest run tests/entities/entities-plugin.test.ts --coverage '--coverage.include=packages/entities/src/**/*.ts'` — pass, 100% statements/branches/functions/lines; `pnpm run check-types` — pass, 44 type files/487 tests/1098 assertions; `pnpm run lint` — pass; `git diff --check` — pass; source audit по out-of-scope APIs — only expected docs/spec/type-test mentions and unrelated middleware devtools tests.
- Coverage: focused `packages/entities/src/**/*.ts` — 100% (`1796/1796`, `793/793`, `334/334`, `1547/1547`).
- Риски: docs build и запрещенные build-команды не запускались; `getSnapshot()` durable storage behavior covered by tests.
- Следующее действие: новый dispatch этапа 12.

### Этап 12 — React hooks: `useEntitySnapshot`, `useEntityCount`, `useEntityList`

Статус: `done`

Записи:

### 2026-06-13 — Этап 12 dispatch

- Статус: `in progress`.
- Исполнитель: `019ec2fe-b4bb-7460-bccc-60783b5bf19f`.
- Corrective: `0/3`.
- Baseline: принятая дельта этапов 8-11 и журнал присутствуют в рабочем дереве; staged diff отсутствует. Текущий diff включает entity lifecycle/effects/reactions/snapshot runtime, tests/docs этапов 8-11 и orchestrator-owned записи журнала.
- Active scope: `packages/entities/src/react.ts` или `packages/entities/src/react/index.ts`, entity runtime read/subscription/preview helpers в `packages/entities/src/runtime/*`, package exports/tsup/tsconfig paths для `@lite-fsm/entities/react`, generic storage preview bridge в `packages/react/src/*`, React/type tests этапа 12, `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`, `packages/entities/README.md`, при необходимости `packages/react/README.md`.
- Out of scope: editor/prefab UI, renderer-specific integrations, mutation APIs from hooks, arbitrary predicates/sorting/multi-tag filters, raw column arrays/`EntityIndex` from hooks, graph/devtools UI, docs build и любые команды, которые транзитивно запускают docs build.
- Следующее действие: передать исполнителю brief этапа 12.

### 2026-06-13 — Этап 12 done

- Статус: `done`.
- Исполнитель: `019ec2fe-b4bb-7460-bccc-60783b5bf19f`.
- Corrective: `0/3`.
- Baseline: принятая дельта этапов 8-11 была исходным состоянием; stage-owned delta этапа 12 добавляет `@lite-fsm/entities/react`, generic storage preview bridge в `@lite-fsm/react`, React/type tests и docs.
- Scope: `packages/entities/src/react/index.ts`, `packages/entities/src/runtime/react.ts`, `packages/entities/src/runtime/access.ts`, `packages/entities/src/runtime/snapshot.ts`, `packages/entities/src/runtime/state.ts`, `packages/entities/src/runtime/storage.ts`, `packages/entities/package.json`, `packages/entities/tsup.config.ts`, `tsconfig.paths.json`, `packages/react/src/hydrationOverlay.ts`, `packages/react/src/FSMHydrationBoundary.tsx`, `packages/react/src/FSMProvider.tsx`, `packages/react/src/index.ts`, `tests/react/entities.test.tsx`, `tests/entities/entities-plugin.test.ts`, `tests/types/entities-api.tst.ts`, `tests/types/react-api.tst.tsx`, `tests/types/regression-matrix.tst.ts`, `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`, `packages/entities/README.md`, `packages/react/README.md`.
- Ключевые контракты: `@lite-fsm/entities/react` экспортирует `useEntitySnapshot`, `useEntityCount`, `useEntityList` и typed aliases; hooks читают manager из `@lite-fsm/react`, возвращают serializable row/list/count snapshots, не раскрывают column arrays или `EntityIndex`, используют stable row/list caches и `snapshot.storage.entity` preview через `useStorageHydrationPreview("entity")`; nested `FSMHydrationBoundary` наследует или заменяет raw storage preview по storage kind; `@lite-fsm/react` не импортирует entity hooks, а main `@lite-fsm/entities` не импортирует React runtime.
- Проверки: `pnpm exec vitest run tests/react/entities.test.tsx tests/react/hydration.test.tsx tests/react/hooks.test.tsx tests/entities/entities-plugin.test.ts --reporter=dot` — pass, 4 files/185 tests; `pnpm exec tstyche tests/types/entities-api.tst.ts tests/types/react-api.tst.tsx tests/types/exports-surface.tst.ts tests/types/regression-matrix.tst.ts` — pass, 4 files/97 tests/199 assertions; `pnpm --filter @lite-fsm/entities run check-types` — pass; `pnpm --filter @lite-fsm/react run check-types` — pass; `pnpm exec vitest run tests/react/entities.test.tsx tests/react/hydration.test.tsx tests/react/hooks.test.tsx tests/react/persist.test.tsx tests/entities/entities-plugin.test.ts --coverage ...` — pass, 5 files/215 tests, 100% statements/branches/functions/lines for changed React/entity hook bridge files; `pnpm --filter @lite-fsm/react run build` — pass; `pnpm --filter @lite-fsm/entities run build` — pass after sequential rerun; `pnpm run check-types` — pass, 44 type files/490 tests/1113 assertions; `pnpm run lint` — pass; `git diff --check` — pass; source audit по import boundaries — no `@lite-fsm/entities/react` imports in `@lite-fsm/react`, no React imports in main `@lite-fsm/entities` runtime path.
- Coverage: focused changed files — 100% (`991/991`, `430/430`, `200/200`, `851/851`).
- Риски: docs build и запрещенные build-команды не запускались; первая параллельная попытка build `@lite-fsm/entities` упала из-за одновременной очистки `@lite-fsm/react/dist`, последовательный build обоих пакетов прошел.
- Следующее действие: новый dispatch этапа 13.

### Этап 13 — Benchmarks, README/examples

Статус: `not started`

Записи:

- Записей пока нет.

### Этап 14 — Рефакторинг, чистка и полировка

Статус: `not started`

Записи:

- Записей пока нет.

### Этап 15 — Финальная проверка `ecs_example`

Статус: `not started`

Записи:

- Записей пока нет.

## Финальная проверка

- Статус: `not started`
- Записи: нет.
