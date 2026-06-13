# Журнал реализации ТЗ Entities, часть 1

ТЗ: `[tz-entities-implementation.md](./tz-entities-implementation.md)`

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
- Активный этап: Финальная readiness gate части 1
- Статус: `done`
- Следующее действие: часть 1 завершена; для продолжения использовать `spec/tz-entities-implementation-part-2.md`.

## Сводка по этапам


| Этап | Название                                                                                                   | Статус        | Последнее обновление |
| ---- | ---------------------------------------------------------------------------------------------------------- | ------------- | -------------------- |
| 1    | Пакет `@lite-fsm/entities`, exports, plugin shell и `storage: "entity"` storage definition                 | `done`        | 2026-06-13           |
| 2    | Schema descriptors и `EntityMachineExtension`                                                              | `done`        | 2026-06-13           |
| 3    | Compile metadata, empty `EntityStore`, `ColumnarActorStore`, public lightweight state и `manager.entities` | `done`        | 2026-06-13           |
| 4    | Entity lifecycle events, `__INIT` и запрет public lifecycle dispatch                                       | `done`        | 2026-06-13           |
| 5    | Spawn events, entity spawn и public spawn staging hook                                                     | `done`        | 2026-06-13           |
| 6    | Columnar reduce pipeline, numeric event/state codes, buckets, routing и hot path guarantees                | `done`        | 2026-06-13           |
| 7    | Рефакторинг, чистка и полировка части 1                                                                    | `done`        | 2026-06-13           |


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

### 2026-06-13 — Этап 4 dispatch

- Статус: `in progress`.
- Исполнитель: `019ec214-c574-7b51-8aae-98e8aea0e3f7`.
- Corrective: `0/3`.
- Baseline: перед dispatch в рабочем дереве был только unstaged diff журнала `spec/tz-entities-implementation-log.md` (markdown-ссылка ТЗ обернута как inline-code, добавлены пустые строки); staged diff отсутствовал.
- Active scope: `packages/entities/src/machine-extension.ts`, `packages/entities/src/plugin.ts`, `packages/entities/src/index.ts`, возможный новый `packages/entities/src/runtime/lifecycle.ts` или локальный runtime helper для lifecycle names, runtime/type tests этапа 4, `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`, `packages/entities/README.md`.
- Out of scope: `defineSpawnEvents`, `spawnEvent`, `SpawnEventsFrom`, `defineEntitySpawn`, public spawn events, spawn transaction, `payloadFor(entity)`, `despawnOn`, `transition.despawn(...)`, reactions, snapshot/hydrate, React hooks, benchmarks и entity-specific hardcode в `@lite-fsm/core`.
- Следующее действие: передать исполнителю brief этапа 4.

### 2026-06-13 — Этап 4 done

- Статус: `done`.
- Исполнитель: `019ec214-c574-7b51-8aae-98e8aea0e3f7`.
- Baseline: сохранен baseline dispatch; stage-owned delta не включает предшествующую markdown-правку журнала.
- Corrective: `0/3`.
- Scope: `packages/entities/src/runtime/lifecycle.ts`, `packages/entities/src/machine-extension.ts`, `packages/entities/src/plugin.ts`, `packages/entities/src/index.ts`, `tests/entities/entities-plugin.test.ts`, `tests/types/entities-api.tst.ts`, `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`, `packages/entities/README.md`.
- Ключевые контракты: добавлен `LiteFsmEntityLifecycleEvents`; `EntityMachineExtension.internalEvents` делает lifecycle events доступными entity config/reducer surface; public dispatch `ENTITY_SPAWNED`/`ENTITY_DESPAWNED` запрещен до delivery и после plugin intercept replacement; entity `__INIT` допускает только `ENTITY_SPAWNED`; `storage: "instance"` custom `__INIT` не изменен; `@lite-fsm/core` не изменялся и не содержит entity lifecycle hardcode.
- Проверки: `pnpm exec vitest run tests/entities/entities-plugin.test.ts` — pass, 39 tests; `pnpm exec tstyche tests/types/entities-api.tst.ts` — pass, 14 tests; `pnpm --filter @lite-fsm/entities check-types` — pass; `pnpm run test:types` — pass, 44 files/471 tests/1038 assertions; `pnpm --filter @lite-fsm/entities build` — pass; `pnpm exec vitest run tests/core/storage-runtime-dispatch-pipeline.test.ts tests/core/plugin-system-stage1.test.ts` — pass, 60 tests; `pnpm run check-types` — pass; `git diff --check` — pass; source audit по no-hacks и core lifecycle/entity hits — no hits.
- Coverage: changed runtime scope `packages/entities/src/plugin.ts` и `packages/entities/src/runtime/lifecycle.ts` — 100% statements/branches/functions/lines. Full package include additionally reports an unchanged pre-existing branch gap in `packages/entities/src/runtime/state.ts:196`, outside stage 4 delta.
- Риски: TypeScript-level запрет custom `__INIT` edge не реализован, потому что текущий core `internalEvents` добавляет events в общий storage machine union; runtime validation является источником истины по ТЗ. Docs build не запускался по запрету.
- Следующее действие: новый dispatch этапа 5.

