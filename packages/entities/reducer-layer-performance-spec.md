# `@lite-fsm/entities` reducer layer — ТЗ для реализации

## 1. Цель

Ускорить problem 3 из `packages/entities/PERFORMANCE.md`: общий reducer pipeline `@lite-fsm/entities`, прежде всего `reduceAcceptedBatch` для простых событий вида `active -> active`.

Актуальная база после problem 2:

- `.bench/entities/after-reaction-scope.json`;
- `movement update / 50 000 / raw entity kernel`: `0.933ms`;
- `projectile lifetime update / 50 000 / raw entity kernel`: `0.868ms`;
- `sprite sync reaction / 50 000 / reduce entity batches`: `1.681ms`;
- `sprite sync reaction / 50 000 / raw entity kernel`: `2.346ms`;
- `sprite sync reaction / 50 000 / public manager.transition`: `4.753ms`;
- `movement update` и `projectile lifetime update` имеют public regression выше `10%` относительно `after-despawn-cleanup`, при этом diagnostics raw entity kernel изменился в пределах `0.2%`.

Целевой результат первого шага:

- `movement update / 50 000 / raw entity kernel` ниже `0.5ms`;
- `projectile lifetime update / 50 000 / raw entity kernel` ниже `0.5ms`;
- `sprite sync reaction / 50 000 / reduce entity batches` ниже `1.0ms`;
- `sprite sync reaction / 50 000 / raw entity kernel` ниже `2.0ms`;
- reducer-only gate должен двигаться от `5.45x` / `6.50x` к бюджету `1.50x`;
- соседние gate-сценарии не получают regression entity median больше `10%` относительно `after-reaction-scope`.

Stretch-цель:

- reducer-only public gate приближается к бюджету `1.50x`;
- `sprite sync reaction / 50 000 / public manager.transition` уменьшается вслед за reducer kernel;
- если public overhead остается выше целевого уровня из problem 5, результат фиксируется как остаточный core/bucket overhead, а не как blocker reducer layer.

## 2. Как выполнять это ТЗ

### Область работ

- Runtime `@lite-fsm/entities`: `packages/entities/src/runtime/reduce.ts`, `compile.ts`, `state.ts`, `transaction.ts`, `reactions.ts`, при необходимости новые internal-модули рядом с ними.
- Routing boundary только в части передачи batch metadata из `packages/entities/src/runtime/routing.ts`; не менять публичную маршрутизацию.
- Benchmark diagnostics и reports: `tests/bench/entities/diagnostics.fixture.mjs`, `tests/bench/entities/composition-lite-fsm-entities.fixture.mjs`, `tests/bench/entities/record-node.mjs`, `tests/bench/entities/reporting.mjs`.
- Runtime tests: `tests/entities/entities-plugin.test.ts`, при необходимости `tests/entities/entities-examples.test.ts`.
- Type tests: `tests/types/entities-api.tst.ts`, только если меняется type-visible contract.
- Документация контракта: `packages/entities/README.md`, `packages/entities/PERFORMANCE.md`, `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`, только если уточняется публичное поведение.
- Benchmark artifacts: `.bench/entities/after-reducer-layer.json`, `.bench/entities/after-reducer-layer.md`, compare Markdown.

### Вне области работ

- Новый public API, public options, public exports или изменение синтаксиса `storage: "entity"`.
- Новый public helper для записи состояния. Прямой контракт `self.stateCode[entity] = self.states.<STATE>` сохраняется.
- Перевод `self.indices` на array-like объект вместо настоящего массива.
- Изменение порядка routing, порядка `self.indices`, lifecycle order, error semantics, subscribers или effects.
- Problem 4: spawn validators, payload arrays, capacity reservation.
- Problem 5: core `manager.transition`, bucket runtime, storage hook phases и dispatch context вне `@lite-fsm/entities`.
- Повторная оптимизация reaction scope, уже закрытая в problem 2, кроме адаптации к новому reducer plan.
- Оптимизация effect scope и async effect model.
- Сборка документации и любые команды, которые транзитивно запускают `apps/docs`.

### Запрещенные команды

