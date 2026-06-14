# Журнал реализации ТЗ `@lite-fsm/entities` despawn cleanup

ТЗ: [`despawn-cleanup-performance-spec.md`](./despawn-cleanup-performance-spec.md)

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

- Активное ТЗ: `packages/entities/despawn-cleanup-performance-spec.md`
- Активный этап: Финальная проверка
- Статус: `done`
- Исполнитель: оркестратор
- Corrective: —
- Baseline: все этапы 1-5 имеют status `done`; финальная проверка выполняется на интегрированном diff.
- Следующее действие: цель готова к итоговому отчету.

## Сводка по этапам

| Этап | Название | Статус | Последнее обновление |
| ---- | -------- | ------ | -------------------- |
| 1 | Контракты, metadata и transaction scratch | `done` | 2026-06-14 |
| 2 | Indexed ownership и batch removal primitives | `done` | 2026-06-14 |
| 3 | Lifecycle cleanup pipeline | `done` | 2026-06-14 |
| 4 | Tests, benchmarks и документация | `done` | 2026-06-14 |
| 5 | Рефакторинг, чистка и полировка | `done` | 2026-06-14 |

## Ход реализации

### Этап 1 — Контракты, metadata и transaction scratch

Статус: `done`

Записи:

- 2026-06-14: baseline зафиксирован перед dispatch: `git status --short`, `git diff`, `git diff --staged` пустые. Исполнитель: `019ec739-5058-7a80-a9e3-4b0c6283729a`. Corrective: `0/3`. Scope: `packages/entities/src/runtime/compile.ts`, `packages/entities/src/runtime/transaction.ts`, focused tests в `tests/entities/entities-plugin.test.ts`. Stage-owned delta пока отсутствует. Следующее действие: dispatch Stage 1 brief исполнителю.
- 2026-06-14: `accept`, corrective `0/3`. Stage-owned delta: `EntityTemplateMetadata.despawnLifecycleStateMask` для accepted `ENTITY_DESPAWNED` transition с reducer или `reactions.ENTITY_DESPAWNED`; reusable per-runtime despawn scratch без `new Uint8Array(0)` на каждый dispatch; regression tests для dedupe, stale mark reset и lifecycle metadata classification. Измененные файлы: `packages/entities/src/runtime/compile.ts`, `packages/entities/src/runtime/transaction.ts`, `tests/entities/entities-plugin.test.ts`. Проверки: `pnpm exec vitest run tests/entities/entities-plugin.test.ts` — passed, 119 tests; `pnpm exec vitest run tests/entities/entities-plugin.test.ts --coverage --coverage.include=packages/entities/src/runtime/compile.ts --coverage.include=packages/entities/src/runtime/transaction.ts --coverage.reporter=text` — 100% statements/branches/functions/lines; `pnpm run check-types` — passed; `pnpm run lint` — passed; `git diff --check` — passed. Public exports не изменялись; public type tests прошли как часть `check-types`. Следующее действие: Этап 2.

### Этап 2 — Indexed ownership и batch removal primitives

Статус: `done`

Записи:

- 2026-06-14: baseline зафиксирован перед dispatch: accepted Stage 1 diff в `packages/entities/despawn-cleanup-performance-spec-log.md`, `packages/entities/src/runtime/compile.ts`, `packages/entities/src/runtime/transaction.ts`, `tests/entities/entities-plugin.test.ts`; staged diff отсутствует. Исполнитель: `019ec740-eb84-7203-9990-817d43b52b85`. Corrective: `0/3`. Scope: `packages/entities/src/runtime/state.ts`, при необходимости `packages/entities/src/runtime/reduce.ts` и focused tests в `tests/entities/entities-plugin.test.ts`. Stage-owned delta пока отсутствует. Следующее действие: dispatch Stage 2 brief исполнителю.
- 2026-06-14: `return_to_subagent`, corrective `1/3`. Review gate статически прошел по ownership shape: `EntityActorRowRef` хранит позиции, swap-remove обновляет moved refs, batch primitives не подключены к `flushEntityLifecycleCleanup`. Verify gate не принят: `pnpm exec vitest run tests/entities/entities-plugin.test.ts --coverage --coverage.include=packages/entities/src/runtime/state.ts --coverage.include=packages/entities/src/runtime/reduce.ts --coverage.reporter=text` завершился с coverage ниже 100%; uncovered `packages/entities/src/runtime/state.ts:357` и `packages/entities/src/runtime/state.ts:465`. Предыдущие проверки: Stage 2 focused Vitest — passed, full `tests/entities/entities-plugin.test.ts` — passed, `git diff --check` — passed. Следующее действие: corrective исполнителю, закрыть coverage gaps и повторить проверки.
- 2026-06-14: `accept`, corrective `1/3`. Stage-owned delta: `EntityActorRowRef` получил `groupTag`, `entityRowsPosition`, `groupRowsPosition`; ownership removal стал swap-remove с обновлением moved ref positions; добавлены `removeActorRowsForStore` и `removeEntityRecords`; `removeActorRow`, `removeEntityIfEmpty`, `removeEntityRows` оставлены совместимыми wrappers; snapshot rollback клонирует shared row refs с позициями. Измененные файлы: `packages/entities/src/runtime/state.ts`, `packages/entities/src/runtime/reduce.ts`, `tests/entities/entities-plugin.test.ts`. Проверки: `pnpm exec vitest run tests/entities/entities-plugin.test.ts --testNamePattern "despawn cleanup этап 2"` — passed, 5 tests; `pnpm exec vitest run tests/entities/entities-plugin.test.ts` — passed, 124 tests; `pnpm exec vitest run tests/entities/entities-plugin.test.ts --coverage --coverage.include=packages/entities/src/runtime/state.ts --coverage.include=packages/entities/src/runtime/reduce.ts --coverage.reporter=text` — 100% statements/branches/functions/lines; `pnpm run check-types` — passed; `pnpm run lint` — passed; `git diff --check` — passed. Source audit: один владелец mutation logic для actor row removal плюс совместимые wrappers; batch primitives не подключены к `flushEntityLifecycleCleanup`. Следующее действие: Этап 3.

### Этап 3 — Lifecycle cleanup pipeline

Статус: `done`

Записи:

- 2026-06-14: baseline зафиксирован перед dispatch: accepted Stage 1+2 diff в `packages/entities/despawn-cleanup-performance-spec-log.md`, `packages/entities/src/runtime/compile.ts`, `packages/entities/src/runtime/reduce.ts`, `packages/entities/src/runtime/state.ts`, `packages/entities/src/runtime/transaction.ts`, `tests/entities/entities-plugin.test.ts`; staged diff отсутствует. Исполнитель: `019ec74e-cdb1-73e3-bbaa-3630f81b854d`. Corrective: `0/3`. Scope: `packages/entities/src/runtime/reduce.ts`, `packages/entities/src/runtime/state.ts`, focused lifecycle tests в `tests/entities/entities-plugin.test.ts`, при необходимости `tests/react/entities.test.tsx`. Stage-owned delta пока отсутствует. Следующее действие: dispatch Stage 3 brief исполнителю.
- 2026-06-14: `return_to_subagent`, corrective `1/3`. Review gate не принят: в новом Stage 3 тесте `пустой ENTITY_DESPAWNED transition остается fast path...` есть точное ожидание `store.version === beforeVersion + 2`, что противоречит контракту `version` как invalidation token; в `packages/entities/src/runtime/reduce.ts` `v8 ignore next` стоит на нормальных cleanup touch branches `if (removedRows)` и `if (removedEntities)`, что скрывает активную production logic ради coverage. Следующее действие: corrective исполнителю, убрать exact version assertion и coverage ignore для активных веток, повторить focused tests/coverage/type/lint.
- 2026-06-14: `return_to_subagent`, corrective `2/3`. Review gate еще не принят: exact version assertion исправлен, active `v8 ignore` убран, но `touched = Boolean(Number(touched) + Number(...))` в `flushEntityLifecycleCleanup` выглядит как coverage workaround и не проходит No-hacks gate. Следующее действие: заменить на прямой линейный boolean update без numeric coercion, повторить focused tests/coverage/type/lint.
- 2026-06-14: `accept`, corrective `2/3`. Stage-owned delta: `flushEntityLifecycleCleanup` строит cleanup plan, использует `despawnLifecycleStateMask` для lifecycle rows, не запускает cleanup state effects/terminal scheduling, выполняет lifecycle reducer/reaction до физического удаления и затем удаляет actor rows/entity records через batch primitives; terminal cleanup переведен на batch removal; rollback snapshot сохраняет row ref identity/positions. Измененные файлы: `packages/entities/src/runtime/reduce.ts`, `tests/entities/entities-plugin.test.ts`. Проверки: `pnpm exec vitest run tests/entities/entities-plugin.test.ts --testNamePattern "despawn cleanup этап 3"` — passed, 11 tests; `pnpm exec vitest run tests/entities/entities-plugin.test.ts --testNamePattern "^(?!.*dehydrate JSON hydrate).*" --coverage --coverage.include=packages/entities/src/runtime/reduce.ts --coverage.reporter=text` — 100% statements/branches/functions/lines; `pnpm run check-types` — passed; `pnpm run lint` — passed; `git diff --check` — passed. Expected remaining audit hit для Stage 4: полный `tests/entities/entities-plugin.test.ts` содержит старое snapshot sanitation ожидание для dead row columns; Stage 4 должен обновить тест и `dehydrate()` sanitation. Следующее действие: Этап 4.

