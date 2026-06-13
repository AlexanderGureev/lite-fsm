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
- Активный этап: все этапы 8-15 завершены
- Статус: `done`
- Следующее действие: performance budgets этапа 13 закрыть отдельным ТЗ.

## Сводка по этапам

| Этап | Название                                                            | Статус        | Последнее обновление |
| ---- | ------------------------------------------------------------------- | ------------- | -------------------- |
| 8    | Despawn, `despawnOn` и lifecycle cleanup                            | `done`        | 2026-06-13           |
| 9    | Entity effects, entity-specific helpers и core transition helpers   | `done`        | 2026-06-13           |
| 10   | Reactions и reaction error semantics                                | `done`        | 2026-06-13           |
| 11   | Snapshot/hydrate через `snapshot.storage.entity`                    | `done`        | 2026-06-13           |
| 12   | React hooks: `useEntitySnapshot`, `useEntityCount`, `useEntityList` | `done`        | 2026-06-13           |
| 13   | Benchmarks, README/examples                                         | `done`        | 2026-06-14           |
| 14   | Рефакторинг, чистка и полировка                                     | `done`        | 2026-06-14           |
| 15   | Финальная проверка `ecs_example`                                    | `done`        | 2026-06-14           |

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

Статус: `done`

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

Статус: `done`

Записи:

### 2026-06-14 — Этап 13 dispatch

- Статус: `in progress`.
- Исполнитель: `019ec31d-a874-7633-975d-0aea869d3eca`.
- Corrective: `0/3`.
- Baseline: рабочее дерево чистое; `git status --short`, `git diff` и `git diff --staged` без вывода.
- Active scope: benchmark fixtures/scripts для `@lite-fsm/entities`, package README/examples и package docs, `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`, тесты или fixture checks для README/examples, точечные изменения `package.json`/workspace scripts без docs build.
- Out of scope: runtime behavior, public API/types, docs pages в `apps/docs`, DevTools UI, editor prefab UI, graph visualizer UI, public `manager.spawn(...)`, public routing по `actorId` к entity rows, docs build и любые команды, которые транзитивно запускают docs build.
- Следующее действие: передать исполнителю brief этапа 13.

### 2026-06-14 — Этап 13 done с performance deferral

- Статус: `done`.
- Исполнитель: `019ec31d-a874-7633-975d-0aea869d3eca`.
- Corrective: `0/3`.
- Baseline: рабочее дерево до dispatch было чистым; stage-owned delta добавляет benchmark scripts, package example, performance report, README/cheatsheet updates и example fixture test. Orchestrator-owned delta журнала не входит в stage-owned delta.
- Scope: `tests/bench/entities/*`, `packages/entities/examples/composition-lite-fsm-entities.ts`, `packages/entities/PERFORMANCE.md`, `tests/entities/entities-examples.test.ts`, `packages/entities/README.md`, `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`, `package.json`, `packages/entities/package.json`.
- Ключевые контракты: добавлены `pnpm run bench:entities` и `pnpm run bench:entities:browser`; benchmark `composition-lite-fsm-entities` измеряет movement update, projectile lifetime update, `despawnOn` cleanup и sprite sync reaction на `10k`/`50k` rows, печатает median/p95 после `5` warmup и `30` measured iterations, использует production `dist` entrypoints и Node allocation guard. README/example закрепляют spawn events, `groupTag`, descriptors, `entitiesPlugin({ spawn })`, root `manager.entities` и scoped `entities` в reactions без `manager.spawn(...)` и public `actorId` routing.
- Проверки: `pnpm exec vitest run tests/entities/entities-examples.test.ts --reporter=dot` — pass, 2 tests; `pnpm exec tsc --ignoreConfig --noEmit --moduleResolution bundler --module ESNext --target ES2022 --strict --skipLibCheck --types node,vitest --allowSyntheticDefaultImports packages/entities/examples/composition-lite-fsm-entities.ts` — pass; `pnpm exec tstyche tests/types/entities-api.tst.ts` — pass, 32 tests/91 assertions; `pnpm --filter @lite-fsm/entities run check-types` — pass; `pnpm run check-types` — pass по отчету исполнителя; `pnpm run lint` — pass; `git diff --check` — pass.
- Benchmark gate: `pnpm run bench:entities` и `pnpm run bench:entities:browser` запускаются и печатают p95, но падают по hard median ratio budgets: Node ratios от `4.80x` до `79.53x`, browser ratios от `3.19x` до `70.00x` при budget `1.5x` reducer-only и `2x` full-pipeline; Node allocation guard прошел (`0 bytes` retained growth). По решению пользователя от 2026-06-14 этот performance blocker не блокирует этапы 14-15 и выносится в отдельное ТЗ.
- Coverage: для production runtime не применимо, runtime behavior/source не менялись; package example покрыт focused fixture test.
- Риски: performance budgets этапа 13 не выполнены и должны быть закрыты отдельным performance ТЗ до строгого release gate; docs build и запрещенные build-команды не запускались.
- Следующее действие: новый dispatch этапа 14.

