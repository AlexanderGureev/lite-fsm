# Журнал реализации ТЗ `@lite-fsm/core` и `@lite-fsm/entities` transition trace

ТЗ: [`transition-trace-performance-spec.md`](./transition-trace-performance-spec.md)

Цель журнала — восстановить состояние реализации после сжатия контекста. Журнал не заменяет ТЗ и не пересказывает diff.

## Правила ведения

- Перед продолжением работы прочитать ТЗ и этот журнал.
- Продолжать первый этап со статусом не `done`.
- Не переходить к следующему этапу, пока текущий этап не прошел свой `stage gate`.
- Обновлять журнал после закрытия этапа, blocker или значимого промежуточного результата.
- Записи держать короткими: scope, измененные модули, проверки, coverage, риски, следующее действие.
- Не фиксировать каждую мелкую правку и не вставлять полный diff.

## Статусы

- `not started`
- `in progress`
- `done`
- `blocked`

## Текущий указатель

- Активное ТЗ: `packages/entities/transition-trace-performance-spec.md`
- Активный этап: Финальная проверка
- Статус: `done`
- Следующее действие: цель выполнена; результат готов к review.

## Сводка по этапам

| Этап | Название | Статус | Последнее обновление |
| ---- | -------- | ------ | -------------------- |
| 1 | Internal trace carrier в core | `done` | 2026-06-15 |
| 2 | Core phase markup | `done` | 2026-06-15 |
| 3 | Entities phase markup | `done` | 2026-06-15 |
| 4 | Benchmark record/report/compare для trace | `done` | 2026-06-15 |
| 5 | Baseline trace report и документация workflow | `done` | 2026-06-15 |
| 6 | Миграция synthetic diagnostics | `done` | 2026-06-15 |
| 7 | Рефакторинг, чистка и полировка | `done` | 2026-06-15 |

## Ход реализации

### Этап 1 — Internal trace carrier в core

Статус: `done`

Baseline:

- `executor-id`: `019ecaa7-6de8-7542-984b-e24bd61b7ebe`
- Corrective: `0/3`
- `git status --short`: clean
- `git diff`: нет изменений в active scope этапа
- `git diff --staged`: нет изменений в active scope этапа
- Active scope: `packages/core/src/runtime/kernel/*`, focused tests, public surface audit.

Записи:

### 2026-06-15 — Этап 1 — Internal trace carrier в core

- Статус: `in progress`
- Scope: write-ahead dispatch этапа 1; добавить private global collector и dispatch trace carrier в core без public API.
- Изменено: пока нет.
- Проверки: baseline снят; проверки реализации еще не запускались.
- Coverage: будет проверяться по focused helper tests.
- Риски: нет; active scope clean.
- Следующее действие: отправить stage brief исполнителю `019ecaa7-6de8-7542-984b-e24bd61b7ebe`.

### 2026-06-15 — Этап 1 — Internal trace carrier в core

- Статус: `done`
- `executor-id`: `019ecaa7-6de8-7542-984b-e24bd61b7ebe`
- Corrective: `0/3`
- Baseline: clean active scope до dispatch; `packages/entities/transition-trace-performance-spec-log.md` изменен оркестратором вне stage-owned delta.
- Stage-owned delta: добавлен internal helper `transitionTrace.ts`, подключение session в `createMachineManagerFactory.ts`, focused tests `tests/core/transition-trace.test.ts`.
- Scope: private collector `Symbol.for("@lite-fsm/performance-trace")`, private runtime slot `"@lite-fsm/core/transition-trace"`, disabled-path invariant без `performance.now()` и phase arrays.
- Изменено: `packages/core/src/runtime/kernel/transitionTrace.ts`, `packages/core/src/runtime/kernel/createMachineManagerFactory.ts`, `tests/core/transition-trace.test.ts`.
- Проверки: `pnpm exec vitest run tests/core/transition-trace.test.ts` pass; `pnpm exec vitest run tests/core/transition-trace.test.ts --coverage --coverage.include=packages/core/src/runtime/kernel/transitionTrace.ts` pass; `pnpm run check-types` pass; `pnpm run lint` pass; `git diff --check` pass.
- Coverage: `transitionTrace.ts` — 100% statements/branches/functions/lines.
- Риски: нет; public exports/options/types не изменены, `tests/types/exports-surface.tst.ts` прошел в составе `check-types`.
- Следующее действие: начать этап 2 — разметить top-level core и bucket phases поверх существующего carrier.