### Этап 4 — Tests, benchmarks и документация

Статус: `done`

Записи:

- 2026-06-14: baseline зафиксирован перед dispatch: accepted Stage 1-3 diff в `packages/entities/despawn-cleanup-performance-spec-log.md`, `packages/entities/src/runtime/compile.ts`, `packages/entities/src/runtime/reduce.ts`, `packages/entities/src/runtime/state.ts`, `packages/entities/src/runtime/transaction.ts`, `tests/entities/entities-plugin.test.ts`; staged diff отсутствует. Исполнитель: `019ec75e-bdf9-7a61-a143-f44a13815f17`. Corrective: `0/3`. Scope: `packages/entities/src/runtime/snapshot.ts`, `tests/entities/entities-plugin.test.ts`, `tests/react/entities.test.tsx`, `tests/entities/entities-examples.test.ts`, `tests/bench/entities/*`, `.bench/entities/*`, `packages/entities/README.md`, `packages/entities/PERFORMANCE.md`, `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`. Stage-owned delta пока отсутствует. Следующее действие: dispatch Stage 4 brief исполнителю.
- 2026-06-14: `return_to_subagent`, corrective `1/3`. Review gate по Stage 4 patch статически почти закрыт: snapshot sanitation добавлен, старые ожидания очистки колонок обновлены, diagnostics fixture получил batch cleanup model и новые фазы, docs/cheatsheets обновлены как contract docs, artifacts созданы. Локальные проверки оркестратора: `pnpm exec vitest run tests/entities/entities-plugin.test.ts tests/react/entities.test.tsx tests/entities/entities-examples.test.ts` — passed, 160 tests; `pnpm run test:types` — passed, 492 tests; `pnpm run check-types` — passed; `pnpm run lint` — passed; `git diff --check` — passed. Verify gate не принят: `.bench/entities/after-despawn-cleanup.md` показывает `despawnOn cleanup / 50 000` after median `21.203ms` против baseline `20.521ms` и RSD `25.4%`, что нарушает Stage 4 gate `RSD < 15%`; compare также не показывает ускорение целевого gate scenario. Следующее действие: corrective исполнителю — стабилизировать/перезаписать required benchmark artifacts или вернуть `blocked` с evidence, не выходя за Stage 4 scope.
- 2026-06-14: `accept`, corrective `1/3`. Stage-owned delta: `dehydrate()` сериализует dead slots через defaults из `initialContext`; tests больше не требуют очистки dead row columns и покрывают snapshot sanitation; diagnostics fixture переведен на batch cleanup model без `rows.slice()`/per-row refresh и получил фазы `schedule despawn`, `despawn lifecycle plan`, `batch remove actor rows`, `remove entity records`, `public commit`; `README`, `PERFORMANCE`, `API-CHEATSHEET`, `TYPES-CHEATSHEET` описывают live-row read contract, `ENTITY_DESPAWNED` cleanup hook, `version` invalidation token. Артефакты: `.bench/entities/after-despawn-cleanup.json`, `.bench/entities/after-despawn-cleanup.md`, `.bench/entities/after-despawn-cleanup-vs-codex-baseline-2026-06-14.md`. Проверки оркестратора: `pnpm exec vitest run tests/entities/entities-plugin.test.ts tests/react/entities.test.tsx tests/entities/entities-examples.test.ts` — passed, 160 tests; `pnpm run test:types` — passed, 492 tests; `pnpm run check-types` — passed; `pnpm run lint` — passed; `pnpm run bench:entities:record -- --runs 5 --label after-despawn-cleanup --include gate,diagnostics` — passed and rebuilt only `@lite-fsm/core`/`@lite-fsm/entities`; `pnpm run bench:entities:compare -- .bench/entities/codex-baseline-2026-06-14.json .bench/entities/after-despawn-cleanup.json` — passed, output saved to compare Markdown; `git diff --check` — passed. Итоговый target: `despawnOn cleanup / 50 000` gate median `1.098ms`, RSD `0.9%`, ускорение `94.6%`; соседние gate public scenarios без регрессий >10%. Следующее действие: Этап 5.

