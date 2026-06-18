# Журнал реализации ТЗ @lite-fsm/entities mass despawn optimization

ТЗ: [`tz-entities-mass-despawn-optimization.md`](./tz-entities-mass-despawn-optimization.md)

Цель журнала — восстановить состояние реализации после сжатия контекста. Журнал не заменяет ТЗ и не пересказывает diff.

## Правила ведения

- Перед продолжением работы прочитать ТЗ и этот журнал.
- Продолжать первый этап со статусом не `done`.
- Не переходить к следующему этапу, пока текущий этап не прошел свой `stage gate`.
- Обновлять журнал после закрытия этапа, blocker или значимого промежуточного результата.
- Записи держать короткими: scope, измененные модули, проверки, coverage, риски, следующее действие.
- Не фиксировать каждую мелкую правку и не вставлять полный diff.
- Не запускать запрещенные docs build commands из `AGENTS.md` и ТЗ.

## Статусы

- `not started`
- `in progress`
- `done`
- `blocked`

## Текущий указатель

- Активное ТЗ: `spec/tz-entities-mass-despawn-optimization.md`
- Активный этап: Финальная проверка
- Статус: `done`
- Следующее действие: нет, ТЗ выполнено.

## Сводка по этапам

| Этап | Название | Статус | Последнее обновление |
| ---- | -------- | ------ | -------------------- |
| 0 | Baseline audit и тестовая карта | `done` | 2026-06-18 |
| 1 | Store id, `despawnOn` classification и final-removal hints | `done` | 2026-06-18 |
| 2 | Full-entity cleanup fast path | `done` | 2026-06-18 |
| 3 | Scratch cleanup batches вместо `Map<string, ...>` | `done` | 2026-06-18 |
| 4 | Benchmark attribution и runtime performance gate | `done` | 2026-06-18 |
| 5 | RTS `UNIT_DEAD` death flow | `done` | 2026-06-18 |
| 6 | Рефакторинг, чистка и полировка | `done` | 2026-06-18 |

## Ход реализации

### Этап 0 — Baseline audit и тестовая карта

Статус: `done`

Записи:

### 2026-06-18 — Этап 0 — Baseline audit и тестовая карта

- Статус: `in progress`
- Executor: `019edb69-4bee-7160-8f9c-5488b31a2c7b`
- Baseline: clean; `git status --short`, `git diff --stat`, `git diff --staged --stat` пустые; untracked отсутствуют.
- Stage-owned delta: отсутствует на dispatch.
- Corrective: `0/3`
- Scope: baseline audit, trace/test coverage map, optional comments in focused tests; runtime и RTS behavior не менять.
- Изменено: журнал.
- Проверки: не запускались.
- Coverage: не применимо до изменений тестовой карты.
- Риски: нет.
- Следующее действие: отправить исполнителю self-contained brief Этапа 0.

### 2026-06-18 — Этап 0 — Baseline audit и тестовая карта