### Этап 2 — Core phase markup

Статус: `done`

Baseline:

- `executor-id`: `019ecaae-be47-7d52-af83-8ebd35633ae2`
- Corrective: `0/3`
- `git status --short`: `M packages/core/src/runtime/kernel/createMachineManagerFactory.ts`; `M packages/entities/transition-trace-performance-spec-log.md`; `?? packages/core/src/runtime/kernel/transitionTrace.ts`; `?? tests/core/transition-trace.test.ts`
- `git diff`: accepted stage 1 delta plus orchestrator log updates; no staged changes.
- `git diff --staged`: clean
- Active scope: `packages/core/src/runtime/kernel/createMachineManagerFactory.ts`, `packages/core/src/runtime/kernel/bucketRuntime.ts`, `packages/core/src/runtime/kernel/transitionTrace.ts`, focused core runtime tests.
- Baseline owner: этап 1 и журнал оркестратора; stage 2 delta должен быть отделим от этой базы.

Записи:

### 2026-06-15 — Этап 2 — Core phase markup

- Статус: `in progress`
- Scope: write-ahead dispatch этапа 2; разметить top-level core phases и bucket phases без entities internals и без изменения ordering.
- Изменено: пока нет.
- Проверки: baseline снят; проверки реализации еще не запускались.
- Coverage: не применимо до появления stage-owned tests; focused runtime tests обязательны.
- Риски: baseline уже содержит accepted stage 1 delta; review должен отделять stage-owned изменения этапа 2.
- Следующее действие: отправить stage brief исполнителю `019ecaae-be47-7d52-af83-8ebd35633ae2`.

### 2026-06-15 — Этап 2 — Core phase markup

- Статус: `done`
- `executor-id`: `019ecaae-be47-7d52-af83-8ebd35633ae2`
- Corrective: `0/3`
- Baseline: accepted stage 1 delta и журнал оркестратора; staged changes отсутствовали.
- Stage-owned delta: top-level core phase markup в `transition(...)` и `coreTransition(...)`, bucket phase markup по `runtime.kind`, runtime tests для enabled/disabled/error/nested trace.
- Scope: `core.transition.total`, `core.assertUserAction`, `core.createDispatch`, `core.prepareAction.total`, `core.beforeReduce.total`, `core.interceptors`, hook phases, `core.rootReducer`, `core.markExternallyChangedBuckets`, `core.commit.total`, `core.reactions.total`, `core.subscribers`, `core.effects.total`, `core.bucket.*.<kind>`.
- Изменено: `packages/core/src/runtime/kernel/createMachineManagerFactory.ts`, `packages/core/src/runtime/kernel/bucketRuntime.ts`, `packages/core/src/runtime/kernel/transitionTrace.ts`, `tests/core/transition-trace.test.ts`.
- Проверки: `pnpm exec vitest run tests/core/transition-trace.test.ts tests/core/MachineManager.test.ts tests/core/storage-runtime-dispatch-pipeline.test.ts tests/core/dispatch-hooks.test.ts tests/core/runtime-ownership.test.ts` pass; `pnpm run check-types` pass; `pnpm run lint` pass; `git diff --check` pass; source audit по `console`, `process.stdout`, `process.stderr`, `debugger`, `TODO`, `FIXME` в touched runtime/test files — clean.
- Coverage: отдельный coverage gate не применялся; этап проверен focused runtime suite и full lint/type gates.
- Риски: нет; entities internals, benchmark, diagnostics и public surface не менялись.
- Следующее действие: начать этап 3 — разметить entities runtime phases через private dispatch runtime slot.

### Этап 3 — Entities phase markup

Статус: `done`

Baseline:

- `executor-id`: `019ecab8-3688-7d01-889b-f6ad23e7447c`
- Corrective: `0/3`
- `git status --short`: `M packages/core/src/runtime/kernel/bucketRuntime.ts`; `M packages/core/src/runtime/kernel/createMachineManagerFactory.ts`; `M packages/entities/transition-trace-performance-spec-log.md`; `?? packages/core/src/runtime/kernel/transitionTrace.ts`; `?? tests/core/transition-trace.test.ts`
- `git diff`: accepted stages 1-2 delta plus orchestrator log updates; no staged changes.
- `git diff --staged`: clean
- Active scope: `packages/entities/src/runtime/storage.ts`, `packages/entities/src/runtime/reduce.ts`, `packages/entities/src/runtime/reactions.ts`, `packages/entities/src/runtime/transaction.ts`, `packages/entities/src/runtime/state.ts`, optional internal entities trace helper, focused entities tests.
- Baseline owner: этапы 1-2 и журнал оркестратора; stage 3 delta должен быть отделим от core trace baseline.

Записи:

### 2026-06-15 — Этап 3 — Entities phase markup

- Статус: `in progress`
- Scope: write-ahead dispatch этапа 3; разметить entities runtime phases через private dispatch runtime slot без импорта private core source path.
- Изменено: пока нет.
- Проверки: baseline снят; проверки реализации еще не запускались.
- Coverage: нужен 100% gate по новым чистым entities trace helper modules.
- Риски: baseline содержит accepted core instrumentation; review должен отделять stage-owned entities changes.
- Следующее действие: отправить stage brief исполнителю `019ecab8-3688-7d01-889b-f6ad23e7447c`.

### 2026-06-15 — Этап 3 — Entities phase markup

- Статус: `done`
- `executor-id`: `019ecab8-3688-7d01-889b-f6ad23e7447c`
- Corrective: `0/3`
- Baseline: accepted stages 1-2 delta и журнал оркестратора; staged changes отсутствовали.
- Stage-owned delta: structural entities trace helper, storage/transaction/reduce/reactions phase markup, focused entities trace tests.
- Scope: private runtime slot `"@lite-fsm/core/transition-trace"`, `entities.prepare.transaction`, `entities.spawn.stage`, `entities.reduce.*`, `entities.cleanup.*`, `entities.commit.restorePublicSlices`, `entities.reactions.*`, `entities.effects.*`.
- Изменено: `packages/entities/src/runtime/transitionTrace.ts`, `packages/entities/src/runtime/storage.ts`, `packages/entities/src/runtime/transaction.ts`, `packages/entities/src/runtime/reduce.ts`, `packages/entities/src/runtime/reactions.ts`, `tests/entities/entities-transition-trace.test.ts`.
- Проверки: `pnpm exec vitest run tests/entities` pass; `pnpm exec vitest run tests/entities/entities-transition-trace.test.ts --coverage --coverage.include=packages/entities/src/runtime/transitionTrace.ts --coverage.reporter=text` pass; `pnpm run check-types` pass; `pnpm run lint` pass; `git diff --check` pass; source audit по `@lite-fsm/core/internal`, `performance.now(`, logging, `debugger`, `TODO`, `FIXME` в entities runtime/test scope — clean.
- Coverage: `packages/entities/src/runtime/transitionTrace.ts` — 100% statements/branches/functions/lines.
- Риски: нет; `state.ts`, public API/types, benchmark, diagnostics и docs не менялись.
- Следующее действие: начать этап 4 — добавить `trace` include в benchmark record/report/compare workflow.

### Этап 4 — Benchmark record/report/compare для trace

Статус: `done`

Baseline:

- `executor-id`: `019ecabf-9c56-77b0-a260-e0e3b82c2c04`
- Corrective: `0/3`
- `git status --short`: accepted runtime trace delta in core/entities plus `packages/entities/transition-trace-performance-spec-log.md`; untracked focused trace tests/helpers from stages 1-3.
- `git diff`: accepted stages 1-3 delta plus orchestrator log updates; no staged changes.
- `git diff --staged`: clean
- Active scope: `tests/bench/entities/composition-lite-fsm-entities.fixture.mjs`, `tests/bench/entities/record-node.mjs`, `tests/bench/entities/compare-records.mjs`, `tests/bench/entities/reporting.mjs`, optional `tests/bench/entities/trace.fixture.mjs`, benchmark-focused checks.
- Baseline owner: этапы 1-3 и журнал оркестратора; stage 4 delta должен быть отделим от runtime instrumentation.

