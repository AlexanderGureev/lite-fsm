# `@lite-fsm/core` и `@lite-fsm/entities` transition trace — ТЗ для реализации

## 1. Цель

Добавить internal-разметку runtime-фаз в `@lite-fsm/core` и `@lite-fsm/entities` и адаптировать benchmark `@lite-fsm/entities`, чтобы получать стабильный отчет по реальному public path `manager.transition(...)`.

Целевой результат:

- benchmark умеет запускать production dist код через тот же composition fixture, что и gate;
- отчет показывает breakdown одного `manager.transition({ type: "TICK" })` по core-фазам и вложенным entities-фазам;
- trace выключен по умолчанию и не меняет public API, public types, runtime semantics и обычные gate-метрики;
- record/compare workflow позволяет после каждой оптимизации сохранять отдельный артефакт и сравнивать phase medians с предыдущим шагом;
- synthetic diagnostics fixture больше не является единственным источником правды для выбора следующей оптимизации;
- после появления trace baseline synthetic diagnostics fixture удаляется из основного record workflow; если отдельный synthetic benchmark понадобится позже, он оформляется как legacy/calibration command без stale `raw entity kernel` и без участия в optimization gates.

Актуальная база перед этим ТЗ:

- `.bench/entities/after-reducer-layer.json`;
- `movement update / 50 000`: `0.471ms`, `2.04x`;
- `projectile lifetime update / 50 000`: `0.411ms`, `2.28x`;
- `despawnOn cleanup / 50 000`: `0.508ms`, `1.81x`, budget pass;
- `sprite sync reaction / 50 000`: `3.093ms`, `6.32x`;
- diagnostics `raw entity kernel` для reducer-only сценариев медленнее public `manager.transition`, поэтому текущая diagnostics model не должна использоваться как strict gate для последующих оптимизаций.

## 2. Как выполнять это ТЗ

### Область работ

- Internal core runtime:
  - `packages/core/src/runtime/kernel/createMachineManagerFactory.ts`;
  - `packages/core/src/runtime/kernel/bucketRuntime.ts`;
  - `packages/core/src/runtime/kernel/storage.ts`;
  - новый internal helper в `packages/core/src/runtime/kernel/*`, если нужен.
- Internal entities runtime:
  - `packages/entities/src/runtime/storage.ts`;
  - `packages/entities/src/runtime/reduce.ts`;
  - `packages/entities/src/runtime/reactions.ts`;
  - `packages/entities/src/runtime/transaction.ts`;
  - `packages/entities/src/runtime/state.ts`;
  - новый internal helper в `packages/entities/src/runtime/*`, если нужен.
- Benchmark:
  - `tests/bench/entities/composition-lite-fsm-entities.fixture.mjs`;
  - `tests/bench/entities/diagnostics.fixture.mjs`;
  - `tests/bench/entities/record-node.mjs`;
  - `tests/bench/entities/run-diagnostics-node.mjs`;
  - `tests/bench/entities/compare-records.mjs`;
  - `tests/bench/entities/reporting.mjs`;
  - при необходимости новый `tests/bench/entities/trace.fixture.mjs`.
- Tests:
  - focused Vitest по internal trace helper;
  - existing entities runtime tests только если instrumentation меняет затронутые files;
  - type tests только если случайно меняется public type surface.
- Документация:
  - `tests/bench/README.md`;
  - `packages/entities/PERFORMANCE.md`;
  - это ТЗ и журнал.
- Benchmark artifacts:
  - `.bench/entities/transition-trace-baseline.json`;
  - `.bench/entities/transition-trace-baseline.md`;
  - compare Markdown для последующих optimization labels.

### Вне области работ

- Оптимизация core или entities hot path по результатам trace.
- Изменение public API, public exports, `MachineManager` options, storage authoring API или route meta.
- Замена существующих gate budgets.
- Удаление или переписывание diagnostics fixture до появления stable trace baseline.
- Browser benchmark.
- CPU flamegraph tooling, inspector integration и автоматический V8 profile export.
- Spawn/lifecycle allocation optimization.
- Сборка документации и любые команды, которые транзитивно запускают `apps/docs`.

### Запрещенные команды

Агентам запрещено запускать:

- `pnpm run build`;
- `pnpm --filter @lite-fsm/docs build`;
- `pnpm run docs:build`;
- `pnpm run pages:build`;
- `pnpm run pages:build:fast`;
- любой `next build` внутри `apps/docs`.

Для пакетной проверки использовать `pnpm run build:packages` или benchmark-команды, которые строят только `@lite-fsm/core` и `@lite-fsm/entities`.

### Общие инварианты

- Trace выключен по умолчанию.
- Выключенный trace не должен делать `performance.now()`, создавать phase records, аллоцировать arrays/maps для phase collection или менять dispatch data shape, кроме уже существующих обязательных runtime объектов.
- Включенный trace не должен писать в `stdout` или `stderr` внутри timed hot path.
- Trace не должен менять:
  - порядок storage phases;
  - action normalization;
  - routing;
  - lifecycle cleanup;
  - subscribers;
  - reactions/effects;
  - error propagation;
  - rollback semantics.
