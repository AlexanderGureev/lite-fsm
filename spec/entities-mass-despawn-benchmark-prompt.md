# Prompt: mass despawn benchmark для `@lite-fsm/entities`

Рабочая директория: `/Users/alexga/work/lite-fsm`.

Реализуй diagnostic benchmark и недостающую trace attribution для массового despawn в `@lite-fsm/entities`. Цель первой версии - локализовать источник frame spike в cleanup pipeline и записать baseline, с которым можно сравнивать оптимизации. Не оптимизируй cleanup path в рамках этого задания.

## 1. Контекст

В `apps/playground/app/examples/entities-rts` частые батчевые смерти units могут давать frame spikes. RTS-пример сейчас частично обходит массовый despawn: мертвые строки выключаются батчевым событием `UNITS_DIED` и остаются до `GAME_RESTART`. Нужно проверить библиотечный despawn path без Phaser, React и app code.

Перед началом прочитай:

- `AGENTS.md`;
- `package.json`;
- `packages/entities/src/runtime/reduce.ts`;
- `packages/entities/src/runtime/reduce-despawn.ts`;
- `packages/entities/src/runtime/reduce-batch.ts`;
- `packages/entities/src/runtime/reduce-post-process.ts`;
- `packages/entities/src/runtime/runtime-index.ts`;
- `packages/entities/src/runtime/state.ts`;
- `packages/entities/src/runtime/transaction.ts`;
- `packages/entities/src/runtime/effects.ts`;
- `packages/entities/src/runtime/transitionTrace.ts`;
- `packages/core/src/runtime/kernel/transitionTrace.ts`;
- `tests/entities/entities-transition-trace.test.ts`;
- `tests/bench/entities/composition-lite-fsm-entities.fixture.mjs`;
- `tests/bench/entities/trace.fixture.mjs`;
- `tests/bench/entities/diagnostics.fixture.mjs`;
- `tests/bench/entities/record-node.mjs`;
- `tests/bench/entities/reporting.mjs`;
- `tests/bench/entities/compare-records.mjs`;
- `.bench/entities/transition-trace-baseline.md`, если файл есть в checkout.

Запрещено запускать docs build и команды, которые транзитивно запускают docs build:

- `pnpm run build`;
- `pnpm --filter @lite-fsm/docs build`;
- `pnpm run docs:build`;
- `pnpm run pages:build*`;
- любой `next build` внутри `apps/docs`.

Для package build используй только разрешенный subset: `pnpm --filter @lite-fsm/core run build`, `pnpm --filter @lite-fsm/entities run build` или `pnpm run build:packages`.

## 2. Цель

Добавить benchmark, который отвечает на вопросы:

- проблема находится в RTS-паттерне использования или в библиотечном cleanup path;
- `despawnOn` после reducer state transition дороже explicit `transition.despawn(...)` или наоборот;
- explicit despawn по ids отличается от explicit despawn по `EntityIndex[]`;
- lifecycle `ENTITY_DESPAWNED` без reducer/reactions, с reducer и с reactions влияет на spike;
- основная стоимость находится в `collectPlan`, lifecycle, удалении actor rows, удалении entity records, ownership indexes, group/state buckets, `freeList` или `indexById`;
- steady-state churn отличается от one-shot mass despawn.

Результат должен дать стартовую baseline-запись и отчет, где для каждого сценария видно, какую часть времени занимают cleanup phases и сколько объектов реально обработано.

## 3. Область работ

Добавить или изменить:

- `tests/bench/entities/mass-despawn.fixture.mjs`;
- `tests/bench/entities/trace.fixture.mjs`, если общий trace summarizer должен понимать новые counters или nested explicit despawn records;
- `tests/bench/entities/diagnostics.fixture.mjs`, если нужны kernel-level layers для ownership/group/state/index attribution;
- `tests/bench/entities/record-node.mjs`;
- `tests/bench/entities/reporting.mjs`;
- `tests/bench/entities/compare-records.mjs`, если новый result shape требует сравнения counters или derived metrics;
- `packages/entities/src/runtime/transitionTrace.ts`;
- `packages/entities/src/runtime/transaction.ts`;
- `packages/entities/src/runtime/reduce-despawn.ts`;
- `packages/entities/src/runtime/runtime-index.ts` только если без этого невозможно посчитать removed actor rows или entity records без дублирования логики;
- `tests/entities/entities-transition-trace.test.ts`.

Артефакты baseline писать в `.bench/entities/`.

## 4. Вне области работ

