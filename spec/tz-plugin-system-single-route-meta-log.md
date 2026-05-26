# Журнал реализации ТЗ Plugin System Single Route Meta

ТЗ: [`tz-plugin-system-single-route-meta.md`](./tz-plugin-system-single-route-meta.md)

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

- Активное ТЗ: `spec/tz-plugin-system-single-route-meta.md`
- Активный этап: Финальная проверка
- Статус: `done`
- Следующее действие: Нет.

## Сводка по этапам

| Этап | Название | Статус | Последнее обновление |
| ---- | -------- | ------ | -------------------- |
| 1 | Runtime ambiguity validation | `done` | 2026-05-26 |
| 2 | Dispatch pipeline regression coverage | `done` | 2026-05-26 |
| 3 | Документация и cheatsheets | `done` | 2026-05-26 |
| 4 | Рефакторинг, чистка и полировка | `done` | 2026-05-26 |

## Ход реализации

### Этап 1 — Runtime ambiguity validation

Статус: `done`

Записи:

- Scope: `packages/core/src/runtime/kernel/routing.ts`, `packages/core/src/utils.ts`, routing/actor tests.
- Реализация: `resolveRoute` собирает active routing keys в порядке `actorId`, registered plugin keys, `groupId`, `groupTag`; при нескольких keys бросает `LITE_FSM_AMBIGUOUS_ROUTE_META` до вызова resolver-ов. `hasRoute` использует тот же сбор active keys.
- Сохранено: single-route behavior для `actorId`, одного plugin key, `groupId`, `groupTag`, `unscoped`; resolver result validation и target de-duplication не менялись.
- Дополнительно: default actor dispatch теперь выражает sender group route одним `groupId`, чтобы не создавать ambiguous core meta.
- Проверки: focused Vitest по `routing-registry`, `storage-runtime-dispatch-pipeline`, `plugin-system-stage4`, `plugin-system-documentation`, actor routing/effects/helpers и stage9 — pass.

### Этап 2 — Dispatch pipeline regression coverage

Статус: `done`

Записи:

- Scope: `tests/core/storage-runtime-dispatch-pipeline.test.ts`.
- Покрыто: ambiguity для initial action, storage `prepareAction` replacement, storage `beforeReduce` replacement и plugin `intercept` replacement.
- Проверено: failed dispatch не меняет state, не вызывает subscribers/effects/reactions, не вызывает `onError`, не запускает следующие interceptors/hooks/reducers; plugin resolver не вызывается при ambiguity.
- Проверки: focused Vitest — pass; полный `pnpm run test` — pass.

### Этап 3 — Документация и cheatsheets

Статус: `done`

Записи:

- Scope: `PLUGIN-SYSTEM-CHEATSHEET.md`, `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`, documentation fixture.
- Обновлено: one route constraint, active routing keys, `LITE_FSM_AMBIGUOUS_ROUTE_META`, отсутствие user metadata semantics у `routeMeta`, fanout через отдельные `manager.transition(...)` или unscoped domain event.
- Types docs уточняют, что optional route fields остаются типовым shape, но runtime contract допускает только один active routing key.
- Проверки: `pnpm run test:types`, `pnpm run check-types`, `git diff --check` — pass.

### Этап 4 — Рефакторинг, чистка и полировка

Статус: `done`

Записи:

- Удален неиспользуемый internal helper `resolveRouting` и тесты старого priority-first contract, чтобы не оставлять второго владельца routing policy.
- Проверено, что в измененных source/tests/cheatsheets нет stale wording про priority-first route resolution.
- Проверки: `pnpm run test`, `pnpm run test:types`, `pnpm run check-types`, `pnpm run lint`, `git diff --check` — pass.

## Финальная проверка

- Статус: `done`
- Записи:
  - `pnpm run test` — pass: 98 files passed, 2 skipped; 1302 tests passed, 14 skipped.
  - `pnpm run test:types` — pass: 40 files, 441 tests, 973 assertions.
  - `pnpm run check-types` — pass.
  - `pnpm run lint` — pass.
  - `git diff --check` — pass.
  - Docs build не запускался.
