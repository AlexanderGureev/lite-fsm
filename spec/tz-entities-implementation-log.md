# Журнал реализации ТЗ Entities, часть 1

ТЗ: [`tz-entities-implementation.md`](./tz-entities-implementation.md)

Цель журнала — восстановить состояние реализации после сжатия контекста. Журнал не заменяет ТЗ и не пересказывает diff.

## Правила ведения

- Перед продолжением работы прочитать ТЗ и этот журнал.
- Продолжать первый этап со статусом не `done`.
- Не переходить к следующему этапу, пока текущий этап не прошел свой `stage gate`.
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

- Активное ТЗ: `spec/tz-entities-implementation.md`
- Активный этап: Этап 4 — Entity lifecycle events, `__INIT` и запрет public lifecycle dispatch
- Статус: `not started`
- Следующее действие: начать этап 4 после review stage 3 diff.

## Сводка по этапам

| Этап | Название                                                                                                   | Статус        | Последнее обновление |
| ---- | ---------------------------------------------------------------------------------------------------------- | ------------- | -------------------- |
| 1    | Пакет `@lite-fsm/entities`, exports, plugin shell и `storage: "entity"` storage definition                 | `done`        | 2026-06-13           |
| 2    | Schema descriptors и `EntityMachineExtension`                                                              | `done`        | 2026-06-13           |
| 3    | Compile metadata, empty `EntityStore`, `ColumnarActorStore`, public lightweight state и `manager.entities` | `done`        | 2026-06-13           |
| 4    | Entity lifecycle events, `__INIT` и запрет public lifecycle dispatch                                       | `not started` | 2026-06-13           |
| 5    | Spawn events, entity spawn и public spawn staging hook                                                     | `not started` | 2026-06-13           |
| 6    | Columnar reduce pipeline, numeric event/state codes, buckets, routing и hot path guarantees                | `not started` | 2026-06-13           |
| 7    | Рефакторинг, чистка и полировка части 1                                                                    | `not started` | 2026-06-13           |

## Ход реализации

### 2026-06-13 — Этап 1 dispatch

- Статус: `in progress`.
- Исполнитель: `019ec19d-8c37-7c53-ac94-6a288dc39db4`.
- Corrective: `0/3`.
- Baseline: рабочее дерево чистое; unstaged и staged diff отсутствуют.
- Active scope: `packages/entities/**`, root `package.json`, `tsconfig.paths.json`, tests для runtime/type/import graph, `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`, package docs.
- Out of scope: `@lite-fsm/core` runtime changes, schema descriptors, spawn API, `EntityMachineExtension`, `manager.entities`, lifecycle, routing, React hooks и benchmarks.
- Следующее действие: передать исполнителю brief этапа 1.

### 2026-06-13 — Этап 1 review corrective 1

- Статус: `in progress`.
- Исполнитель: `019ec19d-8c37-7c53-ac94-6a288dc39db4`.
- Corrective: `1/3`.
- Review verdict: `return_to_subagent`.
- Замечания: `reduceBucket()` shell не должен помечать runtime touched без rows; stage 1 не должен вводить template validation этапа 2 ради проверки propagation.
- Следующее действие: исполнитель вносит точечный fix и перезапускает focused checks.

### 2026-06-13 — Этап 1 review corrective 2

- Статус: `in progress`.
- Исполнитель: `019ec19d-8c37-7c53-ac94-6a288dc39db4`.
- Corrective: `2/3`.
- Review verdict: `return_to_subagent`.
- Замечания: `pnpm-lock.yaml` не отражает новый workspace package и root dependency; coverage ignore на `commit()` требует устранения или явного evidence, что это не active production logic.
- Следующее действие: исполнитель обновляет metadata/coverage evidence и перезапускает focused checks.

### 2026-06-13 — Этап 1 done