### 2026-06-13 — Этап 5 dispatch

- Статус: `in progress`.
- Исполнитель: `019ec220-dda1-7303-b178-b90845cd14bd`.
- Corrective: `0/3`.
- Baseline: stage 1-4 delta и журнал присутствуют в рабочем дереве; staged diff отсутствует. Текущий unstaged scope: `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`, `packages/entities/README.md`, `packages/entities/src/index.ts`, `packages/entities/src/machine-extension.ts`, `packages/entities/src/plugin.ts`, `packages/entities/src/runtime/lifecycle.ts`, `tests/entities/entities-plugin.test.ts`, `tests/types/entities-api.tst.ts`, `spec/tz-entities-implementation-log.md`.
- Active scope: `packages/entities/src/spawn.ts`, `packages/entities/src/runtime/transaction.ts`, `packages/entities/src/runtime/reduce.ts`, точечные изменения `packages/entities/src/runtime/state.ts`, `packages/entities/src/runtime/lifecycle.ts`, `packages/entities/src/plugin.ts`, `packages/entities/src/machine-extension.ts`, `packages/entities/src/index.ts`, runtime/type tests этапа 5, `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`, `packages/entities/README.md`.
- Out of scope: columnar performance optimizations этапа 6, routing hot path, `despawnOn`, `transition.despawn(...)`, entity effects, reactions, snapshot/hydrate, React hooks, benchmarks и entity-specific hardcode в `@lite-fsm/core`.
- Следующее действие: передать исполнителю brief этапа 5.

### 2026-06-13 — Этап 5 review corrective 1

- Статус: `in progress`.
- Исполнитель: `019ec220-dda1-7303-b178-b90845cd14bd`.
- Corrective: `1/3`.
- Review verdict: `return_to_subagent`.
- Замечания: contextual reducer type contract не закрыт — tests проверяют exported `EntityReducerContext`, но не `createMachine(... reducer(_, _, meta) ...)`; допускается только generic core type resolver fix без entity hardcode, если entities-local workaround невозможен. Runtime spawn lifecycle мутирует live rows до завершения `ENTITY_SPAWNED` reducer/validation, поэтому reducer-time errors могут оставить partially spawned rows; добавить rollback/atomicity tests. Дополнить type traceability для missing/unknown recipe keys, если текущие mapped types это уже поддерживают.
- Следующее действие: исполнитель вносит corrective fix, перезапускает focused runtime/type/coverage/build checks и возвращает `ready_for_review` или подтвержденный `blocked`.

### 2026-06-13 — Этап 5 review corrective 2

- Статус: `in progress`.
- Исполнитель: `019ec220-dda1-7303-b178-b90845cd14bd`.
- Corrective: `2/3`.
- Review verdict: `return_to_subagent`.
- Замечания: `entitiesPlugin<AppDeps>({ spawn })` из общего контракта больше не типизируется, потому что overload с одним generic трактует его как `Spawn`; нужен overload, который сохраняет AppDeps generic и продолжает выводить spawn events из value. Проверить, что `StorageDependentField` не становится слишком broad structural match для обычных object fields; при необходимости сделать marker nominal/required и сохранить существующие plugin-system type tests. Дополнительно закрыть atomicity для ошибки в public spawn event reducer того же dispatch, если она оставляет newly spawned rows после thrown transition.
- Следующее действие: исполнитель вносит точечный API/type corrective, перезапускает focused checks и возвращает `ready_for_review` или подтвержденный `blocked`.

