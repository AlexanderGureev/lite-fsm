# Журнал реализации ТЗ `@lite-fsm/entities` reaction scope

ТЗ: [`reaction-scope-performance-spec.md`](./reaction-scope-performance-spec.md)

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

- Активное ТЗ: `packages/entities/reaction-scope-performance-spec.md`
- Активный этап: Этап 4 — Benchmarks, docs и performance report
- Статус: `blocked`
- Следующее действие: решить blocker Этапа 4: продолжать оптимизацию вне problem 2 или изменить performance gate.

## Сводка по этапам

| Этап | Название | Статус | Последнее обновление |
| ---- | -------- | ------ | -------------------- |
| 1 | Reaction diagnostics breakdown | `done` | 2026-06-14 |
| 2 | Reaction batch ownership | `done` | 2026-06-14 |
| 3 | Fast reaction self, access и deps | `done` | 2026-06-14 |
| 4 | Benchmarks, docs и performance report | `blocked` | 2026-06-15 |
| 5 | Рефакторинг, чистка и полировка | `not started` | — |

## Ход реализации

### Этап 1 — Reaction diagnostics breakdown

Статус: `done`

Записи:

### 2026-06-14 — Этап 1 — Reaction diagnostics breakdown

- Статус: `in progress`
- Исполнитель: `019ec7c9-bb2d-7f91-adb0-6b8a12f2b8a0`
- Baseline: `git status --short` пустой; `git diff` пустой; `git diff --staged` пустой.
- Stage-owned delta: отсутствует перед dispatch.
- Corrective: `0/3`.
- Scope: benchmark diagnostics для `sprite sync reaction`; production benchmark env в `record-node.mjs`; runtime не менять.
- Изменено: журнал.
- Проверки: не запускались.
- Coverage: не применимо до изменений.
- Риски: нет.
- Следующее действие: исполнитель реализует Этап 1 и возвращает `ready_for_review` или `blocked`.

### 2026-06-14 — Этап 1 — Reaction diagnostics breakdown

- Статус: `done`
- Исполнитель: `019ec7c9-bb2d-7f91-adb0-6b8a12f2b8a0`
- Baseline: `git status --short` пустой; `git diff` пустой; `git diff --staged` пустой.
- Stage-owned delta: `tests/bench/entities/diagnostics.fixture.mjs`, `tests/bench/entities/record-node.mjs`; журнал изменен оркестратором.
- Corrective: `0/3`.
- Scope: добавлен breakdown `sprite sync reaction`; `record-node.mjs` выставляет `NODE_ENV=production` до импорта fixtures; runtime, docs и public surface не менялись.
- Изменено: benchmark diagnostics fixture и benchmark record entrypoint.
- Проверки: `pnpm run bench:entities:record -- --runs 1 --label reaction-breakdown-smoke --include diagnostics --row-counts 1000` — passed; `pnpm run bench:entities:compare -- .bench/entities/reaction-breakdown-smoke.json .bench/entities/reaction-breakdown-smoke.json` — passed; `pnpm run bench:entities:record -- --runs 1 --label reaction-breakdown-50k-verify --include diagnostics --row-counts 50000` — passed; `git diff --check` — passed.
- Baseline values: `sprite sync reaction / 50 000`: `raw entity kernel` `5.818ms`, `reduce entity batches` `1.641ms`, `schedule reaction batch` `0.038ms`, `collect reaction scope` `0.597ms`, `create reaction deps` `3.639ms`, `run user reaction` `0.095ms`, `public manager.transition` `8.156ms`; breakdown sum `6.010ms` (`103.3%` от raw kernel).
- Coverage: не применимо; менялись benchmark fixtures, runtime behavior не менялся.
- Риски: benchmark smoke artifacts обновили ignored `.bench/entities/latest.*` и label aliases; tracked diff не включает benchmark artifacts.
- Следующее действие: начать Этап 2 — Reaction batch ownership.

### Этап 2 — Reaction batch ownership