Агентам запрещено запускать:

- `pnpm run build`;
- `pnpm --filter @lite-fsm/docs build`;
- `pnpm run docs:build`;
- `pnpm run pages:build`;
- `pnpm run pages:build:fast`;
- любой `next build` внутри `apps/docs`.

Для пакетной проверки использовать `pnpm run build:packages` или команды benchmark, которые строят только `@lite-fsm/core` и `@lite-fsm/entities`.

### Общие инварианты

- Default transition применяется до reducer. Reducer видит `prevStateCode` как исходное состояние, а `stateCode` как target состояния по `config`.
- Reducer может откатить state через `self.stateCode[entity] = self.prevStateCode[entity]`.
- Reducer может override state через `self.stateCode[entity] = self.states.<STATE>`.
- Прямые writes в `stateCode` остаются поддержанным контрактом. Fast path обязан обнаруживать фактическое итоговое состояние после reducer.
- `self.indices` остается настоящим `readonly EntityIndex[]`, порядок строк не меняется.
- `payloadFor(entity)` остается доступен только во время `ENTITY_SPAWNED`.
- Ошибка invalid `stateCode` после reducer остается `LiteFsmError` с диагностикой actor, stateCode и entity.
- `rowVersion` увеличивается для accepted rows, включая identity transition, как сейчас.
- `store.version` и `entityStore.version` остаются monotonic invalidation tokens; точная величина инкремента не является контрактом.
- `effects` запускаются только для строк, которые вошли в final state после reducer; steady, rollback и `despawnOn` rows не должны запускать state effects.
- `reactions` запускаются после commit; original event reaction не получает rows, удаленные через `despawnOn` в том же transition.
- `despawnOn` и terminal cleanup сохраняют текущий lifecycle ordering и no-op semantics для missing/dead rows.
- `ENTITY_SPAWNED` и `ENTITY_DESPAWNED` lifecycle batches могут использовать общий reducer pipeline, но не обязаны проходить самый агрессивный identity fast path.
- Изменения в `reduce.ts` не должны оставлять файл монолитным. Если новая логика увеличивает файл, выделить владельцев: plan selection, transition application, reducer self, post-processing, cleanup/lifecycle.

### Матрица проверок

- Runtime behavior changed: focused Vitest regressions, 100% coverage по statements/branches/functions/lines для измененных чистых runtime-модулей, `pnpm run check-types`, `pnpm run lint`, `git diff --check`.
- Public types changed: `pnpm run test:types`, `pnpm run check-types`, audit `tests/types/entities-api.tst.ts`.
- Public docs changed: audit `packages/entities/README.md`, `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`; docs build не запускать.
- Benchmark fixture changed: smoke record с `--row-counts 1000`, затем stable record на `runs 5`.
- Performance gate: compare с `.bench/entities/after-reaction-scope.json` и, при необходимости, с `.bench/entities/codex-baseline-2026-06-14.json`.

### Артефакты результата

- Итоговый record:
  - `.bench/entities/after-reducer-layer.json`;
  - `.bench/entities/after-reducer-layer.md`.
- Compare с актуальной базой:
  - `.bench/entities/after-reducer-layer-vs-after-reaction-scope.md`.
- При необходимости compare с исходной базой:
  - `.bench/entities/after-reducer-layer-vs-codex-baseline-2026-06-14.md`.
- `packages/entities/PERFORMANCE.md` должен получить раздел `Итог problem 3: reducer layer`:
  - baseline и after для `movement update`, `projectile lifetime update`, `despawnOn cleanup`, `sprite sync reaction`;
  - diagnostics `raw entity kernel`, `reduce entity batches`, `public manager.transition`;
  - public overhead над kernel;
  - RSD after;
  - вывод, достигнут ли first gate и что осталось для problem 5.

## 3. Целевой public API

Новые public exports, options, event types, route meta и type helpers не добавляются.

Публичный контракт сохраняется:

- `EntityReducerSelf` остается mutable SoA view с `indices`, `states`, `presence`, `stateCode`, `prevStateCode`, `rowVersion`, `has(entity)`, `entityId(entity)` и колонками `initialContext`.
- Запись `self.stateCode[entity] = self.states.<STATE>` остается поддержанным способом перевести строку в состояние после default transition.
- `self.stateCode[entity] = self.prevStateCode[entity]` остается поддержанным rollback способом.
- `rowVersion` и `version` не получают точных per-row или per-pass гарантий.
- `reactions` и `effects` получают тот же scope и тот же порядок вызовов.
- `manager.entities()` и React read layer не меняют contract.
- Type tests должны остаться совместимыми без изменений, если не меняются только internal metadata.

## 4. Целевая архитектура

- Compile layer предоставляет per-event reduce plan для каждого actor template.
- Plan должен быть internal metadata, индексированной по `eventCode`, без public export.
- Plan должен описывать:
  - принимает ли template событие;
  - какие source states принимают событие;
  - все ли default transitions являются identity;
  - есть ли non-identity targets;
  - может ли default transition войти в state с `effects`;
  - может ли final state попасть под `despawnOn`;
  - есть ли `reactions` для event;
  - возможны ли terminal target states по transition table;
  - нужен ли lifecycle-specific path.
- Runtime не должен заменять compile-time plan runtime-сканами по всем rows.
- `reduceAcceptedBatch` должен стать тонким entrypoint:
  - выбрать plan;
  - применить default transitions;
  - вызвать reducer;
  - выполнить post-processing;
  - запланировать reactions/effects/cleanup.
- Identity transition fast path должен избегать per-row transition-table lookup и записи `stateCode`, но должен подготовить `prevStateCode` до reducer.
- Фактическое изменение состояния определяется после reducer через сравнение `stateCode[entity] !== prevStateCode[entity]`.
- Dirty rows используются для:
  - validation измененных states;
  - state bucket movement;
  - effects scheduling;
  - terminal cleanup scheduling.
- `despawnOn` сохраняет текущую observable модель: если event accepted и итоговый state попадает в despawn mask, row планируется на cleanup. Если у template нет `despawnOn`, проход полностью пропускается.
- Reducer self должен иметь стабильную форму на store:
  - не перечислять `Object.entries(store.columns)` на каждый batch;
  - не создавать новый object shape на каждый batch;
  - обновлять только текущий `indices`;
  - корректно перепривязывать column references после capacity growth, hydrate/restore или замены `store.columns`.
- Reaction borrowed ownership должен использовать фактический post-processing result, а не отдельные полные сканы `acceptedRowsUseIdentityTransitions`, `acceptedRowsStayedInSourceState` и `acceptedRowsNeedDespawnOn`.
- Diagnostics fixture должен моделировать новую архитектуру, а не старый generic reducer pipeline.

## 5. Этапы реализации

### Этап 1 — Reducer diagnostics breakdown

#### Цель

Сделать стоимость `reduceAcceptedBatch` измеримой до runtime-оптимизации.

#### Зависит от

Нет.

#### Контракт этапа

- В `tests/bench/entities/diagnostics.fixture.mjs` добавить breakdown reducer pipeline для `movement update`, `projectile lifetime update` и `sprite sync reaction`.
- Минимальные слои:
  - `collect/default transitions`;
  - `create reducer self`;
  - `run user reducer`;
  - `validate final states`;
  - `mark rows/public slice`;
  - `schedule lifecycle work`;
  - `update state buckets`;
  - итоговый `raw entity kernel`;
  - итоговый `public manager.transition`.
- Для `sprite sync reaction` сохранить существующие reaction layers и добавить связь с `reduce entity batches`.
- Breakdown должен объяснять не менее `80%` времени `raw entity kernel` для `movement update / 50 000` и `projectile lifetime update / 50 000`.
- Diagnostic fixture на этом этапе может повторять старую модель, но имена слоев должны остаться пригодными после оптимизации.
- Runtime `packages/entities/src/runtime/*` на этом этапе не менять.

#### Не делать в этом этапе

- Не менять runtime behavior.
- Не менять public docs и cheatsheets.
- Не добавлять compile metadata.
- Не менять benchmark gate budgets.

#### Тесты этапа