- Статус: `done`
- Executor: `019edb69-4bee-7160-8f9c-5488b31a2c7b`
- Baseline: clean; `git status --short`, `git diff --stat`, `git diff --staged --stat` пустые; untracked отсутствовали.
- Stage-owned delta: `covered by` comments в `tests/entities/entities-plugin.test.ts`, `tests/entities/entities-reducer-post-processing.test.ts`, `tests/entities/entities-transition-trace.test.ts`; runtime, RTS, benchmark, public API и cheatsheets не менялись.
- Corrective: `0/3`
- Scope: baseline audit, trace/test coverage map, focused test comments.
- Trace baseline: JSON `.bench/entities/mass-despawn-baseline.json` фиксирует `despawnOn / none / one-shot / 35k / batch 5k` около `7.645875ms`; ключевые фазы для сравнения: `entities.reduce.publicBatch.total`, `postProcess`, `updateStateBuckets`, `entities.reduce.publicCleanup`, `collectPlan`, `removeActorRows`, `removeEntityRecords`; counters включают `scheduledDespawns`, `despawnedEntities`, `touchedTemplates`, `lifecycleBatches`, `lifecycleRows`, `removalBatches`, `removedActorRows`, `removedEntityRecords`, `terminalRows`.
- Current gaps: 5.1 explicit ids/indices full-entity fast path и duplicate no-op under hints; 5.2 final-removal all/mixed rows и reducer overrides; 5.3 lifecycle-vs-final-removal split; 5.4 consolidated index assertions after optimized cleanup; 5.5 survivor reaction ownership/no survivor array behavior; 5.6 cleanup scratch/no hot `Map`/`Set`/skipped bucket move counters; 5.7 RTS `UNIT_DEAD` flow.
- Проверки: `pnpm exec vitest tests/entities/entities-plugin.test.ts tests/entities/entities-reducer-post-processing.test.ts tests/entities/entities-transition-trace.test.ts --run` — passed, 3 files / 183 tests; `git diff --check` — passed.
- Coverage: не применимо, stage-owned production logic не менялась.
- Риски: `.bench` Markdown и JSON расходятся по части counter table; для future compare использовать JSON как machine-readable источник и фиксировать расхождение при benchmark attribution.
- Следующее действие: начать Этап 1 с новым clean executor и учесть gaps Этапа 0.

### Этап 1 — Store id, `despawnOn` classification и final-removal hints

Статус: `done`

Записи:

### 2026-06-18 — Этап 1 — Store id, `despawnOn` classification и final-removal hints

- Статус: `in progress`
- Executor: `019edb6e-9d34-7882-a251-d1a9f320e1e2`
- Baseline: включает принятый delta Этапа 0; `git status --short` показывает modified `spec/tz-entities-mass-despawn-optimization-log.md`, `tests/entities/entities-plugin.test.ts`, `tests/entities/entities-reducer-post-processing.test.ts`, `tests/entities/entities-transition-trace.test.ts`; staged diff и untracked отсутствуют.
- Stage-owned delta: отсутствует на dispatch.
- Corrective: `0/3`
- Scope: internal runtime classification/hints/store id, focused runtime tests; physical cleanup algorithm менять только минимально для чтения hints; RTS не менять.
- Изменено: журнал.
- Проверки: не запускались.
- Coverage: будет оцениваться после production/test delta.
- Риски: baseline содержит закрытые изменения Этапа 0, их не включать в acceptance Этапа 1.
- Следующее действие: отправить исполнителю self-contained brief Этапа 1.

### 2026-06-18 — Этап 1 — Store id, `despawnOn` classification и final-removal hints

- Статус: `done`
- Executor: `019edb6e-9d34-7882-a251-d1a9f320e1e2`
- Baseline: включает принятый delta Этапа 0 и write-ahead запись Этапа 1; staged diff и untracked отсутствовали.
- Stage-owned delta: `packages/entities/src/runtime/store-types.ts`, `state.ts`, `reduce-transitions.ts`, `transaction.ts`, `reduce-post-process.ts`, `reduce-batch.ts`, `runtime-index.ts`, `reduce-despawn.ts`, `tests/entities/entities-plugin.test.ts`, `tests/entities/entities-reducer-post-processing.test.ts`.
- Corrective: `0/3`
- Scope: internal `storeId`/`actorStoresById`, source bucket state capture, `despawnOn` final-removal classification, row hints, survivor reaction rows, minimal hinted bucket cleanup.
- Проверки: `pnpm exec vitest tests/entities/entities-reducer-post-processing.test.ts tests/entities/entities-plugin.test.ts --run` — passed, 2 files / 181 tests; `pnpm exec vitest tests/entities/entities-transition-trace.test.ts --run` — passed, 1 file / 10 tests; `pnpm --filter @lite-fsm/entities run check-types` — passed; `git diff --check` — passed.
- Coverage: focused runtime/tests пройдены; full coverage не запускался на этом этапе.
- Review gate: pass; runtime phase order, public API, snapshot format, RTS files, docs и cheatsheets не менялись; cleanup `Map` plan оставлен для Этапа 3.
- Source audit: `rg` подтвердил новые internal ids/hints только в runtime/tests; `UNITS_DIED|UNIT_DIED` остаются только в RTS future scope; `Map<string, ActorRowRemovalBatch>` остается ожидаемым hit в `reduce-despawn.ts` до Этапа 3.
- Риски: нет.
- Следующее действие: начать Этап 2, применить full-entity cleanup fast path ко всем scheduled despawns без изменения lifecycle semantics.