- Trace records должны быть агрегированным benchmark result, а не live logging.
- Измеряется production dist, как в текущем `bench:entities:record`.
- Trace command должен быть стабильным для `50_000` строк; `10_000` строки могут оставаться secondary signal из-за timer noise.
- Primary trace baseline собирается только для `50_000` строк. `10_000` не входит в обязательный trace baseline и не используется для выбора следующей оптимизации.
- Primary trace должен собирать только transitions внутри timed `runner.run()` участка benchmark. `beforeOperation`, `afterOperation`, setup spawn и replacement spawn не входят в primary transition trace, потому что gate timer их не измеряет.
- Collector должен быть выключен во время warmup iterations. Warmup transitions не попадают в `results.trace`.
- Primary trace records для текущих scenarios должны фильтроваться по measured action `TICK` или эквивалентному operation boundary. Setup transitions можно собирать только в отдельный debug section, не влияющий на primary trace tables.
- Primary trace summaries и compare учитывают только transition records с `depth === 0`. Nested `manager.transition` не является reporting feature в этом ТЗ: core должен помечать nested records depth counter, а benchmark должен игнорировать `depth > 0` в primary summaries. В обоих случаях обычный runtime behavior не меняется.
- Public type surface `@lite-fsm/core` и `@lite-fsm/entities` не расширяется. Internal trace использует private global collector key `Symbol.for("@lite-fsm/performance-trace")` и private dispatch runtime slot key `"@lite-fsm/core/transition-trace"`.
- Entities не должны импортировать private source path из `@lite-fsm/core`. Cross-package связь идет только через duplicated private runtime slot key `"@lite-fsm/core/transition-trace"` и structural session object contract.
- Synthetic diagnostics fixture больше не является источником strict performance gates после появления trace baseline.
- Если diagnostics fixture остается, он должен быть явно описан как synthetic calibration benchmark, а не как модель production `manager.transition`.

### Матрица проверок

- Core trace helper changed: focused Vitest, `pnpm run check-types`, `pnpm run lint`, `git diff --check`.
- Core pipeline instrumentation changed: focused runtime tests для выключенного trace и включенного collector, existing core manager tests при необходимости.
- Entities instrumentation changed: focused entities runtime tests, coverage по измененным чистым helpers, `pnpm run check-types`, `pnpm run lint`.
- Benchmark changed: smoke trace record с `--row-counts 1000`, затем stable trace baseline на `50_000`.
- Reporting/compare changed: fixture JSON consistency test или focused script smoke, compare trace report с самим собой.
- Public surface audit: `tests/types/exports-surface.tst.ts` и `tests/types/entities-api.tst.ts` не требуют новых public exports.

### Команды результата

После реализации должна быть стабильная команда baseline trace:

```bash
pnpm run bench:entities:record -- --runs 5 --label transition-trace-baseline --include gate,trace --row-counts 50000
```

Для последующих оптимизаций использовать тот же workflow:

```bash
pnpm run bench:entities:record -- --runs 5 --label <short-name> --include gate,trace --row-counts 50000
pnpm run bench:entities:compare -- .bench/entities/transition-trace-baseline.json .bench/entities/<short-name>.json
```

Для smoke-проверки:

```bash
pnpm run bench:entities:record -- --runs 1 --label transition-trace-smoke --include trace --row-counts 1000
pnpm run bench:entities:compare -- .bench/entities/transition-trace-smoke.json .bench/entities/transition-trace-smoke.json
```

## 3. Целевой public API

Новые public exports, options, types и runtime APIs не добавляются.

Публичный контракт сохраняется:

- `MachineManager(...)` принимает те же options.
- `manager.transition(...)` возвращает тот же action и выполняет те же phases.
- `defineStorageRuntime` и storage contexts не получают новых public полей.
- `entitiesPlugin(...)`, `manager.entities()`, `EntityAccess`, `EntityReducerSelf`, `reactions` и `effects` не меняют types или behavior.
- `API-CHEATSHEET.md` и `TYPES-CHEATSHEET.md` обновлять не нужно, если public surface действительно не меняется.

Internal trace contract не является public API:

- benchmark включает collector через `globalThis[Symbol.for("@lite-fsm/performance-trace")]`;
- core кладет transition trace session в `dispatch.runtime` по ключу `"@lite-fsm/core/transition-trace"`;
- entities читают session из `dispatch.runtime` по тому же private string key и проверяют shape перед использованием;
- эти детали не документируются как пользовательский API.

## 4. Целевая архитектура

### Trace carrier

- Core создает trace session в `transition(...)` только если internal collector включен.
- Session привязана к одному dispatch.
- Session хранится в `dispatch.runtime` по private key `"@lite-fsm/core/transition-trace"`, доступному entities через structural contract.
- Session предоставляет минимальные операции:
  - получить timestamp;
  - записать duration phase;
  - записать счетчик, если нужен для интерпретации phase;
  - завершить transition record.