- Статус: `done`.
- Исполнитель: `019ec19d-8c37-7c53-ac94-6a288dc39db4`.
- Baseline: рабочее дерево было чистым до dispatch; stage-owned delta добавляет package shell и tests, журнал обновлен оркестратором.
- Corrective: `2/3`.
- Scope: `packages/entities`, root `package.json`, `pnpm-lock.yaml`, `tsconfig.paths.json`, `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`, `tests/entities`, `tests/types/entities-api.tst.ts`.
- Ключевые контракты: `@lite-fsm/entities` публикует `"."` и `"./package.json"`, экспортирует `entitiesPlugin`, `EntityId`, `EntityIndex`, регистрирует storage kind `"entity"` через `defineStorageRuntime().create(...)` и `definePlugin().create(...)`, не добавляет React/spawn/schema/lifecycle/routing APIs.
- Проверки: `pnpm exec vitest run tests/entities/entities-plugin.test.ts` — pass, 11 tests; `pnpm --filter @lite-fsm/entities check-types` — pass; `pnpm run test:types` — pass, 44 files/460 tests/1022 assertions; focused coverage `packages/entities/src/plugin.ts` — 100% statements/branches/functions/lines; `pnpm --filter @lite-fsm/entities build` — pass; `pnpm exec vitest run tests/entities/entities-plugin.test.ts tests/core/plugin-system-stage5.test.ts tests/core/runtime-ownership.test.ts` — pass, 40 tests; `git diff --check` — pass; source audit по future/temporary hits в active scope — no hits.
- Coverage: новый runtime-код этапа покрыт 100%; `commit()` покрыт как обязательный no-op callback через normalized storage value без изменения dispatch semantics, потому что `reduceBucket()` shell возвращает `{ type: "skip" }`.
- Риски: docs build не запускался по запрету; ignored `packages/entities/dist` создан package build и не входит в git status.
- Следующее действие: новый dispatch этапа 2.

### 2026-06-13 — Этап 2 dispatch

- Статус: `in progress`.
- Исполнитель: `019ec1ad-b20f-7d23-84cc-65b1e4f8668f`.
- Corrective: `0/3`.
- Baseline: stage 1 delta и журнал присутствуют в рабочем дереве; staged diff отсутствует; ignored `packages/entities/dist` может быть пересоздан build-командами.
- Active scope: `packages/entities/src/schema.ts`, `packages/entities/src/machine-extension.ts`, точечные изменения `packages/entities/src/plugin.ts` и `packages/entities/src/index.ts`, runtime/type tests этапа 2, `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`, `packages/entities/README.md`.
- Out of scope: lifecycle events, spawn events/API, `manager.entities`, runtime rows/stores, routing, effects, reactions, snapshot/hydrate, React hooks, benchmarks, core runtime changes без доказанного blocker.
- Следующее действие: передать исполнителю brief этапа 2.

### 2026-06-13 — Этап 2 review corrective 1

- Статус: `in progress`.
- Исполнитель: `019ec1ad-b20f-7d23-84cc-65b1e4f8668f`.
- Corrective: `1/3`.
- Review verdict: `return_to_subagent`.
- Замечания: type gate не покрывает unknown descriptor shape как TypeScript error, хотя текущая extension typing позволяет это проверить без core changes.
- Следующее действие: исполнитель добавляет focused type test и перезапускает проверки.

### 2026-06-13 — Этап 2 verify corrective 2

- Статус: `in progress`.
- Исполнитель: `019ec1ad-b20f-7d23-84cc-65b1e4f8668f`.
- Corrective: `2/3`.
- Verify verdict: `return_to_subagent`.
- Замечания: `pnpm --filter @lite-fsm/entities build` падает с `TS4023`, потому что exported `entitiesPlugin()` return type leaks private `descriptorMarker` from `schema.ts`.
- Следующее действие: исполнитель исправляет declaration emit surface без расширения public API и перезапускает checks.

### 2026-06-13 — Этап 2 done

- Статус: `done`.
- Исполнитель: `019ec1ad-b20f-7d23-84cc-65b1e4f8668f`.
- Baseline: stage 1 delta была исходным состоянием; stage-owned delta добавляет schema descriptors, `EntityMachineExtension`, runtime validation и tests/docs этапа 2.
- Corrective: `2/3`.
- Scope: `packages/entities/src/schema.ts`, `packages/entities/src/machine-extension.ts`, `packages/entities/src/plugin.ts`, `packages/entities/src/index.ts`, `tests/entities/entities-plugin.test.ts`, `tests/types/entities-api.tst.ts`, `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`, `packages/entities/README.md`.
- Ключевые контракты: root exports добавили `f32`, `i16`, `i32`, `u8`, `string`, `optional`, `EntityMachineExtension`; entity templates валидируются на init; extension подключается только через plugin source и содержит stage 2 `input`/`resultMetadata` без public state, lifecycle, deps, spawn или routing.
- Проверки: `pnpm exec vitest run tests/entities/entities-plugin.test.ts` — pass, 25 tests; `pnpm --filter @lite-fsm/entities check-types` — pass; `pnpm exec tstyche tests/types/entities-api.tst.ts` — pass, 7 tests; `pnpm run test:types` — pass, 44 files/464 tests/1028 assertions; focused coverage `packages/entities/src/**/*.ts` — 100% statements/branches/functions/lines; `pnpm --filter @lite-fsm/entities build` — pass; `pnpm exec vitest run tests/entities/entities-plugin.test.ts tests/core/plugin-system-stage5.test.ts tests/core/runtime-ownership.test.ts` — pass, 54 tests; `git diff --check` — pass; source audit по future/temporary hits в active scope — no hits.
- Coverage: новый и измененный runtime-код этапа покрыт 100%.
- Риски: unknown descriptor shape проверяется runtime; TypeScript wrapper не отклоняет arbitrary malformed descriptor objects из-за текущей core inference для extension input fields, поэтому type-test пункт засчитан как not possible without core changes. Docs build не запускался по запрету.
- Следующее действие: новый dispatch этапа 3.