### 2026-06-13 — Этап 5 done

- Статус: `done`.
- Исполнитель: `019ec220-dda1-7303-b178-b90845cd14bd`.
- Baseline: stage 1-4 delta и журнал были исходным состоянием; stage-owned delta добавляет spawn API/runtime, generic core type resolver и spec contract correction.
- Corrective: `2/3`.
- Scope: `packages/entities/src/spawn.ts`, `packages/entities/src/runtime/transaction.ts`, `packages/entities/src/runtime/reduce.ts`, `packages/entities/src/runtime/state.ts`, `packages/entities/src/plugin.ts`, `packages/entities/src/machine-extension.ts`, `packages/entities/src/index.ts`, `packages/entities/README.md`, `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`, `tests/entities/entities-plugin.test.ts`, `tests/types/entities-api.tst.ts`, `tests/types/create-machine-dependent-storage.tst.ts`, `packages/core/src/createMachine.types.ts`, `packages/core/src/pluginStorageTypes.ts`, `packages/core/src/index.ts`, `spec/tz-entities-implementation.md`, `spec/tz-entities-implementation-part-2.md`.
- Ключевые контракты: добавлены `defineSpawnEvents`, `spawnEvent`, `SpawnEventsFrom`, `defineEntitySpawn`, `entitiesPlugin({ spawn })`; public spawn events типизируют `manager.transition(...)`; spawn recipes stage-ятся в `hooks.beforeReduce` по финальному action; entity rows создаются через internal `ENTITY_SPAWNED`; reducer получает `self` и `payloadFor(entity)`; payload/spec validation и reducer-time spawn dispatch errors откатывают staged spawn mutations; public lifecycle dispatch остается запрещен.
- Contract correction: `entitiesPlugin<AppDeps>({ spawn })` не поддерживается как shorthand из-за ограничения TypeScript partial type argument inference; для точного вывода spawn events runtime manager использует `entitiesPlugin({ spawn })`, а `entitiesPlugin<AppDeps>()` остается источником типизации для wrappers/deps.
- Core type support: добавлены generic `StorageDependentField`/`StorageDependentTypeLambda` без entity-specific hardcode; marker nominal/required, fixed object extension fields покрыты regression type test.
- Проверки: `pnpm exec vitest run tests/entities/entities-plugin.test.ts` — pass, 62 tests; `pnpm exec tstyche tests/types/entities-api.tst.ts tests/types/create-machine-dependent-storage.tst.ts tests/types/create-machine-entity-proof.tst.ts` — pass, 25 tests/73 assertions; `pnpm --filter @lite-fsm/entities check-types` — pass; `pnpm run test:types` — pass, 44 files/477 tests/1061 assertions; `pnpm run check-types` — pass; `pnpm exec vitest run tests/entities/entities-plugin.test.ts --coverage '--coverage.include=packages/entities/src/**/*.ts'` — pass, 100% statements/branches/functions/lines; `pnpm exec vitest run tests/core/storage-runtime-dispatch-pipeline.test.ts tests/core/plugin-system-stage1.test.ts` — pass, 60 tests; serial `pnpm --filter @lite-fsm/core build` — pass; serial `pnpm --filter @lite-fsm/entities build` — pass; `git diff --check` — pass; no-hacks/core hardcode audit — only spec policy text hits.
- Риски: docs build не запускался по запрету; core/entities package builds regenerated ignored `dist`.
- Следующее действие: новый dispatch этапа 6.

## Финальная проверка

- Статус: `done`
- Последнее обновление: 2026-06-13

### 2026-06-13 — Финальная readiness gate части 1