- Smoke record:
  - `pnpm run bench:entities:record -- --runs 1 --label reducer-breakdown-smoke --include diagnostics --row-counts 1000`.
- Compare smoke с самим собой:
  - `pnpm run bench:entities:compare -- .bench/entities/reducer-breakdown-smoke.json .bench/entities/reducer-breakdown-smoke.json`.
- Проверить Markdown diagnostics на наличие новых reducer breakdown rows.

#### Критерий завершения

- Smoke record и compare проходят.
- `git diff --check` проходит.
- Журнал фиксирует baseline values новых breakdown слоев для `50 000`.

### Этап 2 — Compile-time reduce plans

#### Цель

Добавить internal metadata, которая позволяет выбирать reducer fast path без runtime-анализа transition table для каждой строки.

#### Зависит от

Этап 1.

#### Контракт этапа

- В `packages/entities/src/runtime/compile.ts` добавить internal reduce plan, индексированный по `eventCode`.
- Plan должен быть частью `EntityTemplateMetadata` или соседней internal структуры, доступной `reduce.ts`.
- Для каждого event plan должен фиксировать:
  - `eventCode`;
  - `acceptStateCodes`;
  - `allDefaultTransitionsIdentity`;
  - `hasNonIdentityDefaultTransition`;
  - `mayEnterEffectState`;
  - `hasDespawnOnStates`;
  - `hasReaction`;
  - `mayEnterTerminalState`;
  - `requiresReducerCall`.
- `requiresReducerCall` зависит только от наличия reducer у template; отсутствие reducer не должно мешать default state transition.
- Plan для `ENTITY_SPAWNED` и `ENTITY_DESPAWNED` должен сохранять lifecycle correctness.
- Unknown transition target diagnostics через `ENTITY_INVALID_TRANSITION_TARGET` должны остаться в runtime path.
- Metadata не должна менять public types или emitted public exports.

#### Не делать в этом этапе

- Не подключать plan к `reduceAcceptedBatch`.
- Не менять reducer self.
- Не менять diagnostics fixture после этапа 1.
- Не менять public docs.

#### Тесты этапа

- Compile/runtime test: `active: { TICK: "active" }` получает identity plan.
- Compile/runtime test: event из двух states, оба identity, получает multi-state identity plan.
- Compile/runtime test: event с `READY -> STOPPED` получает non-identity plan.
- Compile/runtime test: target state с `effects` помечает `mayEnterEffectState`.
- Compile/runtime test: template с `despawnOn` помечает `hasDespawnOnStates`.
- Compile/runtime test: template с `reactions.TICK` помечает `hasReaction`.
- Compile/runtime test: transition в terminal state помечает `mayEnterTerminalState`.

#### Критерий завершения

- Focused Vitest по compile metadata проходит.
- `pnpm run check-types` проходит.
- Public API diff отсутствует.

### Этап 3 — Stable reducer self и default transition fast path

#### Цель

Убрать per-batch создание reducer self и ускорить применение default transitions для identity events.

#### Зависит от

Этапы 1 и 2.

#### Контракт этапа

- В `ColumnarActorStore` или соседнем internal cache добавить stable reducer self.
- Cached self должен:
  - иметь стабильную object shape для одного store;
  - содержать текущий `indices`;
  - ссылаться на актуальные `presence`, `stateCode`, `prevStateCode`, `rowVersion` и column arrays;
  - сохранять методы `has(entity)` и `entityId(entity)`;
  - перепривязывать columns после capacity growth, hydrate/restore или замены `store.columns`.
- `ensureActorCapacity`, restore/hydrate paths или общий cache invalidation должны гарантировать, что self не держит stale typed arrays.
- `createReducerSelf` не должен выполнять `Object.entries(store.columns)` на каждый accepted batch.
- Default transition application должен использовать reduce plan:
  - для single-state identity bucket не выполнять transition-table lookup на каждую строку;
  - не записывать `stateCode`, если default target равен source state;
  - записывать `prevStateCode` до reducer, чтобы rollback contract работал;
  - сохранять `nextState` для reducer meta.
