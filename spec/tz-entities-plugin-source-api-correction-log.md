# Журнал реализации ТЗ Entities plugin source API

ТЗ: [`tz-entities-plugin-source-api-correction.md`](./tz-entities-plugin-source-api-correction.md)

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

- Активное ТЗ: `spec/tz-entities-plugin-source-api-correction.md`
- Активный этап: Этап 4 — Финальная проверка корректирующего ТЗ
- Статус: `done`
- Следующее действие: корректирующее ТЗ завершено; можно возвращаться к этапу 6 основного ТЗ.

## Сводка по этапам

| Этап | Название                                      | Статус        | Последнее обновление |
| ---- | --------------------------------------------- | ------------- | -------------------- |
| 1    | Public type source для entities               | `done`        | 2026-06-13           |
| 2    | Синхронизация основного ТЗ, docs и examples   | `done`        | 2026-06-13           |
| 3    | Рефакторинг, чистка и полировка               | `done`        | 2026-06-13           |
| 4    | Финальная проверка корректирующего ТЗ         | `done`        | 2026-06-13           |

## Ход реализации

### Этап 1 — Public type source для entities

Статус: `done`

Записи:

- 2026-06-13: добавлен exported type-only source `EntitiesPlugin<AppDeps = unknown, PluginEvents extends AnyEvent = never>`, root export обновлен; `entitiesPlugin()` больше не имеет `AppDeps` overload, `entitiesPlugin({ spawn })` сохраняет точный `EntitySpawnPluginEvents<Spawn>`.
- 2026-06-13: type tests переведены с dummy `entitiesPlugin<AppDeps>()` value на `TypedCreateMachineFn<AppEvents, AppDeps, EntitiesPlugin<AppDeps>>`; добавлены negative tests для `entitiesPlugin<AppDeps>()` и `entitiesPlugin<AppDeps>({ spawn })`.
- 2026-06-13: проверки этапа: `pnpm exec tstyche tests/types/entities-api.tst.ts` — pass, 20 tests/44 assertions; `pnpm exec tstyche tests/types/create-machine-dependent-storage.tst.ts tests/types/create-machine-entity-proof.tst.ts` — pass, 5 tests/29 assertions; `pnpm --filter @lite-fsm/entities check-types` — pass.

### Этап 2 — Синхронизация основного ТЗ, docs и examples

Статус: `done`

Записи:

- 2026-06-13: `spec/tz-entities-implementation.md` и `spec/tz-entities-implementation-part-2.md` синхронизированы: `EntitiesPlugin<AppDeps>` является type-only source для `TypedCreateMachineFn`, `entitiesPlugin(...)` не переносит `AppDeps`, runtime spawn pattern остается `entitiesPlugin({ spawn })`.
- 2026-06-13: `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md` и `packages/entities/README.md` обновлены на стандартный wrapper `TypedCreateMachineFn<AppEvents, AppDeps, EntitiesPlugin<AppDeps>>`; stale examples с `createEntityMachine(...)` и `entitiesPlugin<AppDeps>()` удалены.
- 2026-06-13: проверки этапа: `pnpm exec tstyche tests/types/entities-api.tst.ts` — pass, 20 tests/44 assertions; audit `rg -n "entitiesPlugin<|createEntityMachine|dummy|type-only plugin value" ...` — no hits; `git diff --check` — pass.

### Этап 3 — Рефакторинг, чистка и полировка

Статус: `done`

Записи:

- 2026-06-13: убран временный single-use alias в `machine-extension.ts`; runtime overload `entitiesPlugin` отформатирован так, чтобы stale-аудит `entitiesPlugin<` не путал infer-only `Spawn` generic с удаленным `AppDeps` path.
- 2026-06-13: убрано явное приведение `as unknown as EntitiesPlugin<...>` в `plugin.ts`; runtime extension теперь сохраняет type-level `publicState` contract, а `entityStorageRuntime` аннотирован как public `EntityStorageDefinition<unknown>`.
- 2026-06-13: active source/docs audit не показывает stale recommended pattern; оставшиеся hits находятся в корректирующем ТЗ, журналах и negative type tests `tests/types/entities-api.tst.ts`.
- 2026-06-13: проверки этапа: `pnpm exec tstyche tests/types/entities-api.tst.ts` — pass, 20 tests/44 assertions; `pnpm --filter @lite-fsm/entities check-types` — pass; `git diff --check` — pass.

### Этап 4 — Финальная проверка корректирующего ТЗ

Статус: `done`

Записи:

- 2026-06-13: финальный readiness gate пройден. Public API экспортирует `EntitiesPlugin<AppDeps = unknown, PluginEvents extends AnyEvent = never>`; `TypedCreateMachineFn<AppEvents, AppDeps, EntitiesPlugin<AppDeps>>` принимает `storage: "entity"`; runtime pattern остается `entitiesPlugin()` / `entitiesPlugin({ spawn })`; `entitiesPlugin<AppDeps>()` и `entitiesPlugin<AppDeps>({ spawn })` покрыты negative type tests.
- 2026-06-13: проверки: `pnpm exec tstyche tests/types/entities-api.tst.ts tests/types/create-machine-dependent-storage.tst.ts tests/types/create-machine-entity-proof.tst.ts` — pass, 25 tests/73 assertions; `pnpm --filter @lite-fsm/entities check-types` — pass; `pnpm exec vitest run tests/entities/entities-plugin.test.ts` — pass, 62 tests; `pnpm run test:types` — pass, 44 files/477 tests/1061 assertions; `pnpm run check-types` — pass; `pnpm --filter @lite-fsm/core build` — pass; `pnpm --filter @lite-fsm/entities build` — pass after sequential rerun.
- 2026-06-13: `git diff --check` — pass; active source/docs stale audit оставляет hits только в корректирующем ТЗ, журналах и negative tests; docs build и запрещенные команды не запускались.

## Финальная проверка

- Статус: `done`
- Записи: корректирующее ТЗ завершено, blockers нет.