- Не импортировать `apps/playground/**` и не использовать Phaser, React, Next или browser APIs.
- Не менять public API `@lite-fsm/entities`.
- Не менять public types, schema descriptors, `entitiesPlugin` options или lifecycle event names.
- Не менять `apps/playground/app/examples/entities-rts/**`.
- Не оптимизировать cleanup algorithms, ownership indexes, group buckets, state buckets, `freeList` или `indexById`.
- Не менять spawn benchmark contracts, кроме добавления нового include в record runner.
- Не обновлять `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md` или README: целевое изменение internal diagnostics only.
- Не превращать benchmark в release gate с жестким performance budget. Первая версия diagnostic baseline only.

## 5. Целевая архитектура benchmark

### Benchmark fixture

Создай отдельный fixture:

```text
tests/bench/entities/mass-despawn.fixture.mjs
```

Fixture должен импортировать production dist:

- `../../../packages/core/dist/index.js`;
- `../../../packages/entities/dist/index.js`.

Fixture должен экспортировать:

- `benchmarkName = "mass-despawn-lite-fsm-entities"`;
- `rowCounts = [30_000, 35_000]`;
- `batchSizes = [128, 512, 1024, 5_000]`;
- `warmupIterations`;
- `measuredIterations`;
- `scenarioDefinitions`;
- `runEntitiesMassDespawnBenchmark(...)`;
- `runEntitiesMassDespawnTraceBenchmark(...)` или единый runner, если reporting сохраняет traced и untraced sections отдельно.

### Synthetic RTS composition

Каждая entity должна иметь 5 actor rows:

- `identity`;
- `movement`;
- `health`;
- `combat`;
- `enemyAi`.

Используй numeric columns через `u8`, `i32`, `f32`. Строковые поля в hot rows не нужны, кроме public entity id в spawn spec.

Каждый actor должен иметь:

- `storage: "entity"`;
- `__INIT -> ENTITY_SPAWNED -> active`;
- минимальный `spawnSchema`, достаточный для заполнения колонок;
- `ENTITY_DESPAWNED` transitions только в сценариях, где это требуется lifecycle mode.

Рекомендуемые поля:

- `identity`: `kind`, `faction`, `radius`, `unitIndex`;
- `movement`: `x`, `y`, `vx`, `vy`, `speed`;
- `health`: `hp`, `maxHp`, `pendingKill`;
- `combat`: `attackRange`, `attackDamage`, `cooldownMs`, `incomingDamage`;
- `enemyAi`: `intent`.

Spawn event:

- `SPAWN_RTS_UNITS`;
- payload: `{ count, startId, groupTagMode }`;
- group tags: базово один `unit`; optional profile `player/enemy` допустим только если он добавляет отдельный scenario key и не смешивает результаты с базовым профилем.

### Scenario dimensions

Обязательные dimensions:

- `rowCount`: `30_000`, `35_000`;
- `batchSize`: `128`, `512`, `1024`, `5000`;
- `mode`: `one-shot`, `churn`;
- `path`: `despawnOn`, `explicit-ids`, `explicit-indices`;
- `lifecycle`: `none`, `edge-only`, `reducer`, `reaction`.

Не обязательно выполнять полный Cartesian product, если он слишком дорогой. Минимальная обязательная матрица:

- все `batchSize` для `despawnOn + lifecycle:none`;
- все `batchSize` для `explicit-ids + lifecycle:none`;
- все `batchSize` для `explicit-indices + lifecycle:none`;
- `batchSize=1024` и `batchSize=5000` для `lifecycle:edge-only`;
- `batchSize=1024` и `batchSize=5000` для `lifecycle:reducer`;
- `batchSize=1024` и `batchSize=5000` для `lifecycle:reaction`;
- `one-shot` и `churn` для всех обязательных сценариев.

Каждый scenario key должен кодировать все dimensions, например:

```text
despawn-on-none-one-shot-b1024
explicit-ids-reaction-churn-b5000
```

### Despawn paths

`despawnOn`:

- reducer `health` получает routed action для batch entities;
- reducer переводит `health.stateCode[entity]` в `dead`;
- `health` имеет `despawnOn: "dead"`;
- cleanup должен происходить в `entities.reduce.publicCleanup`;
- если action routing выполняется по ids, отчет должен явно показывать routing/setup cost отдельно от cleanup phases, чтобы не смешивать `indexById` lookup с `removeEntityRecords`.

`explicit-ids`:

- effect должен вызвать `transition.despawn(ids)`;
- ids строятся через `self.entityId(entity)` для текущего effect scope;
- benchmark должен учитывать nested transition `LITE_FSM_ENTITY_DESPAWN`, а не терять его из-за фильтра `depth === 0`;
- отчет должен отдельно показывать outer effect transition и inner explicit despawn transition или агрегировать их под одним scenario с явным breakdown.

`explicit-indices`:

- effect должен вызвать `transition.despawn(self.indices)`;
- нельзя передавать raw `EntityIndex[]`, не равный текущему `self.indices`;
- benchmark должен учитывать captured scope/generation validation path;
- отчет должен показывать разницу с `explicit-ids`.

### One-shot mode

`one-shot` измеряет один despawn transition после populate.

Правила:

- populate и reset не входят в измеряемое время;
- перед каждым measured operation manager должен быть в одинаковом состоянии;
- live entities до transition: `rowCount`;
- despawned entities: `batchSize`;
- removed actor rows: `batchSize * 5`;
- после transition live count уменьшается на `batchSize`.

### Churn mode

`churn` измеряет повторяемую нагрузку: despawn batch и replacement spawn batch.

Правила:

- отчет должен показывать despawn transition отдельно от replacement spawn transition;
- основная метрика сравнения для этой задачи - despawn transition;
- replacement spawn нужен, чтобы проверить `freeList`, capacity reuse и `indexById` под steady-state;
- live count должен возвращаться к целевому уровню между циклами;
- если порядок реализации проще как `despawn -> spawn replacement`, используй его и явно назови в scenario metadata;
- если используешь `spawn replacement -> despawn`, prepopulate должен учитывать временный live count, чтобы не менять целевую нагрузку между samples.

## 6. Недостающая trace attribution

### Existing phases

Сохрани и проверь существующие phases:

- `entities.cleanup.public.collectPlan`;
- `entities.cleanup.public.lifecycle`;
- `entities.cleanup.public.removeActorRows`;
- `entities.cleanup.public.removeEntityRecords`;
- `entities.reduce.publicCleanup`.

Добавь labels и parent mapping в `tests/bench/entities/trace.fixture.mjs` и reporting, если новый fixture переиспользует общий trace summarizer.

### New phases

Добавь phase:

- `entities.prepare.explicitDespawn`.

Назначение: измерять `stageExplicitDespawns(...)` внутри `prepareEntityTransaction(...)`, включая id lookup, captured generation validation и schedule marks. Phase должен записываться только при включенном trace collector и не должен вызывать `performance.now()` без trace session.

Если без дополнительного риска можно разделить cleanup internals, добавь только coarse phases:

- `entities.cleanup.public.collectPlan`;
- `entities.cleanup.public.lifecycle`;
- `entities.cleanup.public.removeActorRows`;
- `entities.cleanup.public.removeEntityRecords`.

Не протаскивай trace session глубоко в `runtime-index.ts`, если это существенно усложняет владельцев ответственности. Для стоимости `actorRowsByGroupTag`, state buckets, group buckets, `freeList` и `indexById` используй diagnostics fixture, если public phases недостаточно.

### Counters

Добавь helper в `packages/entities/src/runtime/transitionTrace.ts`:

```ts
recordEntityTraceCounter(trace, key, value?)
```

Контракт helper:

- без trace session не делает ничего;
- не вызывает `performance.now()`;
- использует `trace.count(key, value)`;
- не экспортируется из public package entrypoint.

Обязательные counters:

- `entities.prepare.explicitDespawn.ids`;
- `entities.prepare.explicitDespawn.scopeEntries`;
- `entities.prepare.explicitDespawn.scheduled`;
- `entities.cleanup.public.scheduledDespawns`;
- `entities.cleanup.public.despawnedEntities`;
- `entities.cleanup.public.removedActorRows`;
- `entities.cleanup.public.removedEntityRecords`;
- `entities.cleanup.public.touchedTemplates`;
- `entities.cleanup.public.lifecycleBatches`;
- `entities.cleanup.public.lifecycleRows`;
- `entities.cleanup.public.removalBatches`;
- `entities.cleanup.public.terminalRows`.

Если меняется `spawn` cleanup path теми же helpers, аналогичные counters для `entities.cleanup.spawn.*` допустимы, но report для mass despawn должен фокусироваться на `public`.

Counter semantics:

- `scheduledDespawns`: количество записей, прочитанных из transaction before stale/live filtering;
- `despawnedEntities`: live entities, попавшие в cleanup plan;
- `removedActorRows`: фактически удаленные actor rows;
- `removedEntityRecords`: фактически удаленные entity records;
- `touchedTemplates`: количество actor stores с removal batch;
- `lifecycleBatches`: количество reducer batches для `ENTITY_DESPAWNED`;
- `lifecycleRows`: сумма rows во всех lifecycle batches;
- `removalBatches`: количество removal batches;
- `terminalRows`: количество terminal row refs, обработанных terminal cleanup branch.

### Trace summary and reporting

Trace summary должен агрегировать counters так же, как phases:

- median;
- p95;
- min;
- max;
- samples;
- relative stddev.

Markdown report должен содержать tables:

- scenario summary: total median/p95, rowCount, batchSize, mode, path, lifecycle;
- cleanup phases: phase median/p95 и percent of `entities.reduce.publicCleanup`;
- counters: despawned entities, removed actor rows, removed entity records, lifecycle rows, touched templates;
- derived throughput: entities/ms, actorRows/ms, ms/entity, ms/actorRow;
- path comparison: `despawnOn` vs `explicit-ids` vs `explicit-indices` for same rowCount/batchSize/mode/lifecycle;
- churn comparison: despawn transition vs replacement spawn transition.

`compare-records.mjs` должен показывать до/после:

- total transition delta;
- cleanup phase deltas;
- throughput deltas;
- counters mismatch warnings, если before/after обработали разный объем work.

## 7. Diagnostics layer

Если public trace показывает проблему в `removeActorRows` или `removeEntityRecords`, но не объясняет структуру, расширь `tests/bench/entities/diagnostics.fixture.mjs` или добавь рядом новый diagnostics runner.

Diagnostics должны изолировать:

- `actorRowsByEntity` plan scan;
- `actorRowsByGroupTag` ownership swap-remove;
- state bucket remove;
- entity group bucket remove;
- `indexById` delete;
- `freeList.push`;
- public slice refresh.

Diagnostics не должны заменять public API benchmark. Они служат только attribution layer.

## 8. CLI и baseline commands

Расширь `tests/bench/entities/record-node.mjs`:

- добавить include `mass-despawn`;
- добавить include `mass-despawn-trace`;
- `--include gate,trace` остается default;
- новый include не должен запускаться по умолчанию.

Smoke command:

```bash
pnpm run bench:entities:record -- --label mass-despawn-smoke --runs 1 --include mass-despawn,mass-despawn-trace --row-counts 6000
```

Baseline command:

```bash
pnpm run bench:entities:record -- --label mass-despawn-baseline --runs 5 --include mass-despawn,mass-despawn-trace --row-counts 30000,35000
```

Compare command after future optimization:

```bash
pnpm run bench:entities:compare -- .bench/entities/mass-despawn-baseline.json .bench/entities/mass-despawn-after.json
```

Если baseline command слишком долгий, не уменьшай default scenario coverage молча. Зафиксируй время выполнения и предложи отдельный `--profile smoke|baseline` или аналогичный option.

## 9. Этапы реализации

### Этап 1 - Trace counters и explicit despawn phase

#### Цель

Добавить недостающую production trace attribution без изменения public API.

#### Зависит от

Нет.

#### Контракт этапа

- Добавить internal helper `recordEntityTraceCounter`.
- Добавить phase `entities.prepare.explicitDespawn` вокруг explicit despawn staging.
- Добавить counters для explicit ids, explicit scope entries и scheduled despawns.
- Добавить cleanup counters в `flushEntityLifecycleCleanup(...)`.
- `recordEntityTracePhase` и новый counter helper не должны создавать overhead без trace session.
- Не менять semantic behavior cleanup, stale scope handling и no-op для unknown ids.

#### Не делать в этом этапе

- Не добавлять benchmark fixture.
- Не менять reporting.
- Не оптимизировать cleanup.
- Не менять public exports.

#### Тесты этапа

- Обновить `tests/entities/entities-transition-trace.test.ts`.
- Добавить test на наличие `entities.prepare.explicitDespawn` для `transition.despawn(...)`.
- Добавить test на cleanup counters для `despawnOn`.
- Названия новых `describe`/`it` писать на русском.

#### Критерий завершения

- `pnpm exec vitest run tests/entities/entities-transition-trace.test.ts` проходит.
- `pnpm run check-types` проходит или, если команда слишком долгая, выполнен focused package type check и причина зафиксирована в журнале.
- `git diff --check` проходит.