- Generic path должен остаться для routed batches, multi-state batches, non-identity transitions, invalid targets и lifecycle events.
- `payloadFor(entity)` semantics для spawn lifecycle не меняется.

#### Не делать в этом этапе

- Не объединять post-processing loops.
- Не менять schedule effects/despawn/reaction logic.
- Не менять public docs.
- Не менять `self.indices` type или runtime array nature.

#### Тесты этапа

- Runtime test: `config-default transition` применяется до reducer.
- Runtime test: reducer rollback через `self.prevStateCode` сохраняет state.
- Runtime test: reducer override через `self.states.<STATE>` меняет state.
- Runtime test: cached self получает актуальные columns после capacity growth.
- Runtime test: cached self получает актуальные columns после hydrate/restore, если затронуты snapshot paths.
- Internal regression: `createReducerSelf` или его replacement не перечисляет columns на hot `TICK` каждый batch.
- Existing reaction borrowed tests остаются зелеными.

#### Критерий завершения

- Focused Vitest по reducer self/default transition scenarios проходит.
- `pnpm run check-types` проходит.
- Targeted coverage по измененным runtime-модулям закрыт до `100%` для statements/branches/functions/lines, если модули остаются чистой логикой.

### Этап 4 — Single-pass post-processing и dirty rows

#### Цель

Сократить отдельные полные проходы после reducer и выполнять обязательную работу только для фактически нужных строк.

#### Зависит от

Этапы 1-3.

#### Контракт этапа

- После reducer выполнить один основной pass по accepted rows.
- Pass должен:
  - увеличить `rowVersion` для accepted rows;
  - проверить final `stateCode`;
  - собрать dirty rows, где `stateCode[entity] !== prevStateCode[entity]`;
  - сгруппировать entered effect states только для dirty rows;
  - запланировать terminal cleanup только для dirty rows с terminal final state;
  - проверить `despawnOn`, если у store есть despawn mask;
  - собрать флаги для reaction borrowed ownership.
- Если у event/template нет effects, despawn mask и terminal risk, соответствующие checks не выполняются.
- `updateActorStateBuckets` должен работать только по dirty rows.
- Identity event без reducer state writes не должен проходить full bucket update loop.
- Reactions продолжают планироваться для accepted rows, если event имеет reaction.
- Original event reaction не должен получать rows, которые post-processing запланировал на `despawnOn`.
- Borrowed reaction batch разрешен только если:
  - source indices stable;
  - default transition identity;
  - dirty rows пусты;
  - cleanup не удаляет rows из original reaction scope.
- Existing helper scans `acceptedRowsUseIdentityTransitions`, `acceptedRowsStayedInSourceState`, `acceptedRowsNeedDespawnOn` должны быть удалены или сведены к compile/runtime flags без второго полного scan.
- `markActorRowsTouched` и `refreshActorPublicSlice` должны сохранять один public slice refresh на batch.
- Error rollback semantics для staged spawn snapshot не меняется.

#### Не делать в этом этапе

- Не менять semantics `despawnOn` на "только при входе", если текущие tests ожидают cleanup accepted rows по final state.
- Не оптимизировать spawn allocation.
- Не менять effect captured scope.
- Не менять core bucket runtime.

#### Тесты этапа

- Runtime test: invalid `stateCode` после reducer бросает clear error.
- Runtime test: `rowVersion` увеличивается только для accepted rows.
- Runtime test: effects используют final state после override и не запускаются для steady/rollback/despawnOn rows.
- Runtime test: `despawnOn` удаляет rows и original event reaction их не получает.
- Runtime test: lifecycle `ENTITY_DESPAWNED` reaction читает columns до cleanup.
- Runtime test: terminal rows cleanup остается корректным.
- Regression test: unscoped event из нескольких state buckets сохраняет порядок accepted rows.
- Internal allocation/regression test: hot identity `TICK` не создает `Set`/`Map`/column enumeration, масштабируемые от row count.

#### Критерий завершения

- Focused lifecycle/reducer/reaction tests проходят.
- `pnpm run check-types` проходит.
- Targeted coverage по измененным runtime-модулям закрыт до `100%` для statements/branches/functions/lines.
- Source audit показывает одного владельца post-processing logic.