### 2026-06-13 — Этап 3 dispatch

- Статус: `in progress`.
- Исполнитель: `019ec1bf-02bd-75f2-a522-b91fd328adfc`.
- Corrective: `0/3`.
- Baseline: stage 1-2 delta и журнал присутствуют в рабочем дереве; staged diff отсутствует; ignored `packages/entities/dist` может быть пересоздан build-командами.
- Active scope: `packages/entities/src/runtime/state.ts`, `packages/entities/src/runtime/access.ts`, точечные изменения `packages/entities/src/machine-extension.ts`, `packages/entities/src/plugin.ts`, `packages/entities/src/index.ts`, runtime/type tests этапа 3, `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`, `packages/entities/README.md`.
- Out of scope: lifecycle events, live rows/spawn, routing, reducers, effects, reactions, snapshot/hydrate, React hooks, benchmarks и core changes без доказанного blocker.
- Следующее действие: передать исполнителю brief этапа 3.

### 2026-06-13 — Этап 3 review corrective 1

- Статус: `in progress`.
- Исполнитель: `019ec1bf-02bd-75f2-a522-b91fd328adfc`.
- Corrective: `1/3`.
- Review verdict: `return_to_subagent`.
- Замечания: core type heuristic для `entityState` не доказан как blocker; phantom metadata field должен быть optional; tests не должны закреплять raw typed arrays как public store view contract.
- Следующее действие: исполнитель исправляет stage-boundary/type surface и перезапускает focused checks.

### 2026-06-13 — Этап 3 review corrective 2

- Статус: `in progress`.
- Исполнитель: `019ec1bf-02bd-75f2-a522-b91fd328adfc`.
- Corrective: `2/3`.
- Review verdict: `return_to_subagent`.
- Замечания: phantom metadata не должен переносить лишнее поле `config`; `EntityAccess.state(...)` должен читать `entityState` metadata напрямую; `entityStateMetadata` должен оставаться type-only marker без runtime coverage ignore, если это возможно.
- Следующее действие: исполнитель сужает metadata surface и перезапускает focused checks.

### 2026-06-13 — Этап 3 review corrective 3

- Статус: `in progress`.
- Исполнитель: `019ec1bf-02bd-75f2-a522-b91fd328adfc`.
- Corrective: `3/3`.
- Review verdict: `return_to_subagent`.
- Замечания: core type diff hardcode-ит `entityState` и импортирует `ActorPublicState`, нарушая границу `@lite-fsm/core` не знает про entity semantics.
- Следующее действие: исполнитель убирает entity-specific core hardcode или возвращает `blocked` с evidence.

### 2026-06-13 — Этап 3 blocked

- Статус: `blocked`.
- Исполнитель: `019ec1bf-02bd-75f2-a522-b91fd328adfc`.
- Corrective: `3/3`.
- Scope: runtime state/access, lightweight public slices и `manager.entities` реализованы частично; core entity-specific hardcode убран.
- Blocker: без entity-specific branch в `packages/core/src/createMachine.types.ts` и без лишнего `config` в phantom metadata `EntityAccess<AppState>` сохраняет keys и columns, но `store.state(entity)` выводится как `undefined` вместо public state union `ActorPublicState<Input["config"]> | undefined`.
- Evidence: `pnpm exec tstyche tests/types/entities-api.tst.ts` падает на assertions `movement.state(entity)` и `name.state(entity)`; `pnpm run test:types` падает только на `tests/types/entities-api.tst.ts`, остальные 43 files проходят.
- Пройденные проверки при blocker: `pnpm --filter @lite-fsm/entities check-types` — pass; `pnpm exec vitest run tests/entities/entities-plugin.test.ts` — pass, 34 tests; focused coverage `packages/entities/src/**/*.ts` — 100%; `pnpm --filter @lite-fsm/entities build` — pass; `git diff --check` — pass.
- Решение требуется: разрешить generic core type-system extension, который поддерживает nested/symbol-keyed dependent `publicState` metadata без entity-specific hardcode, либо скорректировать type contract `store.state(entity)` для этапа 3.