- API session должен позволять вызывать phases без closures в hot path:
  - `const startedAt = trace?.now(); ... trace?.record("phase", startedAt);`;
  - или эквивалент с нулевой работой при `trace === undefined`.
- Collector агрегирует records вне hot path benchmark sample.

### Core phases

Обязательные top-level фазы:

- `core.transition.total`;
- `core.assertUserAction`;
- `core.createDispatch`;
- `core.prepareAction.total`;
- `core.beforeReduce.total`;
- `core.interceptors`;
- `core.hooks.beforeReduce`;
- `core.rootReducer`;
- `core.markExternallyChangedBuckets`;
- `core.hooks.afterReduce`;
- `core.hooks.beforeCommit`;
- `core.commit.total`;
- `core.hooks.beforeSubscribers`;
- `core.reactions.total`;
- `core.subscribers`;
- `core.hooks.beforeEffects`;
- `core.effects.total`;
- `core.hooks.afterEffects`.

Обязательные bucket-фазы с `runtime.kind`:

- `core.bucket.prepareAction.<kind>`;
- `core.bucket.beforeReduce.<kind>`;
- `core.bucket.reduce.<kind>`;
- `core.bucket.commit.<kind>`;
- `core.bucket.reactions.<kind>`;
- `core.bucket.effects.resolve.<kind>`;
- `core.bucket.effects.invoke.<kind>`.

Для bucket phases `key` должен включать normalized `runtime.kind`, например `core.bucket.reduce.entity`, а phase metadata должен содержать `runtimeKind: "entity"`. Для top-level core phases `runtimeKind` отсутствует.

Если phase отсутствует из-за пустого hook/interceptor/effect list, report должен показывать `0` или не показывать phase по согласованному правилу. Правило должно быть одинаковым для record и compare.

### Entities phases

Обязательные фазы:

- `entities.prepare.transaction`;
- `entities.spawn.stage`;
- `entities.reduce.total`;
- `entities.reduce.spawnLifecycle`;
- `entities.reduce.spawnCleanup`;
- `entities.reduce.collectPublicBatches`;
- `entities.reduce.publicBatch.total`;
- `entities.reduce.publicBatch.defaultTransitions`;
- `entities.reduce.publicBatch.userReducer`;
- `entities.reduce.publicBatch.postProcess`;
- `entities.reduce.publicBatch.markTouched`;
- `entities.reduce.publicBatch.scheduleEffects`;
- `entities.reduce.publicBatch.scheduleReactions`;
- `entities.reduce.publicBatch.updateStateBuckets`;
- `entities.reduce.publicCleanup`;
- `entities.cleanup.spawn.collectPlan`;
- `entities.cleanup.spawn.lifecycle`;
- `entities.cleanup.spawn.removeActorRows`;
- `entities.cleanup.spawn.removeEntityRecords`;
- `entities.cleanup.public.collectPlan`;
- `entities.cleanup.public.lifecycle`;
- `entities.cleanup.public.removeActorRows`;
- `entities.cleanup.public.removeEntityRecords`;
- `entities.commit.restorePublicSlices`;
- `entities.reactions.total`;
- `entities.reactions.captureScope`;
- `entities.reactions.createDeps`;
- `entities.reactions.user`;
- `entities.effects.resolve`;
- `entities.effects.invoke`.

Фазы не должны измеряться внутри per-row loops. Разметка ставится вокруг batch-level или phase-level blocks.

`entities.reduce.publicBatch.*` относится только к batch-ам, полученным из `collectEntityPublicReducerBatches(...)` для measured action. Spawn lifecycle и cleanup lifecycle не должны записывать `entities.reduce.publicBatch.*`; их reducer work остается внутри `entities.reduce.spawnLifecycle`, `entities.cleanup.spawn.lifecycle` или `entities.cleanup.public.lifecycle`.

`entities.reactions.*` в этом ТЗ относятся к storage boundary `reactions.run`. Lifecycle reaction batches, которые выполняются внутри reduce cleanup/spawn lifecycle, остаются временем соответствующей reduce/cleanup phase и не размечаются как `entities.reactions.*`.

### Report model

- Trace report должен хранить phase-level `samples` и summaries, но не полный список per-operation transition records.
- Полные per-operation records могут появиться только как отдельный future debug mode, вне baseline trace workflow.
- JSON schema trace phases должен быть плоским списком, а не вложенным деревом.
- Phase `samples` должны быть per-transition значениями. Если один `phase.key` записан несколько раз внутри одного measured transition, collector или aggregator должен сначала сложить эти occurrences внутри transition, а затем добавить один sample для этого phase key. Это обязательно для `entities.reduce.publicBatch.*`, cleanup phases и effects invoke.
- Primary `samples` не включают setup, warmup, `beforeOperation`, `afterOperation` и nested records с `depth > 0`.
- Для каждого scenario/rowCount phase summary должен содержать:
  - `key`;
  - `label`;
  - `parentKey`;
  - `runtimeKind`, если phase относится к storage bucket;
  - `median`;
  - `p95`;
  - `min`;
  - `max`;
  - `relativeStdDev`;
  - `samples`;
  - `percentOfTransition` для top-level core phases;
  - `percentOfParent` для child phases с известным `parentKey`.
