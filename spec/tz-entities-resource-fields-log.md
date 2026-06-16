# Журнал реализации ТЗ @lite-fsm/entities resource fields

ТЗ: [`tz-entities-resource-fields.md`](./tz-entities-resource-fields.md)

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

- Активное ТЗ: `spec/tz-entities-resource-fields.md`
- Активный этап: завершено
- Статус: `done`
- Следующее действие: финальный отчет пользователю.

## Сводка по этапам

| Этап | Название | Статус | Последнее обновление |
| ---- | -------- | ------ | -------------------- |
| 1 | Schema descriptor и public type model | `done` | 2026-06-16 |
| 2 | Runtime resource storage и access views | `done` | 2026-06-16 |
| 3 | Reducer, effect и reaction typing | `done` | 2026-06-16 |
| 4 | Snapshot, hydrate, React и leakage regression | `done` | 2026-06-16 |
| 5 | Документация, examples и cheatsheets | `done` | 2026-06-16 |
| 6 | Рефакторинг, чистка и полировка | `done` | 2026-06-16 |
| 7 | Финальная проверка release scope | `done` | 2026-06-16 |

## Ход реализации

### Этап 1 — Schema descriptor и public type model

Статус: `done`

Записи:

- 2026-06-16: этап открыт. Baseline чистый: `git status --short`, `git diff`, `git diff --staged` без вывода. Исполнитель: `019ed14c-f832-7aa2-bbea-9279dee2a800`. Corrective: `0/3`. Scope: schema descriptor, public type model, root export и type tests этапа. Следующее действие: dispatch brief исполнителю.
- 2026-06-16: этап принят. Исполнитель: `019ed14c-f832-7aa2-bbea-9279dee2a800`. Corrective: `0/3`. Stage-owned delta: `packages/entities/src/schema.ts`, `packages/entities/src/machine-extension.ts`, `packages/entities/src/runtime/access.ts`, `packages/entities/src/runtime/snapshot.ts`, `packages/entities/src/index.ts`, `tests/entities/entities-plugin.test.ts`, `tests/types/entities-api.tst.ts`; отдельно от baseline остается журнал оркестратора. Scope: добавлен `resource(...)`, resource descriptor type metadata, разделение column/resource type helpers, root export, type coverage для owner/view/private resource и runtime validation для `resource` в `spawnSchema`. Review gate: `pass`; verify gate: `accept`. Команды: `pnpm exec tstyche tests/types/entities-api.tst.ts` — passed; `pnpm --filter @lite-fsm/entities run check-types` — passed; `pnpm exec vitest tests/entities/entities-plugin.test.ts --run` — passed; `git diff --check` — passed. Coverage: не запускался, для этапа не применялся. Риск: runtime schema split и store wiring не реализованы намеренно и переходят в Этап 2; `runtime/snapshot.ts` содержит type-only cast из-за временно расширенного `EntityContextSchema`.

### Этап 2 — Runtime resource storage и access views

Статус: `done`

Записи:

- 2026-06-16: этап открыт. Baseline: принятый diff Этапа 1 (`packages/entities/src/schema.ts`, `packages/entities/src/machine-extension.ts`, `packages/entities/src/runtime/access.ts`, `packages/entities/src/runtime/snapshot.ts`, `packages/entities/src/index.ts`, `tests/entities/entities-plugin.test.ts`, `tests/types/entities-api.tst.ts`) и журнал; `git diff --staged` без вывода. Исполнитель: `019ed15b-5512-7de3-b0ea-17fe14c852bf`. Corrective: `0/3`. Scope: runtime metadata split, actor store resources/resourceViews, owner self и EntityAccess runtime wiring, resource validation diagnostics и focused runtime tests. Следующее действие: dispatch brief исполнителю.
- 2026-06-16: review gate вернул corrective `1/3`. Исполнитель: `019ed15b-5512-7de3-b0ea-17fe14c852bf`. Причина: validation для дополнительных built-in names (`has`, `entityId`, `state` и related self/view keys) применена ко всем `initialContext` fields, включая columns; контракт Этапа 2 требует дополнительный список именно для resource field names, чтобы не расширять поведение обычных column descriptors вне scope. Следующее действие: сузить extra reserved-name validation до resource descriptors, сохранить существующую reserved validation для columns/spawn и повторить focused checks.
- 2026-06-16: этап принят. Исполнитель: `019ed15b-5512-7de3-b0ea-17fe14c852bf`. Corrective: `1/3`. Stage-owned delta поверх Этапа 1: `packages/entities/src/schema.ts`, `packages/entities/src/runtime/compile.ts`, `packages/entities/src/runtime/state.ts`, `packages/entities/src/runtime/access.ts`, `tests/entities/entities-plugin.test.ts`; `runtime/snapshot.ts` больше не требует временного cast. Scope: `metadata.initialContext` стал column-only, добавлен `metadata.resourceSchema`, store-level `resources`/`resourceViews`, owner self и `EntityAccess` runtime wiring, Promise diagnostics, resource-only reserved-name validation. Review gate: `pass`; verify gate: `accept`. Команды: `pnpm exec vitest tests/entities/entities-plugin.test.ts --run` — passed; `pnpm exec vitest tests/entities/entities-reducer-self.test.ts tests/entities/entities-reducer-entities-access.test.ts --run` — passed; `pnpm --filter @lite-fsm/entities run check-types` — passed; `pnpm exec tstyche tests/types/entities-api.tst.ts` — passed; `git diff --check` — passed. Coverage: не запускался, для этапа не применялся. Риски: Promise detection использует текущий runtime-style `instanceof Promise`; hydrate/rollback/docs остаются будущими этапами.

### Этап 3 — Reducer, effect и reaction typing

Статус: `done`

Записи:

- 2026-06-16: этап открыт. Baseline: принятый diff Этапов 1-2 (`packages/entities/src/schema.ts`, `packages/entities/src/machine-extension.ts`, `packages/entities/src/runtime/access.ts`, `packages/entities/src/runtime/compile.ts`, `packages/entities/src/runtime/state.ts`, `packages/entities/src/index.ts`, `tests/entities/entities-plugin.test.ts`, `tests/types/entities-api.tst.ts`) и журнал; `git diff --staged` без вывода. Исполнитель: `019ed167-cfde-7372-81f4-6cee024a53d6`. Corrective: `0/3`. Scope: reducer/effect/reaction owner resource types, exposed view typing across `entities().get`, `entities().maybe`, `manager.entities().get`, fallback access compatibility и type tests. Следующее действие: dispatch brief исполнителю.
- 2026-06-16: этап принят. Исполнитель: `019ed167-cfde-7372-81f4-6cee024a53d6`. Corrective: `0/3`. Stage-owned delta поверх Этапов 1-2: `packages/entities/src/machine-extension.ts`, `tests/types/entities-api.tst.ts`. Scope: type docs для transition-scope owner resources, type coverage для reducer/effect/reaction mutable owner resources, exact exposed `View`, mutable exposed facade, private resources absent/not `never`, `get`/`maybe`/`entities().get`/`manager.entities().get` consistency, fallback access compatibility. Review gate: `pass`; verify gate: `accept`. Команды: `pnpm exec tstyche tests/types/entities-api.tst.ts` — passed; `pnpm run test:types` — passed; `pnpm --filter @lite-fsm/entities run check-types` — passed; `git diff --check` — passed. Coverage: не применялся, изменения type-only. Риски: runtime behavior не менялся; docs/cheatsheets остаются Этапом 5.

### Этап 4 — Snapshot, hydrate, React и leakage regression

Статус: `done`

Записи:

- 2026-06-16: этап открыт. Baseline: принятый diff Этапов 1-3 (`packages/entities/src/schema.ts`, `packages/entities/src/machine-extension.ts`, `packages/entities/src/runtime/access.ts`, `packages/entities/src/runtime/compile.ts`, `packages/entities/src/runtime/state.ts`, `packages/entities/src/index.ts`, `tests/entities/entities-plugin.test.ts`, `tests/types/entities-api.tst.ts`) и журнал; `git diff --staged` без вывода. Исполнитель: `019ed16d-efa0-7320-ba0b-248d69f93a7d`. Corrective: `0/3`. Scope: snapshot/dehydrate/hydrate/preview, React row snapshots/list leakage, mutation snapshot rollback limitation и focused runtime/React tests. Следующее действие: dispatch brief исполнителю.
- 2026-06-16: этап принят. Исполнитель: `019ed16d-efa0-7320-ba0b-248d69f93a7d`. Corrective: `0/3`. Stage-owned delta поверх Этапов 1-3: `tests/entities/entities-plugin.test.ts`; runtime-код без изменений. Scope: tests for no resource leakage in `dehydrate`, public state and `getSnapshot`, hydrate identity/call counts, `getHydratedState` preview no mutation, React runtime readRow/readList column-only output, staged spawn rollback limitation with resource not transactional. Review gate: `pass`; verify gate: `accept`. Команды: `pnpm exec vitest tests/entities/entities-plugin.test.ts tests/entities/entities-reducer-self.test.ts tests/entities/entities-reducer-entities-access.test.ts --run` — passed; `pnpm --filter @lite-fsm/entities run check-types` — passed; `git diff --check` — passed. Coverage: не запускался; focused runtime/React regressions пройдены. Риски: docs/cheatsheets и release-wide checks остаются будущими этапами.

### Этап 5 — Документация, examples и cheatsheets

Статус: `done`

Записи:

- 2026-06-16: этап открыт. Baseline: принятый diff Этапов 1-4 (`packages/entities/src/schema.ts`, `packages/entities/src/machine-extension.ts`, `packages/entities/src/runtime/access.ts`, `packages/entities/src/runtime/compile.ts`, `packages/entities/src/runtime/state.ts`, `packages/entities/src/index.ts`, `tests/entities/entities-plugin.test.ts`, `tests/types/entities-api.tst.ts`) и журнал; `git diff --staged` без вывода. Исполнитель: `019ed173-33be-79e1-98d1-5fad15890ca8`. Corrective: `0/3`. Scope: `packages/entities/README.md`, `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`; docs/examples for `resource(...)`, intended ECS usage, persistence/hydrate/rollback limitations and stale wording audit. Следующее действие: dispatch brief исполнителю.
- 2026-06-16: review gate вернул corrective `1/3`. Исполнитель: `019ed173-33be-79e1-98d1-5fad15890ca8`. Причины: acceptance checklist требует явно назвать negative domain examples (`hp`, `command`, `selected`, ownership/authoritative facts), а docs пока описывают это только общим правилом; snippet в `TYPES-CHEATSHEET.md` объявляет `x: f32()` внутри `initialContext`, что расходится с контрактом defaults для column descriptors. Следующее действие: исправить docs-only delta и повторить `git diff --check` + stale wording audit.
- 2026-06-16: этап принят. Исполнитель: `019ed173-33be-79e1-98d1-5fad15890ca8`. Corrective: `1/3`. Stage-owned delta поверх Этапов 1-4: `packages/entities/README.md`, `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`. Scope: documented `resource(...)` as template/runtime shared resource, private owner-only form, exposed `View`, no singleton-row requirement, no snapshot/hydrate/persistence/public-state leakage, rollback limitation, RTS ordered ECS usage, negative domain examples and owner/view type rules. Review gate: `pass`; verify gate: `accept`. Команды: `git diff --check` — passed; `rg -n "singleton resource|requires exactly one active row|resourceField\\[entity\\]|Readonly<.*runtime|Readonly<.*protection|runtime protection" packages/entities/README.md API-CHEATSHEET.md TYPES-CHEATSHEET.md` — no matches (`exit 1`, expected). `pnpm run test:types` не запускался: изменения docs-only, type snippets приведены к уже покрытому контракту; docs build не запускался по запрету. Coverage: не применим для docs-only этапа. Риски: оставшиеся stale-code/source audits и full checks переходят в Этапы 6-7.

### Этап 6 — Рефакторинг, чистка и полировка

Статус: `done`

Записи:

- 2026-06-16: этап открыт. Baseline: принятый diff Этапов 1-5 (`packages/entities/src/schema.ts`, `packages/entities/src/machine-extension.ts`, `packages/entities/src/runtime/access.ts`, `packages/entities/src/runtime/compile.ts`, `packages/entities/src/runtime/state.ts`, `packages/entities/src/index.ts`, `tests/entities/entities-plugin.test.ts`, `tests/types/entities-api.tst.ts`, `packages/entities/README.md`, `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`) и журнал; `git diff --staged` без вывода. Исполнитель: `019ed179-9876-7413-9dfb-9cf246814e49`. Corrective: `0/3`. Scope: cleanup/refactor audit for temporary helpers, duplicate validation/split logic, stale comments, unused code, resource leakage and source audits; no new public API or semantics. Следующее действие: dispatch brief исполнителю.
- 2026-06-16: этап принят. Исполнитель: `019ed179-9876-7413-9dfb-9cf246814e49`. Corrective: `0/3`. Stage-owned delta поверх Этапов 1-5: `packages/entities/README.md`, `tests/entities/entities-plugin.test.ts`. Scope: stale self wording обновлен для owner resources; test scaffold type issue fixed after broad type gate; implementation audit found compile as single column/resource split owner, column-only runtime loops, no resource leakage in snapshot/hydrate/react paths, no temporary/debug code in active scope. Review gate: `pass`; verify gate: `accept`. Команды: `pnpm run lint` — passed; `pnpm run check-types` — passed; `pnpm exec vitest tests/entities/entities-plugin.test.ts --run` — passed (160 tests); `git diff --check` — passed; source audits for `TODO|FIXME|temporary|transitional|debugger|console.log`, stale resource wording and `initialContext`/`resourceSchema` usage — no unexpected hits; expected `console.log` hits remain only in unrelated cheatsheet plugin examples. Coverage: не применим, behavior code не менялся. Риски: финальные full release checks остаются Этапом 7; docs build commands не запускались.

### Этап 7 — Финальная проверка release scope

Статус: `done`

Записи:

- 2026-06-16: этап открыт. Baseline: принятый diff Этапов 1-6 (`packages/entities/src/schema.ts`, `packages/entities/src/machine-extension.ts`, `packages/entities/src/runtime/access.ts`, `packages/entities/src/runtime/compile.ts`, `packages/entities/src/runtime/state.ts`, `packages/entities/src/index.ts`, `tests/entities/entities-plugin.test.ts`, `tests/types/entities-api.tst.ts`, `packages/entities/README.md`, `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`) и журнал; `git diff --staged` без вывода. Исполнитель: `019ed17e-f044-7ef2-9c30-0ccae16f43d6`. Corrective: `0/3`. Scope: final release-scope checks, docs/cheatsheet contract audit, snapshot/public-state absence confirmation, no implementation changes except final corrective fixes. Следующее действие: dispatch brief исполнителю.
- 2026-06-16: этап принят. Исполнитель: `019ed17e-f044-7ef2-9c30-0ccae16f43d6`. Corrective: `0/3`. Stage-owned delta поверх Этапов 1-6: `tests/entities/entities-plugin.test.ts` (test-only coverage for unknown property on resource descriptor). Scope: final release gate confirmed root export, docs/cheatsheets final contract, resource absence in public/snapshot formats, no stale wording or temporary code. Review gate: `pass`; verify gate: `accept`. Команды: `pnpm run test:types` — passed (44 files, 501 tests); `pnpm run check-types` — passed; `pnpm run lint` — passed; `pnpm run test` — passed (115 files passed, 2 skipped; 1566 tests passed, 14 skipped); `pnpm run test:coverage` — passed, 100% statements/branches/functions/lines; `pnpm run build:packages` — passed (7/7 packages; non-fatal visualizer chunk-size and `perf_hooks` Vite warnings); `git diff --check` — passed; source audits for temporary markers, stale resource wording and expected resource references — no unexpected hits. Запрещенные docs build commands не запускались. Coverage: 100%. Риски: нет известных блокеров; package build warnings относятся к existing visualizer bundle size/browser externalization.

## Финальная проверка

- Статус: `done`
- 2026-06-16: final readiness gate завершен. Все этапы `done`, каждый этап имеет отдельного исполнителя и baseline запись. Проверки пройдены: `pnpm run test:types`, `pnpm run check-types`, `pnpm run lint`, `pnpm run test`, `pnpm run test:coverage`, `pnpm run build:packages`, `git diff --check`; source audits без unexpected hits. `pnpm run build`, docs build commands, pages build commands и `next build` внутри `apps/docs` не запускались.
