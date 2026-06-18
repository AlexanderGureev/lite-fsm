# @lite-fsm/entities mass despawn optimization — ТЗ для реализации

## 1. Цель

Оптимизировать массовый despawn в `@lite-fsm/entities` без изменения public API и без изменения observable runtime contract.

Проблемный пользовательский сценарий:

- пакет: `packages/entities/`;
- пример: `apps/playground/app/examples/entities-rts/`;
- benchmark: `tests/bench/entities/mass-despawn.fixture.mjs`;
- baseline report: `.bench/entities/mass-despawn-baseline.md`;
- baseline json: `.bench/entities/mass-despawn-baseline.json`.

Текущий обход в `entities-rts`: `unitHealth` переводит non-hero units в `DEAD`, но не despawn-ит их. Остальные behavior actors выключаются через `UNITS_DIED`, а мертвые строки остаются до `GAME_RESTART`. Этот workaround введен из-за frame spike при массовом despawn и должен быть заменен декларативным death flow после runtime-оптимизаций.

Baseline facts:

- `despawnOn / none / one-shot / 35k rows / batch 5k`: около `7.646ms`;
- `explicit-ids / none / one-shot / 35k rows / batch 5k`: около `9.222ms`;
- `explicit-indices / none / one-shot / 35k rows / batch 5k`: около `7.725ms`;
- lifecycle reducer/reaction при batch `5k` обычно около `9-11ms`;
- churn replacement spawn стоит примерно `35-46ms`, то есть spawn часто дороже despawn;
- trace для `despawnOn / none / one-shot / batch 5k`:
  - `entities.reduce.publicBatch.total`: около `2.03ms`;
  - `entities.reduce.publicBatch.postProcess`: около `1.887ms`;
  - `entities.cleanup.public.collectPlan`: около `0.617ms`;
  - `entities.cleanup.public.removeActorRows`: около `0.850ms`;
  - `entities.cleanup.public.removeEntityRecords`: около `0.392ms`.

Целевой результат:

- ускорить `despawnOn` mixed batch, где часть accepted rows удаляется, а часть остается жить;
- ускорить physical cleanup для всех scheduled full-entity despawn sources;
- убрать `Map<string, ...>` и fresh arrays из cleanup plan hot path;
- вернуть в `entities-rts` реальный despawn через единое batched domain event `UNIT_DEAD`;
- сохранить lifecycle, reactions, effects, routing, indexes, snapshot и type contracts.

## 2. Как выполнять это ТЗ

Реализация идет строго по этапам. Этап `N+1` начинается только после прохождения `stage gate` этапа `N`.

Перед началом реализации прочитать:

- `packages/entities/src/runtime/reduce.ts`;
- `packages/entities/src/runtime/reduce-batch.ts`;
- `packages/entities/src/runtime/reduce-post-process.ts`;
- `packages/entities/src/runtime/reduce-despawn.ts`;
- `packages/entities/src/runtime/reduce-transitions.ts`;
- `packages/entities/src/runtime/runtime-index.ts`;
- `packages/entities/src/runtime/transaction.ts`;
- `packages/entities/src/runtime/routing.ts`;
- `packages/entities/src/runtime/reactions.ts`;
- `packages/entities/src/runtime/effects.ts`;
- `packages/entities/src/runtime/state.ts`;
- `packages/entities/src/runtime/store-types.ts`;
- `packages/entities/src/runtime/mutation-snapshot.ts`;
- `tests/entities/entities-plugin.test.ts`;
- `tests/entities/entities-reducer-post-processing.test.ts`;
- `tests/entities/entities-transition-trace.test.ts`;
- `tests/playground/entities-rts/runtime.test.ts`;
- `tests/playground/entities-rts/spawn.test.ts`;
- `tests/bench/entities/mass-despawn.fixture.mjs`;
- `tests/bench/entities/reporting.mjs`;
- `.bench/entities/mass-despawn-baseline.md`;
- `.bench/entities/mass-despawn-baseline.json`;
- `apps/playground/app/examples/entities-rts/store/machines/unit-health/index.ts`;
- `apps/playground/app/examples/entities-rts/store/machines/unit-movement/index.ts`;
- `apps/playground/app/examples/entities-rts/store/machines/unit-combat/index.ts`;
- `apps/playground/app/examples/entities-rts/store/machines/unit-command/index.ts`;
- `apps/playground/app/examples/entities-rts/store/machines/unit-selection/index.ts`;
- `apps/playground/app/examples/entities-rts/store/machines/enemy-ai/index.ts`;
- `apps/playground/app/examples/entities-rts/store/machines/unit-identity/index.ts`;
- `apps/playground/app/examples/entities-rts/store/machines/unit-projectile/index.ts`;
- `apps/playground/app/examples/entities-rts/store/machines/rts-spatial-index/index.ts`;
- `apps/playground/app/examples/entities-rts/store/types.ts`.