### 2026-06-13 — Этап 3 contract correction

- Статус: `in progress`.
- Решение: type contract этапа 3 скорректирован на `EntityAccess<AppMachines>` / `EntityAccess<typeof machines>`.
- Обоснование: `MachinesState<typeof machines>` является public read model и не должен быть compile-time registry для entity actor templates; `ActorPublicState<Config>` надежно выводится из machine definitions.
- Scope: `packages/entities/src/runtime/access.ts`, `packages/entities/src/plugin.ts`, type tests и package/spec docs; generic resolver-костыль в `packages/core/src/createMachine.types.ts` удален.
- Проверка: `pnpm exec tstyche tests/types/entities-api.tst.ts` — pass, 11 tests.
- Следующее действие: запустить focused runtime/check/build gates этапа 3 и обновить статус.

### 2026-06-13 — Этап 3 done

- Статус: `done`.
- Scope: `packages/entities/src/runtime/state.ts`, `packages/entities/src/runtime/access.ts`, `packages/entities/src/plugin.ts`, `tests/entities/entities-plugin.test.ts`, `tests/types/entities-api.tst.ts`, `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`, `packages/entities/README.md`, `spec/tz-entities-implementation.md`, `spec/tz-entities-implementation-part-2.md`.
- Ключевые контракты: `manager.entities` возвращает stable live root accessor; `EntityAccess<AppMachines>` выводит keys, columns и public state union из `typeof machines`; `MachinesState<typeof machines>` остается lightweight public read model и не используется как registry для entity access.
- Проверки: `pnpm --filter @lite-fsm/entities check-types` — pass; `pnpm exec vitest run tests/entities/entities-plugin.test.ts` — pass, 34 tests; `pnpm exec tstyche tests/types/entities-api.tst.ts` — pass, 11 tests; `pnpm run test:types` — pass, 44 files/468 tests/1036 assertions; `pnpm --filter @lite-fsm/entities build` — pass; focused coverage `packages/entities/src/**/*.ts` — 100% statements/branches/functions/lines; `pnpm exec vitest run tests/entities/entities-plugin.test.ts tests/core/plugin-system-stage5.test.ts tests/core/runtime-ownership.test.ts` — pass, 63 tests; `git diff --check` — pass; source audit по temporary/workaround/hardcode hits в active code scope — no hits.
- Риски: docs build не запускался по запрету; ignored `packages/entities/dist` пересоздан package build и не входит в git status.
- Следующее действие: review stage 3 diff, затем новый dispatch этапа 4.

### 2026-06-13 — Этап 3 post-review critical fixes

- Статус: `done`.
- Scope: `packages/core/src/runtime/kernel/bucketRuntime.ts`, `packages/core/src/runtime/kernel/createMachineManagerFactory.ts`, `packages/entities/src/plugin.ts`, `packages/entities/src/machine-extension.ts`, `tests/core/runtime-ownership.test.ts`, `tests/entities/entities-plugin.test.ts`, `TYPES-CHEATSHEET.md`.
- Fixes: entity storage shell снова возвращает `{ type: "skip" }` без entity transaction; core generic dispatch теперь помечает owner storage bucket touched при external replacement его public slice; phantom metadata `EntityMachinePublicState` переносит только `initialContext` и `spawnSchema`, без `entityState`.
- Архитектурное решение: новых entity-specific hardcode, public markers или store-specialization hooks в `@lite-fsm/core` не добавлено; `EntityAccess<AppMachines>` по-прежнему выводит state union из machine definitions.
- Проверки: `pnpm exec vitest run tests/core/runtime-ownership.test.ts` — pass, 17 tests; `pnpm exec vitest run tests/entities/entities-plugin.test.ts` — pass, 34 tests; `pnpm exec tstyche tests/types/entities-api.tst.ts` — pass, 11 tests; `pnpm --filter @lite-fsm/entities check-types` — pass; `pnpm run check-types` — pass; `pnpm --filter @lite-fsm/entities build` — pass; `pnpm exec vitest run tests/entities/entities-plugin.test.ts tests/core/plugin-system-stage5.test.ts tests/core/runtime-ownership.test.ts tests/core/storage-runtime-dispatch-pipeline.test.ts` — pass, 115 tests; `git diff --check` — pass.
- Риски: docs build не запускался по запрету; ignored `packages/entities/dist` пересоздан package build и не входит в git status.
- Следующее действие: можно начинать этап 4.

## Финальная проверка

- Статус: `not started`
- Записи: нет.