### Этап 5 — Рефакторинг, чистка и полировка

Статус: `in progress`

Записи:

- 2026-06-14: baseline зафиксирован перед dispatch: accepted Stage 1-4 diff в `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`, `packages/entities/PERFORMANCE.md`, `packages/entities/README.md`, `packages/entities/despawn-cleanup-performance-spec-log.md`, `packages/entities/src/runtime/compile.ts`, `packages/entities/src/runtime/reduce.ts`, `packages/entities/src/runtime/snapshot.ts`, `packages/entities/src/runtime/state.ts`, `packages/entities/src/runtime/transaction.ts`, `tests/bench/entities/diagnostics.fixture.mjs`, `tests/entities/entities-plugin.test.ts`; staged diff отсутствует. Исполнитель: `019ec791-31c9-7da0-bef2-6c7fa60a2c93`. Corrective: `0/3`. Scope: `packages/entities`, `tests/entities`, `tests/react`, `tests/bench/entities`, `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md` только для cleanup/refactor contracts. Stage-owned delta пока отсутствует. Следующее действие: dispatch Stage 5 brief исполнителю.
- 2026-06-14: `accept`, corrective `0/3`. Stage-owned delta: удалены внутренние compatibility wrappers `removeActorRow`, `removeEntityIfEmpty`, `removeEntityRows`; владельцы удаления сведены к `removeActorRowsForStore` и `removeEntityRecords`; `consumeScheduledDespawns` очищает reusable scratch marks сразу после consume; tests больше не проверяют точный per-row `rowVersion` increment; README/PERFORMANCE/cheatsheets приведены к финальному контракту без обещаний очистки колонок удаленных строк. Измененные файлы: `packages/entities/src/runtime/state.ts`, `packages/entities/src/runtime/transaction.ts`, `tests/entities/entities-plugin.test.ts`, `tests/react/entities.test.tsx`, `packages/entities/PERFORMANCE.md`, `packages/entities/README.md`, `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`. Проверки оркестратора: `pnpm exec vitest run tests/entities/entities-plugin.test.ts tests/react/entities.test.tsx tests/entities/entities-examples.test.ts` — passed, 160 tests; `pnpm exec vitest run tests/entities/entities-plugin.test.ts --coverage --coverage.include=packages/entities/src/runtime/state.ts --coverage.include=packages/entities/src/runtime/transaction.ts --coverage.reporter=text` — 100% statements/branches/functions/lines; `pnpm run check-types` — passed; `pnpm run lint` — passed; `git diff --check` — passed; source audit command выполнен, remaining hits являются contract docs/tests или историческим ТЗ/журналом, не stale production comments. Benchmark rerun после рефакторинга не выполнялся по решению пользователя от 2026-06-14; Stage 4 record считается актуальным. Следующее действие: финальная проверка.

## Финальная проверка

- Статус: `done`
- Записи:
  - 2026-06-14: final readiness gate на интегрированном diff пройден. Этапы 1-5 имеют status `done`, executor ids уникальны: `019ec739-5058-7a80-a9e3-4b0c6283729a`, `019ec740-eb84-7203-9990-817d43b52b85`, `019ec74e-cdb1-73e3-bbaa-3630f81b854d`, `019ec75e-bdf9-7a61-a143-f44a13815f17`, `019ec791-31c9-7da0-bef2-6c7fa60a2c93`. Проверки: `pnpm run test` — passed, 102 files, 1465 tests, 2 files/14 tests skipped; `pnpm run check-types` — passed, включая `pnpm run test:types` 492 tests; `pnpm run lint` — passed; `pnpm run build:packages` — passed; `git diff --check` — passed. Targeted coverage Stage 5: `state.ts` + `transaction.ts` — 100% statements/branches/functions/lines. Source audits: public export/package files без diff; TODO/FIXME/debug audit не нашел новых production hits, оставшиеся `console.log` — существующие examples/benchmark CLI output; source audit по cleanup terms содержит только contract docs/tests или исторические ТЗ/журнал. Benchmark artifacts Stage 4 сохранены: `.bench/entities/after-despawn-cleanup.json`, `.bench/entities/after-despawn-cleanup.md`, `.bench/entities/after-despawn-cleanup-vs-codex-baseline-2026-06-14.md`; target `despawnOn cleanup / 50 000` — `1.098ms`, RSD `0.9%`. Повторный benchmark после Stage 5 не запускался по решению пользователя от 2026-06-14. Запрещенные docs build команды не запускались; `pnpm run build:packages` не запускал `apps/docs`.