### Этап 5 — Benchmarks, docs и performance report

#### Цель

Зафиксировать performance result stage 3 и обновить документы без изменения public API.

#### Зависит от

Этапы 1-4.

#### Контракт этапа

- Diagnostics fixture должен отражать новую reducer architecture.
- Stable record:
  - `pnpm run bench:entities:record -- --runs 5 --label after-reducer-layer --include gate,diagnostics`.
- Compare:
  - `pnpm run bench:entities:compare -- .bench/entities/after-reaction-scope.json .bench/entities/after-reducer-layer.json`;
  - при необходимости `pnpm run bench:entities:compare -- .bench/entities/codex-baseline-2026-06-14.json .bench/entities/after-reducer-layer.json`.
- Compare Markdown сохранить в `.bench/entities/after-reducer-layer-vs-after-reaction-scope.md`.
- `packages/entities/PERFORMANCE.md` обновить разделом `Итог problem 3: reducer layer`.
- Если public API не менялся, `API-CHEATSHEET.md` и `TYPES-CHEATSHEET.md` обновлять только при необходимости уточнить контракт; не превращать их в changelog.
- `packages/entities/reaction-scope-performance-spec-log.md` можно оставить blocked; новый report должен явно объяснять, какие metrics могут разблокировать reaction-scope gate.

#### Не делать в этом этапе

- Не менять runtime behavior.
- Не запускать docs build.
- Не менять benchmark budgets без отдельного решения.
- Не удалять historical benchmark artifacts.

#### Documentation acceptance checklist

- `packages/entities/PERFORMANCE.md` содержит:
  - ссылки на `after-reducer-layer` artifacts;
  - таблицу gate до/после для `movement`, `projectile`, `despawnOn`, `sprite`;
  - diagnostics table по reducer layers;
  - public overhead над raw kernel;
  - вывод по first gate и остаточным problem 5 рискам.
- `README.md` не содержит performance claims, не подтвержденных record.
- `API-CHEATSHEET.md` и `TYPES-CHEATSHEET.md` не получают changelog-формулировок.

#### Тесты этапа

- Smoke record перед stable run:
  - `pnpm run bench:entities:record -- --runs 1 --label reducer-layer-smoke --include gate,diagnostics --row-counts 1000`.
- Stable record и compare команды выше.
- `git diff --check`.

#### Критерий завершения

- Stable record создан.
- Compare Markdown создан.
- `PERFORMANCE.md` обновлен фактическими метриками.
- Neighbor gate regression выше `10%` отсутствует или явно зафиксирован как blocker.
- First gate достигнут или журнал содержит concrete blocker с diagnostics breakdown.

### Этап 6 — Рефакторинг, чистка и полировка

#### Цель

Закрыть качество реализации после behavior/docs этапов и перед финальной проверкой.

#### Зависит от

Этапы 1-5.

#### Контракт этапа

- Убрать временные helpers, transitional branches, debug logging, TODO/FIXME и dead code в области работ.
- Удалить неиспользуемые imports, locals, types, feature flags и тестовые scaffolds.
- Убрать дублирование validation, normalization, mapping и post-processing logic.
- Сохранить одного владельца для каждого контракта:
  - compile plan;
  - default transition application;
  - reducer self cache;
  - post-processing;
  - lifecycle cleanup;
  - diagnostics fixture phases.
- Сделать код читаемым сверху вниз: validate -> transform -> mutate/commit.
- Если `reduce.ts` остается больше `800` строк, выделить internal modules с четкими владельцами и тонким entrypoint.
- Не оставлять abstractions или type aliases без второго места использования или явного снижения сложности.
- Comments/docs привести к финальному контракту, а не к истории реализации.
- Проверить, что public API, order, error semantics, lifecycle, reaction/effect scope и performance gates не изменились из-за cleanup.

#### Не делать в этом этапе

- Не выполнять декоративные переименования без пользы.
- Не переносить код между файлами без снижения сложности.
- Не объединять helpers с разными владельцами.
- Не добавлять micro-optimizations без performance contract.

