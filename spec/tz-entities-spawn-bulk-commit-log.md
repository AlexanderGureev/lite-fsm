# Журнал реализации ТЗ @lite-fsm/entities spawn bulk commit

ТЗ: [`tz-entities-spawn-bulk-commit.md`](./tz-entities-spawn-bulk-commit.md)

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

- Активное ТЗ: `spec/tz-entities-spawn-bulk-commit.md`
- Активный этап: Этап 5 — Рефакторинг, чистка и полировка
- Статус: `done`
- Следующее действие: цель реализована; все этапы и критерии полной готовности закрыты.

## Сводка по этапам

| Этап | Название | Статус | Последнее обновление |
| ---- | -------- | ------ | -------------------- |
| 1 | Bulk planner и exact reserve | `done` | 2026-06-18 |
| 2 | Payload scope без `Map` | `done` | 2026-06-18 |
| 3 | Полная матрица runtime contracts | `done` | 2026-06-18 |
| 4 | Benchmark и trace acceptance | `done` | 2026-06-18 |
| 5 | Рефакторинг, чистка и полировка | `done` | 2026-06-18 |

## Ход реализации

### Этап 1 — Bulk planner и exact reserve

Статус: `done`

Записи:

- Добавлен `packages/entities/src/runtime/spawn-commit.ts`: планирует EntityIndex без мутации, считает exact capacity, резервирует entity store и actor stores один раз на batch/store, затем bulk-коммитит entity rows, actor rows, ownership refs и public slices.
- `reduce-spawn.ts` оставлен orchestration entrypoint для lifecycle; локальные `allocateEntity`, `stageActorRow`, `applyStagedSpawns` удалены.
- Добавлен `tests/entities/entities-spawn-bulk-commit.test.ts` с проверками dense spawn, sparse LIFO `freeList` reuse, multi-actor ownership/group routing, actor без `ENTITY_SPAWNED`, rollback после lifecycle error.
- Проверки: `pnpm exec vitest tests/entities/entities-spawn-bulk-commit.test.ts --run`; `pnpm --filter @lite-fsm/entities run check-types`; `git diff --check`.

### Этап 2 — Payload scope без `Map`

Статус: `done`

Записи:

- `ReducerBatch` переведен с `payloadByEntity` на internal `SpawnPayloadScope`: `indices` и `payloads` синхронизированы по позиции.
- Dense lookup использует `firstEntity` и offset с обязательной проверкой `indices[offset] === entity`; sparse/freeList path использует numeric `positionsByEntity` object без `Map`.
- Добавлены focused проверки `payloadFor` для outside `ENTITY_SPAWNED` и out-of-scope entity во втором spawn с rollback только второго dispatch; dense, sparse и multi-actor valid lookup покрыты bulk commit tests.
- Проверки: `pnpm exec vitest tests/entities/entities-spawn-bulk-commit.test.ts --run`; `rg -n "payloadByEntity|new Map<EntityIndex, Record<string, unknown>>" packages/entities/src/runtime tests/entities/entities-spawn-bulk-commit.test.ts` без hits; `pnpm --filter @lite-fsm/entities run check-types`; `git diff --check`.

### Этап 3 — Полная матрица runtime contracts

Статус: `done`

Записи:

- `tests/entities/entities-spawn-bulk-commit.test.ts` расширен до focused matrix: dense spawn, sparse/freeList LIFO reuse, multi-actor + несколько `groupTag` + group routing, payloadFor valid/out-of-scope/outside lifecycle, actor без `ENTITY_SPAWNED`, reducer override `stateCode`, despawnOn cleanup, dehydrate/hydrate dense и sparse, lifecycle rollback.
- Существующие регрессии закрывают duplicate ids, validation before commit, public reducer rollback, lifecycle effects/reactions, terminal cleanup, entity/id/group/unscoped routing, snapshot import/export edge cases и reaction/effect captured scope semantics.
- Проверки: `pnpm exec vitest tests/entities/entities-spawn-bulk-commit.test.ts --run`; `pnpm exec vitest tests/entities/entities-plugin.test.ts tests/entities/entities-reducer-post-processing.test.ts tests/entities/entities-transition-trace.test.ts --run`; `pnpm exec vitest tests/playground/entities-rts/spawn.test.ts --run`; `pnpm --filter @lite-fsm/entities run check-types`; `git diff --check`.

### Этап 4 — Benchmark и trace acceptance

Статус: `done`

Записи:

- Benchmark command выполнен: `pnpm run bench:entities:record -- --runs 3 --label after-spawn-bulk-commit --include spawn,spawn-trace --row-counts 35000`.
- Созданы artifacts: `.bench/entities/after-spawn-bulk-commit.json`, `.bench/entities/after-spawn-bulk-commit.md` плюс `latest.*`.
- Gate metrics финального record: `RTS enemy spawn batch / 35 000` total `p95OfP95s = 169.913ms` (< 250ms); `entities.reduce.spawnLifecycle.applyStagedSpawns p95OfP95s = 34.751ms` (< 50ms); `reduceBatches p95OfP95s = 18.395ms`, baseline `23.792ms`, не хуже `1.5x`.
- Compare command выполнен: `pnpm run bench:entities:compare -- .bench/entities/spawn-baseline.json .bench/entities/after-spawn-bulk-commit.json`.

### Этап 5 — Рефакторинг, чистка и полировка

Статус: `done`

Записи:

- Удален мертвый `writeInitialColumnValues` из `columns.ts` и re-export из `state.ts`; bulk commit использует precomputed default entries в `spawn-commit.ts`.
- Убран недостижимый `addedRows === 0` branch в actor commit; `SpawnPayloadScope.firstEntity` сделан непустым invariant для реальных spawn batches.
- `packages/entities/PERFORMANCE.md` обновлен, чтобы не ссылаться на удаленный helper и старую ownership responsibility.
- Source audit: debug/TODO hits отсутствуют; `payloadByEntity` отсутствует в runtime; `ensureEntityCapacity`/`ensureActorCapacity` остались только в definitions/imports и bulk reserve.
- Проверки: focused regressions, package/root typechecks, lint, coverage 100%, package build, final benchmark record, compare, `git diff --check`.

## Финальная проверка

- Статус: `done`
- Проверки:
  - `pnpm exec vitest tests/entities/entities-spawn-bulk-commit.test.ts --run`
  - `pnpm exec vitest tests/entities/entities-plugin.test.ts tests/entities/entities-reducer-post-processing.test.ts tests/entities/entities-transition-trace.test.ts --run`
  - `pnpm exec vitest tests/playground/entities-rts/spawn.test.ts --run`
  - `pnpm --filter @lite-fsm/entities run check-types`
  - `pnpm run check-types`
  - `pnpm run lint`
  - `pnpm run test:coverage`
  - `pnpm run build:packages`
  - `pnpm run bench:entities:record -- --runs 3 --label after-spawn-bulk-commit --include spawn,spawn-trace --row-counts 35000`
  - `pnpm run bench:entities:compare -- .bench/entities/spawn-baseline.json .bench/entities/after-spawn-bulk-commit.json`
  - `git diff --check`
- Финальные benchmark gates: total `p95OfP95s = 169.913ms`; `entities.reduce.spawnLifecycle.applyStagedSpawns p95OfP95s = 34.751ms`; `reduceBatches p95OfP95s = 18.395ms`.
- Docs build commands не запускались. Public API и public types не изменены; cheatsheets не требуют обновления.