Статус: `done`

Записи:

### 2026-06-14 — Этап 2 — Reaction batch ownership

- Статус: `in progress`
- Исполнитель: `019ec7d1-6be2-7c21-badb-8004943cc62b`
- Baseline: `git status --short` показывает изменения Этапа 1 в `packages/entities/reaction-scope-performance-spec-log.md`, `tests/bench/entities/diagnostics.fixture.mjs`, `tests/bench/entities/record-node.mjs`; `git diff --staged` пустой.
- Stage-owned delta: отсутствует перед dispatch.
- Corrective: `0/3`.
- Scope: runtime reaction batch ownership в `packages/entities/src/runtime/transaction.ts`, `reactions.ts`, `reduce.ts`, `state.ts`, при необходимости `compile.ts`; focused tests в `tests/entities/entities-plugin.test.ts`.
- Изменено: журнал.
- Проверки: не запускались.
- Coverage: не применимо до изменений.
- Риски: baseline уже содержит принятый diff Этапа 1; исполнитель не должен изменять benchmark diagnostics или журнал.
- Следующее действие: исполнитель реализует Этап 2 и возвращает `ready_for_review` или `blocked`.

### 2026-06-14 — Этап 2 — Reaction batch ownership

- Статус: `done`
- Исполнитель: `019ec7d1-6be2-7c21-badb-8004943cc62b`
- Baseline: изменения Этапа 1 в `packages/entities/reaction-scope-performance-spec-log.md`, `tests/bench/entities/diagnostics.fixture.mjs`, `tests/bench/entities/record-node.mjs`; `git diff --staged` пустой.
- Stage-owned delta: `packages/entities/src/runtime/transaction.ts`, `packages/entities/src/runtime/reduce.ts`, `tests/entities/entities-plugin.test.ts`; журнал изменен оркестратором.
- Corrective: `0/3`.
- Scope: `EntityReactionBatch` получил `borrowed`/`owned`; owned indices идут через transaction scratch pool; ordinary borrowed ограничен unscoped single-bucket identity без state movement и `despawnOn` риска; lifecycle reactions создаются через тот же helper как owned.
- Изменено: runtime transaction/reduce ownership и focused reaction tests.
- Проверки: `pnpm exec vitest run tests/entities/entities-plugin.test.ts --coverage --coverage.include=packages/entities/src/runtime/transaction.ts --coverage.include=packages/entities/src/runtime/reduce.ts` — passed, 143 tests, coverage summary 100%; `pnpm run check-types` — passed; `pnpm run lint` — passed; `git diff --check` — passed.
- Coverage: `100%` statements/branches/functions/lines для focused include `transaction.ts` и `reduce.ts`.
- Риски: borrowed policy консервативная; potential safe cases вне single-bucket identity остаются owned. Public API, docs, benchmark files и effect scope не менялись.
- Следующее действие: начать Этап 3 — Fast reaction self, access и deps.

### Этап 3 — Fast reaction self, access и deps

Статус: `done`

Записи:

### 2026-06-14 — Этап 3 — Fast reaction self, access и deps

- Статус: `in progress`
- Исполнитель: `019ec7dd-5dae-7bd2-bb43-3adfcbf6ea8c`
- Baseline: `git status --short` показывает принятые изменения Этапов 1-2 в журнале, benchmark diagnostics, `record-node.mjs`, `transaction.ts`, `reduce.ts`, `tests/entities/entities-plugin.test.ts`; `git diff --staged` пустой.
- Stage-owned delta: отсутствует перед dispatch.
- Corrective: `0/3`.
- Scope: reaction hot path в `packages/entities/src/runtime/reactions.ts`, `access.ts`, `transaction.ts`; focused tests в `tests/entities/entities-plugin.test.ts`; runtime ownership из Этапа 2 сохранить.
- Изменено: журнал.
- Проверки: не запускались.
- Coverage: не применимо до изменений.
- Риски: baseline уже содержит принятый diff Этапов 1-2; исполнитель не должен менять benchmark diagnostics, docs или журнал.
- Следующее действие: исполнитель реализует Этап 3 и возвращает `ready_for_review` или `blocked`.

