# @lite-fsm/entities spawn bulk commit — ТЗ для реализации

## 1. Цель

Ускорить spawn path в `@lite-fsm/entities` без изменения public API.

Проблемный сценарий:

- пример: `apps/playground/app/examples/entities-rts`;
- конфигурация: `enemies=30000&playerUnits=5000&playerUnitHp=50000&seed=debug-smoke`;
- размер batch: `35 000` entities, примерно `175 000` actor rows;
- baseline: `.bench/entities/spawn-baseline.md`, record `2026-06-18T10:57:53.590Z`, Git SHA `7db039091a7c`;
- текущий результат: `RTS enemy spawn batch / 35 000` занимает `22178.930ms`, trace total `22852.557ms`;
- основной источник: `entities.reduce.spawnLifecycle.applyStagedSpawns` занимает `22751.148ms`;
- lifecycle reducers после commit занимают около `23.792ms` и не являются целью первой оптимизации.

Целевой результат первой реализации:

- убрать per-row рост capacity в `applyStagedSpawns`;
- сохранить текущие runtime contracts spawn lifecycle;
- оставить public API и public types без изменений;
- довести `RTS enemy spawn batch / 35 000` до `Total p95 < 250ms`;
- довести `entities.reduce.spawnLifecycle.applyStagedSpawns p95 < 50ms`;
- не ухудшить `entities.reduce.spawnLifecycle.reduceBatches` больше чем в `1.5x` относительно baseline.

## 2. Как выполнять это ТЗ

Реализация идет строго по этапам. Этап `N+1` начинается только после прохождения `stage gate` этапа `N`.

Перед началом реализации прочитать:

- `packages/entities/src/runtime/reduce.ts`;
- `packages/entities/src/runtime/reduce-spawn.ts`;
- `packages/entities/src/runtime/reduce-batch.ts`;
- `packages/entities/src/runtime/reduce-transitions.ts`;
- `packages/entities/src/runtime/reduce-post-process.ts`;
- `packages/entities/src/runtime/runtime-index.ts`;
- `packages/entities/src/runtime/state.ts`;
- `packages/entities/src/runtime/store-types.ts`;
- `packages/entities/src/runtime/columns.ts`;
- `packages/entities/src/runtime/transaction.ts`;
- `packages/entities/src/runtime/mutation-snapshot.ts`;
- `packages/entities/src/runtime/routing.ts`;
- `packages/entities/src/runtime/snapshot.ts`;
- `tests/entities/entities-plugin.test.ts`;
- `tests/entities/entities-reducer-post-processing.test.ts`;
- `tests/entities/entities-transition-trace.test.ts`;
- `tests/playground/entities-rts/spawn.test.ts`;
- `tests/bench/entities/spawn.fixture.mjs`;
- `tests/bench/entities/reporting.mjs`;
- `.bench/entities/spawn-baseline.md`;
- `.bench/entities/spawn-baseline.json`.

Запрещенные проверки:

- `pnpm run build`;
- `pnpm --filter @lite-fsm/docs build`;
- `pnpm run docs:build`;
- `pnpm run pages:build*`;
- любой `next build` внутри `apps/docs`.

Если нужна сборка пакетов, использовать `pnpm run build:packages`.

### Область работ

- internal spawn commit path в `packages/entities/src/runtime/**`;
- internal types, используемые `reduce-spawn.ts`, `reduce-batch.ts` и `reduce-shared.ts`;
- focused runtime tests в `tests/entities/**`;
- RTS spawn regression tests в `tests/playground/entities-rts/**`, если контракт требует demo-level подтверждения;
- benchmark tooling only в части trace labels/reporting, если новая структура требует уточнить attribution.

### Вне области работ