Запрещенные проверки:

- `pnpm run build`;
- `pnpm --filter @lite-fsm/docs build`;
- `pnpm run docs:build`;
- `pnpm run pages:build*`;
- любой `next build` внутри `apps/docs`.

Если нужна сборка пакетов, использовать `pnpm run build:packages`.

### Область работ

- internal runtime в `packages/entities/src/runtime/**`;
- internal runtime types, если они не попадают в public exports;
- focused runtime tests в `tests/entities/**`;
- RTS tests в `tests/playground/entities-rts/**`;
- benchmark trace counters/reporting для attribution, если новые fast paths требуют новых counters;
- `apps/playground/app/examples/entities-rts/**` только после закрытия runtime benchmark gates.

### Вне области работ

- изменение public API `@lite-fsm/entities`;
- изменение public options `entitiesPlugin`, `defineEntitySpawn`, `defineSpawnEvents`, schema descriptors;
- изменение public snapshot format;
- изменение lifecycle event name `ENTITY_DESPAWNED`;
- замена dispatch phase order в core или bucket runtime;
- immediate cleanup после каждого public batch;
- полноценный rollback для public cleanup errors без staged spawn;
- bulk compaction `actorRowsByGroupTag`, `stateBuckets`, `entitiesByGroupTag` как обязательный первый-pass scope;
- docs build;
- docs app changes.

### Общие инварианты

- Physical cleanup после public event остается в одной фазе `entities.reduce.publicCleanup` после всех public batches текущего dispatch.
- `despawnOn` не удаляет entity между actor templates внутри одного public event.
- Sibling actors, которые принимают тот же public event по текущим buckets, продолжают получать этот event до cleanup.
- `despawnOn` определяется только по финальному `stateCode` после default transition и пользовательского reducer.
- Reducer исходного event выполняется для accepted rows до классификации despawn/survivor.
- State effects для target state, входящего в `despawnOn`, не запускаются.
- Original event reactions не получают rows, которые этот же event отправил в `despawnOn`.
- `ENTITY_DESPAWNED` reducer/reaction видит lifecycle rows до физического удаления.
- `ENTITY_DESPAWNED` lifecycle work выполняется только для rows, где текущий state принимает `ENTITY_DESPAWNED` и metadata требует reducer или `reactions.ENTITY_DESPAWNED`.
- Empty `ENTITY_DESPAWNED` transition без reducer/reaction не является cleanup work.
- Effects после `ENTITY_DESPAWNED` cleanup transition не являются cleanup contract.
- Terminal row cleanup не равен full-entity despawn и не получает full-entity cleanup fast path.
- Успешный dispatch не оставляет разрыв между `stateCode`, `stateBuckets`, ownership indexes и entity indexes.
- Error atomicity для public cleanup без staged spawn не расширяется в рамках этого ТЗ.
- Runtime scratch не является сериализуемым state и не входит в snapshot/hydration contracts.
- `store.version`, `entityStore.version`, `rowVersion` остаются monotonic invalidation tokens; exact increments не становятся public contract.

## 3. Целевой public API

Public API не меняется.

Не добавлять:

- новые exports из `@lite-fsm/entities`;
- новые public options;
- public `storeId`;
- public cleanup options;
- public benchmark gates;
- новый public snapshot field;
- новые public lifecycle events.

`API-CHEATSHEET.md` и `TYPES-CHEATSHEET.md` не обновлять, если реализация остается internal. Если агент реализации меняет public exports, public options, public entity types или snapshot format, он обязан обновить оба cheatsheet, добавить type tests и зафиксировать причину отклонения от этого ТЗ.

## 4. Целевая архитектура

### 4.1 Internal store id

Добавить internal numeric id для actor stores:

- `ColumnarActorStore.storeId: number`;
- `EntityRuntimeState.actorStoresById: ColumnarActorStore[]`.

