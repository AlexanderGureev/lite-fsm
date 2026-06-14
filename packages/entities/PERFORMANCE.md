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

- `packages/entities/src/runtime/reduce.ts`: `scheduleDespawnOnRows`, cleanup plan, `flushEntityLifecycleCleanup`.
- `packages/entities/src/runtime/state.ts`: `removeActorRowOwnership`, `removeActorRowsForStore`, `removeEntityRecords`.
- `packages/entities/src/runtime/transaction.ts`: `scheduleEntityDespawn`, `consumeScheduledDespawns`.

Контракт решения:

1. Fast path удаляет строки без observable `ENTITY_DESPAWNED` work. Observable work — accepted `ENTITY_DESPAWNED` transition и reducer или `reactions.ENTITY_DESPAWNED`; state `effects` целевого состояния не являются cleanup contract.
2. Cleanup строит план удаления и удаляет строки батчами по store через `removeActorRowsForStore`.
3. `publicSlice`, `store.version` и `entityStore.version` обновляются один раз на затронутый batch.
4. Контракт колонок удалённых строк: публичное чтение корректно только через `has(entity) === true`; runtime не обязан очищать колонки удаленной строки в hot path, а `dehydrate()` должен сериализовать удалённые слоты через defaults из `initialContext`.
5. `despawnScheduled` использует переиспользуемый scratch runtime с очисткой только затронутых индексов.

Критерий приемки:

- `despawnOn cleanup / 50 000` должен сначала приблизиться к `raw entity kernel` уровня `1-2ms`, затем к `semantic SoA` уровня `0.3-0.6ms`.
- RSD для `despawnOn cleanup / 50 000` должен опуститься ниже `15%`.
- После изменения запускать `pnpm run bench:entities:record -- --runs 5 --label after-despawn-cleanup --include gate,diagnostics` и сравнивать с baseline.

### Итог problem 1: despawnOn cleanup

Команда:

```bash
pnpm run bench:entities:record -- --runs 5 --label after-despawn-cleanup --include gate,diagnostics
pnpm run bench:entities:compare -- .bench/entities/codex-baseline-2026-06-14.json .bench/entities/after-despawn-cleanup.json
```

Артефакты:

- [`after-despawn-cleanup.json`](../../.bench/entities/after-despawn-cleanup.json)
- [`after-despawn-cleanup.md`](../../.bench/entities/after-despawn-cleanup.md)
- [`after-despawn-cleanup-vs-codex-baseline-2026-06-14.md`](../../.bench/entities/after-despawn-cleanup-vs-codex-baseline-2026-06-14.md)

Окружение итогового record: `2026-06-14T19:02:30.226Z`, Git `9f092b7109fd`, branch `entities`, status `dirty`, Node `v24.16.0`, CPU `Apple M1 Max`, package manager `pnpm/10.33.0`.

| Сценарий | Строки | Baseline median | After median | Ratio к SoA до | Ratio к SoA после | Ускорение | RSD after |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `despawnOn cleanup` | 10 000 | 2.406ms | 0.241ms | 43.91x | 4.43x | 2.166ms (90.0%) | 11.7% |
| `despawnOn cleanup` | 50 000 | 20.521ms | 1.098ms | 74.65x | 3.99x | 19.423ms (94.6%) | 0.9% |

Итог: первый целевой диапазон `1-2ms` для `despawnOn cleanup / 50 000` достигнут: gate median `1.098ms`. RSD gate-сценария `50 000` ниже порога `15%` (`0.9%`). Соседние gate-сценарии не получили регрессий больше `10%`: compare не показывает ни одного public entity median regression выше порога.

Diagnostics после обновления fixture содержит cleanup breakdown:

| Фаза / слой | 10 000 median | 50 000 median | RSD 50 000 |
| --- | ---: | ---: | ---: |
| `schedule despawn` | 0.015ms | 0.073ms | 1.4% |
| `despawn lifecycle plan` | 0.006ms | 0.010ms | 15.5% |
| `batch remove actor rows` | 0.005ms | 0.007ms | 9.9% |
| `remove entity records` | 0.005ms | 0.013ms | 14.1% |
| `public commit` | 0.000ms | 0.001ms | 55.6% |
| `raw entity kernel` | 0.196ms | 1.647ms | 1.4% |
| `public manager.transition` | 0.247ms | 1.086ms | 1.1% |

Вывод по problem 1: public cleanup path теперь близок к primary reducer path и проходит первый целевой диапазон. Batch cleanup phases сами по себе занимают малую часть времени; основная стоимость остается в полном reducer/kernel проходе по активному bucket. Diagnostics `raw entity kernel / 50 000` стал медленнее baseline из-за более точной batch-removal модели fixture, но gate public scenarios не регрессировали больше `10%`.

Следующие приоритеты:

1. Двигать `despawnOn cleanup / 50 000` от первого диапазона `1-2ms` к следующему диапазону `0.3-0.6ms`: сейчас лимитирующий слой — общий reducer/kernel проход.
2. Профилировать `raw entity kernel` cleanup после перехода fixture на batch-removal модель, чтобы отделить цену полного bucket scan от цены удаления `128` строк.
3. Сохранять контракт колонок удалённых строк: чтение только через `has(entity)`, snapshot sanitation через defaults, без возврата очистки колонок в hot path.

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

### Итог problem 2: reaction scope и sprite sync reaction

Команды:

```bash
pnpm run bench:entities:record -- --runs 5 --label after-reaction-scope --include gate,diagnostics
pnpm run bench:entities:compare -- .bench/entities/after-despawn-cleanup.json .bench/entities/after-reaction-scope.json
pnpm run bench:entities:compare -- .bench/entities/codex-baseline-2026-06-14.json .bench/entities/after-reaction-scope.json
```

Артефакты:

- [`after-reaction-scope.json`](../../.bench/entities/after-reaction-scope.json)
- [`after-reaction-scope.md`](../../.bench/entities/after-reaction-scope.md)
- [`after-reaction-scope-vs-after-despawn-cleanup.md`](../../.bench/entities/after-reaction-scope-vs-after-despawn-cleanup.md)
- [`after-reaction-scope-vs-codex-baseline-2026-06-14.md`](../../.bench/entities/after-reaction-scope-vs-codex-baseline-2026-06-14.md)

Окружение итогового record: `2026-06-14T20:53:31.896Z`, Git `ff6c39838767`, branch `entities`, status `dirty`, Node `v24.16.0`, CPU `Apple M1 Max`, package manager `pnpm/10.33.0`.

Gate `sprite sync reaction` относительно `after-despawn-cleanup`:

| Сценарий | Строки | Baseline median | After median | Ratio до | Ratio после | Ускорение | RSD after |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `sprite sync reaction` | 10 000 | 1.507ms | 0.893ms | 19.26x | 12.33x | 0.614ms (40.7%) | 2.2% |
| `sprite sync reaction` | 50 000 | 8.259ms | 4.792ms | 16.85x | 9.77x | 3.467ms (42.0%) | 5.0% |

Diagnostics `sprite sync reaction` относительно `after-despawn-cleanup`:

| Слой | Строки | Baseline median | After median | Ratio к raw SoA до | Ratio к raw SoA после | Ускорение | RSD after |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `semantic SoA baseline` | 10 000 | 0.064ms | 0.065ms | 2.62x | 2.58x | -0.001ms (-1.5%) | 13.7% |
| `raw entity kernel` | 10 000 | 1.001ms | 0.430ms | 41.06x | 17.61x | 0.571ms (57.1%) | 7.0% |
| `public manager.transition` | 10 000 | 1.447ms | 0.904ms | 59.45x | 36.66x | 0.543ms (37.5%) | 1.1% |
| `semantic SoA baseline` | 50 000 | 0.328ms | 0.336ms | 2.64x | 2.70x | -0.009ms (-2.6%) | 1.9% |
| `raw entity kernel` | 50 000 | 7.916ms | 2.346ms | 63.17x | 18.87x | 5.570ms (70.4%) | 1.1% |
| `public manager.transition` | 50 000 | 7.941ms | 4.753ms | 65.18x | 38.65x | 3.188ms (40.1%) | 2.4% |

Breakdown `sprite sync reaction / 50 000` после reaction scope:

| Фаза / слой | Median | RSD after |
| --- | ---: | ---: |
| `reduce entity batches` | 1.681ms | 0.8% |
| `schedule reaction batch` | 0.000ms | 10.0% |
| `collect reaction scope` | 0.433ms | 2.5% |
| `create reaction deps` | 0.000ms | 16.9% |
| `run user reaction` | 0.094ms | 0.5% |
| `raw entity kernel` | 2.346ms | 1.1% |
| `public manager.transition` | 4.753ms | 2.4% |

Итог: problem 2 дал сильное ускорение reaction scope, но first gate не достигнут. `sprite sync reaction / 50 000 / raw entity kernel` остается выше порога `2ms` (`2.346ms`), а `public manager.transition` добавляет к kernel `2.407ms`, что выше лимита `0.3ms`. Stretch gate также не достигнут: kernel выше `1ms`, public ratio `9.77x` далек от бюджета `2.00x`.

Breakdown показывает, что основная оставшаяся цена находится в общем reducer pipeline и public path: `reduce entity batches` занимает `1.681ms`, public overhead поверх kernel — `2.407ms`. Собственный reaction scope слой больше не доминирует: `collect reaction scope` занимает `0.433ms`, `run user reaction` — `0.094ms`, scheduling и deps creation находятся на уровне таймера.

Соседние gate-сценарии не прошли порог регрессии относительно `after-despawn-cleanup`: `movement update` замедлился на `13.0%` / `13.2%`, `projectile lifetime update` — на `12.9%` / `14.6%` для `10 000` / `50 000` строк. `despawnOn cleanup` остался ниже порога (`6.4%` / `5.9%`). Diagnostics raw entity kernel для `movement` и `projectile` при этом изменился в пределах `0.2%`, поэтому основная регрессия видна в public path.

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