- Report должен отдельно показывать:
  - total transition median;
  - `traceTotal / gateEntityMedian` для того же scenario/rowCount;
  - top-level core coverage: сумма non-overlapping top-level phases / `core.transition.total`;
  - entities reduce coverage: сумма child phases / `entities.reduce.total`;
  - entities reactions coverage: сумма child phases / `entities.reactions.total`;
  - unattributed time по каждому scope.
- Coverage и unattributed time должны считаться из per-transition сумм до удаления transition-level aggregation. Не вычислять coverage как сумму phase medians: медианы child phases не обязаны складываться в медиану parent phase.
- Если `traceTotal / gateEntityMedian` выше `2.00x`, Markdown report должен выводить warning. Warning не должен переводить record или compare в fail status.
- Child phases не суммируются вместе с parent в общей таблице как единый total, чтобы не было double counting.
- Markdown может группировать flat phases визуально по `parentKey`, но source JSON и compare работают по flat `key`.
- Compare должен сопоставлять phases по flat `key`; для bucket phases `runtimeKind` используется только как metadata и не заменяет `key`.
- Compare должен сравнивать phase median и percent share; изменения больше `10%` выделяются, но compare не завершает процесс с ошибкой.

Обязательная карта `parentKey`:

- `core.transition.total`: `parentKey` отсутствует.
- Top-level core phases, кроме `core.transition.total`: `parentKey: "core.transition.total"`.
- `core.bucket.prepareAction.<kind>`: `parentKey: "core.prepareAction.total"`.
- `core.bucket.beforeReduce.<kind>`: `parentKey: "core.beforeReduce.total"`.
- `core.bucket.reduce.<kind>`: `parentKey: "core.rootReducer"`.
- `core.bucket.commit.<kind>`: `parentKey: "core.commit.total"`.
- `core.bucket.reactions.<kind>`: `parentKey: "core.reactions.total"`.
- `core.bucket.effects.resolve.<kind>` и `core.bucket.effects.invoke.<kind>`: `parentKey: "core.effects.total"`.
- `entities.prepare.transaction`: `parentKey: "core.bucket.prepareAction.entity"`.
- `entities.spawn.stage`: `parentKey: "core.hooks.beforeReduce"`.
- `entities.reduce.total`: `parentKey: "core.bucket.reduce.entity"`.
- `entities.reduce.spawnLifecycle`, `entities.reduce.spawnCleanup`, `entities.reduce.collectPublicBatches`, `entities.reduce.publicBatch.total`, `entities.reduce.publicCleanup`: `parentKey: "entities.reduce.total"`.
- `entities.reduce.publicBatch.defaultTransitions`, `entities.reduce.publicBatch.userReducer`, `entities.reduce.publicBatch.postProcess`, `entities.reduce.publicBatch.markTouched`, `entities.reduce.publicBatch.scheduleEffects`, `entities.reduce.publicBatch.scheduleReactions`, `entities.reduce.publicBatch.updateStateBuckets`: `parentKey: "entities.reduce.publicBatch.total"`.
- `entities.cleanup.spawn.*`: `parentKey: "entities.reduce.spawnCleanup"`.
- `entities.cleanup.public.*`: `parentKey: "entities.reduce.publicCleanup"`.
- `entities.commit.restorePublicSlices`: `parentKey: "core.bucket.commit.entity"`.
- `entities.reactions.total`: `parentKey: "core.bucket.reactions.entity"`.
- `entities.reactions.captureScope`, `entities.reactions.createDeps`, `entities.reactions.user`: `parentKey: "entities.reactions.total"`.
- `entities.effects.resolve`: `parentKey: "core.bucket.effects.resolve.entity"`.
- `entities.effects.invoke`: `parentKey: "core.bucket.effects.invoke.entity"`.

Coverage metrics должны использовать заранее заданные non-overlapping child sets. Parent phases и их child phases нельзя складывать в один coverage numerator.
Минимальные coverage sets:

- core top-level coverage: все top-level core phases из раздела `Core phases`, кроме `core.transition.total`; bucket phases не входят в numerator.
- entities reduce coverage: `entities.reduce.spawnLifecycle`, `entities.reduce.spawnCleanup`, `entities.reduce.collectPublicBatches`, `entities.reduce.publicBatch.total`, `entities.reduce.publicCleanup`; children `entities.reduce.publicBatch.*` и `entities.cleanup.*` не входят в этот numerator.
- entities reactions coverage: `entities.reactions.captureScope`, `entities.reactions.createDeps`, `entities.reactions.user`.

### Diagnostics migration policy