`storeId` назначается в `createEntityRuntimeState` по порядку templates. Он используется только runtime hot paths и tests, которые импортируют internal modules. Не документировать `storeId` как public API.

### 4.2 `despawnOn` final-removal fast path

`postProcessAcceptedRows` должен классифицировать accepted rows после reducer:

- `survivorCleanRows`: final state совпадает с previous state и row не удаляется;
- `survivorDirtyRows`: final state отличается от previous state и row не удаляется;
- `despawnLifecycleRows`: final state входит в `despawnOn`, и row требует `ENTITY_DESPAWNED` lifecycle work;
- `finalRemovalOnlyRows`: final state входит в `despawnOn`, но row не требует `ENTITY_DESPAWNED` lifecycle work.

`despawnLifecycleRows` идут через обычный dirty-row path:

- state bucket update выполняется до cleanup;
- `prevStateCode` sync планируется как сейчас;
- state effects для `despawnOn` state не планируются;
- original event reaction не получает эти rows;
- cleanup lifecycle получает согласованный row state.

`finalRemovalOnlyRows` идут через fast path:

- `rowVersion[entity] += 1`;
- entity schedule выполняется через `scheduleEntityDespawn(transaction, entity)`;
- state bucket move в `despawnOn` state не выполняется;
- `prevStateCode` sync не планируется для этих rows;
- state effects не планируются;
- original event reaction не получает эти rows;
- transaction получает row cleanup hint с `storeId`, `entity`, `bucketStateCode`.

`bucketStateCode` должен быть источником истины для removal из state bucket, если bucket update был пропущен. Он должен приходить из default transition source state, а не из reducer-mutated `prevStateCode`.

### 4.3 Reaction survivors

`reduceAcceptedBatch` должен планировать original event reaction по survivor rows.

Правила:

- если event не имеет reaction, survivor array не строить ради reaction;
- если все accepted rows удаляются через `despawnOn`, original reaction batch не планировать;
- если batch mixed, reaction получает только survivors;
- если нет despawn rows, сохранить существующие borrowed/owned ownership rules;
- `chooseReactionBatchOwnership` должен учитывать survivor rows и не занимать borrowed batch, если accepted batch содержит final-removal rows.

### 4.4 Despawn row hints

Добавить transaction-level hints для rows, чей bucket update пропущен:

- `scheduledDespawns`: entity-level дедупликация, как сейчас;
- `despawnRowHints`: store/entity-level hints для cleanup;
- hint dedupe key: `(storeId, entity)`;
- duplicate hint для той же пары не добавлять;
- entity может быть scheduled один раз, но иметь несколько hints от разных stores;
- explicit despawn без hints остается валидным.

Hint marks должны жить в transaction scratch. Нельзя использовать `Map<string, ...>` в hot path для hints.

### 4.5 Full-entity cleanup fast path

Full-entity cleanup применяется к scheduled despawns из всех источников:

- `despawnOn`;
- `transition.despawn(ids)`;
- `transition.despawn(self.indices)`;
- duplicate scheduled despawn no-op cases.

Первый обязательный fast path:

- не делать per-row swap-remove из `actorRowsByEntity[entity]`, если cleanup удаляет всю entity;
- выставлять `row.entityRowsPosition = -1`;
- в `removeEntityRecords` или equivalent entity phase установить `runtime.actorRowsByEntity[entity] = []`.

Остальные индексы в первом проходе обновлять корректно существующей swap-remove моделью:

- `actorRowsByGroupTag`;
- `stateBuckets`;
- `statePosition`;
- `entitiesByGroupTag`;
- `groupTagPosition`;
- `indexById`;
- `freeList`.

Bulk compaction этих индексов допускается только как отдельный future work после закрытия этого ТЗ.

### 4.6 Cleanup scratch batches

Cleanup plan должен перейти с `Map<string, ActorRowRemovalBatch>` и fresh arrays на transaction scratch:

- `removalBatchesByStoreId`;
- `lifecycleBatchesByStoreId`;
- touched store ids для iteration;
- pooled `rows` arrays;
- pooled `indices` arrays;
- counters считаются до очистки scratch;
- очистка scratch выполняется в `finally` или перед следующим `prepareEntityTransaction`.

Scratch должен быть частью transaction scratch, а не `EntityRuntimeState`. Вложенные transitions не должны видеть активные cleanup arrays внешнего transition.

