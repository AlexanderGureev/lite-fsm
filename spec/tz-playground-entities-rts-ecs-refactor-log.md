# Журнал реализации ТЗ entities-rts ordered ECS refactor

ТЗ: [`tz-playground-entities-rts-ecs-refactor.md`](./tz-playground-entities-rts-ecs-refactor.md)

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

- Активное ТЗ: `spec/tz-playground-entities-rts-ecs-refactor.md`
- Активный этап: завершено
- Статус: `done`
- Следующее действие: нет, все этапы и final gate закрыты.

## Сводка по этапам

| Этап | Название | Статус | Последнее обновление |
| ---- | -------- | ------ | -------------------- |
| 1 | `rtsSpatialIndex` и resource-based spatial cache | `done` | 2026-06-16 |
| 2 | Hot-path migration в ordered reducers | `done` | 2026-06-16 |
| 3 | Events, metrics и component integration cleanup | `done` | 2026-06-16 |
| 4 | File ownership и удаление `store/sim` | `done` | 2026-06-16 |
| 5 | Рефакторинг, чистка и полировка | `done` | 2026-06-16 |

## Ход реализации

### Этап 1 — `rtsSpatialIndex` и resource-based spatial cache

Статус: `done`

Записи:

- 2026-06-16: добавлен `rtsSpatialIndex` с owner resource и query-only `RtsSpatialIndexView`; system row добавлена в `GAME_START`, metrics UI читает timings через exposed view. Старый `runRtsSimulationTick` оставлен активным для Этапа 2.
- 2026-06-16: добавлены focused tests `rts-spatial-index.test.ts` для hero lookup, enemy neighbors, restart reset/rebuild и metrics. Проверки: `pnpm exec vitest run tests/playground/entities-rts`, `pnpm --filter @lite-fsm/playground check-types`, `git diff --check`.

### Этап 2 — Hot-path migration в ordered reducers

Статус: `done`

Записи:

- 2026-06-16: hot-path `TICK` перенесен в ordered reducers `unitCombat`, `unitHealth`, `unitCommand`, `enemyAi`, `unitMovement`; добавлен `incomingDamage`, private buffers/resources и enemy intent. `rtsSimulation`/`rtsSimulationTick` удалены из runtime order и files.
- 2026-06-16: spawn plan создает `enemyAi` только для enemies; system row `system/rts-simulation-tick` удалена. Добавлены regressions для command arrival, enemy intent и `incomingDamage` -> `unitHealth`. Проверки: `pnpm exec vitest run tests/playground/entities-rts`, `pnpm --filter @lite-fsm/playground check-types`, `git diff --check`.

### Этап 3 — Events, metrics и component integration cleanup

Статус: `done`

Записи:

- 2026-06-16: удалены legacy hot-path events из `AppEvents`, reducers и active tests; `batches.ts` сокращен до selection/command assignment helpers. Старые `sim/tick.ts` и `sim/runtime.ts` удалены, metrics читаются через `rtsSpatialIndex`.
- 2026-06-16: audit `rg` по legacy events/helpers в `apps/playground/app/examples/entities-rts` и `tests/playground/entities-rts` не нашел совпадений. Проверки: `pnpm exec vitest run tests/playground/entities-rts`, `pnpm --filter @lite-fsm/playground check-types`, `git diff --check`.

### Этап 4 — File ownership и удаление `store/sim`

Статус: `done`

Записи:

- 2026-06-16: все machine modules перенесены в `store/machines/<machine-name>/index.ts`; `formation` и `batches` лежат рядом с `unitOrders`, spatial/flow helpers рядом с `rtsSpatialIndex`, spawn helpers перенесены в `store/spawn`.
- 2026-06-16: `store/sim` удален, active imports на `/sim/` отсутствуют. Проверки: `pnpm exec vitest run tests/playground/entities-rts`, `pnpm --filter @lite-fsm/playground check-types`, `test ! -d apps/playground/app/examples/entities-rts/store/sim`, `rg -n "store/sim|/sim/" apps/playground/app/examples/entities-rts tests/playground/entities-rts`, `git diff --check`.

### Этап 5 — Рефакторинг, чистка и полировка

Статус: `done`

Записи:

- 2026-06-16: source audit по legacy simulation identifiers, debug/test markers и stale `/sim/` paths чистый. Оставшиеся `batch` helpers относятся только к non-hot-path selection/command assignment у `unitOrders`.
- 2026-06-16: проверки Stage 5 пройдены: `pnpm exec vitest run tests/playground/entities-rts`, `pnpm --filter @lite-fsm/playground check-types`, `pnpm run lint`, `git diff --check`.

## Финальная проверка

- Статус: `done`
- 2026-06-16: final gate пройден: `pnpm run build:packages`, `pnpm exec vitest run tests/playground/entities-rts tests/entities/entities-reducer-entities-access.test.ts`, `pnpm run check-types`, `pnpm run check-types:apps:dist`.
- 2026-06-16: дополнительная проверка `git diff --check` после final gate прошла без ошибок. Критерии полной готовности закрыты.