- Статус: `done`.
- Scope: integrated result этапов 1-7 для `@lite-fsm/entities`, public docs/cheatsheets и затронутые core routeMeta regressions.
- Traceability: этапы 1-7 в сводке имеют статус `done`; cleanup/refactor этап выполнен после stage gate этапа 6; у этапов есть executor-id, baseline и stage-owned delta в журнале. Исторический `Этап 3 blocked` закрыт последующей contract correction и статусом `done`.
- Проверки: `pnpm run test` — pass, 99 files/1384 tests, 2 files/14 tests skipped из существующего suite; `pnpm run check-types` — pass, 7 packages + `tsconfig.test.json` + 44 Tstyche files/479 tests/1072 assertions; `pnpm run lint` — pass; `pnpm exec vitest run tests/entities/entities-plugin.test.ts --coverage '--coverage.include=packages/entities/src/**/*.ts'` — pass, 80 tests, 100% coverage; `pnpm exec tstyche tests/types/entities-api.tst.ts` — pass, 22 tests/55 assertions; `pnpm exec vitest run tests/core/routing-registry.test.ts tests/core/plugin-system-stage5.test.ts tests/core/plugin-system-stage8.test.ts` — pass, 38 tests; `git diff --check` — pass.
- Coverage: focused `packages/entities/src/**/*.ts` — 100% statements/branches/functions/lines (`873/873`, `363/363`, `181/181`, `760/760`). Full coverage не запускался как финальный gate, потому что ТЗ требует 100% для нового/измененного scope.
- Audits: active entity scope не содержит `TODO/FIXME`, `test.only`, временных `test.skip`, `not implemented`, debug logging, temporary/workaround/hardcode markers; `packages/core/src` не импортирует `@lite-fsm/entities` и не содержит entity-specific hardcode hits; `packages/entities/src/runtime/routing.ts` не содержит `new Set(indices)`, `metadata.config`, `getEntityStateName` или `Map.get`; exact legacy plugin audit содержит только expected historical/spec/test registry hits вне active entity scope.
- Docs/API: `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md` и `packages/entities/README.md` отражают public API и types этапов 1-6; `@lite-fsm/entities/react` остается не опубликован до будущего React этапа.
- Запрещенные команды: docs build, `pnpm run build`, `pnpm run verify:release`, pages build и `next build` внутри `apps/docs` агентом не запускались.
- Residual risks: package build/dist и docs build не проверялись по запрету/границе ТЗ; переход к этапу 8 должен использовать `spec/tz-entities-implementation-part-2.md`.

### 2026-06-13 — Корректирующее ТЗ перед этапом 6

- Статус: `done`.
- Scope: `spec/tz-entities-plugin-source-api-correction.md` исправляет public API `@lite-fsm/entities` после этапа 5 и до начала этапа 6.
- Причина: старый bootstrap через `entitiesPlugin<AppDeps>()` должен быть заменен на type-only source `EntitiesPlugin<AppDeps>` для `TypedCreateMachineFn`, а runtime manager должен использовать `entitiesPlugin({ spawn })`.
- Итог: `EntitiesPlugin<AppDeps>` стал documented type-only source, runtime `entitiesPlugin(...)` не переносит dependency type, docs/cheatsheets/specs синхронизированы.
- Проверки: финальный gate корректирующего ТЗ пройден; docs build не запускался по запрету.
- Следующее действие: можно начинать основной этап 6.

### 2026-06-13 — Этап 6 dispatch

- Статус: `in progress`.
- Исполнитель: `019ec28d-3a31-7290-88e0-de1280752090`.
- Corrective: `0/3`.
- Baseline: рабочее дерево чистое; unstaged и staged diff отсутствуют.
- Active scope: `packages/entities/src/runtime/compile.ts`, `packages/entities/src/runtime/state.ts`, `packages/entities/src/runtime/routing.ts`, `packages/entities/src/runtime/reduce.ts`, `packages/entities/src/runtime/transaction.ts`, `packages/entities/src/runtime/storage.ts`, точечные изменения `packages/entities/src/plugin.ts`, `packages/entities/src/machine-extension.ts`, runtime/type/performance tests этапа 6, `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`, `packages/entities/README.md`.
- Out of scope: `despawnOn`, entity effects, reactions, snapshot/hydrate, React hooks, public `manager.spawn(...)`, public `manager.despawn(...)`, benchmarks acceptance этапа 13 и entity-specific hardcode в `@lite-fsm/core`.
- Следующее действие: передать исполнителю brief этапа 6.