- После создания `transition-trace-baseline` основной workflow оптимизаций должен использовать `gate,trace`.
- `diagnostics.fixture.mjs` не должен продолжать публиковать stale `raw entity kernel`, который выглядит как production path, но расходится с `manager.transition`.
- Целевое решение: удалить `diagnostics` include из основного `bench:entities:record` workflow после появления trace baseline.
- `gate` остается источником SoA budget check и сохраняет текущий baseline comparison.
- `trace` становится единственным attribution report для real public path.
- `compare-records.mjs` должен продолжать читать старые records с `results.diagnostics`, но новый record не обязан создавать `results.diagnostics`.
- Если отдельный synthetic benchmark будет нужен для исторического анализа, он должен быть вынесен в legacy command после отдельного решения и не должен участвовать в stage gates для runtime-оптимизаций.
- Historical `.bench/entities/*diagnostics*` artifacts не удалять.

## 5. Этапы реализации

### Этап 1 — Internal trace carrier в core

#### Цель

Добавить выключенный по умолчанию internal trace carrier, который может измерять один dispatch без изменения public API.

#### Зависит от

Нет.

#### Контракт этапа

- Добавить internal helper в `packages/core/src/runtime/kernel/*`.
- Helper должен читать collector из private global symbol.
- Если collector отсутствует, helper возвращает `undefined`.
- Если collector включен, helper создает trace session для текущего transition.
- Session должна записывать phase durations и counters в in-memory collector.
- Session должна поддерживать завершение transition record даже при exception; exception behavior не меняется.
- `StorageDispatchLifecycleContext` может получить internal поле или session может храниться только в `dispatch.runtime`.
- Public `StorageDispatchContext` type не должен получать новый documented field.
- Disabled path не должен вызывать `performance.now()`.
- Disabled path не должен создавать per-transition phase arrays.

#### Не делать в этом этапе

- Не размечать core phases.
- Не менять benchmark.
- Не импортировать trace helper в entities.
- Не добавлять public exports.

#### Тесты этапа

- Focused unit test: collector отсутствует, session не создается.
- Focused unit test: collector включен, session записывает phase и завершает record.
- Focused unit test: session завершает record при thrown callback, а исходная ошибка сохраняется.
- Type/public surface audit: public exports не изменились.

#### Критерий завершения

- Focused tests проходят.
- `pnpm run check-types` проходит.
- `git diff --check` проходит.
- Журнал фиксирует private key/global symbol и disabled-path invariant.

### Этап 2 — Core phase markup

#### Цель

Разметить real `manager.transition` pipeline и bucket runtime phases.

#### Зависит от

Этап 1.

#### Контракт этапа

- В `createMachineManagerFactory.ts` разметить top-level phases из раздела 4.
- В `bucketRuntime.ts` разметить phases по `bucket.runtime.kind`.
- `core.transition.total` должен покрывать весь public `transition(...)` от входа после guard до return или throw.
- `prepareAction`, `beforeReduce`, `commit`, `reactions`, `effects` должны иметь both total phase и per-bucket phase там, где есть bucket loop.
- Пустые hook/interceptor phases не должны создавать заметный overhead при disabled trace.
- Active dispatch restore в `finally` должен сохраняться.
- Trace при thrown storage/plugin callback должен записать completed phases до ошибки и завершить transition record со статусом `error`.
- Trace session должен хранить `depth`. Nested transition records с `depth > 0` допустимы только как debug input и не попадают в primary trace summaries.

#### Не делать в этом этапе

- Не размечать entities internals.
- Не менять ordering phases.
- Не оптимизировать bucket loops.
- Не менять diagnostics fixture.

#### Тесты этапа

- Runtime test: обычный transition без collector возвращает тот же action и state.
- Runtime test: включенный collector видит `core.transition.total` и `core.bucket.reduce.<kind>`.
- Runtime test: thrown reducer/plugin error сохраняет error propagation и trace status `error`.
- Focused/runtime test: nested transition или trace helper scenario помечает `depth > 0`, а primary aggregation игнорирует nested record.

#### Критерий завершения

- Focused core runtime tests проходят.
- `pnpm run check-types` проходит.
- `pnpm run lint` проходит.
- Source audit не показывает trace logging в timed path.

### Этап 3 — Entities phase markup

#### Цель

Разметить основные entities runtime phases внутри real public transition.

#### Зависит от

Этапы 1 и 2.

#### Контракт этапа

- Добавить internal helper в `packages/entities/src/runtime/*`, который читает trace session из `dispatch.runtime`.
- Helper не импортирует private core source path.
- В `storage.ts` разметить:
  - `entities.prepare.transaction`;
  - `entities.commit.restorePublicSlices`;
  - `entities.effects.resolve`;
  - `entities.effects.invoke`;
  - `entities.reactions.total`, если total удобнее на storage boundary.
- В `transaction.ts` разметить `entities.spawn.stage`.
- В `reduce.ts` разметить phases из раздела 4.
- В `reactions.ts` разметить:
  - `entities.reactions.captureScope`;
  - `entities.reactions.createDeps`;
  - `entities.reactions.user`.