### Этап 2 - Mass despawn fixture

#### Цель

Добавить synthetic RTS-like benchmark без app imports.

#### Зависит от

Этап 1.

#### Контракт этапа

- Создать `tests/bench/entities/mass-despawn.fixture.mjs`.
- Использовать 5 actor rows на entity: `identity`, `movement`, `health`, `combat`, `enemyAi`.
- Реализовать `despawnOn`, `explicit-ids`, `explicit-indices`.
- Реализовать lifecycle modes `none`, `edge-only`, `reducer`, `reaction`.
- Реализовать `one-shot` и `churn`.
- Для explicit despawn trace учитывать nested `LITE_FSM_ENTITY_DESPAWN` records.
- У каждого scenario должны быть metadata: `rowCount`, `actorRowsPerEntity`, `actorRowCount`, `batchSize`, `mode`, `path`, `lifecycle`, `operationOrder`.
- Сценарии должны проверять expected counts после operation: live entities, actor store counts, removed actor rows.

#### Не делать в этом этапе

- Не добавлять CLI include.
- Не менять Markdown reporting.
- Не оптимизировать runtime.
- Не импортировать `apps/playground`.

#### Тесты этапа

- Запустить fixture через локальный smoke runner или временно через node import command.
- Проверить rowCount `6000`, batchSize `5000`, все обязательные paths.
- Проверить, что one-shot reset не входит в measured timing.
- Проверить, что churn возвращает live count к целевому уровню.

#### Критерий завершения

- Fixture smoke выполняется без ошибок.
- Для каждого mandatory scenario есть ненулевой measured sample set.
- Expected counters совпадают с batch size и `5` actor rows на entity.

### Этап 3 - Record runner и reporting

#### Цель

Сделать benchmark записываемым и сравнимым через существующие `.bench/entities` artifacts.

#### Зависит от

Этап 2.

#### Контракт этапа

- Добавить `mass-despawn` и `mass-despawn-trace` в `record-node.mjs`.
- Сохранить default `--include gate,trace`.
- Добавить aggregation для mass despawn timing, trace phases и counters.
- Markdown report должен иметь отдельные sections для mass despawn.
- `compare-records.mjs` должен показывать before/after deltas и warnings при mismatch counters.
- JSON schema version менять только если старые records нельзя валидно читать; предпочтительно сохранить backward compatibility.

#### Не делать в этом этапе

- Не менять существующие gate/spawn/trace tables без необходимости.
- Не делать mass despawn default include.
- Не добавлять hard budget pass/fail.

#### Тесты этапа

- Smoke command:

```bash
pnpm run bench:entities:record -- --label mass-despawn-smoke --runs 1 --include mass-despawn,mass-despawn-trace --row-counts 6000
```

- Если smoke пишет artifacts, проверить `.bench/entities/mass-despawn-smoke.json` и `.bench/entities/mass-despawn-smoke.md`.
- Проверить, что old include still works:

```bash
pnpm run bench:entities:record -- --label transition-trace-smoke --runs 1 --include trace --row-counts 1000
```

#### Критерий завершения

- Smoke artifacts созданы.
- Markdown содержит summary, cleanup phases, counters и throughput.
- Старые trace artifacts продолжают записываться.

### Этап 4 - Diagnostics attribution

#### Цель

Добавить internal layer, который объясняет `removeActorRows` и `removeEntityRecords`, если public phases слишком coarse.

#### Зависит от

Этап 3.

#### Контракт этапа

- Переиспользовать `tests/bench/entities/diagnostics.fixture.mjs`, если его layers достаточно близки.
- Добавить RTS-like mass despawn diagnostics только для структур, которые public trace не разделяет.
- Diagnostics должны показывать cost для ownership, group buckets, state buckets, `indexById`, `freeList`.
- Diagnostics report не должен смешиваться с public API scenario summary.

#### Не делать в этом этапе

- Не менять production runtime ради diagnostics, если можно измерить kernel-like runner.
- Не делать вывод об оптимизации без public trace evidence.
- Не расширять diagnostics на unrelated spawn/reducer scenarios.

#### Тесты этапа

- Запустить diagnostics smoke для rowCount `6000`.
- Проверить, что report содержит layers для ownership/group/state/index.

#### Критерий завершения

- Diagnostics smoke выполняется.
- Report позволяет связать public phase `removeActorRows` или `removeEntityRecords` с конкретной внутренней структурой.

### Этап 5 - Baseline record

#### Цель