### 2026-06-13 — Этап 6 review corrective 1

- Статус: `in progress`.
- Исполнитель: `019ec28d-3a31-7290-88e0-de1280752090`.
- Corrective: `1/3`.
- Review verdict: `return_to_subagent`.
- Замечания: steady-state reducer context создает `new Set(indices)` для `payloadFor` даже вне `ENTITY_SPAWNED`, что нарушает hot path no per-row allocations; `entityId`/`groupTag` routing выбирает rows через все templates accepting event, а не через actor rows attached to routed entities/groups, поэтому не закрывает целевую сложность routed dispatch; performance guard не измеряет per-row allocation growth.
- Следующее действие: исполнитель исправляет routing/payloadFor hot path, добавляет focused guards и перезапускает проверки этапа 6.

### 2026-06-13 — Этап 6 verify corrective 2

- Статус: `in progress`.
- Исполнитель: `019ec28d-3a31-7290-88e0-de1280752090`.
- Corrective: `2/3`.
- Verify verdict: `return_to_subagent`.
- Замечания: `pnpm run check-types` падает на новых тестах этапа 6: `tests/entities/entities-plugin.test.ts(2288,20)` из-за слишком узкого `Middleware<any, { type: "PING" }>` без spawn events/plugin meta и `tests/entities/entities-plugin.test.ts(2388,25)` из-за `push` на `readonly EntityIndex[][]`.
- Пройденные проверки до failure: package check-types, focused runtime coverage, focused Tstyche, `pnpm run test:types`, core routeMeta regressions, `git diff --check` и source audits.
- Следующее действие: исполнитель исправляет test typing, перезапускает focused checks и `pnpm run check-types`.

### 2026-06-13 — Этап 6 done

- Статус: `done`.
- Исполнитель: `019ec28d-3a31-7290-88e0-de1280752090`.
- Baseline: рабочее дерево было чистым до dispatch; stage-owned delta добавляет numeric compile metadata, routing/storage modules, sidecar ownership, tests/docs этапа 6; журнал обновлен оркестратором.
- Corrective: `2/3`.
- Scope: `packages/entities/src/runtime/compile.ts`, `packages/entities/src/runtime/storage.ts`, `packages/entities/src/runtime/routing.ts`, `packages/entities/src/runtime/state.ts`, `packages/entities/src/runtime/reduce.ts`, `packages/entities/src/plugin.ts`, `packages/entities/src/machine-extension.ts`, `tests/entities/entities-plugin.test.ts`, `tests/types/entities-api.tst.ts`, `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`, `packages/entities/README.md`.
- Ключевые контракты: `entitiesPlugin()` объявляет `routeMeta.entityId`, entity storage требует `routeMetaKeys: ["entityId"]`; `manager.transition(...)` типизирует `meta.entityId` только при plugin; reduce использует numeric event/state metadata, transition table, state buckets и `config-default`; `self` получил `states`, `presence`, `rowVersion`; routed `entityId`/`groupTag` идет по attached actor rows sidecar, `actorId`/`groupId` не адресуют entity rows; hot `TICK` не создает row-scaled `Set(indices)` и не сканирует unrelated routed templates.
- Проверки: `pnpm --filter @lite-fsm/entities check-types` — pass; `pnpm exec vitest run tests/entities/entities-plugin.test.ts --coverage '--coverage.include=packages/entities/src/**/*.ts'` — pass, 80 tests, 100% coverage; `pnpm exec tstyche tests/types/entities-api.tst.ts` — pass, 22 tests/55 assertions; `pnpm run test:types` — pass, 44 files/479 tests/1072 assertions; `pnpm exec vitest run tests/core/routing-registry.test.ts tests/core/plugin-system-stage5.test.ts tests/core/plugin-system-stage8.test.ts` — pass, 38 tests; `pnpm run check-types` — pass; `git diff --check` — pass; source audits по core entity hardcode, no-hacks и routing hot path — no active hits.
- Coverage: focused `packages/entities/src/**/*.ts` — 100% statements/branches/functions/lines (`876/876`, `365/365`, `181/181`, `763/763`).
- Риски: docs build не запускался по запрету; legacy plugin audit hits остаются только в historical/spec файлах и разрешены cleanup-критерием.
- Следующее действие: новый dispatch этапа 7.