Записи:

### 2026-06-15 — Этап 4 — Benchmark record/report/compare для trace

- Статус: `in progress`
- Scope: write-ahead dispatch этапа 4; добавить `--include trace` в benchmark record/report/compare workflow без изменения gate budgets и diagnostics semantics.
- Изменено: пока нет.
- Проверки: baseline снят; проверки реализации еще не запускались.
- Coverage: не применимо; stage gate требует smoke record/compare и JSON/Markdown audit.
- Риски: benchmark smoke может собрать package dist и занять больше времени; запрещенные docs build команды остаются запрещены.
- Следующее действие: отправить stage brief исполнителю `019ecabf-9c56-77b0-a260-e0e3b82c2c04`.

### 2026-06-15 — Этап 4 — Benchmark record/report/compare для trace

- Статус: `done`
- `executor-id`: `019ecabf-9c56-77b0-a260-e0e3b82c2c04`
- Corrective: `0/3`
- Baseline: accepted stages 1-3 delta и журнал оркестратора; staged changes отсутствовали.
- Stage-owned delta: `trace` include в record workflow, public composition fixture reuse, trace aggregation/reporting/compare, новый `trace.fixture.mjs`.
- Scope: `tests/bench/entities/composition-lite-fsm-entities.fixture.mjs`, `tests/bench/entities/record-node.mjs`, `tests/bench/entities/reporting.mjs`, `tests/bench/entities/trace.fixture.mjs`.
- JSON schema summary: `results.trace.scenarios[]` содержит `key`, `label`, `rowCount`, `kind`, `iterations`, `runs`, `transitionCount`, optional `total`, optional `gateEntityMedian`, optional `traceTotalToGateEntityMedian`, flat `phases[]` и flat `coverage[]`; phase содержит `key`, `label`, optional `parentKey`, optional `runtimeKind`, summary metrics, `samples`, optional percent fields; per-operation `records`/`transitions` не сохраняются.
- Проверки: `pnpm run bench:entities:record -- --runs 1 --label transition-trace-smoke --include trace --row-counts 1000` pass; `pnpm run bench:entities:compare -- .bench/entities/transition-trace-smoke.json .bench/entities/transition-trace-smoke.json` pass; `pnpm run bench:entities:record -- --runs 1 --label transition-trace-gate-smoke --include gate,trace --row-counts 1000` pass; `pnpm run bench:entities:record -- --runs 1 --label transition-gate-smoke --include gate --row-counts 1000` pass with expected noisy 1000-row budget failures in report data; `pnpm run bench:entities:record -- --runs 1 --label transition-diagnostics-smoke --include diagnostics --row-counts 1000` pass; JSON consistency audit pass; Markdown audit pass; `node --check` for changed benchmark scripts pass; `git diff --check` pass.
- Coverage: не применимо; этап проверен benchmark smoke, artifact schema audit и script syntax checks.
- Риски: stable `50_000` baseline еще не запускался; это scope этапа 5. `diagnostics` остается в основном workflow до этапа 6.
- Следующее действие: начать этап 5 — записать `transition-trace-baseline`, выполнить self-compare и обновить `packages/entities/PERFORMANCE.md` и `tests/bench/README.md`.

### Этап 5 — Baseline trace report и документация workflow

Статус: `done`

Записи:

### 2026-06-15 — Этап 5 — Baseline trace report и документация workflow