- В `state.ts` разметка допустима только для batch-level operations, например `restorePublicSlices`, без per-row marks.
- Не добавлять trace calls внутрь loops по каждой entity.
- Phase labels должны быть стабильными строками, пригодными для compare между optimization steps.
- Если phase отсутствует в сценарии, report должен корректно показывать отсутствие или нулевое значение.

#### Не делать в этом этапе

- Не менять reducer/reaction/cleanup behavior.
- Не менять phase granularity после benchmark integration без обновления report schema.
- Не оптимизировать найденные hotspots.
- Не менять public docs.

#### Тесты этапа

- Runtime test: collector включен, `movement update` пишет reduce phases.
- Runtime test: collector включен, `sprite sync reaction` пишет reaction phases.
- Runtime test: collector включен, cleanup scenario пишет cleanup phases.
- Existing entities runtime tests проходят без collector.
- Disabled trace audit: нет `performance.now()` при `trace === undefined` в entities helpers.

#### Критерий завершения

- Focused entities tests проходят.
- `pnpm run check-types` проходит.
- `pnpm run lint` проходит.
- Coverage по новым чистым trace helper modules достигает `100%` statements/branches/functions/lines.

### Этап 4 — Benchmark record/report/compare для trace

#### Цель

Добавить `trace` как stable include в существующий benchmark record workflow.

#### Зависит от

Этапы 1-3.

#### Контракт этапа

- `tests/bench/entities/record-node.mjs` должен принимать `--include trace`.
- `allowedIncludes` временно становится `gate,diagnostics,trace`; этап 6 удаляет `diagnostics` из основного workflow.
- Trace benchmark должен использовать real public runners из `composition-lite-fsm-entities.fixture.mjs` или общий factory без synthetic kernel.
- Trace benchmark не должен использовать `diagnostics.fixture.mjs` как источник измеряемого кода.
- Trace benchmark должен выставлять `NODE_ENV=production` до import production dist, как текущий record.
- Trace benchmark должен включать collector только вокруг measured operation `runner.run()`. Collector не должен быть активен во время setup spawn, warmup iterations, `beforeOperation` replacement spawn и `afterOperation`.
- Primary trace tables должны содержать только measured `TICK` transitions. Если benchmark сохраняет setup traces, они должны быть отдельным optional debug payload без участия в summary/compare.
- Trace scenarios должны совпадать с gate scenarios:
  - `movement update`;
  - `projectile lifetime update`;
  - `despawnOn cleanup`;
  - `sprite sync reaction`.
- Primary trace row count: `50_000`.
- Trace record может поддерживать другие `--row-counts` для smoke/debug, но stable baseline и `PERFORMANCE.md` используют только `50_000`.
- `--row-counts` должен работать для smoke.
- Aggregation: median-of-medians across runs, как у gate/diagnostics.
- Markdown report должен содержать отдельный раздел `Trace benchmark`.
- JSON record должен сохранить `results.trace` с schema-stable structure.
- `results.trace.scenarios[].phases` должен быть flat array; grouped view строится только в Markdown/reporting layer.
- `results.trace` не должен сохранять полный список per-operation transition records; для каждого phase сохраняются только samples и агрегированные summaries.
- Если raw collector внутри одного transition получает несколько occurrences одного `phase.key`, `record-node.mjs` должен сохранять в `results.trace.scenarios[].phases[].samples` сумму occurrences за transition, а не отдельные occurrence samples.
- Trace summary должен связывать trace scenario с gate scenario того же `key` и `rowCount` и вычислять `traceTotal / gateEntityMedian`, если record включает `gate,trace`.
- Если record включает только `trace`, overhead ratio должен быть `undefined` или omitted без ошибки.
- Markdown report должен показывать warning при `traceTotal / gateEntityMedian > 2.00x`.
- `compare-records.mjs` должен сравнивать trace phase medians и phase shares.
- Existing gate/diagnostics record format должен остаться backward-compatible для чтения старых artifacts.
- `latest.json` и label aliases должны работать для records с `trace`.

#### Не делать в этом этапе

- Не менять gate scenarios и budgets.
- Не менять diagnostics semantics.
- Не добавлять browser trace.
- Не падать compare при trace regression; report только выделяет изменения.

#### Тесты этапа

- Smoke:
  - `pnpm run bench:entities:record -- --runs 1 --label transition-trace-smoke --include trace --row-counts 1000`.
- Smoke compare:
  - `pnpm run bench:entities:compare -- .bench/entities/transition-trace-smoke.json .bench/entities/transition-trace-smoke.json`.
- Mixed include smoke:
  - `pnpm run bench:entities:record -- --runs 1 --label transition-trace-gate-smoke --include gate,trace --row-counts 1000`.
- JSON consistency check: `results.trace.scenarios` содержит expected scenarios, flat `phases`, `parentKey`, `runtimeKind` для bucket phases, phase summaries и phase-level samples; per-operation records отсутствуют.
- Markdown audit: `Trace benchmark` содержит total, `traceTotal / gateEntityMedian`, top-level core phases, entities reduce phases и entities reaction phases.