### 2026-06-14 — Этап 3 — Fast reaction self, access и deps

- Статус: `done`
- Исполнитель: `019ec7dd-5dae-7bd2-bb43-3adfcbf6ea8c`
- Baseline: принятые изменения Этапов 1-2 в журнале, benchmark diagnostics, `record-node.mjs`, `transaction.ts`, `reduce.ts`, `tests/entities/entities-plugin.test.ts`; `git diff --staged` пустой.
- Stage-owned delta: `packages/entities/src/runtime/reactions.ts`, `packages/entities/src/runtime/access.ts`, `tests/entities/entities-plugin.test.ts`; журнал изменен оркестратором.
- Corrective: `0/3`.
- Scope: reaction hot path переведен на marker/generation scratch без `CapturedEntityScopeEntry[]` и `Map`; reaction deps создаются через prototype shadowing без spread/delete; `transition` и `condition` shadowed как `undefined`; effect captured-entry path сохранен.
- Изменено: runtime reactions/access и focused reaction semantics tests.
- Проверки: `pnpm exec vitest run tests/entities/entities-plugin.test.ts --coverage --coverage.include=packages/entities/src/runtime/reactions.ts --coverage.include=packages/entities/src/runtime/access.ts` — passed, 145 tests, coverage summary 100%; `pnpm run check-types` — passed; `pnpm run lint` — passed; `git diff --check` — passed; `rg -n "collectReactionScopeEntries|entriesByEntity|CapturedEntityScopeEntry|new Map" packages/entities/src/runtime/reactions.ts packages/entities/src/runtime/access.ts` — expected hits только в root access cache и effect captured-scope path.
- Coverage: `100%` statements/branches/functions/lines для focused include `reactions.ts` и `access.ts`.
- Риски: `CapturedEntityScopeEntry` остается в effect scope; это expected remaining hit и соответствует ТЗ. Public types, docs и benchmark files на этапе не менялись.
- Следующее действие: начать Этап 4 — Benchmarks, docs и performance report.

### Этап 4 — Benchmarks, docs и performance report

Статус: `blocked`

Записи:

### 2026-06-14 — Этап 4 — Benchmarks, docs и performance report

- Статус: `in progress`
- Исполнитель: `019ec7e6-7032-73b1-83c3-14cee8914e56`
- Baseline: `git status --short` показывает принятые изменения Этапов 1-3 в журнале, runtime reaction/ownership files, benchmark diagnostics, `record-node.mjs`, `tests/entities/entities-plugin.test.ts`; `git diff --staged` пустой.
- Stage-owned delta: отсутствует перед dispatch.
- Corrective: `0/3`.
- Scope: benchmark diagnostics fixture alignment, record/compare artifacts, `packages/entities/README.md`, `packages/entities/PERFORMANCE.md`, `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`.
- Изменено: журнал.
- Проверки: не запускались.
- Coverage: не применимо до изменений.
- Риски: stable benchmark может показать, что first gate не достигнут; тогда этап должен вернуться `blocked` с evidence breakdown.
- Следующее действие: исполнитель реализует Этап 4 и возвращает `ready_for_review` или `blocked`.

### 2026-06-14 — Этап 4 — Benchmarks, docs и performance report