### Этап 14 — Рефакторинг, чистка и полировка

Статус: `done`

Записи:

### 2026-06-14 — Этап 14 dispatch

- Статус: `in progress`.
- Исполнитель: `019ec33a-ed95-79a1-9867-c589a7e5a8c6`.
- Corrective: `0/3`.
- Baseline: accepted delta этапов 8-13 и журнал присутствуют в рабочем дереве; staged diff отсутствует. Текущий diff включает entity lifecycle/effects/reactions/snapshot/react runtime, benchmark scripts, package example/docs, performance report и orchestrator-owned записи журнала. Untracked stage-owned файлы этапа 13: `packages/entities/PERFORMANCE.md`, `packages/entities/examples/`, `tests/bench/entities/`, `tests/entities/entities-examples.test.ts`.
- Active scope: `packages/entities/src`, `packages/entities/examples`, `tests/bench/entities`, `tests/entities`, `tests/react`, `tests/types`, `packages/entities/README.md`, `packages/entities/PERFORMANCE.md`, `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`, точечные package/script/docs cleanup changes.
- Out of scope: public API/types changes, storage snapshot format, React hook signatures, routing semantics, benchmark thresholds, runtime behavior changes, docs pages в `apps/docs`, DevTools UI, graph UI, editor prefab UI, docs build и любые команды, которые транзитивно запускают docs build.
- Следующее действие: передать исполнителю brief этапа 14.

### 2026-06-14 — Этап 14 done

- Статус: `done`.
- Исполнитель: `019ec33a-ed95-79a1-9867-c589a7e5a8c6`.
- Corrective: `0/3`.
- Baseline: принятая дельта этапов 8-13 была исходным состоянием; stage-owned delta этапа 14 переносит общий scoped `self`/captured-scope liveness helper в `packages/entities/src/runtime/access.ts` и уточняет README/performance wording без изменения public API, runtime behavior, snapshot format, React hook signatures, routing semantics или benchmark thresholds.
- Scope: `packages/entities/src/runtime/access.ts`, `packages/entities/src/runtime/effects.ts`, `packages/entities/src/runtime/reactions.ts`, `packages/entities/README.md`, `packages/entities/PERFORMANCE.md`.
- Ключевые контракты: `runtime/access.ts` стал единым владельцем scoped `self` и captured-scope liveness для effects/reactions; README quick-start не содержит circular typed-wrapper snippet; performance report явно фиксирует accepted deferral без изменения failed benchmark statuses; benchmark `console.log/error` оставлен как CLI report/progress output.
- Проверки: `pnpm exec vitest run tests/entities/entities-plugin.test.ts --reporter=dot` — pass, 114 tests; `pnpm exec vitest run tests/entities/entities-plugin.test.ts --coverage '--coverage.include=packages/entities/src/runtime/access.ts' '--coverage.include=packages/entities/src/runtime/effects.ts' '--coverage.include=packages/entities/src/runtime/reactions.ts'` — pass, 100% statements/branches/functions/lines (`225/225`, `93/93`, `57/57`, `194/194`); `pnpm exec vitest run tests/entities/entities-examples.test.ts --reporter=dot` — pass, 2 tests; `pnpm exec tstyche tests/types/entities-api.tst.ts` — pass, 32 tests/91 assertions; `pnpm --filter @lite-fsm/entities run check-types` — pass; `pnpm exec tsc --ignoreConfig --noEmit --moduleResolution bundler --module ESNext --target ES2022 --strict --skipLibCheck --types node,vitest --allowSyntheticDefaultImports packages/entities/examples/composition-lite-fsm-entities.ts` — pass; `pnpm run check-types` — pass, 44 type files/490 tests/1113 assertions; `pnpm run lint` — pass; `git diff --check` — pass.
- Source audit: `rg -n "ctx\\.storage|storage\\.register|PluginInstallContext|PluginCapabilities|StorageRuntimeBase|public spawn intercept|spawn .*intercept|generic action interceptors" packages/entities packages/react tests spec` — только historical specs, core regression tests и `ctx.storageKind` false positives в type tests; active `packages/entities`/`packages/react` source hits отсутствуют.
- Coverage: touched runtime files — 100%.
- Риски: stage 13 performance budgets остаются deferred отдельному ТЗ по решению пользователя; docs build и запрещенные build-команды не запускались.
- Следующее действие: новый dispatch этапа 15.