- Статус: `in progress`
- `executor-id`: `019ecacb-48f2-7a43-bfdd-ed94e42fc6df`
- Corrective: `0/3`
- Baseline: accepted stages 1-4 delta plus orchestrator log updates; staged changes отсутствуют.
- `git status --short`: accepted runtime trace delta in core/entities, accepted benchmark trace delta, updated `packages/entities/transition-trace-performance-spec-log.md`, untracked focused trace helpers/tests from previous stages.
- `git diff`: accepted stages 1-4 delta plus orchestrator log updates; no staged changes.
- `git diff --staged`: clean
- Active scope: `.bench/entities/transition-trace-baseline.json`, `.bench/entities/transition-trace-baseline.md`, `packages/entities/PERFORMANCE.md`, `tests/bench/README.md`, and this log.
- Scope: write-ahead dispatch этапа 5; записать stable baseline, self-compare и описать trace workflow без изменения benchmark budgets или diagnostics migration.
- Изменено: пока нет.
- Проверки: baseline снят; проверки реализации еще не запускались.
- Coverage: не применимо; stage gate требует stable record, self-compare, artifact consistency audit и `git diff --check`.
- Риски: stable `50_000` baseline может занять больше времени; запрещенные docs build команды остаются запрещены.
- Следующее действие: отправить stage brief исполнителю `019ecacb-48f2-7a43-bfdd-ed94e42fc6df`.

### 2026-06-15 — Этап 5 — Baseline trace report и документация workflow

- Статус: `done`
- `executor-id`: `019ecacb-48f2-7a43-bfdd-ed94e42fc6df`
- Corrective: `0/3`
- Baseline: accepted stages 1-4 delta и журнал оркестратора; staged changes отсутствовали.
- Stage-owned delta: baseline artifacts `.bench/entities/transition-trace-baseline.{json,md}`, trace baseline summary in `packages/entities/PERFORMANCE.md`, trace workflow docs in `tests/bench/README.md`.
- Scope: stable trace baseline for `50_000`, self-compare, workflow docs; benchmark budgets, diagnostics migration and public API/types не менялись.
- Проверки: executor ran `pnpm run bench:entities:record -- --runs 5 --label transition-trace-baseline --include gate,trace --row-counts 50000` pass; orchestrator verified generated artifact command metadata/config; orchestrator ran `pnpm run bench:entities:compare -- .bench/entities/transition-trace-baseline.json .bench/entities/transition-trace-baseline.json` pass; baseline artifact consistency audit pass; docs audit pass; `git diff --check` pass.
- Coverage: не применимо; этап изменяет artifacts/docs.
- Hotspots: `sprite sync reaction / 50_000` остается главным кандидатом: `core.reactions.total` 2.645ms, `entities.reactions.total` 2.642ms, `entities.reactions.user` 2.015ms; secondary targets `entities.reactions.captureScope` 0.565ms and `entities.reduce.publicBatch.total` 1.079ms. `traceTotal / gateEntityMedian > 2.00x` warnings absent.
- Риски: gate `movement update` and `projectile lifetime update` at `50_000` have high variance in baseline artifact; docs build commands were not run by agents and remain prohibited.
- Следующее действие: начать этап 6 — удалить `diagnostics` include из основного record workflow или явно вывести synthetic diagnostics в legacy path.

### Этап 6 — Миграция synthetic diagnostics

Статус: `done`

Записи:

### 2026-06-15 — Этап 6 — Миграция synthetic diagnostics

- Статус: `in progress`
- `executor-id`: `019ecad7-c02d-79c0-8310-6ecd166934c2`
- Corrective: `0/3`
- Baseline: accepted stages 1-5 delta plus orchestrator log updates; staged changes отсутствуют.
- `git status --short`: accepted runtime trace delta in core/entities, accepted benchmark trace delta, `packages/entities/PERFORMANCE.md`, `tests/bench/README.md`, updated implementation log, untracked focused trace helpers/tests from previous stages.
- `git diff`: accepted stages 1-5 delta plus orchestrator log updates; no staged changes.
- `git diff --staged`: clean
- Active scope: `tests/bench/entities/diagnostics.fixture.mjs`, `tests/bench/entities/run-diagnostics-node.mjs`, `tests/bench/entities/record-node.mjs`, `tests/bench/entities/reporting.mjs`, `tests/bench/entities/compare-records.mjs`, `tests/bench/README.md`, `packages/entities/PERFORMANCE.md`, package scripts if needed.
- Scope: write-ahead dispatch этапа 6; убрать `diagnostics` include из основного record workflow, сохранить чтение старых diagnostics records in compare, docs перевести на `gate,trace`.
- Изменено: пока нет.
- Проверки: baseline снят; проверки реализации еще не запускались.
- Coverage: не применимо; stage gate требует smoke `gate,trace`, old/new compare compatibility and `git diff --check`.
- Риски: historical diagnostics artifacts не удалять; docs build commands запрещены.
- Следующее действие: отправить stage brief исполнителю `019ecad7-c02d-79c0-8310-6ecd166934c2`.