### 4.7 RTS `UNIT_DEAD` flow

RTS death flow должен использовать одно domain event:

- `UNIT_DEAD`: entity-routed batched event для всех newly-dead units;
- `HERO_DEAD`: game-level event остается для сессии и spawn orchestration, но не является per-unit death event.

`unitHealth.effects.DEAD`:

- получает только newly-dead rows;
- считает `HERO_DEAD` и `ENEMIES_KILLED`;
- отправляет один batched `transition.entity(deadIds, { type: "UNIT_DEAD" })`;
- не вызывает `transition.despawn(...)`;
- не отправляет `UNITS_DIED`;
- не отправляет per-entity loop из `transition.entity(id, ...)`.

Entity actors:

- принимают `UNIT_DEAD`;
- используют промежуточный disabled state как default target;
- reducer читает `unitIdentity.kind`;
- hero остается в disabled/dead state;
- non-hero переводится в `REMOVED`;
- `despawnOn: "REMOVED"` удаляет non-hero entity;
- no-op `ENTITY_DESPAWNED: "__RESOLVED"` удаляется, если actor не имеет реального cleanup reducer/reaction.

## 5. Матрица обязательных тестов

Каждая клетка этой матрицы должна быть покрыта прямым тестом или явным `covered by` комментарием в тестовом файле рядом с группой assertions.

### 5.1 Source matrix

Покрыть источники despawn:

- `despawnOn` из public reducer final state;
- `transition.despawn(ids)`;
- `transition.despawn(self.indices)`;
- duplicate scheduled despawn в одном dispatch;
- stale scheduled despawn no-op;
- missing ids no-op для explicit despawn.

### 5.2 Batch shape matrix

Покрыть формы batch:

- all accepted rows despawn;
- mixed despawn/survivor;
- routed single entity;
- routed multiple `entityId[]`;
- routed `groupTag`;
- unscoped single state bucket;
- accepted scratch из нескольких source buckets;
- reducer override из `despawnOn` обратно в live state;
- reducer override из identity/default state в `despawnOn`.

### 5.3 Lifecycle matrix

Покрыть lifecycle modes:

- no `ENTITY_DESPAWNED` edge;
- empty `ENTITY_DESPAWNED` transition без reducer/reaction;
- `ENTITY_DESPAWNED` reducer only;
- `ENTITY_DESPAWNED` reaction only;
- reducer + reaction;
- sibling actor with lifecycle + sibling actor without lifecycle;
- terminal row with sibling actor;
- terminal-only cleanup без full-entity despawn.

### 5.4 Index matrix

После cleanup проверять:

- `actorRowsByEntity`;
- `actorRowsByGroupTag`;
- `stateBuckets`;
- `statePosition`;
- `entitiesByGroupTag`;
- `groupTagPosition`;
- `indexById`;
- `freeList`;
- `alive`;
- `ids`;
- `generation`;
- `presence`;
- `stateCode`;
- `prevStateCode`;
- `rowVersion`;
- actor `count/version/publicSlice`;
- entity store `count/version`.

### 5.5 Observability matrix

Покрыть observable behavior:

- original event reducer выполняется до despawn classification;
- original event reaction получает только survivor rows;
- original event reaction не запускается при all-despawn batch;
- `ENTITY_DESPAWNED` reducer читает columns до removal;
- `ENTITY_DESPAWNED` reaction читает columns до removal;
- target state effects для `despawnOn` rows не запускаются;
- effects после `ENTITY_DESPAWNED` cleanup transition не запускаются как cleanup contract;
- subscriber видит rows уже удаленными после successful dispatch;
- sibling actors получают public event до `publicCleanup`;
- `self.entityId(entity)` и `self.has(entity)` сохраняют текущие semantics в reducer/reaction/effect scopes.

### 5.6 Allocation and scan matrix

Добавить focused tests с counters:

- `despawnOn` final-removal fast path не создает `Map`/`Set` для hot classification;
- cleanup scratch path не создает `Map<string, ...>` для removal/lifecycle batches;
- no-reaction path не строит survivor reaction array;
- final-removal-only rows не вызывают state bucket move в despawn state;
- lifecycle rows продолжают вызывать state bucket update до cleanup.

Новые pure helpers для classification, hint dedupe и scratch cleanup должны иметь 100% coverage по statements/branches/functions/lines.