### Этап 15 — Финальная проверка `ecs_example`

Статус: `done`

Записи:

### 2026-06-14 — Этап 15 dispatch

- Статус: `in progress`.
- Исполнитель: `019ec342-1509-77c3-ac49-578f7a72d5c9`.
- Corrective: `0/3`.
- Baseline: принятая дельта этапов 8-14 и журнал присутствуют в рабочем дереве; staged diff отсутствует. Текущий diff включает entity runtime/docs/bench/example updates, cleanup scoped-access helper и orchestrator-owned записи журнала. Untracked accepted files: `packages/entities/PERFORMANCE.md`, `packages/entities/examples/`, `tests/bench/entities/`, `tests/entities/entities-examples.test.ts`.
- Active scope: `ecs_example/**`, focused smoke test для `runEcsExample()` в `tests/entities` или ближайшем test scope, минимальные package/test config изменения только если нужны для запуска smoke test.
- Out of scope: runtime implementation, public API/types, storage snapshot format, React hooks, benchmark thresholds, docs snippets, compatibility shims только для `ecs_example`, docs build и любые команды, которые транзитивно запускают docs build.
- Следующее действие: передать исполнителю brief этапа 15.

### 2026-06-14 — Этап 15 done

- Статус: `done`.
- Исполнитель: `019ec342-1509-77c3-ac49-578f7a72d5c9`.
- Corrective: `0/3`.
- Baseline: принятая дельта этапов 8-14 была исходным состоянием; stage-owned delta этапа 15 обновляет `ecs_example` под финальный public API и добавляет focused smoke test без изменений runtime implementation, public API/types, snapshot format, React hooks, benchmark thresholds или docs snippets.
- Scope: `ecs_example/**`, `tests/entities/ecs-example-final-gate.test.ts`.
- Ключевые контракты: `ecs_example/store` использует public entrypoints `@lite-fsm/core`, `@lite-fsm/entities`, `@lite-fsm/entities/react`, `@lite-fsm/middleware/immer`, `@lite-fsm/persist` и `@lite-fsm/react`; пример содержит `worldMachine`, `blinkActor`, `enemyActor` и `enemySpriteActor`; public spawn идет через `manager.transition({ type: "SPAWN_ENEMY" })`; entity routing проверяется через `meta.entityId`, group routing через `meta.groupTag`; `manager.entities.get("enemyActor")`, `dehydrate()`, `getHydratedState(...)`, `hydrate(...)` и persist save/restore loop покрыты smoke test.
- Проверки: `pnpm exec tsc --noEmit -p ecs_example/tsconfig.json` — pass; `pnpm exec vitest run tests/entities/ecs-example-final-gate.test.ts --reporter=dot` — pass, 1 test; `pnpm exec eslint ecs_example` — pass; `git diff --check` — pass; audit `rg -n "@ts-nocheck|as any|manager\\.spawn|actorId|@lite-fsm/core/|packages/entities/src|runtime/" ecs_example tests/entities/ecs-example-final-gate.test.ts` — no matches; audit legacy draft APIs `rg -n "columnar|defineSpawnConfig|defineSpawnRecipes|storageHandlers|contextSchema|manager\\.spawn|@ts-nocheck|as any|actorId|@lite-fsm/core/columnar|private|internal" ecs_example tests/entities/ecs-example-final-gate.test.ts` — no matches.
- Coverage: не применимо для production runtime, этап менял executable example и focused integration smoke.
- Риски: stage 13 performance budgets остаются deferred отдельному ТЗ по решению пользователя; docs build и запрещенные build-команды не запускались.
- Следующее действие: финальный readiness gate.