#### Критерий завершения

- Smoke commands проходят.
- Existing `--include gate` продолжает работать.
- `--include diagnostics` продолжает работать только до этапа 6; после этапа 6 основной `record` workflow принимает `gate,trace`.
- `git diff --check` проходит.
- Журнал фиксирует final trace JSON schema summary.

### Этап 5 — Baseline trace report и документация workflow

#### Цель

Сохранить первый стабильный trace baseline и описать workflow для следующих оптимизаций.

#### Зависит от

Этапы 1-4.

#### Контракт этапа

- Запустить stable baseline:
  - `pnpm run bench:entities:record -- --runs 5 --label transition-trace-baseline --include gate,trace --row-counts 50000`.
- Создать self-compare:
  - `pnpm run bench:entities:compare -- .bench/entities/transition-trace-baseline.json .bench/entities/transition-trace-baseline.json`.
- `packages/entities/PERFORMANCE.md` должен получить раздел `Итог trace baseline`.
- Раздел должен содержать:
  - ссылки на JSON/Markdown artifacts;
  - gate table для `50_000`;
  - top core phases для каждого scenario;
  - top entities phases для каждого scenario;
  - residual unattributed time;
  - вывод, какой hotspot является кандидатом для следующего optimization ТЗ.
- `tests/bench/README.md` должен описать:
  - `--include trace`;
  - primary command для baseline;
  - command для optimization compare;
  - warning `traceTotal / gateEntityMedian > 2.00x`;
  - как читать child phases и почему child phases нельзя суммировать с parent.
- `API-CHEATSHEET.md` и `TYPES-CHEATSHEET.md` не обновлять, если public API не менялся.

#### Не делать в этом этапе

- Не оптимизировать hotspots.
- Не менять benchmark budgets.
- Не запускать docs build.
- Не удалять historical `.bench` artifacts.

#### Documentation acceptance checklist

- `PERFORMANCE.md` не превращается в changelog.
- `tests/bench/README.md` описывает команды, формат и ограничения trace.
- Документация явно говорит, что trace измеряет real public path, но trace overhead делает абсолютные числа отдельными от gate.
- Документация описывает `traceTotal / gateEntityMedian` как guard качества instrumentation, а не как performance budget.
- Документация фиксирует, что gate остается основным budget check, а trace является причиной выбора следующего optimization step.

#### Тесты этапа

- Stable record command проходит.
- Self-compare command проходит.
- `git diff --check` проходит.
- Artifact consistency audit проходит для `.bench/entities/transition-trace-baseline.*`.

#### Критерий завершения

- Baseline artifacts созданы.
- `PERFORMANCE.md` и `tests/bench/README.md` обновлены.
- Журнал фиксирует top hotspots и рекомендуемый следующий step.
- Запрещенные docs build команды не запускались.

### Этап 6 — Миграция synthetic diagnostics

#### Цель

Убрать stale synthetic diagnostics из основного optimization workflow после появления trace baseline.

#### Зависит от

Этапы 1-5.

#### Контракт этапа

- Провести audit `tests/bench/entities/diagnostics.fixture.mjs`, `run-diagnostics-node.mjs`, `record-node.mjs`, `reporting.mjs`, `compare-records.mjs` и `tests/bench/README.md`.
- Удалить `diagnostics` include из `record-node.mjs`.
- Удалить или вывести из активного workflow `diagnostics.fixture.mjs` и `run-diagnostics-node.mjs`; если файлы остаются временно, они должны быть помечены как legacy и не подключаться из `record-node.mjs`.
- `raw entity kernel` не должен оставаться в основном `diagnostics` report как будто это production kernel.
- `allowedIncludes` должен стать `gate,trace`.
- Docs должны убрать основной workflow `--include diagnostics`.
- Compare должен корректно читать старые records с `results.diagnostics`, но новый record не обязан их создавать.
- `PERFORMANCE.md` должен перестать ссылаться на diagnostics `raw entity kernel` как strict gate.
- `pnpm run bench:entities:diagnostics` должен быть удален из `package.json` или оставлен только как явно legacy command с отдельным именем, например `bench:entities:legacy-diagnostics`.
- Historical artifacts в `.bench/entities` не удалять.

#### Не делать в этом этапе

- Не менять gate scenarios и budgets.
- Не менять trace schema.
- Не удалять SoA baseline из gate.
- Не удалять historical benchmark artifacts.
- Не запускать docs build.

#### Documentation acceptance checklist

- `tests/bench/README.md` ясно разделяет:
  - `gate` как budget check;
  - `trace` как attribution для real public path;
  - historical diagnostics artifacts как legacy data, не как текущий workflow.
- `packages/entities/PERFORMANCE.md` не предлагает использовать stale diagnostics kernel для выбора следующих optimization steps.
- Команды следующего optimization workflow используют `--include gate,trace`.

#### Тесты этапа

- Smoke:
  - `pnpm run bench:entities:record -- --runs 1 --label transition-trace-post-diagnostics-smoke --include gate,trace --row-counts 1000`.