### Этап 2 — Full-entity cleanup fast path

Статус: `done`

Записи:

### 2026-06-18 — Этап 2 — Full-entity cleanup fast path

- Статус: `in progress`
- Executor: `019edb7a-0a3c-7a22-a9b8-b97c303af1c0`
- Baseline: включает принятые delta Этапов 0-1; `git status --short` показывает modified runtime/test/log файлы предыдущих этапов; `git diff --stat` — 12 files, 688 insertions, 32 deletions; staged diff и untracked отсутствуют.
- Stage-owned delta: отсутствует на dispatch.
- Corrective: `0/3`
- Scope: full-entity cleanup fast path для всех scheduled despawns, index correctness tests; terminal cleanup и lifecycle order не менять.
- Изменено: журнал.
- Проверки: не запускались.
- Coverage: будет оцениваться после production/test delta.
- Риски: baseline содержит закрытые изменения Этапов 0-1, их не включать в acceptance Этапа 2.
- Следующее действие: отправить исполнителю self-contained brief Этапа 2.

### 2026-06-18 — Этап 2 — Full-entity cleanup fast path

- Статус: `done`
- Executor: `019edb7a-0a3c-7a22-a9b8-b97c303af1c0`
- Baseline: включает принятые delta Этапов 0-1 и write-ahead запись Этапа 2; staged diff и untracked отсутствовали.
- Stage-owned delta: `packages/entities/src/runtime/runtime-index.ts`, `packages/entities/src/runtime/reduce-despawn.ts`, `tests/entities/entities-plugin.test.ts`.
- Corrective: `0/3`
- Scope: `fullEntity` removal mode для scheduled despawns, сохранение row-level terminal cleanup, index matrix helpers/tests.
- Проверки: `pnpm exec vitest tests/entities/entities-plugin.test.ts tests/entities/entities-transition-trace.test.ts --run` — passed, 2 files / 178 tests; `pnpm --filter @lite-fsm/entities run check-types` — passed; `git diff --check` — passed.
- Coverage: focused runtime/tests пройдены; full coverage не запускался на этом этапе.
- Review gate: pass; `actorRowsByEntity` не swap-remove в full-entity mode, `row.entityRowsPosition = -1`, `actorRowsByGroupTag` и `stateBuckets` обновляются существующей моделью, terminal-only cleanup остается row mode.
- Source audit: `rg -n "removeActorRowsForStore\\(" packages tests` показал совместимые вызовы; public API, snapshot, RTS, benchmark и docs не менялись.
- Риски: cleanup `Map` plan намеренно остается до Этапа 3.
- Следующее действие: начать Этап 3, заменить cleanup plan `Map<string, ...>` и fresh arrays на transaction scratch batches.

### Этап 3 — Scratch cleanup batches вместо `Map<string, ...>`

Статус: `done`

Записи:

### 2026-06-18 — Этап 3 — Scratch cleanup batches вместо `Map<string, ...>`

- Статус: `in progress`
- Executor: `019edb80-0d69-7c52-b628-77b8daed0ee7`
- Baseline: включает принятые delta Этапов 0-2; `git status --short` показывает modified runtime/test/log файлы предыдущих этапов; `git diff --stat` — 12 files, 1059 insertions, 42 deletions; staged diff и untracked отсутствуют.
- Stage-owned delta: отсутствует на dispatch.
- Corrective: `0/3`
- Scope: cleanup plan batches в transaction scratch, storeId indexing, reusable rows/indices arrays, stale scratch reset tests.
- Изменено: журнал.
- Проверки: не запускались.
- Coverage: будет оцениваться после production/test delta.
- Риски: baseline содержит закрытые изменения Этапов 0-2, их не включать в acceptance Этапа 3.
- Следующее действие: отправить исполнителю self-contained brief Этапа 3.