## Финальная проверка

- Статус: `done`

### 2026-06-14 — Final readiness gate

- Статус: `done` с явно принятым performance deferral.
- Traceability: этапы 8-15 имеют статус `done`, уникальные executor-id, baseline, stage-owned delta, corrective counters и результаты проверок в журнале.
- Scope итоговой проверки: entity runtime/effects/reactions cleanup, React hooks regressions, snapshot/hydrate regressions через `entities-plugin` tests, package example/docs, benchmark scripts/report, `ecs_example` final gate, public type surface, lint/source audits.
- Проверки: `pnpm run test` — pass, 102 files passed/2 skipped, 1443 tests passed/14 skipped; skipped tests находятся в existing stress/GC helpers, не в active scope и не добавлялись этим ТЗ. `pnpm run check-types` — pass, 44 type files/490 tests/1113 assertions. `pnpm exec vitest run tests/entities/entities-plugin.test.ts tests/entities/entities-examples.test.ts tests/entities/ecs-example-final-gate.test.ts tests/react/entities.test.tsx tests/react/hydration.test.tsx tests/react/hooks.test.tsx --reporter=dot` — pass, 6 files/188 tests. `pnpm exec vitest run tests/entities/entities-plugin.test.ts --coverage '--coverage.include=packages/entities/src/runtime/access.ts' '--coverage.include=packages/entities/src/runtime/effects.ts' '--coverage.include=packages/entities/src/runtime/reactions.ts'` — pass, touched runtime files 100% statements/branches/functions/lines (`225/225`, `93/93`, `57/57`, `194/194`). `pnpm exec tsc --noEmit -p ecs_example/tsconfig.json` — pass. `pnpm exec vitest run tests/entities/ecs-example-final-gate.test.ts --reporter=dot` — pass, 1 test. `pnpm run lint` — pass. `git diff --check` — pass.
- Source audits: no active-scope `test.only`, temporary `test.skip`, TODO/FIXME, `not implemented`, `debugger`, old `columnar` draft APIs, `manager.spawn(...)`, public `actorId` routing, `as any`, `@ts-nocheck`, private entity imports, or `@lite-fsm/entities/react` imports from `@lite-fsm/react`. Remaining `console.*` hits are public examples/error handlers and benchmark CLI output; remaining legacy plugin audit hits are historical specs, core regression tests and `ctx.storageKind` false positives, not active entity/react source.
- Benchmark status: `pnpm run bench:entities` и `pnpm run bench:entities:browser` are implemented and were run during stage 13; both print median/p95 and fail hard median ratio budgets. Node allocation guard passed. По решению пользователя от 2026-06-14 этот performance blocker вынесен в отдельное ТЗ и не блокирует завершение этапов 14-15 или текущий readiness record.
- Build/docs: forbidden commands `pnpm run build`, docs build commands, pages build commands and `next build` inside `apps/docs` were not run. Docs build remains delegated to user/CI if needed.
- Residual risks: performance budgets from stage 13 remain open for a separate performance ТЗ before a strict release gate; no other known runtime/type/lint/source-audit blockers remain.