### 5.7 RTS matrix

Покрыть RTS flow:

- non-hero death отправляет один batched `UNIT_DEAD`;
- hero death отправляет `UNIT_DEAD` и `HERO_DEAD`, но hero entity не despawnится;
- non-hero actors переходят в `REMOVED` и despawnятся;
- hero actors переходят в disabled/dead state и остаются live;
- `UNITS_DIED` отсутствует в source после refactor;
- `UNIT_DIED` отсутствует как отдельное per-unit death event после refactor;
- повторный `TICK` после death не дублирует `UNIT_DEAD`, `HERO_DEAD`, `ENEMIES_KILLED`;
- `unitMovement`, `unitCombat`, `unitCommand`, `unitSelection`, `enemyAi` очищают свои hot columns для hero и переводят non-hero в `REMOVED`;
- source audit `rg -n "UNITS_DIED|UNIT_DIED|ENTITY_DESPAWNED"` показывает только допустимые hits.

## 6. Этапы реализации

### Этап 0 — Baseline audit и тестовая карта

#### Цель

Зафиксировать текущие контракты и создать рабочую карту тестового покрытия без изменения runtime.

#### Зависит от

Нет.

#### Контракт этапа

- Прочитать файлы из раздела 2.
- Сверить baseline `.bench/entities/mass-despawn-baseline.md`.
- Зафиксировать текущие trace keys и counters, которые будут сравниваться после изменений.
- Добавить или обновить test matrix comments, если существующие tests уже покрывают часть клеток.
- Не менять runtime behavior.
- Не менять RTS behavior.

#### Не делать в этом этапе

- Не оптимизировать runtime.
- Не менять benchmark workload.
- Не менять `entities-rts`.
- Не менять public API.

#### Тесты этапа

- Запустить focused tests, которые уже покрывают despawn cleanup:
  - `pnpm exec vitest tests/entities/entities-plugin.test.ts tests/entities/entities-reducer-post-processing.test.ts tests/entities/entities-transition-trace.test.ts --run`.
- Если тесты не запускаются из-за окружения, зафиксировать blocker в журнале.

#### Критерий завершения

- Есть список текущих тестовых gaps по матрице раздела 5.
- Нет runtime diff.
- Журнал обновлен.

### Этап 1 — Store id, `despawnOn` classification и final-removal hints

#### Цель

Добавить mixed `despawnOn` fast path для rows без lifecycle work.

#### Зависит от

Этап 0.

#### Контракт этапа

- Добавить internal `storeId` и `actorStoresById`.
- Расширить default transition result так, чтобы previous bucket state был доступен без чтения reducer-mutated `prevStateCode`.
- Классифицировать accepted rows после reducer по финальному `stateCode`.
- `despawnLifecycleRows` оставлять в обычном dirty-row path.
- `finalRemovalOnlyRows` не двигать в `despawnOn` state bucket.
- Для `finalRemovalOnlyRows` добавлять deduplicated row hint в transaction scratch.
- `scheduleEntityDespawn` оставить entity-level дедупликацией.
- Original event reaction планировать только по survivor rows.
- State effects для всех `despawnOn` rows не планировать.
- `rowVersion` accepted despawn rows увеличивать как до изменения.
- `markActorRowsTouched` behavior сохранить.
- В successful dispatch не оставлять bucket/state mismatch.

#### Не делать в этом этапе

- Не менять physical cleanup algorithm кроме чтения hints, если это минимально нужно для корректности.
- Не заменять cleanup `Map` plan на scratch batches.
- Не менять RTS example.
- Не менять terminal cleanup.

#### Тесты этапа

- Добавить runtime tests для all-despawn и mixed-despawn `despawnOn`.
- Добавить tests для reducer override live -> despawn и despawn default -> live.
- Добавить tests для original event reaction survivors.
- Добавить tests для lifecycle rows, которые не используют skip-bucket fast path.
- Добавить counter/allocation tests для no `Map`/no survivor array where not needed.
- Запустить:
  - `pnpm exec vitest tests/entities/entities-reducer-post-processing.test.ts tests/entities/entities-plugin.test.ts --run`;
  - `pnpm exec vitest tests/entities/entities-transition-trace.test.ts --run`;
  - `pnpm --filter @lite-fsm/entities run check-types`.

#### Критерий завершения