### 2026-06-18 — Этап 3 — Scratch cleanup batches вместо `Map<string, ...>`

- Статус: `in progress`
- Executor: `019edb80-0d69-7c52-b628-77b8daed0ee7`
- Baseline: прежний baseline Этапа 3 сохраняется; stage-owned delta исполнителя оставлен для corrective.
- Stage-owned delta: `packages/entities/src/runtime/transaction.ts`, `packages/entities/src/runtime/reduce-despawn.ts`, `tests/entities/entities-plugin.test.ts`.
- Corrective: `1/3`
- Scope: review gate выявил незакрытый cleanup-in-finally contract.
- Проверки: не запускались оркестратором после review issue.
- Coverage: не применимо до исправления.
- Риски: `flushEntityLifecycleCleanup` создает cleanup frame в collect phase, но `finishEntityCleanupScratch` находится только в later processing `finally`; exception в `collectDespawnCleanupPlan` после `beginEntityCleanupScratch` оставит active cleanup frame и stale scratch.
- Следующее действие: исправить cleanup scratch finalization так, чтобы frame и despawn hints закрывались при ошибке collect phase; добавить focused regression или явно покрыть существующим тестом.

### 2026-06-18 — Этап 3 — Scratch cleanup batches вместо `Map<string, ...>`

- Статус: `done`
- Executor: `019edb80-0d69-7c52-b628-77b8daed0ee7`
- Baseline: включает принятые delta Этапов 0-2 и write-ahead/corrective записи Этапа 3; staged diff и untracked отсутствовали.
- Stage-owned delta: `packages/entities/src/runtime/transaction.ts`, `packages/entities/src/runtime/reduce-despawn.ts`, `tests/entities/entities-plugin.test.ts`.
- Corrective: `1/3`
- Scope: cleanup scratch pool в transaction scratch, storeId-indexed removal/lifecycle batches, touched store ids, reusable rows/indices/entities arrays, nested frame boundary.
- Проверки: `pnpm exec vitest tests/entities/entities-plugin.test.ts tests/entities/entities-transition-trace.test.ts --run` — passed, 2 files / 182 tests; `pnpm exec vitest tests/entities/entities-reducer-post-processing.test.ts --run` — passed, 1 file / 16 tests; `pnpm --filter @lite-fsm/entities run check-types` — passed; `git diff --check` — passed.
- Coverage: focused runtime/tests пройдены; full coverage не запускался на этом этапе.
- Review gate: pass after corrective; cleanup frame/hints now close in `finally` even when collect phase throws; counters remain before scratch clear on success path; terminal cleanup remains row mode; trace key names unchanged.
- Source audit: `rg -n "Map<string, ActorRowRemovalBatch|new Map<string" packages/entities/src/runtime/reduce-despawn.ts packages/entities/src/runtime/transaction.ts` — no hits.
- Expected remaining hits: broader `new Map<string, unknown>()` hits remain in tests as dispatch carrier fixtures; cleanup `Map` hits outside active scope are not part of this stage.
- Риски: benchmark impact not measured yet; Этап 4 must record attribution.
- Следующее действие: начать Этап 4, запустить runtime benchmark record/compare и зафиксировать performance gate.

### Этап 4 — Benchmark attribution и runtime performance gate

Статус: `done`

Записи:

### 2026-06-18 — Этап 4 — Benchmark attribution и runtime performance gate

- Статус: `in progress`
- Executor: `019edb8a-2086-7563-8476-0c7c610cf115`
- Baseline: включает принятые delta Этапов 0-3; `git status --short` показывает modified runtime/test/log файлы предыдущих этапов; `git diff --stat` — 12 files, 1635 insertions, 183 deletions; staged diff и untracked отсутствуют.
- Stage-owned delta: отсутствует на dispatch.
- Corrective: `0/3`
- Scope: benchmark record/compare artifacts и optional trace attribution counters; benchmark scenario matrix, RTS и public API не менять.
- Изменено: журнал.
- Проверки: не запускались.
- Coverage: не применимо до benchmark run.
- Риски: benchmark может быть noisy; сравнение делать по artifact и thresholds ТЗ.
- Следующее действие: отправить исполнителю self-contained brief Этапа 4.