### 2026-06-15 — Этап 6 — Миграция synthetic diagnostics

- Статус: `done`
- `executor-id`: `019ecad7-c02d-79c0-8310-6ecd166934c2`
- Corrective: `0/3`
- Baseline: accepted stages 1-5 delta и журнал оркестратора; staged changes отсутствовали.
- Stage-owned delta: `record-node.mjs` accepts/defaults only `gate,trace`; `diagnostics.fixture.mjs` and `run-diagnostics-node.mjs` remain as legacy synthetic calibration; root script renamed to `bench:entities:legacy-diagnostics`; reporting/compare labels old diagnostics as legacy; docs switched current workflow to `gate,trace`.
- Scope: `package.json`, benchmark record/reporting scripts, legacy diagnostics marker, `tests/bench/README.md`, `packages/entities/PERFORMANCE.md`.
- Проверки: `pnpm run bench:entities:record -- --runs 1 --label transition-trace-post-diagnostics-smoke --include gate,trace --row-counts 1000` pass; `pnpm run bench:entities:compare -- .bench/entities/transition-diagnostics-smoke.json .bench/entities/transition-trace-post-diagnostics-smoke.json` pass and reports missing sections gracefully; `node --check` for changed benchmark `.mjs` scripts pass; JSON audit confirms new record has `command.include = gate,trace` and no `results.diagnostics`; package script audit pass; `pnpm run bench:entities:record -- --include diagnostics` rejects `diagnostics` as unknown; `git diff --check` pass.
- Coverage: не применимо; этап изменяет benchmark workflow/docs.
- Риски: historical `PERFORMANCE.md` sections still contain old diagnostics commands and `raw entity kernel` values as provenance, with explicit note that they are legacy and not current production attribution. Historical `.bench` artifacts were not deleted. Docs build commands were not run.
- Следующее действие: начать этап 7 — cleanup/refactor/source audit, then final readiness gate.

### Этап 7 — Рефакторинг, чистка и полировка

Статус: `done`

Записи:

### 2026-06-15 — Этап 7 — Рефакторинг, чистка и полировка

- Статус: `in progress`
- `executor-id`: `019ecade-3438-7cc3-9f51-14c29b9eb58b`
- Corrective: `0/3`
- Baseline: accepted stages 1-6 delta plus orchestrator log updates; staged changes отсутствуют.
- `git status --short`: accepted runtime trace delta in core/entities, accepted benchmark trace/diagnostics migration/docs delta, updated implementation log, untracked focused trace helpers/tests.
- `git diff`: accepted stages 1-6 delta plus orchestrator log updates; no staged changes.
- `git diff --staged`: clean
- Active scope: core/entities trace helpers and instrumentation, benchmark trace/legacy diagnostics scripts, benchmark docs, focused trace tests, package script rename.
- Scope: write-ahead dispatch этапа 7; cleanup/refactor/source audit без изменения trace schema, phase labels, public API or benchmark budgets.
- Изменено: пока нет.
- Проверки: baseline снят; проверки реализации еще не запускались.
- Coverage: required for new pure helpers if cleanup changes them; otherwise verify existing coverage gates still pass.
- Риски: source audit will have expected historical/spec/log hits; forbidden docs build commands remain prohibited.
- Следующее действие: отправить stage brief исполнителю `019ecade-3438-7cc3-9f51-14c29b9eb58b`.

### 2026-06-15 — Этап 7 — Рефакторинг, чистка и полировка