- изменение public API `@lite-fsm/entities`;
- изменение `defineEntitySpawn`, `defineSpawnEvents`, schema descriptors или public lifecycle event names;
- изменение public type inference и `tests/types/**`, если internal type edits не затрагивают public contracts;
- изменение RTS gameplay, spawn plan generation или Phaser integration;
- lifecycle reducer fast path после `applyStagedSpawns`;
- узкий undo-журнал вместо текущего `snapshotRuntimeMutation` rollback;
- amortized capacity policy для множества мелких spawn dispatch;
- prod-only unchecked `payloadFor(entity)`;
- замена `actorRowsByEntity` / `actorRowsByGroupTag` на новую SoA-структуру;
- docs build.

### Общие инварианты

- `stageSpawnAction` продолжает выполнять recipe, normalize и validation до любых runtime store mutations.
- Duplicate live id и duplicate id внутри одного recipe result продолжают падать атомарно до commit.
- `reduceEntityBucket` продолжает создавать `snapshotRuntimeMutation(runtime)` перед spawn lifecycle, если `staged.length > 0`.
- Ошибка после spawn commit продолжает восстанавливать runtime через `restoreRuntimeMutation(runtime, snapshot)`.
- `ENTITY_SPAWNED` lifecycle остается internal event и не доставляется subscribers как public transition.
- Spawn lifecycle по-прежнему выполняется перед reducer исходного public spawn event.
- `despawnOn`, terminal cleanup, state effects и reactions остаются обязанностью существующего `reduceAcceptedBatch` и `flushEntityLifecycleCleanup`.
- Все actor rows текущего staged spawn должны быть физически созданы до первого вызова lifecycle reducer.
- Reducer `entities()` внутри `ENTITY_SPAWNED` должен видеть полный staged spawn commit по всем templates этого dispatch.
- `payloadFor(entity)` доступен только во время `ENTITY_SPAWNED` и только для entity текущего spawn scope этого actor template.
- `payloadFor(entity)` должен бросать текущую диагностическую ошибку для entity вне current spawn scope во всех режимах.
- `EntityIndex` allocation сохраняет internal compatibility: сначала LIFO reuse из `freeList`, затем новые индексы от текущего `entityStore.ids.length`.
- Точный размер `version` increments не является контрактом. Версии являются monotonic invalidation tokens.
- `publicSlice` должен обновляться один раз на затронутый actor store после bulk count/version/capacity mutation и до storage `commit.restorePublicSlices`.
- Порядок `SpawnBatch[]` должен совпадать с текущим `Map` insertion order: первый template encounter в обходе staged specs.
- Порядок `batch.indices` для каждого actor template должен совпадать с текущим обходом staged specs.
- Порядок `actorRowsByEntity[entity]` и `actorRowsByGroupTag[groupTag]` должен соответствовать текущему nested traversal: staged entity order, затем actor order внутри spec.
- Column defaults остаются контрактом для строк, где reducer не записал значение.
- Resource values и resource views не участвуют в этой оптимизации.

## 3. Целевой public API

Public API не меняется.

Не добавлять:

- новые exports из `@lite-fsm/entities`;
- новые options для `entitiesPlugin`;
- public `reserve`, `bulkSpawn`, `uncheckedPayloadFor` или аналогичные API;
- новые lifecycle event names;
- новые cheatsheet entries как public capability.

`API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md` и `packages/entities/README.md` обновлять только если реализация неожиданно меняет документированный публичный контракт. Для целевого решения обновление этих файлов не требуется.

## 4. Целевая архитектура

### Internal modules

Добавить небольшой internal module, например:

```text
packages/entities/src/runtime/spawn-commit.ts
```

Назначение модуля:

- назначить entity indices для staged spawn без мутации store;
- посчитать exact capacity requirements для `entityStore` и actor stores;
- подготовить actor batches для lifecycle reducer;
- выполнить bulk reserve;
- применить physical commit в entity store, actor stores, ownership indexes и group buckets.

`reduce-spawn.ts` остается entrypoint lifecycle orchestration:

- вызывает internal planner/commit;
- получает `SpawnBatch[]`;
- передает batches в существующий `reduceAcceptedBatch`;
- запускает lifecycle reactions без изменения порядка.

### Планирование entity indices