- Статус: `blocked`
- Исполнитель: `019ec7e6-7032-73b1-83c3-14cee8914e56`
- Baseline: принятые изменения Этапов 1-3 в журнале, runtime reaction/ownership files, benchmark diagnostics, `record-node.mjs`, `tests/entities/entities-plugin.test.ts`; `git diff --staged` пустой.
- Stage-owned delta: `tests/bench/entities/diagnostics.fixture.mjs`, `.bench/entities/after-reaction-scope.json`, `.bench/entities/after-reaction-scope.md`, `.bench/entities/after-reaction-scope-vs-after-despawn-cleanup.md`, `.bench/entities/after-reaction-scope-vs-codex-baseline-2026-06-14.md`, `packages/entities/README.md`, `packages/entities/PERFORMANCE.md`, `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`; журнал изменен оркестратором.
- Corrective: `0/3`.
- Scope: diagnostics fixture измеряет fast reaction scope без `indices.slice()`, `entries[]` и `Map`; contract docs описывают sync-only reaction scope; performance report сохраняет итог problem 2 как недостигший gate.
- Изменено: benchmark diagnostics fixture, benchmark artifacts и contract/performance docs.
- Проверки: `pnpm run bench:entities:record -- --runs 1 --label reaction-scope-smoke --include gate,diagnostics --row-counts 1000` — passed; `pnpm run bench:entities:record -- --runs 5 --label after-reaction-scope --include gate,diagnostics` — passed; `pnpm run bench:entities:compare -- .bench/entities/after-despawn-cleanup.json .bench/entities/after-reaction-scope.json` — passed; compare с `.bench/entities/codex-baseline-2026-06-14.json` — passed; `git diff --check` — passed; forbidden docs build commands не запускались.
- Metrics: `sprite sync reaction / 50 000 / raw entity kernel` `2.346ms` при gate `<2ms`; `public manager.transition` `4.753ms`, overhead к kernel `2.407ms` при gate `<=0.3ms`; gate median `4.792ms` против baseline `8.259ms`; RSD after `5.0%`.
- Breakdown: `reduce entity batches` `1.681ms`, `collect reaction scope` `0.433ms`, `create reaction deps` `0.000ms`, `run user reaction` `0.094ms`; remaining cost в основном общий reducer pipeline и public path.
- Neighbor gates: `movement update` regression `13.0%` / `13.2%`; `projectile lifetime update` regression `12.9%` / `14.6%`; `despawnOn cleanup` regression `6.4%` / `5.9%`.
- Coverage: не применимо; runtime behavior на этапе не менялся.
- Риски: Этап 4 не может быть закрыт без runtime/performance работ вне своего scope. Следующий незакрытый этап остается `blocked`; Stage 5 и финальная проверка не начинаются.
- Следующее действие: решение пользователя или новое ТЗ: продолжить оптимизацию generic reducer/public path или скорректировать performance gate.

### 2026-06-15 — Этап 4 — corrective attempt откатан

- Статус: `blocked`
- Scope: проверялась узкая внутренняя оптимизация reaction path без изменения метрик: compile-time mask для safe borrowed reactions, пропуск reaction ownership для stores без reactions и O(1) инвалидирование reaction scope через active token.
- Проверки: `pnpm run bench:entities:record -- --runs 3 --label after-reaction-scope-corrective --include gate,diagnostics` показал отсутствие значимого выигрыша: `sprite sync reaction / 50 000` остался около `4.870ms`, raw entity kernel — около `2.455ms`, public overhead остался выше gate.
- Итог: изменение усложняло runtime и не приближало gate, поэтому кодовые правки и тесты этого corrective-этапа откатаны; временные benchmark artifacts удалены, `.bench/entities/latest.*` восстановлены из `after-reaction-scope`.
- Проверки после отката: `pnpm exec vitest run tests/entities/entities-plugin.test.ts --coverage --coverage.include=packages/entities/src/runtime/reactions.ts --coverage.include=packages/entities/src/runtime/access.ts --coverage.include=packages/entities/src/runtime/reduce.ts` — passed, 145 tests, coverage summary 100%; `git diff --check` — passed.
- Следующее действие: продолжать оптимизацию стоит в общем reducer/public path, а не в локальном reaction scope слое.

### Этап 5 — Рефакторинг, чистка и полировка

Статус: `not started`

Записи:

- Записей пока нет.

## Финальная проверка

- Статус: `not started`
- Записи: нет.