### 2026-06-18 — Этап 4 — Benchmark attribution и runtime performance gate

- Статус: `in progress`
- Executor: `019edb8a-2086-7563-8476-0c7c610cf115`
- Baseline: прежний baseline Этапа 4 сохраняется; benchmark artifacts записаны в ignored `.bench/entities/`.
- Stage-owned delta: `.bench/entities/after-mass-despawn-runtime.{json,md}`, timestamped copies and `latest.{json,md}` ignored; tracked code/log не менялись исполнителем.
- Corrective: `1/3`
- Scope: benchmark gate failed; нужна точечная performance correction без изменения benchmark workload, public API, RTS или Stage 5.
- Проверки: `pnpm run bench:entities:record -- --runs 5 --label after-mass-despawn-runtime --include mass-despawn,mass-despawn-trace --row-counts 30000,35000` — passed; `pnpm run bench:entities:compare -- .bench/entities/mass-despawn-baseline.json .bench/entities/after-mass-despawn-runtime.json` — exit 0, thresholds failed.
- Coverage: benchmark gate failed; unit/full coverage не запускался.
- Риски: `despawnOn / none / one-shot / 35k / batch 5k` `7.646ms -> 11.606ms` (`+51.8%`); `explicit-indices / none / one-shot / 35k / batch 5k` `7.725ms -> 14.298ms` (`+85.1%`); trace shows `entities.reduce.publicBatch.postProcess` `1.887ms -> 21.396ms`.
- Evidence: likely hot-path issue in `scheduleDespawnRowHint`: `ensureDespawnRowHintCapacity(..., entity + 1)` can allocate/copy `Uint8Array` and `Int16Array` for each increasing entity during mass `despawnOn` final-removal classification.
- Следующее действие: make amortized/bounded hint mark capacity growth, rerun focused tests/check-types and benchmark record/compare.

### 2026-06-18 — Этап 4 — Benchmark attribution и runtime performance gate

- Статус: `done`
- Executor: `019edb8a-2086-7563-8476-0c7c610cf115`
- Baseline: включает принятые delta Этапов 0-3 и corrective запись Этапа 4; staged diff и untracked отсутствовали.
- Stage-owned delta: `packages/entities/src/runtime/transaction.ts`, `tests/entities/entities-reducer-post-processing.test.ts`; ignored benchmark artifacts `.bench/entities/2026-06-18T16-41-02-965Z-after-mass-despawn-runtime.{json,md}`, `.bench/entities/after-mass-despawn-runtime.{json,md}`, `.bench/entities/latest.{json,md}`.
- Corrective: `1/3`
- Scope: amortized/bounded growth для `despawnScheduled` и `despawnRowHint` typed arrays; allocation regression для mass despawn scheduling; benchmark gate без изменения scenario matrix, RTS или public API.
- Проверки: `pnpm exec vitest tests/entities/entities-reducer-post-processing.test.ts tests/entities/entities-plugin.test.ts tests/entities/entities-transition-trace.test.ts --run` — passed, 3 files / 199 tests; `pnpm --filter @lite-fsm/entities run check-types` — passed; `git diff --check` — passed; `pnpm run bench:entities:record -- --runs 5 --label after-mass-despawn-runtime --include mass-despawn,mass-despawn-trace --row-counts 30000,35000` — passed; `pnpm run bench:entities:compare -- .bench/entities/mass-despawn-baseline.json .bench/entities/after-mass-despawn-runtime.json` — exit 0.
- Gate rows: `despawnOn / none / one-shot / 35k / batch 5k` `7.646ms -> 5.646ms` (`-26.1%`); `explicit-ids / none / one-shot / 35k / batch 5k` `9.222ms -> 7.156ms` (`-22.4%`); `explicit-indices / none / one-shot / 35k / batch 5k` `7.725ms -> 6.052ms` (`-21.7%`).
- Trace attribution: `despawnOn / none / one-shot / 35k / batch 5k` total `7.602ms -> 6.034ms` (`-20.6%`); `entities.reduce.publicBatch.postProcess` `1.887ms -> 0.350ms`; `entities.cleanup.public.collectPlan` `0.617ms -> 0.578ms`; `entities.cleanup.public.removeActorRows` `0.850ms -> 0.693ms`; `entities.cleanup.public.removeEntityRecords` `0.392ms -> 0.337ms`; `entities.reduce.publicCleanup` `1.901ms -> 1.662ms`.
- Coverage: focused runtime/tests и benchmark gate пройдены; full coverage не запускался на этом этапе.
- Review gate: pass; typed-array allocation no longer grows per row, benchmark artifacts accepted by compare, public API/snapshot/docs/RTS files unchanged.
- Риски: benchmark remains noisy in some non-acceptance rows, но stage gate rows and target trace phases pass on orchestrator-recorded artifacts.
- Следующее действие: начать Этап 5, вернуть RTS на batched `UNIT_DEAD` flow.