- Матрица `despawnOn` source/batch/lifecycle/observability закрыта.
- Original reactions видят только survivors.
- Lifecycle rows проходят согласованный bucket update.
- No successful dispatch mismatch.
- Журнал обновлен.

### Этап 2 — Full-entity cleanup fast path

#### Цель

Ускорить physical cleanup scheduled despawns без изменения lifecycle semantics.

#### Зависит от

Этап 1.

#### Контракт этапа

- Применить fast path ко всем full-entity scheduled despawns.
- Не применять fast path к terminal-only row cleanup.
- При full-entity cleanup не делать swap-remove из `actorRowsByEntity[entity]`.
- Устанавливать `row.entityRowsPosition = -1`.
- Удалять `actorRowsByGroupTag` через корректную existing swap-remove модель.
- Удалять state bucket через `bucketStateCode` из hint, если hint есть.
- Для rows без hint удалять из текущего `store.stateCode[entity]`.
- Сбрасывать `presence`, `stateCode`, `prevStateCode`, `rowVersion` как сейчас.
- Обновлять actor `count/version/publicSlice`.
- Entity removal phase сохраняет `entitiesByGroupTag`, `indexById`, `freeList`, `alive`, `ids`, `generation`, `count/version`.
- Duplicate/stale scheduled despawn остается no-op.

#### Не делать в этом этапе

- Не делать bulk compaction `actorRowsByGroupTag`.
- Не делать bulk compaction `stateBuckets`.
- Не делать bulk compaction `entitiesByGroupTag`.
- Не менять lifecycle reducer/reaction order.
- Не менять explicit despawn API.

#### Тесты этапа

- Закрыть index matrix раздела 5.4.
- Добавить tests для explicit ids и explicit indices.
- Добавить tests для sibling actors with mixed lifecycle/no lifecycle.
- Добавить tests для terminal row with sibling actor.
- Добавить repeat cleanup no-op tests.
- Запустить:
  - `pnpm exec vitest tests/entities/entities-plugin.test.ts tests/entities/entities-transition-trace.test.ts --run`;
  - `pnpm --filter @lite-fsm/entities run check-types`.

#### Критерий завершения

- Full-entity despawn удаляет все actor rows и entity records корректно.
- Terminal cleanup не получил semantic regression.
- Existing explicit despawn tests проходят.
- Журнал обновлен.

### Этап 3 — Scratch cleanup batches вместо `Map<string, ...>`

#### Цель

Убрать cleanup plan allocations из массового despawn hot path.

#### Зависит от

Этап 2.

#### Контракт этапа

- Перенести cleanup plan batches в transaction scratch.
- Использовать `storeId` для indexing batches.
- Хранить touched store ids для iteration.
- Переиспользовать arrays для removal rows и lifecycle indices.
- Очищать scratch в `finally` после cleanup или перед следующим `prepareEntityTransaction`.
- Считать trace counters до очистки scratch.
- Не хранить cleanup scratch в `EntityRuntimeState`.
- Не использовать `Map<string, ActorRowRemovalBatch>` в hot cleanup path.
- Не создавать fresh arrays на каждый массовый cleanup batch, кроме bounded defensive fallback с тестом.

#### Не делать в этом этапе

- Не менять observable trace key names без необходимости.
- Не менять benchmark workload.
- Не менять RTS example.
- Не делать unrelated reaction/effect optimizations.

#### Тесты этапа

- Добавить allocation tests для cleanup plan.
- Добавить tests для повторного dispatch: scratch очищает stale rows/hints.
- Добавить tests для nested-safe cleanup boundaries или зафиксировать, почему nested storage reaction невозможен.
- Запустить:
  - `pnpm exec vitest tests/entities/entities-plugin.test.ts tests/entities/entities-transition-trace.test.ts --run`;
  - `pnpm --filter @lite-fsm/entities run check-types`;
  - `git diff --check`.

#### Критерий завершения

- Cleanup plan hot path не использует `Map<string, ...>`.
- Trace counters не теряются.
- Scratch не протекает между dispatch.
- Журнал обновлен.

### Этап 4 — Benchmark attribution и runtime performance gate

#### Цель

Подтвердить, что runtime stages 1-3 ускоряют массовый despawn и не дают соседних регрессий.

#### Зависит от

Этап 3.

#### Контракт этапа