Записать baseline, пригодный для сравнения будущих оптимизаций.

#### Зависит от

Этап 4.

#### Контракт этапа

- Запустить baseline command:

```bash
pnpm run bench:entities:record -- --label mass-despawn-baseline --runs 5 --include mass-despawn,mass-despawn-trace --row-counts 30000,35000
```

- Если diagnostics include добавлен отдельно, записать baseline diagnostics отдельной label или включить в тот же record только при приемлемом времени выполнения.
- В Markdown baseline должны быть указаны git SHA, dirty status, Node version, CPU model, scenario count, run count.
- Если benchmark variance высокая, report должен явно показать warning.

#### Не делать в этом этапе

- Не менять код после baseline без повторной записи baseline.
- Не интерпретировать improvement, потому что оптимизации еще нет.
- Не удалять smoke artifacts.

#### Тесты этапа

- Проверить, что `.bench/entities/mass-despawn-baseline.json` и `.bench/entities/mass-despawn-baseline.md` созданы.
- Проверить, что `latest.json` и `latest.md` обновлены.
- Проверить, что mandatory scenarios присутствуют для `30_000` и `35_000`.

#### Критерий завершения

- Baseline artifacts созданы.
- Отчет показывает, где находится максимальная стоимость: path, mode, batchSize, phase и counters.
- Для каждого scenario counters подтверждают одинаковый объем work между comparable paths.

### Этап 6 - Рефакторинг, чистка и полировка

#### Цель

Убрать временные элементы и проверить, что benchmark и traces готовы к review.

#### Зависит от

Этап 5.

#### Контракт этапа

- Удалить temporary debug logging, transitional branches и unused helpers.
- Сохранить один владелец для trace helper, benchmark fixture, aggregation и report formatting.
- Не оставлять abstractions без второго места использования или явного снижения сложности.
- Проверить, что public API и public types не изменились.
- Проверить, что existing benchmark includes не сломаны.

#### Не делать в этом этапе

- Не оптимизировать cleanup.
- Не переименовывать unrelated scenarios.
- Не менять RTS app.

#### Must fix

- stale comments;
- debug output;
- `TODO`/`FIXME` в active scope;
- duplicate counter aggregation logic;
- source audit hits в active benchmark/runtime trace scope.

#### Inspect only

- декоративные переименования;
- перенос reporting code без снижения дублирования;
- micro-optimizations benchmark runner.

#### Тесты этапа

- `pnpm exec vitest run tests/entities/entities-transition-trace.test.ts`;
- `pnpm run bench:entities:record -- --label mass-despawn-smoke --runs 1 --include mass-despawn,mass-despawn-trace --row-counts 6000`;
- `pnpm run bench:entities:record -- --label transition-trace-smoke --runs 1 --include trace --row-counts 1000`;
- `pnpm run check-types`;
- `pnpm run lint`;
- `git diff --check`;
- source audit:

```bash
rg -n "TODO|FIXME|debugger|test\\.only|test\\.skip|console\\.log|console\\.debug" packages/entities/src/runtime tests/entities tests/bench/entities
```

#### Критерий завершения

- Все проверки этапа проходят или причина невозможности явно зафиксирована в журнале.
- Baseline artifacts остаются актуальными после последней правки.
- В final summary указаны baseline paths и главная локализация стоимости.

## 10. Критерий полной готовности

Работа считается готовой, когда:

- trace counters и `entities.prepare.explicitDespawn` покрыты focused tests;
- mass despawn benchmark работает без app imports;
- smoke artifacts создаются через `bench:entities:record`;
- baseline artifacts `mass-despawn-baseline.json` и `mass-despawn-baseline.md` записаны;
- отчет показывает total, cleanup phases, counters и throughput;
- compare tooling показывает meaningful before/after delta для будущей оптимизации;
- old `gate`, `trace`, `spawn` includes сохраняют backward compatibility;
- public API `@lite-fsm/entities` не изменен;
- docs build не запускался.

## 11. Финальный отчет исполнителя

В финальном ответе укажи:

- список измененных файлов;
- команды, которые запускались;
- пути к baseline JSON и Markdown;
- top 3 самых дорогих scenarios по p95;
- phase, который доминирует в каждом top scenario;
- counters для этих scenarios: despawned entities, removed actor rows, lifecycle rows, touched templates;
- вывод: проблема локализована в usage pattern, explicit despawn staging, lifecycle, ownership/group/state indexes или общем cleanup pipeline;
- residual risks и что сравнивать после оптимизации.