### Этап 5 — RTS `UNIT_DEAD` death flow

Статус: `done`

Записи:

### 2026-06-18 — Этап 5 — RTS `UNIT_DEAD` death flow

- Статус: `in progress`
- Executor: `019edba0-0aa6-7d23-80f8-fa25bfedf5f8`
- Baseline: включает принятые delta Этапов 0-4; `git status --short` показывает modified runtime/test/log файлы предыдущих этапов; `git diff --stat` — 12 files, 1766 insertions, 191 deletions; staged diff и untracked отсутствуют.
- Stage-owned delta: отсутствует на dispatch.
- Corrective: `0/3`
- Scope: RTS death flow only: `UNIT_DEAD` batched entity event, removal of `UNITS_DIED`/per-unit `UNIT_DIED`, non-hero `despawnOn: "REMOVED"`, hero disabled/dead survivor, focused RTS/runtime tests.
- Изменено: журнал.
- Проверки: не запускались.
- Coverage: будет оцениваться после RTS delta.
- Риски: baseline contains accepted runtime optimization deltas; Stage 5 must not alter runtime internals unless a verified RTS integration defect requires it.
- Следующее действие: отправить исполнителю self-contained brief Этапа 5.

### 2026-06-18 — Этап 5 — RTS `UNIT_DEAD` death flow

- Статус: `done`
- Executor: `019edba0-0aa6-7d23-80f8-fa25bfedf5f8`
- Baseline: включает принятые delta Этапов 0-4 и write-ahead запись Этапа 5; staged diff и untracked отсутствовали.
- Stage-owned delta: `apps/playground/app/examples/entities-rts/store/types.ts`, `store/selectors.ts`, `store/machines/enemy-ai/index.ts`, `store/machines/rts-spatial-index/index.ts`, `store/machines/unit-combat/index.ts`, `store/machines/unit-command/index.ts`, `store/machines/unit-health/index.ts`, `store/machines/unit-identity/index.ts`, `store/machines/unit-movement/index.ts`, `store/machines/unit-orders/index.ts`, `store/machines/unit-projectile/index.ts`, `store/machines/unit-selection/index.ts`, `tests/playground/entities-rts/runtime.test.ts`.
- Corrective: `0/3`
- Scope: batched entity-routed `UNIT_DEAD`, removal of old RTS death workaround, real non-hero despawn through `REMOVED`, hero disabled/dead survivor, empty lifecycle edge cleanup, capacity read-view fix via `slotCount`.
- Проверки: `pnpm exec vitest tests/playground/entities-rts/runtime.test.ts tests/playground/entities-rts/spawn.test.ts --run` — passed, 2 files / 20 tests; `pnpm exec vitest tests/entities/entities-plugin.test.ts --run` — passed, 1 file / 172 tests; `pnpm --filter @lite-fsm/playground run check-types` — passed; `rg -n "UNITS_DIED|UNIT_DIED" apps/playground/app/examples/entities-rts tests/playground/entities-rts` — no hits; `rg -n "ENTITY_DESPAWNED" apps/playground/app/examples/entities-rts/store/machines` — no hits; `git diff --check` — passed.
- Coverage: focused RTS/runtime tests пройдены; full coverage не запускался на этом этапе.
- Review gate: pass; `unitHealth.effects.DEAD` sends one `transition.entity(deadIds, { type: "UNIT_DEAD" })`, keeps `HERO_DEAD`/`ENEMIES_KILLED`, does not call `transition.despawn`; behavior actors clear hot columns and override non-hero rows to `REMOVED`; hero rows remain live in `DEAD`/`STOPPED`/`DISABLED`.
- Риски: нет.
- Следующее действие: начать Этап 6, выполнить cleanup audits, lint, coverage and final package checks.