Planner строит `assignedEntities` для `stagedSpawns` до reserve:

```ts
const freeCount = entityStore.freeList.length;
for (let index = 0; index < staged.length; index += 1) {
  assigned[index] =
    index < freeCount
      ? entityStore.freeList[freeCount - 1 - index]
      : entityStore.ids.length + (index - freeCount);
}
```

Контракт:

- порядок совпадает с текущим `entityStore.freeList.pop() ?? entityStore.ids.length`;
- `freeList` мутируется только в commit phase;
- `usedFreeListCount = Math.min(freeList.length, staged.length)`;
- после успешного commit `entityStore.freeList.length -= usedFreeListCount`;
- `requiredEntityCapacity` равен максимальному assigned index плюс `1`, если он больше текущей capacity.

### Bulk reserve

Commit выполняет reserve до записи строк:

- `ensureEntityCapacity(entityStore, requiredEntityCapacity)` вызывается не чаще одного раза на spawn batch;
- `ensureActorCapacity(store, requiredActorCapacity)` вызывается не чаще одного раза на actor store;
- после reserve не должно быть вызовов `ensureEntityCapacity` или `ensureActorCapacity` внутри per-row loops;
- `ensureActorCapacity` сохраняет текущий side effect rebind reducer self и entity access views только при фактическом росте.

### Entity store commit

Для каждой staged entity:

- записать `entityStore.ids[entity] = staged.id`;
- записать `entityStore.indexById[staged.id] = entity`;
- установить `entityStore.alive[entity] = 1`;
- увеличить `entityStore.generation[entity] += 1`;
- записать `entityStore.groupTagByIndex[entity] = staged.groupTag`;
- добавить entity в `entitiesByGroupTag[groupTag]`;
- записать `groupTagPosition[entity]`;
- не обновлять `entityStore.count` и `entityStore.version` на каждой строке.

После всех entity rows:

- `entityStore.count += staged.length`;
- `entityStore.version += 1`, если `staged.length > 0`;
- `freeList` отражает использованные LIFO holes.

### Actor store commit

Для каждой actor row:

- установить `presence[entity] = 1`;
- установить `stateCode[entity] = ENTITY_INIT_STATE_CODE`;
- установить `prevStateCode[entity] = ENTITY_INIT_STATE_CODE`;
- установить `rowVersion[entity] = 0`;
- записать initial context defaults;
- создать `EntityActorRowRef`;
- добавить ref в `runtime.actorRowsByEntity[entity]`;
- добавить ref в `runtime.actorRowsByGroupTag[groupTag]`.

После всех rows конкретного actor store:

- `store.count += addedRows`;
- `store.version += 1`, если `addedRows > 0`;
- `refreshActorPublicSlice(store)` вызвать один раз;
- не вызывать `refreshActorPublicSlice(store)` внутри per-row loop.

Column default initialization:

- сохранить текущий контракт defaults;
- не анализировать reducer и не пропускать defaults на основании `spawnSchema`;
- допустимо предварительно получить `Object.entries(store.metadata.initialContext)` один раз на store и переиспользовать entries внутри row loop;
- не вводить сложную `fill(start, end)` оптимизацию в первой итерации.

### Ownership indexes

Не менять модель данных:

- `runtime.actorRowsByEntity` остается `EntityActorRowRef[][]`;
- `runtime.actorRowsByGroupTag` остается `Record<string, EntityActorRowRef[]>`;
- `EntityActorRowRef` сохраняет поля `store`, `entity`, `groupTag`, `entityRowsPosition`, `groupRowsPosition`.

Меняется только способ заполнения:

- не вызывать `addActorRowOwnership` в hot loop, если новый bulk writer может записать ref и positions напрямую;
- не менять порядок refs относительно текущей реализации;
- group buckets должны корректно работать для entity routing, group routing, despawn cleanup и snapshot rebuild.

### Spawn payload scope

Заменить `payloadByEntity: Map<EntityIndex, Record<string, unknown>>` на более дешевую internal структуру.

Контракт структуры:

- хранить `indices: EntityIndex[]` и `payloads: Record<string, unknown>[]` в одинаковом порядке;
- для dense case поддерживать O(1) lookup через `offset = entity - firstEntity`;
- dense case допустим только если `indices[offset] === entity`;
- для sparse/freeList case использовать lightweight numeric position lookup;
- `payloadFor(entity)` всегда проверяет принадлежность entity current spawn scope;
- ошибка вне scope должна сохранить текущий смысл и текстовую диагностику про current spawn scope;
- outside `ENTITY_SPAWNED` ошибка должна сохранить текущий смысл и диагностику;
- unchecked prod-only behavior не вводить.

### Lifecycle reducer integration

`reduceAcceptedBatch` и post-processing pipeline не переписывать.

Причины:

- baseline `reduceBatches` около `23.792ms`, а `applyStagedSpawns` около `22751.148ms`;
- state bucket update должен идти после default transition, reducer override, `despawnOn` и terminal handling;
- actor template без `ENTITY_SPAWNED` transition должен получить row в `__INIT`, но не должен быть насильно переведен в public state.

## 5. Матрица обязательных проверок

Тесты должны покрыть не полный Cartesian product, а contract matrix с обязательными пересечениями.

Оси:

- dense spawn без `freeList`;
- sparse spawn с `freeList` reuse;
- single actor entity;
- multi-actor entity;
- один `groupTag`;
- несколько `groupTag`;
- actor template с `ENTITY_SPAWNED` transition;
- actor template без `ENTITY_SPAWNED` transition;
- reducer пишет payload columns;
- reducer override `stateCode`;
- reducer бросает ошибку;
- `despawnOn`;
- terminal `__RESOLVED`;
- lifecycle effects;
- lifecycle reactions;
- `payloadFor(entity)` valid;
- `payloadFor(entity)` out-of-scope;
- `payloadFor(entity)` outside `ENTITY_SPAWNED`;
- duplicate live id;
- duplicate id внутри одного recipe;
- rollback после lifecycle error;
- rollback после public event reducer error;
- snapshot/dehydrate/hydrate после bulk spawn;
- routing by entity id;
- routing by group tag;
- unscoped routing.

Обязательные пересечения:

- sparse spawn + multi-actor + несколько `groupTag` + routing by group tag;
- sparse spawn + `payloadFor(entity)` valid/out-of-scope;
- dense spawn + lifecycle reducer пишет payload columns;
- actor без `ENTITY_SPAWNED` transition + row остается в `__INIT`;
- reducer override `stateCode` + state buckets после spawn корректны;
- `despawnOn` на lifecycle + cleanup не оставляет ownership refs;
- lifecycle effect/reaction + captured scope получает корректные entity ids и generation;
- duplicate errors + нет частично созданных rows;
- lifecycle error + rollback восстанавливает предыдущие rows, columns, group buckets, `freeList`, `publicSlice`;
- public event reducer error после spawn lifecycle + rollback удаляет lifecycle-created rows;
- snapshot/dehydrate/hydrate после dense и sparse spawn сохраняет rows, versions, freeList и routing.

## 6. Этапы реализации

### Этап 1 — Bulk planner и exact reserve

Тип этапа: `behavior`.

#### Цель

Вынести physical spawn commit в internal planner/commit module и убрать per-row capacity growth.

#### Зависит от

Нет.

#### Контракт этапа

- Добавить internal module `packages/entities/src/runtime/spawn-commit.ts` или эквивалентный файл с тем же владельцем ответственности.
- `reduce-spawn.ts` должен использовать новый module вместо локальных `allocateEntity`, `stageActorRow`, `applyStagedSpawns`.
- Planner должен назначать entity indices до мутации и сохранять текущий LIFO `freeList` reuse.
- Planner должен считать `requiredEntityCapacity` и `requiredActorCapacity` по actor store.
- Commit должен вызывать `ensureEntityCapacity` один раз на batch и `ensureActorCapacity` один раз на затронутый actor store.
- После reserve per-row loops не должны вызывать capacity helpers.
- Entity store `count` и `version` обновляются агрегированно.
- Actor store `count`, `version` и `publicSlice` обновляются агрегированно.
- Actor row ownership refs создаются без изменения текущего порядка.
- `SpawnBatch[]` order и `batch.indices` order сохраняют текущую семантику.
- Column defaults сохраняются. Допустимо кэшировать entries `initialContext` на время commit.