- Не менять benchmark scenario matrix без отдельной причины.
- Допустимо добавить trace counters:
  - `entities.reduce.publicBatch.despawnRows`;
  - `entities.reduce.publicBatch.finalRemovalOnlyRows`;
  - `entities.reduce.publicBatch.survivorReactionRows`;
  - `entities.cleanup.public.fullEntityFastPathEntities`;
  - `entities.cleanup.public.fullEntityFastPathRows`.
- Compare должен оставаться сопоставимым с `.bench/entities/mass-despawn-baseline.json`.
- Runtime stages считаются успешными только после benchmark record.

#### Не делать в этом этапе

- Не оптимизировать spawn.
- Не менять `rowCounts`, `batchSizes`, `path`, `lifecycle` semantics benchmark fixture.
- Не обновлять RTS example до закрытия runtime gate.

#### Тесты этапа

- Запустить:
  - `pnpm run bench:entities:record -- --runs 5 --label after-mass-despawn-runtime --include mass-despawn,mass-despawn-trace --row-counts 30000,35000`;
  - `pnpm run bench:entities:compare -- .bench/entities/mass-despawn-baseline.json .bench/entities/after-mass-despawn-runtime.json`.

#### Критерий завершения

- `despawnOn / none / one-shot / 35k / batch 5k` быстрее baseline минимум на `15%`.
- `explicit-ids / none / one-shot / 35k / batch 5k` не хуже baseline больше чем на `10%`.
- `explicit-indices / none / one-shot / 35k / batch 5k` не хуже baseline больше чем на `10%`.
- Lifecycle reducer/reaction scenarios не хуже baseline больше чем на `10%`.
- Trace показывает снижение хотя бы одной целевой фазы:
  - `entities.reduce.publicBatch.postProcess`;
  - `entities.reduce.publicBatch.updateStateBuckets`;
  - `entities.cleanup.public.collectPlan`;
  - `entities.cleanup.public.removeActorRows`.
- Журнал обновлен со ссылками на artifacts.

### Этап 5 — RTS `UNIT_DEAD` death flow

#### Цель

Удалить workaround `UNITS_DIED` и вернуть реальный despawn в `entities-rts` через декларативный batched `UNIT_DEAD`.

#### Зависит от

Этап 4.

#### Контракт этапа

- Заменить per-unit death events на единое `UNIT_DEAD`.
- Удалить `UNITS_DIED` из `AppEvents` и machines.
- Удалить `UNIT_DIED` как отдельное per-unit death event.
- `unitHealth.effects.DEAD` отправляет один пакетный `transition.entity(deadIds, { type: "UNIT_DEAD" })`.
- `unitHealth.effects.DEAD` сохраняет игровые side effects `HERO_DEAD` и `ENEMIES_KILLED`.
- Не добавлять `despawnOn: "DEAD"` в `unitHealth`: `effects.DEAD` должен продолжить запускаться.
- Actor configs принимают `UNIT_DEAD`.
- Actors используют промежуточное disabled/dead состояние и reducer override в `REMOVED` для non-hero.
- `despawnOn: "REMOVED"` удаляет non-hero entities.
- Hero rows остаются live в disabled/dead state.
- Пустой `ENTITY_DESPAWNED: "__RESOLVED"` удалить из actors без cleanup reducer/reaction.
- `GAME_RESTART` cleanup через существующий `despawnOn: "REMOVED"` сохранить.

#### Не делать в этом этапе

- Не использовать `transition.despawn(...)` в RTS death flow.
- Не отправлять `UNIT_DEAD` циклом по одному entity.
- Не удалять `HERO_DEAD`, если game session еще зависит от него.
- Не менять simulation order без отдельного теста.
- Не менять renderer contracts без теста.

#### Тесты этапа

- Обновить `tests/playground/entities-rts/runtime.test.ts` и related RTS tests.
- Добавить tests из RTS matrix раздела 5.7.
- Source audit:
  - `rg -n "UNITS_DIED|UNIT_DIED" apps/playground/app/examples/entities-rts tests/playground/entities-rts`;
  - `rg -n "ENTITY_DESPAWNED" apps/playground/app/examples/entities-rts/store/machines`.
- Запустить:
  - `pnpm exec vitest tests/playground/entities-rts/runtime.test.ts tests/playground/entities-rts/spawn.test.ts --run`;
  - `pnpm exec vitest tests/entities/entities-plugin.test.ts --run`;
  - `pnpm --filter @lite-fsm/playground run check-types`.