### Этап 6 — Рефакторинг, чистка и полировка

Статус: `done`

Записи:

### 2026-06-18 — Этап 6 — Рефакторинг, чистка и полировка

- Статус: `in progress`
- Executor: `019edbac-a4d2-7473-b489-bc8830b60018`
- Baseline: включает принятые delta Этапов 0-5; `git status --short` показывает modified runtime/RTS/test/log файлы предыдущих этапов; `git diff --stat` — 25 files, 2077 insertions, 319 deletions; staged diff и untracked отсутствуют.
- Stage-owned delta: отсутствует на dispatch.
- Corrective: `0/3`
- Scope: cleanup/refactor only, source audits, lint, coverage, final package/type checks; no public API, phase order, snapshot, benchmark matrix, docs build or new optimizations.
- Изменено: журнал.
- Проверки: не запускались.
- Coverage: будет оцениваться после cleanup/final checks.
- Риски: `pnpm run test:coverage` and final benchmark may be slower/noisy; do not mask real regressions with unrelated refactors.
- Следующее действие: отправить исполнителю self-contained brief Этапа 6.

### 2026-06-18 — Этап 6 — Рефакторинг, чистка и полировка

- Статус: `done`
- Executor: `019edbac-a4d2-7473-b489-bc8830b60018`
- Baseline: включает принятые delta Этапов 0-5 и write-ahead запись Этапа 6; staged diff и untracked отсутствовали.
- Stage-owned delta: `packages/entities/src/runtime/reduce-batch.ts`, `packages/entities/src/runtime/reduce-despawn.ts`, `packages/entities/src/runtime/reduce-post-process.ts`, `packages/entities/src/runtime/transaction.ts`, `tests/entities/entities-plugin.test.ts`, `tests/entities/entities-reducer-post-processing.test.ts`.
- Corrective: `0/3`
- Scope: defensive branch cleanup for coverage, explicit invariant-only `v8 ignore` annotations, focused tests for scratch reuse/order, row hint reuse/dedupe, survivor copying, per-row source bucket updates and reaction compaction.
- Проверки: `pnpm --filter @lite-fsm/entities run check-types` — passed; `pnpm --filter @lite-fsm/playground run check-types` — passed; `pnpm exec vitest tests/entities/entities-plugin.test.ts tests/entities/entities-reducer-post-processing.test.ts tests/entities/entities-transition-trace.test.ts --run` — passed, 3 files / 203 tests; `pnpm exec vitest tests/playground/entities-rts/runtime.test.ts tests/playground/entities-rts/spawn.test.ts --run` — passed, 2 files / 20 tests; `pnpm run lint` — passed; `pnpm run test:coverage` — passed, 117 files / 1634 tests, coverage 100% statements/branches/functions/lines; `git diff --check` — passed.
- Source audits: `rg -n "UNITS_DIED|UNIT_DIED" apps/playground/app/examples/entities-rts tests/playground/entities-rts` — no hits; `rg -n "Map<string, ActorRowRemovalBatch|new Map<string" packages/entities/src/runtime/reduce-despawn.ts packages/entities/src/runtime/transaction.ts` — no hits; `rg -n "TODO|FIXME|debugger|console\\.log" packages/entities/src/runtime apps/playground/app/examples/entities-rts/store` — no hits.
- Coverage: full coverage gate passed.
- Review gate: pass; public API, phase order, error semantics, snapshot format and benchmark matrix unchanged.
- Риски: final benchmark remains to run under final readiness label.
- Следующее действие: выполнить финальную проверку ТЗ.