#### Не делать в этом этапе

- Не менять `reduceAcceptedBatch`.
- Не менять `payloadFor(entity)` storage, кроме минимальной адаптации к новому `SpawnBatch`, если без этого код не компилируется.
- Не менять public API и public types.
- Не менять rollback snapshot mechanism.
- Не менять `actorRowsByEntity` / `actorRowsByGroupTag` data model.

#### Тесты этапа

- Добавить focused tests на dense spawn: count, capacity, `indexById`, actor presence, group buckets, public slice.
- Добавить focused tests на sparse spawn через `freeList`: LIFO reuse, tail append, `freeList` after commit.
- Добавить test на multi-actor entity: `actorRowsByEntity`, `actorRowsByGroupTag`, positions и group routing.
- Добавить test на monotonic version semantics: версии выросли, но exact increments не проверяются.
- Добавить regression, что actor без `ENTITY_SPAWNED` transition остается в `__INIT`.
- Добавить rollback smoke после ошибки в `ENTITY_SPAWNED` reducer: предыдущие rows, `freeList`, `indexById`, columns, ownership refs и `publicSlice` восстановлены.

#### Критерий завершения

- В hot loop spawn commit нет вызовов `ensureEntityCapacity` и `ensureActorCapacity`.
- Focused tests этапа проходят.
- Rollback smoke stage gate проходит до перехода к payload scope.
- `pnpm --filter @lite-fsm/entities run check-types` проходит.
- `git diff --check` проходит.

### Этап 2 — Payload scope без `Map`

Тип этапа: `behavior`.

#### Цель

Убрать `payloadByEntity: Map` из spawn lifecycle batch и заменить его internal payload scope с dense fast path и checked fallback.

#### Зависит от

Этап 1.

#### Контракт этапа

- Internal batch хранит payloads в массиве, синхронизированном с `indices`.
- Dense path использует `firstEntity` и offset lookup.
- Dense path всегда проверяет bounds и `indices[offset] === entity`.
- Sparse path покрывает `freeList` holes и смешанный free/tail allocation.
- `payloadFor(entity)` сохраняет runtime check во всех режимах.
- Ошибка для entity вне current spawn scope сохраняет текущий диагностический смысл.
- Ошибка outside `ENTITY_SPAWNED` сохраняет текущий диагностический смысл.
- `ReducerBatch` и `createPayloadFor` могут получить новый internal тип, но public types не меняются.

#### Не делать в этом этапе

- Не вводить prod-only unchecked mode.
- Не менять reducer signature.
- Не менять `EntityReducerContext` public typing.
- Не пытаться анализировать reducer usage of `payloadFor`.

#### Тесты этапа

- Dense spawn: `payloadFor(entity)` возвращает корректный payload для всех rows batch.
- Sparse/freeList spawn: `payloadFor(entity)` возвращает payload для reused index и tail index.
- Out-of-scope entity во втором spawn продолжает бросать ошибку и откатывает только второй spawn.
- `payloadFor(entity)` outside `ENTITY_SPAWNED` продолжает бросать ошибку.
- Multi-actor spawn: каждый actor template получает свой payload scope.

#### Критерий завершения

- В spawn lifecycle path больше нет `new Map<EntityIndex, Record<string, unknown>>()` для payload lookup.
- Focused payload tests проходят.
- `pnpm --filter @lite-fsm/entities run check-types` проходит.
- `git diff --check` проходит.

### Этап 3 — Полная матрица runtime contracts

Тип этапа: `behavior`.

#### Цель

