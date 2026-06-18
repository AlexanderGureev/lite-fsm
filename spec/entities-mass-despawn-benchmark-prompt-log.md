# Журнал реализации промта mass despawn benchmark для `@lite-fsm/entities`

Промт: [`entities-mass-despawn-benchmark-prompt.md`](./entities-mass-despawn-benchmark-prompt.md)

Цель журнала - восстановить состояние реализации после сжатия контекста. Журнал не заменяет промт и не пересказывает diff.

## Правила ведения

- Перед продолжением работы прочитать промт и этот журнал.
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

- Активный промт: `spec/entities-mass-despawn-benchmark-prompt.md`
- Активный этап: завершено
- Статус: `done`
- Следующее действие: нет, все этапы и критерии полной готовности закрыты.

## Сводка по этапам

| Этап | Название | Статус | Последнее обновление |
| ---- | -------- | ------ | -------------------- |
| 1 | Trace counters и explicit despawn phase | `done` | 2026-06-18 |
| 2 | Mass despawn fixture | `done` | 2026-06-18 |
| 3 | Record runner и reporting | `done` | 2026-06-18 |
| 4 | Diagnostics attribution | `done` | 2026-06-18 |
| 5 | Baseline record | `done` | 2026-06-18 |
| 6 | Рефакторинг, чистка и полировка | `done` | 2026-06-18 |

## Ход реализации

### Этап 1 - Trace counters и explicit despawn phase

Статус: `done`

Записи:

- Добавлен internal helper `recordEntityTraceCounter`, phase `entities.prepare.explicitDespawn`, counters explicit staging и cleanup counters в `flushEntityLifecycleCleanup(...)`.
- Обновлен focused test `tests/entities/entities-transition-trace.test.ts`: проверены no-overhead helper, nested `transition.despawn(...)` phase/counters и `despawnOn` public cleanup counters.
- Проверки этапа: `pnpm exec vitest run tests/entities/entities-transition-trace.test.ts`, `pnpm run check-types`, `git diff --check`.

### Этап 2 - Mass despawn fixture

Статус: `done`

Записи:

- Создан `tests/bench/entities/mass-despawn.fixture.mjs` с production dist imports, 5 actor rows per entity, paths `despawnOn`, `explicit-ids`, `explicit-indices`, lifecycle modes `none`, `edge-only`, `reducer`, `reaction`, modes `one-shot` и `churn`.
- Fixture валидирует expected counts: live rows before/after, `despawnedEntities`, `removedActorRows = batchSize * 5`; churn выполняет `despawn -> spawn replacement` и возвращает live count к rowCount.
- Trace runner сохраняет sections для outer despawn transition, nested `LITE_FSM_ENTITY_DESPAWN` и replacement spawn transition; nested explicit despawn не фильтруется по `depth === 0`.
- Проверки этапа: package dist build для core/entities, node smoke на `rowCount=6000`, `batchSize=5000` для timing+trace, проверка mandatory matrix `60` scenario definitions.

### Этап 3 - Record runner и reporting

Статус: `done`

Записи:

- `record-node.mjs` получил includes `mass-despawn` и `mass-despawn-trace`; default `gate,trace` не изменен.
- `reporting.mjs` агрегирует mass despawn timing и trace sections/counters, Markdown содержит summary, cleanup phases, counters, throughput, path comparison и churn comparison.
- `compare-records.mjs` через общий reporting показывает mass despawn total/throughput deltas, cleanup phase deltas и warnings при mismatch counters.
- Проверки этапа: `pnpm run bench:entities:record -- --label mass-despawn-smoke --runs 1 --include mass-despawn,mass-despawn-trace --row-counts 6000`, проверка `.bench/entities/mass-despawn-smoke.{json,md}`, `pnpm run bench:entities:record -- --label transition-trace-smoke --runs 1 --include trace --row-counts 1000`, `pnpm run bench:entities:compare -- .bench/entities/mass-despawn-smoke.json .bench/entities/mass-despawn-smoke.json`.

### Этап 4 - Diagnostics attribution

Статус: `done`

Записи:

- В `diagnostics.fixture.mjs` добавлен synthetic mass despawn diagnostics layer без production runtime изменений.
- Layers покрывают `actorRowsByEntity` plan scan, ownership remove для `actorRowsByEntity` и `actorRowsByGroupTag`, state bucket remove, entity group bucket remove, `indexById` delete, `freeList.push`, public slice refresh и combined removeActorRows/removeEntityRecords.
- Проверка этапа: node smoke на `rowCount=6000`, `batchSize=5000`; report содержит ownership/group/state/index/freeList layers и `mapsTo` для public cleanup phases.

### Этап 5 - Baseline record

Статус: `done`

Записи:

- Baseline записан командой `pnpm run bench:entities:record -- --label mass-despawn-baseline --runs 5 --include mass-despawn,mass-despawn-trace --row-counts 30000,35000`.
- Артефакты: `.bench/entities/2026-06-18T12-24-04-855Z-mass-despawn-baseline.{json,md}`, `.bench/entities/mass-despawn-baseline.{json,md}`, `.bench/entities/latest.{json,md}`.
- Проверка baseline: 120 timing-сценариев и 120 trace-сценариев, обязательная матрица для `30_000` и `35_000` присутствует, `latest` обновлен, Markdown содержит metadata и mass despawn sections.
- Counters подтверждают одинаковый объем работы между comparable paths: `despawnedEntities = batchSize`, `removedActorRows = batchSize * 5`, `removedEntityRecords = batchSize`.
- Top p95 scenarios: `explicit-ids / reaction / churn / batch 5,000` rowCount `30_000` (`15.760ms`, dominant `entities.reduce.spawnCleanup`), `explicit-ids / reaction / churn / batch 5,000` rowCount `35_000` (`14.736ms`, dominant `entities.prepare.explicitDespawn`), `explicit-ids / reducer / churn / batch 5,000` rowCount `30_000` (`14.713ms`, dominant `entities.reduce.spawnCleanup`).

### Этап 6 - Рефакторинг, чистка и полировка

Статус: `done`

Записи:

- Удалены unused helpers в `tests/bench/entities/reporting.mjs`; тестовые trace keys переименованы так, чтобы source audit не давал false positive на `test.skip`.
- Проверки этапа: `pnpm exec vitest run tests/entities/entities-transition-trace.test.ts`, `pnpm run bench:entities:record -- --label mass-despawn-smoke --runs 1 --include mass-despawn,mass-despawn-trace --row-counts 6000`, `pnpm run bench:entities:record -- --label transition-trace-smoke --runs 1 --include trace --row-counts 1000`, `pnpm run check-types`, `pnpm run lint`, `git diff --check`.
- Source audit выполнен; остались только штатные `console.log` в CLI benchmark/report runners (`record-node.mjs`, `compare-records.mjs`, `run-*.mjs`), отладочных `TODO/FIXME/debugger/test.only/test.skip/console.debug` нет.
- После Stage 6 cleanup baseline перезаписан заново на текущем checkout и повторно валидирован.

## Финальная проверка

- Статус: `done`
- Записи: все этапы закрыты, baseline artifacts созданы и валидированы, критерии полной готовности выполнены.