## Финальная проверка

- Статус: `done`

### 2026-06-18 — Финальная проверка

- Статус: `done`
- Scope: full-spec readiness после закрытия всех этапов; root checks, package build, финальный benchmark record/compare, source audits и diff hygiene.
- Проверки: `pnpm exec vitest tests/entities/entities-plugin.test.ts tests/entities/entities-reducer-post-processing.test.ts tests/entities/entities-transition-trace.test.ts --run` — passed, 3 files / 203 tests; `pnpm exec vitest tests/playground/entities-rts/runtime.test.ts tests/playground/entities-rts/spawn.test.ts --run` — passed, 2 files / 20 tests; `pnpm run check-types` — passed, Tstyche 44 files / 501 tests / 1157 assertions; `pnpm run lint` — passed; `pnpm run test:coverage` — passed, 117 files / 1634 tests, coverage 100% statements/branches/functions/lines; `pnpm run build:packages` — passed; `git diff --check` — passed.
- Benchmark: `pnpm run bench:entities:record -- --runs 5 --label after-mass-despawn-optimization --include mass-despawn,mass-despawn-trace --row-counts 30000,35000` — passed; artifacts `.bench/entities/2026-06-18T17-12-30-271Z-after-mass-despawn-optimization.{json,md}` and `.bench/entities/after-mass-despawn-optimization.{json,md}`; `pnpm run bench:entities:compare -- .bench/entities/mass-despawn-baseline.json .bench/entities/after-mass-despawn-optimization.json` — exit 0.
- Performance readiness: `despawnOn / none / one-shot / 35k / batch 5k` `7.646ms -> 6.133ms` (`-19.8%`); `explicit-ids / none / one-shot / 35k / batch 5k` `9.222ms -> 6.683ms` (`-27.5%`); `explicit-indices / none / one-shot / 35k / batch 5k` `7.725ms -> 5.679ms` (`-26.5%`).
- Lifecycle readiness: all reducer/reaction scenarios are within the `10%` regression budget; target 35k/batch 5k rows improved: `despawnOn/reducer` `10.869ms -> 8.240ms`, `despawnOn/reaction` `9.266ms -> 8.246ms`, `explicit-ids/reducer` `10.700ms -> 8.600ms`, `explicit-ids/reaction` `10.680ms -> 8.139ms`, `explicit-indices/reducer` `10.254ms -> 7.464ms`, `explicit-indices/reaction` `9.496ms -> 6.969ms`.
- Trace attribution: `despawnOn / none / one-shot / 35k / batch 5k` total `7.602ms -> 5.713ms` (`-24.9%`); `entities.reduce.publicBatch.postProcess` `1.887ms -> 0.361ms`; `entities.reduce.publicBatch.updateStateBuckets` `0.102ms -> 0.000ms`; `entities.cleanup.public.collectPlan` `0.617ms -> 0.583ms`; `entities.cleanup.public.removeActorRows` `0.850ms -> 0.665ms`; `entities.reduce.publicCleanup` `1.901ms -> 1.663ms`.
- Source audits: `rg -n "UNITS_DIED|UNIT_DIED" apps/playground/app/examples/entities-rts tests/playground/entities-rts` — no hits; `rg -n "Map<string, ActorRowRemovalBatch|new Map<string" packages/entities/src/runtime/reduce-despawn.ts packages/entities/src/runtime/transaction.ts` — no hits; `rg -n "TODO|FIXME|debugger|console\\.log" packages/entities/src/runtime apps/playground/app/examples/entities-rts/store` — no hits.
- Documentation readiness: public API не менялся, `API-CHEATSHEET.md` и `TYPES-CHEATSHEET.md` не требуют обновления; запрещенные docs build commands не запускались.