- Статус: `done`
- `executor-id`: `019ecade-3438-7cc3-9f51-14c29b9eb58b`
- Corrective: `0/3`
- Baseline: accepted stages 1-6 delta и журнал оркестратора; staged changes отсутствовали.
- Stage-owned delta: focused branch-coverage test for `readTransitionTraceSession`; runtime, trace schema, phase labels, docs and public API unchanged.
- Scope: cleanup/source audit and integrated trace workflow quality gate.
- Проверки: `pnpm exec vitest run tests/core/transition-trace.test.ts tests/entities/entities-transition-trace.test.ts` pass; core trace helper coverage pass at 100% statements/branches/functions/lines; entities trace helper coverage pass at 100% statements/branches/functions/lines; `pnpm run bench:entities:record -- --runs 1 --label transition-trace-cleanup-smoke --include gate,trace --row-counts 1000` pass with expected noisy gate failures in report data; `pnpm run bench:entities:compare -- .bench/entities/transition-trace-cleanup-smoke.json .bench/entities/transition-trace-cleanup-smoke.json` pass; `pnpm run check-types` pass; `pnpm run lint` pass; `git diff --check` pass; active workflow audit pass.
- Coverage: `packages/core/src/runtime/kernel/transitionTrace.ts` and `packages/entities/src/runtime/transitionTrace.ts` both 100% statements/branches/functions/lines.
- Expected remaining hits: CLI `console.log` in benchmark command scripts; internal core imports in focused core tests; legacy diagnostics references in legacy scripts/reporting and historical docs; old `--include diagnostics` mentions only in spec/log/historical provenance.
- Риски: нет; trace schema/phase labels/public API were not changed. Forbidden docs build commands were not run.
- Следующее действие: выполнить финальный readiness gate по интегрированному результату.

## Финальная проверка

- Статус: `done`

Записи:

### 2026-06-15 — Финальная проверка

- Статус: `in progress`
- Scope: integrated readiness gate after stages 1-7; rerun stable baseline on final record/report workflow, verify artifacts/docs/tests/audits.
- Проверки: стартуют после этой записи.
- Риски: rerun of `transition-trace-baseline` may update ignored benchmark artifacts; docs summary must be checked against final artifact.
- Следующее действие: запустить exact stable baseline command, self-compare, focused regressions, type/lint and source audits.

### 2026-06-15 — Финальная проверка

- Статус: `done`
- Scope: integrated result after stages 1-7; final benchmark artifacts, docs, trace runtime, benchmark workflow and public surface.
- Проверки: `pnpm run bench:entities:record -- --runs 5 --label transition-trace-baseline --include gate,trace --row-counts 50000` pass on final workflow; generated `.bench/entities/transition-trace-baseline.{json,md}` at `2026-06-15T10:47:22.275Z`; `pnpm run bench:entities:compare -- .bench/entities/transition-trace-baseline.json .bench/entities/transition-trace-baseline.json` pass; final artifact/doc audit pass; `pnpm exec vitest run tests/core/transition-trace.test.ts tests/entities/entities-transition-trace.test.ts` pass; `pnpm run check-types` pass; `pnpm run lint` pass; `git diff --check` pass; final active workflow audit pass.
- Coverage: stage 7 confirmed `packages/core/src/runtime/kernel/transitionTrace.ts` and `packages/entities/src/runtime/transitionTrace.ts` at 100% statements/branches/functions/lines.
- Artifacts/docs: baseline trace contains only `50_000` row trace scenarios and no `results.diagnostics`; `packages/entities/PERFORMANCE.md` matches final baseline medians and next target; `tests/bench/README.md` describes current `gate,trace` workflow and legacy diagnostics policy.
- Public surface: public API/types unchanged; `tests/types/exports-surface.tst.ts` and `tests/types/entities-api.tst.ts` passed through `pnpm run check-types`.
- Expected remaining hits: CLI `console.log` in benchmark command scripts; internal core imports in focused core tests; historical/spec/log mentions of old diagnostics workflow; legacy diagnostics script/reporting references by design.
- Запрещенные команды: docs build commands were not run (`pnpm run build`, docs/pages builds, and `next build` inside `apps/docs` remain delegated to user/CI if needed).
- Риски: `movement update` and `projectile lifetime update` gate medians in the final baseline have high run variance, but trace attribution remains stable; this is recorded in `PERFORMANCE.md`.
- Следующее действие: цель выполнена; дальнейшая работа — отдельное optimization ТЗ for `sprite sync reaction / 50_000`, especially `entities.reactions.user`.