#### Must fix

- Active dead code.
- Temporary branches.
- Stale comments.
- Duplicate owners.
- Лишние abstractions.
- Source audit hits по старым именам fast-path прототипов в active runtime scope.

#### Inspect only

- Декоративные переименования.
- Перенос кода без уменьшения сложности.
- Объединение helpers с разными владельцами.
- Дополнительные micro-optimizations вне reducer layer.

#### Тесты этапа

- Focused regressions по затронутым contracts.
- `pnpm run check-types`.
- `pnpm run lint`.
- `git diff --check`.
- Source audit по known stale identifiers/wording.
- Coverage gate для измененной чистой runtime-логики.

#### Критерий завершения

- Cleanup не меняет benchmark result за пределами шума или улучшает его.
- Проверки этапа проходят.
- Журнал содержит `Expected remaining hits`, если source audit оставляет допустимые historical/spec совпадения.

## 6. Критерий полной готовности

- Все этапы имеют статус `done` в журнале.
- `movement update / 50 000 / raw entity kernel` ниже `0.5ms` или blocker описан через reducer breakdown.
- `projectile lifetime update / 50 000 / raw entity kernel` ниже `0.5ms` или blocker описан через reducer breakdown.
- `sprite sync reaction / 50 000 / reduce entity batches` ниже `1.0ms` или blocker описан через reducer breakdown.
- `sprite sync reaction / 50 000 / raw entity kernel` ниже `2.0ms` или blocker описан через split между reducer и reaction/public layers.
- Stable record `after-reducer-layer` создан и сравнен с `after-reaction-scope`.
- Neighbor gate regression выше `10%` отсутствует или оформлен как blocker.
- Runtime behavior tests и type checks проходят.
- `pnpm run lint` и `git diff --check` проходят.
- `packages/entities/PERFORMANCE.md` отражает фактический итог problem 3.
- Запрещенные docs build команды не запускались.

## 7. Карта трассировки исходных требований

- `PERFORMANCE.md`, problem 3: compile-time fast path для identity self-transition покрыт разделом 4 и этапами 2-4.
- `PERFORMANCE.md`, problem 3: отключение пустых post-processing passes покрыто этапом 4.
- `PERFORMANCE.md`, problem 3: stable reducer self покрыт разделом 4 и этапом 3.
- `PERFORMANCE.md`, problem 3: объединение validation, rowVersion, effects/despawn/terminal scan покрыто этапом 4.
- `PERFORMANCE.md`, итог problem 2: remaining cost в `reduce entity batches` и public path покрыт целью, этапом 1 diagnostics и этапом 5 report.
- `reaction-scope-performance-spec-log.md`: blocker Этапа 4 переносится в новое ТЗ через цель снизить reducer/public contribution; закрытие старого ТЗ не выполняется в этом scope.
- Контракт `self.stateCode[entity] = self.states.<STATE>` из README, cheatsheets и type tests покрыт разделом 3, общими инвариантами и этапами 3-4.
- Контракт reaction scope из problem 2 сохраняется через разделы "Вне области работ", "Общие инварианты" и этап 4.
- Контракт `despawnOn` и `ENTITY_DESPAWNED` cleanup сохраняется через общие инварианты, этап 4 и full readiness gate.
- Запрет docs build команд покрыт разделом "Запрещенные команды", этапом 5 и full readiness gate.
- Требование не менять public API покрыто разделом 3, этапом 2 и этапом 5.
- Требование 100% coverage для чистой runtime-логики покрыто матрицей проверок и stage gates этапов 3, 4 и 6.
- Риск роста `reduce.ts` выше `800` строк покрыт общими инвариантами и cleanup этапом 6.

## 8. Открытые вопросы

Открытых вопросов для начала реализации нет.

Решения, принятые по коду и документам:

- Scope ограничен `@lite-fsm/entities` reducer layer; core-wide public overhead остается problem 5.
- Public API не меняется.
- Direct `stateCode` writes сохраняются, поэтому fast path обязан определять dirty rows после reducer.
- Performance gate проверяется от `after-reaction-scope`, потому что это текущая база после problem 2.