Закрыть регрессионными тестами все связи spawn bulk commit с lifecycle, routing, rollback, snapshot и cleanup.

#### Зависит от

Этапы 1-2.

#### Контракт этапа

- Тесты должны покрыть матрицу из раздела `5. Матрица обязательных проверок`.
- Существующие tests можно расширять, но предпочтительно вынести bulk-specific coverage в `tests/entities/entities-spawn-bulk-commit.test.ts`, если это снизит шум.
- Тесты должны проверять контракт, а не приватные имена helpers.
- Version assertions должны быть monotonic, без точного количества increments.
- Rollback tests должны проверять не только `count`, но и `indexById`, `freeList`, columns, `publicSlice`, group buckets и ownership refs.
- Routing tests должны проверять entity id route, group tag route и unscoped route после bulk spawn.
- Snapshot tests должны проверять dense и sparse spawn после dehydrate/hydrate.
- Effects/reactions tests должны проверять captured entity scope: `entity`, `generation`, `id`.

#### Не делать в этом этапе

- Не добавлять benchmark-only assertions в unit tests.
- Не менять production behavior ради упрощения tests.
- Не адаптировать тесты под изменение `EntityIndex` allocation order.
- Не проверять exact `version` increments.

#### Тесты этапа

- `pnpm exec vitest tests/entities/entities-spawn-bulk-commit.test.ts --run`, если добавлен новый файл.
- `pnpm exec vitest tests/entities/entities-plugin.test.ts tests/entities/entities-reducer-post-processing.test.ts tests/entities/entities-transition-trace.test.ts --run`.
- `pnpm exec vitest tests/playground/entities-rts/spawn.test.ts --run`.

#### Критерий завершения

- Все tests этапа проходят.
- Contract matrix из раздела 5 покрыта явно или через существующие tests с понятными названиями на русском.
- Нет тестов, завязанных на точное количество version increments.
- `git diff --check` проходит.

### Этап 4 — Benchmark и trace acceptance

Тип этапа: `release checks`.

#### Цель

Подтвердить, что bulk commit устранил текущий `applyStagedSpawns` bottleneck.

#### Зависит от

Этапы 1-3.

#### Контракт этапа

- Запустить benchmark record:

```bash
pnpm run bench:entities:record -- --runs 3 --label after-spawn-bulk-commit --include spawn,spawn-trace --row-counts 35000
```

- Сравнить с `.bench/entities/spawn-baseline.json`.
- Зафиксировать новый `.bench/entities/after-spawn-bulk-commit.md` и `.json`, если команда их создала.
- Проверить `RTS enemy spawn batch / 35 000`.
- Проверить top-level trace attribution.
- Если target не выполнен, не ослаблять gate без отдельного решения пользователя.

#### Не делать в этом этапе

- Не запускать docs build.
- Не менять benchmark fixture для искусственного прохождения gate.
- Не включать browser benchmark как обязательный gate первой итерации.
- Не оптимизировать lifecycle reducer pipeline, пока не доказано, что `applyStagedSpawns` уже ниже бюджета.

#### Тесты этапа

- Benchmark command выше.
- При необходимости `pnpm run bench:entities:compare -- .bench/entities/spawn-baseline.json .bench/entities/after-spawn-bulk-commit.json`.

#### Критерий завершения

- `Total p95 < 250ms`.
- `entities.reduce.spawnLifecycle.applyStagedSpawns p95 < 50ms`.
- `entities.reduce.spawnLifecycle.reduceBatches p95` не выше `1.5x` baseline без объясненной причины.
- Benchmark artifact сохранен в `.bench/entities/`.

### Этап 5 — Рефакторинг, чистка и полировка

Тип этапа: `cleanup/audit`.

#### Цель

Убрать временный код после реализации и привести internal spawn commit path к финальному виду.

#### Зависит от

Этапы 1-4.

#### Контракт этапа

Must fix:

- временные helpers, transitional branches, debug logging, TODO/FIXME в области работ;
- duplicate owners для validation, index allocation, capacity reserve, ownership refs или payload scope;
- stale comments, которые описывают старый per-row commit;
- неиспользуемые imports, locals, types и test scaffolds;
- helpers без второго места использования или без явного снижения сложности;
- нарушение линейного порядка `validate -> plan -> reserve -> mutate -> lifecycle reduce`.

Inspect only:

- перенос кода между файлами без снижения сложности;
- декоративные rename;
- micro-optimizations без trace evidence;
- изменение ownership data model;
- изменение rollback model.

Expected remaining hits:

- `ensureEntityCapacity` и `ensureActorCapacity` могут остаться в helper definitions, imports и non-spawn code.
- `payloadByEntity` не должен оставаться в active spawn lifecycle path после Этапа 2.
- `TODO|FIXME|temporary|transitional|debugger|console.log` не должны иметь hits в active scope этого ТЗ.

#### Не делать в этом этапе

- Не добавлять новый public API.
- Не переписывать lifecycle reducer pipeline.
- Не менять benchmark thresholds.
- Не объединять helpers с разными владельцами ответственности.

#### Тесты этапа

- Focused regressions из этапа 3.
- `pnpm --filter @lite-fsm/entities run check-types`.
- `pnpm run lint`.
- `git diff --check`.
- Source audit:

```bash
rg -n "TODO|FIXME|temporary|transitional|debugger|console\\.log" packages/entities/src tests/entities tests/playground/entities-rts
rg -n "ensureEntityCapacity|ensureActorCapacity|payloadByEntity" packages/entities/src/runtime
```

`ensureEntityCapacity` и `ensureActorCapacity` могут остаться в helper definitions, imports и non-spawn code, но не внутри spawn per-row commit loop.

#### Критерий завершения

- Cleanup tests и checks проходят.
- Source audit не показывает unexpected hits в active spawn scope.
- Код имеет одного владельца для allocation plan, reserve, physical commit и payload scope.
- Документированные invariants этого ТЗ соответствуют финальному коду.

## 7. Критерий полной готовности

Готовность достигается только после всех этапов.

Обязательные проверки:

```bash
pnpm exec vitest tests/entities/entities-spawn-bulk-commit.test.ts --run
pnpm exec vitest tests/entities/entities-plugin.test.ts tests/entities/entities-reducer-post-processing.test.ts tests/entities/entities-transition-trace.test.ts --run
pnpm exec vitest tests/playground/entities-rts/spawn.test.ts --run
pnpm --filter @lite-fsm/entities run check-types
pnpm run check-types
pnpm run lint
pnpm run test:coverage
pnpm run build:packages
pnpm run bench:entities:record -- --runs 3 --label after-spawn-bulk-commit --include spawn,spawn-trace --row-counts 35000
git diff --check
```

Если `tests/entities/entities-spawn-bulk-commit.test.ts` не создан, заменить первую команду на focused файл, куда помещена bulk commit matrix, и записать это в журнал.

Полная готовность:

- public API не изменен;
- public types не изменены;
- `API-CHEATSHEET.md` и `TYPES-CHEATSHEET.md` не требуют обновления;
- validation остается before commit;
- duplicate id checks остаются атомарными;
- rollback восстанавливает runtime после lifecycle и public reducer ошибок;
- `payloadFor(entity)` сохраняет strict runtime contract;
- `despawnOn`, terminal cleanup, lifecycle reactions и effects работают после bulk spawn;
- dense и sparse/freeList spawn covered tests проходят;
- RTS spawn regression проходит;
- benchmark gates из этапа 4 выполнены;
- запрещенные docs build commands не запускались.

## 8. Future work

Не включать в первую реализацию:

- узкий rollback journal вместо полного `snapshotRuntimeMutation`;
- lifecycle reducer fast path для `ENTITY_SPAWNED`;
- amortized reserve capacity для множества мелких spawn dispatch;
- bulk column `fill(start, end)` для dense ranges;
- prod-only unchecked `payloadFor(entity)`;
- SoA replacement для ownership refs;
- browser benchmark gate.