#### Критерий завершения

- `UNITS_DIED` и `UNIT_DIED` отсутствуют в RTS source.
- `UNIT_DEAD` batched path работает для non-hero и hero.
- Non-hero despawn происходит реально.
- Hero не despawnится.
- Пустые `ENTITY_DESPAWNED` edges удалены или каждое оставшееся вхождение обосновано cleanup reducer/reaction.
- Журнал обновлен.

### Этап 6 — Рефакторинг, чистка и полировка

#### Цель

Убрать временные ветки и привести runtime/docs/comments к финальному контракту.

#### Зависит от

Этап 5.

#### Контракт этапа

- Убрать временные helpers, transitional branches, debug logging, TODO/FIXME и dead code в области работ.
- Удалить неиспользуемые imports, locals, types, feature flags и test scaffolds.
- Убрать дублирование validation, normalization, mapping и type logic, если один владелец уже очевиден.
- Сохранить одного владельца для validation, lifecycle classification, cleanup plan, scratch reset, routing и trace counters.
- Сделать код читаемым сверху вниз: validate -> transform/classify -> mutate/commit.
- Не оставлять abstractions или type aliases без второго места использования или явного снижения сложности.
- Comments описывают контракт, а не историю оптимизации.
- Public API, phase order, error semantics, snapshot format и performance gates не меняются из-за cleanup.

#### Не делать в этом этапе

- Не делать декоративные переименования без снижения сложности.
- Не переносить код без ясного владельца.
- Не добавлять future-work optimizations.
- Не запускать docs build.

#### Тесты этапа

- Focused regressions по всем затронутым contracts.
- `pnpm --filter @lite-fsm/entities run check-types`.
- `pnpm --filter @lite-fsm/playground run check-types`, если RTS files менялись.
- `pnpm run lint`.
- `pnpm run test:coverage`.
- `git diff --check`.
- Source audit:
  - `rg -n "UNITS_DIED|UNIT_DIED" apps/playground/app/examples/entities-rts tests/playground/entities-rts`;
  - `rg -n "Map<string, ActorRowRemovalBatch|new Map<string" packages/entities/src/runtime/reduce-despawn.ts packages/entities/src/runtime/transaction.ts`;
  - `rg -n "TODO|FIXME|debugger|console\\.log" packages/entities/src/runtime apps/playground/app/examples/entities-rts/store`.

#### Критерий завершения

- Cleanup/refactor source audit закрыт.
- Coverage gate пройден.
- Lint пройден.
- Журнал обновлен.

## 7. Критерий полной готовности

Все этапы имеют статус `done` в журнале.

Финальные проверки:

- `pnpm exec vitest tests/entities/entities-plugin.test.ts tests/entities/entities-reducer-post-processing.test.ts tests/entities/entities-transition-trace.test.ts --run`;
- `pnpm exec vitest tests/playground/entities-rts/runtime.test.ts tests/playground/entities-rts/spawn.test.ts --run`;
- `pnpm run check-types`;
- `pnpm run lint`;
- `pnpm run test:coverage`;
- `pnpm run build:packages`;
- `pnpm run bench:entities:record -- --runs 5 --label after-mass-despawn-optimization --include mass-despawn,mass-despawn-trace --row-counts 30000,35000`;
- `pnpm run bench:entities:compare -- .bench/entities/mass-despawn-baseline.json .bench/entities/after-mass-despawn-optimization.json`;
- `git diff --check`.

Performance readiness:

- `despawnOn / none / one-shot / 35k / batch 5k` быстрее baseline минимум на `15%`;
- `explicit-ids` и `explicit-indices` в том же режиме не хуже baseline больше чем на `10%`;
- lifecycle reducer/reaction scenarios не хуже baseline больше чем на `10%`;
- trace attribution объясняет целевой выигрыш через runtime phases;
- RTS tests подтверждают реальный despawn non-hero units без `UNITS_DIED`.

Documentation readiness:

- `spec/tz-entities-mass-despawn-optimization-log.md` обновлен финальной записью;
- benchmark artifacts записаны в `.bench/entities/`;
- `API-CHEATSHEET.md` и `TYPES-CHEATSHEET.md` не изменены, если public API не менялся;
- если public API изменился вопреки целевому контракту, cheatsheets и type tests обновлены.

Запрещенные docs build commands не запускались.
