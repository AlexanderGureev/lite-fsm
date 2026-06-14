# Производительность `@lite-fsm/entities`

Документ фиксирует базовый профиль производительности и очередь работ для приближения публичного `@lite-fsm/entities` к ручному SoA baseline.

## Базовый замер

Команда:

```bash
pnpm run bench:entities:record -- --runs 5 --label codex-baseline-2026-06-14 --include gate,diagnostics
```

Артефакты:

- `.bench/entities/codex-baseline-2026-06-14.json`
- `.bench/entities/codex-baseline-2026-06-14.md`

Окружение:

- Дата: `2026-06-14T16:46:13.766Z`
- Git: `4c7cd65fffbf`, branch `entities`, status `clean`
- Node: `v24.16.0`
- OS: `darwin/arm64`
- CPU: `Apple M1 Max`, 10 cores
- Package manager: `pnpm/10.33.0`

## Gate summary

| Сценарий | Строки | SoA median | entities median | Ratio | Бюджет | Статус |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `movement update` | 10 000 | 0.046ms | 0.226ms | 4.87x | 1.50x | fail |
| `movement update` | 50 000 | 0.232ms | 1.075ms | 4.62x | 1.50x | fail |
| `projectile lifetime update` | 10 000 | 0.036ms | 0.202ms | 5.65x | 1.50x | fail |
| `projectile lifetime update` | 50 000 | 0.179ms | 0.978ms | 5.44x | 1.50x | fail |
| `despawnOn cleanup` | 10 000 | 0.055ms | 2.406ms | 43.91x | 2.00x | fail |
| `despawnOn cleanup` | 50 000 | 0.277ms | 20.521ms | 74.65x | 2.00x | fail |
| `sprite sync reaction` | 10 000 | 0.075ms | 1.506ms | 20.04x | 2.00x | fail |
| `sprite sync reaction` | 50 000 | 0.491ms | 8.310ms | 16.58x | 2.00x | fail |

Важные предупреждения стабильности:

- `despawnOn cleanup / 50 000` имеет высокий разброс entity median: `27.8%`.
- Diagnostics `despawnOn cleanup / 50 000 / public manager.transition` имеет высокий разброс: `24.4%`.
- Несколько baseline на `10 000` строк ниже `0.050ms`; для них ratio чувствителен к шуму таймера.

## Diagnostics summary

| Сценарий | Строки | raw SoA | semantic SoA | raw entity kernel | public transition |
| --- | ---: | ---: | ---: | ---: | ---: |
| `movement update` | 10 000 | 0.015ms | 0.048ms | 0.189ms | 0.220ms |
| `movement update` | 50 000 | 0.074ms | 0.244ms | 0.954ms | 1.077ms |
| `projectile lifetime update` | 10 000 | 0.007ms | 0.039ms | 0.178ms | 0.206ms |
| `projectile lifetime update` | 50 000 | 0.032ms | 0.193ms | 0.886ms | 0.996ms |
| `despawnOn cleanup` | 10 000 | 0.028ms | 0.055ms | 0.212ms | 2.667ms |
| `despawnOn cleanup` | 50 000 | 0.141ms | 0.280ms | 1.421ms | 22.694ms |
| `sprite sync reaction` | 10 000 | 0.025ms | 0.064ms | 1.047ms | 1.482ms |
| `sprite sync reaction` | 50 000 | 0.123ms | 0.334ms | 8.052ms | 8.300ms |

Вывод по слоям:

- Для reducer-only сценариев основная цена уже внутри `raw entity kernel`: `movement 50k` имеет `0.954ms` против `0.244ms` semantic SoA, `projectile 50k` имеет `0.886ms` против `0.193ms`.
- Для `sprite sync reaction` почти весь разрыв находится в entity kernel и reaction scope: `8.052ms` raw entity kernel против `0.334ms` semantic SoA на `50k`.
- Для `despawnOn cleanup` публичный путь резко дороже диагностического kernel: `22.694ms` против `1.421ms` на `50k`. Это главный источник выигрыша и главный источник нестабильности.
- Общий `manager.transition` добавляет небольшой постоянный overhead в reducer-only сценариях: примерно `0.03ms` на `10k` и `0.11-0.12ms` на `50k`. Это не первый источник оптимизации.

## Устройство текущего hot path