### 2026-06-13 — Этап 7 dispatch

- Статус: `in progress`.
- Исполнитель: `019ec2a7-b91f-7fe0-815b-79a9b029036f`.
- Corrective: `0/3`.
- Baseline: stage 1-6 delta и журнал присутствуют в рабочем дереве; staged diff отсутствует. Текущий tracked scope: `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`, `packages/entities/README.md`, `packages/entities/src/machine-extension.ts`, `packages/entities/src/plugin.ts`, `packages/entities/src/runtime/reduce.ts`, `packages/entities/src/runtime/state.ts`, `tests/entities/entities-plugin.test.ts`, `tests/types/entities-api.tst.ts`, `spec/tz-entities-implementation-log.md`. Untracked stage 6 files: `packages/entities/src/runtime/compile.ts`, `packages/entities/src/runtime/routing.ts`, `packages/entities/src/runtime/storage.ts`.
- Active scope: cleanup/refactor только для файлов и tests/docs, затронутых этапами 1-6; source audits из этапа 7; при необходимости точечная чистка `packages/entities/src/runtime/*`, `packages/entities/src/plugin.ts`, `packages/entities/src/machine-extension.ts`, `tests/entities/entities-plugin.test.ts`, `tests/types/entities-api.tst.ts`, `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`, `packages/entities/README.md`.
- Out of scope: новое поведение, public API/types changes beyond cleanup wording, `despawnOn`, entity effects, reactions, snapshot/hydrate, React hooks, benchmarks, docs build и entity-specific hardcode в `@lite-fsm/core`.
- Следующее действие: передать исполнителю brief этапа 7.

### 2026-06-13 — Этап 7 done

- Статус: `done`.
- Исполнитель: `019ec2a7-b91f-7fe0-815b-79a9b029036f`.
- Baseline: stage 1-6 accepted delta была исходным состоянием; stage-owned delta чистит мертвый/unused код без изменения поведения.
- Corrective: `0/3`.
- Scope: `packages/entities/src/machine-extension.ts`, `packages/entities/src/runtime/state.ts`, `packages/entities/src/runtime/reduce.ts`, `packages/entities/src/runtime/transaction.ts`, `API-CHEATSHEET.md`.
- Cleanup: удалены не root-exported `EntityReducerColumn`, unused/future-only `enteredScratchByState`, unused compatibility alias `RuntimeEntitySpawnSpec`; уточнен docs text про live rows части 1 без future hydrate.
- Проверки: `pnpm exec vitest run tests/entities/entities-plugin.test.ts --coverage '--coverage.include=packages/entities/src/**/*.ts'` — pass, 80 tests, 100% coverage; `pnpm exec tstyche tests/types/entities-api.tst.ts` — pass, 22 tests/55 assertions; `pnpm --filter @lite-fsm/entities check-types` — pass; `pnpm run check-types` — pass; `pnpm run lint` — pass; `pnpm exec vitest run tests/core/routing-registry.test.ts tests/core/plugin-system-stage5.test.ts tests/core/plugin-system-stage8.test.ts` — pass, 38 tests; `git diff --check` — pass; exact cleanup audit — only expected historical/spec/test registry hits outside active entity scope.
- Coverage: focused `packages/entities/src/**/*.ts` — 100% statements/branches/functions/lines (`873/873`, `363/363`, `181/181`, `760/760`).
- Риски: docs build не запускался по запрету; cleanup не менял runtime behavior, public API, error semantics, routing order, transaction atomicity или hot path guarantees.
- Следующее действие: финальная readiness gate части 1.