- Compare старого record с diagnostics и нового trace record не падает из-за отсутствующего section.
- `git diff --check`.

#### Критерий завершения

- Основной benchmark workflow больше не зависит от stale synthetic diagnostics.
- Docs и `PERFORMANCE.md` не называют synthetic kernel источником production truth.
- Smoke и compare checks проходят.
- Журнал фиксирует, какие diagnostics files/scripts удалены или помечены как legacy.

### Этап 7 — Рефакторинг, чистка и полировка

#### Цель

Закрыть качество реализации после instrumentation/docs этапов и перед финальной проверкой.

#### Зависит от

Этапы 1-6.

#### Контракт этапа

- Убрать временные helpers, transitional branches, debug logging, TODO/FIXME и dead code в области работ.
- Удалить неиспользуемые imports, locals, types, feature flags и тестовые scaffolds.
- Сохранить одного владельца для каждого контракта:
  - global collector lookup;
  - dispatch trace carrier;
  - core phase labels;
  - entities phase labels;
  - trace aggregation;
  - trace compare;
  - trace documentation.
- Стабилизировать phase label constants, чтобы future optimizations не ломали compare без причины.
- Убрать дублирование trace schema validation между record/report/compare.
- Проверить, что disabled trace не оставляет allocations и logging в hot path.
- Comments/docs привести к финальному контракту, а не к истории реализации.
- Если новый helper используется один раз и не снижает сложность, встроить его обратно.

#### Не делать в этом этапе

- Не переименовывать phase labels без необходимости.
- Не добавлять новые phases без обновления tests/report docs.
- Не делать performance optimization core/entities runtime.
- Не менять public API.

#### Must fix

- Active dead code.
- Temporary branches.
- Stale comments.
- Duplicate trace schema owners.
- Debug logging.
- Source audit hits по temporary trace names в active scope.

#### Inspect only

- Декоративные переименования.
- Перенос кода без уменьшения сложности.
- Дополнительная granular phase разметка без report need.
- Micro-optimizations без измеренного hotspot.

#### Тесты этапа

- Focused trace helper tests.
- Smoke trace record and compare.
- `pnpm run check-types`.
- `pnpm run lint`.
- `git diff --check`.
- Source audit по known stale identifiers/wording.
- Coverage gate для новых чистых helpers.

#### Критерий завершения

- Cleanup не меняет trace schema.
- Disabled trace behavior остается неизменным.
- Проверки этапа проходят.
- Журнал содержит `Expected remaining hits`, если source audit оставляет допустимые historical/spec совпадения.

## 6. Критерий полной готовности

- Все этапы имеют статус `done` в журнале.
- `pnpm run bench:entities:record -- --runs 5 --label transition-trace-baseline --include gate,trace --row-counts 50000` проходит.
- `.bench/entities/transition-trace-baseline.json` и `.bench/entities/transition-trace-baseline.md` созданы.
- `pnpm run bench:entities:compare -- .bench/entities/transition-trace-baseline.json .bench/entities/transition-trace-baseline.json` проходит.
- Trace report показывает core, bucket и entities phases для всех четырех gate scenarios.
- Обязательный trace baseline содержит только `50_000` rows; отсутствие `10_000` trace rows не является gap.
- Trace report показывает `traceTotal / gateEntityMedian`; warnings `> 2.00x` не считаются fail, но должны быть отражены в `PERFORMANCE.md`.
- Top-level core coverage и known entities scope coverage зафиксированы в report.
- Existing `gate` include остается backward-compatible.
- Старые records с `results.diagnostics` читаются `compare-records.mjs`; новый основной `record` workflow не создает `results.diagnostics`.
- Public API/types не изменены; если изменены, это оформлено как blocker, потому что ТЗ не допускает public surface changes.
- Focused runtime tests, `pnpm run check-types`, `pnpm run lint` и `git diff --check` проходят.
- `packages/entities/PERFORMANCE.md` содержит baseline trace summary и следующий recommended optimization step.
- `tests/bench/README.md` описывает trace workflow.
- Основной benchmark workflow не использует stale synthetic diagnostics как production attribution.
- Запрещенные docs build команды не запускались.

## 7. Карта трассировки исходных требований

- Требование измерять реальный code path через `manager.transition` покрыто разделами 1, 4 и этапом 4.
- Требование разметить `@lite-fsm/core` покрыто разделом 4 и этапами 1-2.
- Требование разметить `@lite-fsm/entities` покрыто разделом 4 и этапом 3.
- Требование получить стабильную команду замера покрыто разделом `Команды результата` и этапом 5.
- Требование продолжать оптимизации пошагово с отчетами покрыто этапами 4-5 и compare workflow.
- Требование не опираться на устаревший synthetic raw kernel покрыто целью, разделом 4 и этапом 4.
- Требование удалить stale synthetic diagnostics из основного workflow покрыто разделом `Diagnostics migration policy` и этапом 6.
- Требование сохранить текущий public API покрыто разделами 2-3 и full readiness gate.