`entitiesPlugin` регистрирует storage runtime `entityStorageRuntime`, route meta `entityId`, hook `beforeReduce` для spawn staging и manager extension `manager.entities()`.

На каждый `manager.transition` core создает dispatch context, `runtime: Map`, route, `touched: Set`, проходит storage `prepareAction`, `beforeReduce`, `reduce`, `commit`, `reactions`, `effects` и subscribers. Для `entities` это приводит к следующей цепочке:

1. `prepareEntityTransaction` создает transaction на каждый dispatch.
2. `stageSpawnAction` при spawn-событии запускает recipe, валидирует specs и payload.
3. `reduceEntityBucket` выполняет spawn lifecycle, cleanup, public event routing, reducers, повторный cleanup.
4. `collectEntityPublicReducerBatches` для unscoped событий выбирает state buckets по `acceptStateBucketsByEventCode`.
5. `reduceAcceptedBatch` применяет transition table, создает `self`, вызывает reducer, затем отдельными проходами валидирует state, обновляет row versions, планирует effects/reactions/despawn/terminal cleanup и обновляет state buckets.
6. `commit` восстанавливает public slices.
7. `runEntityReactions` собирает scoped entries, создает scoped deps и выполняет reactions.

Сильные стороны текущей модели:

- Данные контекста уже лежат в SoA колонках.
- Unscoped routing не сканирует все `presence`; он использует state buckets.
- Public state slice отделен от тяжелых колонок и обновляется через lightweight object.

Основная проблема: generic lifecycle pipeline выполняет много проходов, проверок, allocations и cleanup-операций даже для простых событий вида `active -> active`.

## Приоритеты оптимизации

### 1. Ускорить `despawnOn cleanup`

Ожидаемый максимальный выигрыш: самый высокий. Текущий gate на `50k`: `20.521ms`, `74.65x` к SoA. Diagnostics public: `22.694ms`, `165.86x` к raw SoA. Сценарий также нестабилен.

Затронутые места:

- `packages/entities/src/runtime/reduce.ts`: `scheduleDespawnOnRows`, `collectDespawnLifecycleBatches`, `flushEntityLifecycleCleanup`.
- `packages/entities/src/runtime/state.ts`: `removeActorRowOwnership`, `removeActorRow`, `removeEntityIfEmpty`, `removeEntityRows`.
- `packages/entities/src/runtime/transaction.ts`: `scheduleEntityDespawn`, `consumeScheduledDespawns`.

Что исправлять:

1. Добавить fast path для удаления, когда у затронутых templates нет `ENTITY_DESPAWNED` reducer/reaction/effect. В этом случае не нужно строить lifecycle batches и запускать `reduceAcceptedBatch` для `ENTITY_DESPAWNED`.
2. Удалять строки батчами по store, а не entity-by-entity. Сейчас `removeEntityRows` делает `rows.slice()`, затем для каждой строки вызывает `removeActorRow`, линейно удаляет ownership refs и обновляет public slice на каждую строку.
3. Обновлять `publicSlice`, `store.version` и `entityStore.version` один раз на batch, а не на каждую удаленную строку.
4. Пересмотреть контракт очистки колонок при despawn. Текущий `writeInitialColumnValues` очищает все колонки удаленной строки. Если публичный контракт допускает чтение только через `has(entity)`, очистку можно убрать из hot path или перенести в debug/snapshot режим. Если контракт требует очистку, нужна batch-очистка по колонкам.
5. Убрать `despawnScheduled: Uint8Array(0)` с ростом по требованию на каждый dispatch. Нужен переиспользуемый scratch в runtime с очисткой только затронутых индексов.

Критерий приемки:

- `despawnOn cleanup / 50 000` должен сначала приблизиться к `raw entity kernel` уровня `1-2ms`, затем к `semantic SoA` уровня `0.3-0.6ms`.
- RSD для `despawnOn cleanup / 50 000` должен опуститься ниже `15%`.
- После изменения запускать `pnpm run bench:entities:record -- --runs 5 --label after-despawn-cleanup --include gate,diagnostics` и сравнивать с baseline.

### 2. Ускорить reaction scope и `sprite sync reaction`

Ожидаемый выигрыш: очень высокий. Текущий gate на `50k`: `8.310ms`, `16.58x` к SoA. Diagnostics показывают, что почти вся цена уже в `raw entity kernel`: `8.052ms` против `0.334ms` semantic SoA.

Затронутые места:

- `packages/entities/src/runtime/transaction.ts`: `scheduleEntityReactionBatch` копирует `indices`.
- `packages/entities/src/runtime/reactions.ts`: `collectReactionScopeEntries`, `createReactionDeps`, `runReactionBatch`.
- `packages/entities/src/runtime/access.ts`: `createScopedEntitySelf`, `createScopedEntityAccess`.

Что исправлять:

1. Убрать обязательное `indices.slice()` для reaction batch. Нужен стабильный batch view или scratch ownership, который не копирует `50k` индексов для каждого события.
2. Не строить `entries: CapturedEntityScopeEntry[]` и `Map` для всего batch, если reaction использует только `self.indices` и колонки. Сейчас `createScopedEntitySelf` создает `Map` по всем entries, что дорого на `50k`.
3. Разделить быстрый scoped self для reactions и строгий diagnostic self. В production hot path `has(entity)` и `entityId(entity)` могут опираться на generation arrays и scope marker без построения `Map`.
4. Не копировать user deps через `{ ...ctx.manager.getDependencies() }` и серию `delete` на каждый reaction. Нужен заранее нормализованный deps object или wrapper с предсказуемой формой.
5. Кешировать `entities().get("movementActor")` view на уровне reaction deps, не создавать лишний scoped access wrapper при каждом batch, если scope не требует строгой dev-проверки.

Критерий приемки:

- `sprite sync reaction / 50 000 / raw entity kernel` должен опуститься с `8.052ms` хотя бы ниже `2ms` первым шагом.
- Public `sprite sync reaction / 50 000` должен следовать за kernel и не добавлять больше `0.3ms`.
- Поведение scoped `self.has`, `self.entityId`, `entities().get` должно остаться покрытым runtime tests.

### 3. Сократить generic overhead `reduceAcceptedBatch` для простого `active -> active`

Ожидаемый выигрыш: высокий для всех reducer-only сценариев. Текущий raw entity kernel на `50k` примерно в `4-5x` медленнее semantic SoA: `movement` `0.954ms` против `0.244ms`, `projectile` `0.886ms` против `0.193ms`.

Затронутые места:

- `packages/entities/src/runtime/reduce.ts`: `resolveTransitionTarget`, `applyDefaultTransitions`, `createReducerSelf`, `assertValidStateCodes`, `markActorRowsTouched`, `scheduleEnteredStateEffects`, `scheduleDespawnOnRows`, `scheduleTerminalRows`, `updateActorStateBuckets`.
- `packages/entities/src/runtime/compile.ts`: compile-time metadata для event/store fast path.
- `packages/entities/src/runtime/state.ts`: `refreshActorPublicSlice`.

Что исправлять:

1. Компилировать per-event reduce plan. Для события с одним принимающим state и identity transition (`active -> active`) не нужно записывать `prevStateCode` и `stateCode` для каждой строки до reducer.
2. Если template не имеет effects, terminal states, `despawnOn` и reactions для event, не запускать соответствующие проходы по всем accepted rows.
3. Не выполнять `updateActorStateBuckets` для identity transition, пока reducer явно не записал другой `stateCode`. Нужен дешевый способ определить state writes: отдельный dirty list, explicit helper или compile-time режим для reducer-only templates.
4. Создавать `self` со стабильной формой один раз на store и менять только `indices`. Сейчас `createReducerSelf` заново строит object и проходит `Object.entries(store.columns)` на каждый batch.
5. Объединить проходы post-processing там, где они остаются обязательными: validation, rowVersion, effects/despawn/terminal scan могут быть одним циклом.

Критерий приемки:

- `movement update / 50 000 / raw entity kernel` должен опуститься ниже `0.5ms` первым шагом.
- `projectile lifetime update / 50 000 / raw entity kernel` должен опуститься ниже `0.5ms` первым шагом.
- Gate reducer-only должен двигаться от `4.6-5.4x` к бюджету `1.5x`.

### 4. Уменьшить allocations и проверку payload в spawn/lifecycle path

Ожидаемый выигрыш: средний для текущего измеряемого `TICK`, высокий для реальных workloads со spawn/despawn. В gate cleanup replacement spawn выполняется вне timed участка, но в приложении это часть кадра.

Затронутые места:

- `packages/entities/src/runtime/transaction.ts`: `validateSpawnSpec`, `validateActorPayload`, `stageSpawnAction`.
- `packages/entities/src/runtime/reduce.ts`: `applyStagedSpawns`, `stageActorRow`, `payloadByEntity: Map`.
- `packages/entities/src/runtime/state.ts`: `ensureEntityCapacity`, `ensureActorCapacity`, `writeInitialColumnValues`.

Что исправлять:

1. Предкомпилировать spawn schema validators по template, чтобы не делать `Object.entries(schema)` и повторные проверки формы на каждую строку.
2. Заменить `payloadByEntity: Map<EntityIndex, payload>` на batch arrays, если индексы создаются последовательно или могут быть представлены параллельными массивами `indices` и `payloads`.
3. Для batch spawn обновлять `store.version`, `store.count`, ownership indexes и public slice пакетно.
4. Добавить capacity reservation для spawn batch: перед циклом знать максимальный `entity + count` и расширить columns один раз.

Критерий приемки:

- Добавить отдельный diagnostics слой или сценарий для timed spawn batch.
- Не ухудшить `movement update` и `projectile lifetime update` на `50k`.

### 5. Снизить постоянный overhead `manager.transition` для bucket storage

Ожидаемый выигрыш: средний-низкий до исправления entity kernel, но важный для достижения бюджета `1.5x`.

Затронутые места:

- `packages/core/src/runtime/kernel/createMachineManagerFactory.ts`: `createDispatch`, `coreTransition`, hook phases.
- `packages/core/src/runtime/kernel/bucketRuntime.ts`: `prepareAction`, `beforeReduce`, `reduce`, `commit`, `runReactions`, `runEffects`.
- `packages/entities/src/runtime/storage.ts`: `prepareAction`, `commit`, `effects`, `reactions`.

Что исправлять:

1. Сократить создание readonly action views и spread-объектов в bucket runtime на hot path.
2. Не проходить пустые hook/interceptor phases, если registry заранее знает, что callbacks отсутствуют.
3. Для bucket storage с одним активным runtime рассмотреть прямой reduce path без лишних loops по пустым buckets.
4. Не создавать `Map` в dispatch runtime, если ни один plugin/storage не использует runtime slots. Для `entities` slot нужен, но можно заменить на специализированный carrier или переиспользуемый объект внутри одного transition.

Критерий приемки:

- Public minus raw entity kernel для reducer-only `50k` должен быть ниже `0.05ms`.
- Изменения core должны проходить общий `pnpm run test`, `pnpm run test:types`, `pnpm run check-types`.

### 6. Уточнить benchmark breakdown перед крупными изменениями

Ожидаемый выигрыш: непрямой. Нужен, чтобы не оптимизировать по неверной гипотезе.

Что добавить:

1. Diagnostics слои для cleanup: `schedule despawn`, `despawn lifecycle batches`, `remove rows`, `public commit`.
2. Diagnostics слои для reactions: `schedule reaction batch`, `collect entries`, `create deps`, `run user reaction`.
3. Timed spawn scenario, где spawn входит в measured участок.
4. Allocation counters для hot scenarios, хотя бы retained heap plus operation count.

Критерий приемки:

- Новый diagnostics должен объяснять не менее `80%` времени `despawnOn cleanup / public transition` и `sprite sync reaction / raw entity kernel`.
- Существующие gate таблицы должны остаться сопоставимыми с текущим baseline.

## Рекомендуемый порядок работ

1. `despawnOn cleanup`: fast path без `ENTITY_DESPAWNED`, batch remove, single public slice refresh.
2. `sprite sync reaction`: убрать `indices.slice`, entries `Map`, deps copy.
3. `reduceAcceptedBatch`: compile-time fast path для identity self-transition и отключение пустых post-processing passes.
4. Spawn/lifecycle allocation: validators, payload arrays, capacity reservation.
5. Core bucket overhead: убрать пустые phases и лишние action views.
6. Benchmark breakdown: добавить детализацию для cleanup/reactions и timed spawn.

После каждого пункта сохранять отдельный record:

```bash
pnpm run bench:entities:record -- --runs 5 --label <short-name> --include gate,diagnostics
pnpm run bench:entities:compare -- .bench/entities/codex-baseline-2026-06-14.json .bench/entities/<short-name>.json
```

Отчет считать успешным для этапа только если целевой сценарий ускорился, соседние сценарии не получили регрессию больше `10%`, а новые runtime контракты покрыты тестами.
