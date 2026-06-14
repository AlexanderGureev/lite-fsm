# `@lite-fsm/entities` despawn cleanup — ТЗ для реализации

## 1. Цель

Ускорить сценарий `despawnOn cleanup` из `packages/entities/PERFORMANCE.md` без изменения публичных exports и без усложнения ментальной модели `lite-fsm`.

Целевой результат: `despawnOn cleanup / 50 000` должен перейти с текущих `20.521ms` в gate и `22.694ms` в diagnostics public path к уровню `1-2ms` первым шагом, затем к `0.3-0.6ms` при сохранении корректного lifecycle поведения. RSD для `despawnOn cleanup / 50 000` должен быть ниже `15%`.

## 2. Как выполнять это ТЗ

### Область работ

- Runtime `@lite-fsm/entities`: `packages/entities/src/runtime/reduce.ts`, `state.ts`, `transaction.ts`, `compile.ts`, `snapshot.ts` и связанные типы.
- Тесты runtime и React read layer: `tests/entities/entities-plugin.test.ts`, `tests/react/entities.test.tsx`, при необходимости `tests/entities/entities-examples.test.ts`.
- Benchmark fixtures и reports: `tests/bench/entities/*`, `.bench/entities/*` как результат record-команды.
- Документация контракта: `packages/entities/README.md`, `packages/entities/PERFORMANCE.md`, `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`.

### Вне области работ

- Оптимизация `sprite sync reaction`, generic `active -> active` reducer path, spawn allocation и core `manager.transition` overhead.
- Новый public API, новые public options, новые public events или изменение export surface.
- Полная archetype ECS архитектура, dense row id remapping или изменение контракта `view.<column>[entity]`.
- `per-store group buckets` для маршрутизации по `groupTag`; это отдельная оптимизация routing.
- Поддержка state `effects`, запланированных входом в state из `ENTITY_DESPAWNED`, как cleanup contract.
- Сборка документации и любые команды, которые транзитивно запускают `apps/docs`.

### Запрещенные команды

Агентам запрещено запускать:

- `pnpm run build`;
- `pnpm --filter @lite-fsm/docs build`;
- `pnpm run docs:build`;
- `pnpm run pages:build`;
- `pnpm run pages:build:fast`;
- любой `next build` внутри `apps/docs`.

Для пакетной проверки использовать `pnpm run build:packages`.

### Общие инварианты

- `ENTITY_DESPAWNED` остается локальным lifecycle hook только для actor rows сущностей, которые удаляются в текущем `transition`; это не broadcast.
- Public dispatch `ENTITY_SPAWNED` и `ENTITY_DESPAWNED` остается запрещенным.
- Физическое удаление actor rows должно происходить после lifecycle visibility point: `ENTITY_DESPAWNED` reducer и reaction должны видеть удаляемые rows и их колонки до удаления.
- Original event reactions не должны получать rows, которые были удалены через `despawnOn` в том же transition.
- `transition.despawn(...)` и `despawnOn` должны оставаться no-op для missing или уже удаленных сущностей.
- Строка является публично читаемой только при `view.has(entity) === true`. Значения колонок dead row не являются public state.
- `version` actor store и entity store является monotonic invalidation token, а не счетчиком строк, событий или отдельных мутаций.
- `rowVersion` является per-row invalidation token для живых rows. Для dead rows точное значение не является публичным контрактом.

### Матрица проверок

- Behavior code changed: focused Vitest regressions, 100% coverage по statements/branches/functions/lines для затронутой чистой runtime-логики, `pnpm run check-types`, `pnpm run lint`, `git diff --check`.
- Public types или public docs changed: `pnpm run test:types`, `pnpm run check-types`, audit cheatsheets.
- Benchmark fixture changed: record после package build через `pnpm run bench:entities:record -- --runs 5 --label after-despawn-cleanup --include gate,diagnostics` и compare с baseline.
- Package surface changed: `pnpm run build:packages`. Команда не должна запускать docs build.

### Артефакты результата

- Итоговый record должен быть доступен по label aliases:
  - `.bench/entities/after-despawn-cleanup.json`;
  - `.bench/entities/after-despawn-cleanup.md`.
- Compare с baseline должен быть сохранен как Markdown:
  - `.bench/entities/after-despawn-cleanup-vs-codex-baseline-2026-06-14.md`.
- `packages/entities/PERFORMANCE.md` должен содержать раздел `Итог problem 1: despawnOn cleanup` с короткой таблицей:
  - baseline median и after median для `despawnOn cleanup / 10 000` и `50 000`;
  - ratio к SoA до и после;
  - абсолютное и процентное ускорение;
  - RSD after;
  - ссылки на record JSON/Markdown и compare Markdown.
- Журнал реализации должен получить запись финальной проверки с путями к этим артефактам и выводом: достигнут ли целевой диапазон `1-2ms` или почему он не достигнут.

## 3. Целевой public API

Новые exports, options и типы не добавляются.

Уточняется runtime contract alpha-пакета:

- `EntityAccess.get(key)` и `maybe(key)` возвращают колонки, индексированные по `EntityIndex`; чтение значения колонки является корректным только после проверки `view.has(entity) === true`.
- После `view.has(entity) === false` значения `view.<column>[entity]` могут быть stale до повторного использования слота. Публичное состояние dead row определяется через `has`, `state(entity)`, `count`, `version`, `indexById`, group indexes и snapshot contract.
- При повторном spawn в освобожденный `EntityIndex` runtime обязан заново записать default values из `initialContext` до `ENTITY_SPAWNED` reducer.
- `ENTITY_DESPAWNED` reducer и `reactions.ENTITY_DESPAWNED` являются поддерживаемым местом для финального чтения колонок перед удалением.
- State `effects`, которые могли бы быть запланированы переходом по `ENTITY_DESPAWNED`, не являются поддерживаемым cleanup contract. Финальную внешнюю синхронизацию нужно делать через `reactions.ENTITY_DESPAWNED`.
- `version` должен увеличиваться при видимом изменении store, но точная величина инкремента не гарантируется. Один `manager.transition` может увеличить `version` один раз на store при удалении многих rows.
- `dehydrate()` не должен публиковать stale column values dead rows: dead slots сериализуются с default values из `initialContext`.

## 4. Целевая архитектура

- Compile layer должен предоставлять дешевый metadata-план для cleanup:
  - event code `ENTITY_DESPAWNED`;
  - признак, что template имеет observable `ENTITY_DESPAWNED` work: accepted transition плюс reducer или `reactions.ENTITY_DESPAWNED`;
  - lifecycle transition без reducer и без reaction не считается наблюдаемой работой.
- Transaction layer должен использовать переиспользуемый scratch для `despawnScheduled` и очищать только индексы, которые были запланированы в текущем dispatch.
- Ownership indexes должны быть sparse-indexed:
  - `stateBuckets` уже используют `statePosition`;
  - `entitiesByGroupTag` уже использует `groupTagPosition`;
  - `actorRowsByEntity` и `actorRowsByGroupTag` должны получить `O(1)` swap-remove через позиции в `EntityActorRowRef` или эквивалентную внутреннюю структуру.
- Cleanup pipeline должен строить removal plan:
  - lifecycle rows: accepted `ENTITY_DESPAWNED` transition с reducer или reaction;
  - fast rows: rows без наблюдаемой `ENTITY_DESPAWNED` работы;
  - physical removal выполняется батчами по store после lifecycle reducers/reactions.
- Batch removal должен обновлять `store.count`, `store.version`, `store.publicSlice`, `entityStore.count`, `entityStore.version` и entity indexes один раз на затронутый batch, а не на каждую row.
- Runtime cleanup не должен очищать колонки dead rows. Snapshot serialization должна очищать dead slots в выходном JSON.

## 5. Этапы реализации

### Этап 1 — Контракты, metadata и transaction scratch

#### Цель

Подготовить compile/runtime контракты для fast cleanup без изменения public API.

#### Зависит от

Нет.

#### Контракт этапа

- В `EntityTemplateMetadata` или соседней internal metadata добавить данные, достаточные для дешевого ответа: есть ли у template наблюдаемая работа на `ENTITY_DESPAWNED`.
- Наблюдаемая работа определяется как accepted `ENTITY_DESPAWNED` transition в текущем state и наличие reducer или `reactions.ENTITY_DESPAWNED`.
- Наличие state `effects` на target state перехода `ENTITY_DESPAWNED` не должно переводить row в lifecycle path.
- Empty `ENTITY_DESPAWNED` transition без reducer и без reaction может быть пропущен fast path.
- `prepareEntityTransaction` не должен создавать новый `Uint8Array(0)` для despawn schedule на каждый dispatch. Scratch должен жить в runtime или reusable transaction carrier.
- `scheduleEntityDespawn` должен сохранять dedupe semantics: одна entity попадает в scheduled list не более одного раза за dispatch.
- `consumeScheduledDespawns` должен очищать только индексы, которые были выставлены в текущем dispatch.
- Документировать internal invariant: `version` является invalidation token, точный инкремент не является контрактом.

#### Не делать в этом этапе

- Не менять физическое удаление rows.
- Не менять ownership indexes.
- Не менять benchmark fixtures.
- Не обновлять public docs, кроме локальных comments при необходимости.

#### Тесты этапа

- Runtime test: repeated scheduling одной entity в одном dispatch остается deduped.
- Runtime test: scheduled scratch не сохраняет stale mark между dispatch.
- Compile/runtime test: template с reducer и accepted `ENTITY_DESPAWNED` классифицируется как lifecycle work.
- Compile/runtime test: template с `reactions.ENTITY_DESPAWNED` классифицируется как lifecycle work.
- Compile/runtime test: accepted `ENTITY_DESPAWNED` transition без reducer/reaction классифицируется как fast-removable.

#### Критерий завершения

- Focused Vitest по `@lite-fsm/entities` lifecycle/scheduling tests проходит.
- `pnpm run check-types` проходит.
- Нет изменений public exports и public type tests не требуют обновления.

### Этап 2 — Indexed ownership и batch removal primitives

#### Цель

Сделать storage mutation layer пригодным для удаления batch без линейного поиска refs и без per-row public refresh.

#### Зависит от

Этап 1.

#### Контракт этапа

- `actorRowsByEntity` и `actorRowsByGroupTag` должны поддерживать `O(1)` swap-remove.
- При swap-remove позиция перемещенной ссылки должна обновляться синхронно.
- Group routing через `actorRowsByGroupTag[groupTag]` должен сохранить текущий observable contract.
- `removeActorRow` может остаться как wrapper для single-row сценариев, но один владелец mutation logic должен быть очевиден.
- Добавить batch primitive для удаления actor rows по store:
  - удалить rows из `stateBuckets`;
  - выставить `presence[entity] = 0`;
  - сбросить `stateCode` и `prevStateCode` допустимо, но не обязательно для public contract;
  - не вызывать `writeInitialColumnValues` для dead rows;
  - уменьшить `store.count` на количество реально удаленных rows;
  - увеличить `store.version` один раз, если store изменился;
  - вызвать `refreshActorPublicSlice(store)` один раз на store.
- Добавить batch primitive для удаления entity records:
  - удалить id из `indexById`;
  - обновить `alive`, `groupTagByIndex`, `entitiesByGroupTag`, `groupTagPosition`, `freeList`, `count`;
  - увеличить `entityStore.version` один раз, если были удалены live entities.
- При удалении entity с несколькими actor rows все rows должны исчезнуть из ownership indexes и state buckets.
- Повторный spawn в освобожденный slot должен заново записывать initial column values.

#### Не делать в этом этапе

- Не подключать batch primitive к `flushEntityLifecycleCleanup`.
- Не менять lifecycle ordering.
- Не добавлять `per-store group buckets`.
- Не делать lazy tombstones, которые оставляют dead rows в state buckets.

#### Тесты этапа

- Runtime test: удаление actor row из большого `actorRowsByGroupTag` сохраняет корректный routing после swap-remove.
- Runtime test: entity с несколькими actors удаляется из `actorRowsByEntity`, `actorRowsByGroupTag`, `stateBuckets`, `entitiesByGroupTag` и `indexById`.
- Runtime test: после удаления и повторного spawn в тот же `EntityIndex` defaults и spawn payload записаны заново.
- Runtime test: `store.version` и `entityStore.version` увеличиваются как invalidation tokens, без ожидания точного per-row инкремента.

#### Критерий завершения

- Focused runtime tests для ownership и removal primitives проходят.
- `pnpm run check-types` проходит.
- Source audit не показывает второго владельца удаления rows, кроме совместимых wrappers.

### Этап 3 — Lifecycle cleanup pipeline

#### Цель

Подключить fast path к `despawnOn` и `transition.despawn(...)`, сохранив lifecycle visibility для reducer/reaction.

#### Зависит от

Этапы 1 и 2.

#### Контракт этапа

- `flushEntityLifecycleCleanup` должен строить cleanup plan для scheduled despawns.
- Для каждой attached actor row план должен выбрать:
  - lifecycle path, если текущий state принимает `ENTITY_DESPAWNED` и template имеет reducer или `reactions.ENTITY_DESPAWNED`;
  - fast remove path во всех остальных случаях.
- Rows fast remove path не должны физически удаляться до завершения lifecycle reducer/reaction для rows той же cleanup wave.
- Lifecycle reducer должен получать `self.indices` только для rows, которым нужна наблюдаемая `ENTITY_DESPAWNED` работа.
- `reactions.ENTITY_DESPAWNED` должны выполняться до физического удаления и читать последние значения колонок.
- Original event reactions для rows, удаленных через cleanup в этом transition, не должны выполняться.
- State `effects`, связанные с target state перехода `ENTITY_DESPAWNED`, не должны считаться поддерживаемым cleanup contract и не должны блокировать fast path.
- Empty lifecycle transition без reducer/reaction можно пропустить без записи target state, потому что строка удаляется до subscribers.
- Physical removal должен использовать batch primitives из этапа 2.
- Terminal cleanup должен оставаться корректным и не должен удалять уже удаленные rows повторно.
- Ошибки reducer во время lifecycle должны сохранять rollback semantics для staged spawn snapshot, как до изменения.

#### Не делать в этом этапе

- Не оптимизировать generic `reduceAcceptedBatch` для обычного `TICK`.
- Не менять semantics `ENTITY_SPAWNED`.
- Не менять effect API или reaction API.
- Не менять public route meta.

#### Тесты этапа

- Runtime test: actor без `ENTITY_DESPAWNED` reducer/reaction удаляется через fast path и не очищает dead row columns.
- Runtime test: `ENTITY_DESPAWNED` reducer читает колонки до удаления.
- Runtime test: `reactions.ENTITY_DESPAWNED` читает колонки до удаления.
- Runtime test: mixed entity, где один actor имеет lifecycle work, а другой нет, сохраняет все actor rows живыми до lifecycle reaction и удаляет их вместе после нее.
- Runtime test: original event reaction не получает rows, удаленные через `despawnOn`.
- Runtime test: empty `ENTITY_DESPAWNED` transition без reducer/reaction не вызывает lifecycle reducer path.
- Runtime test: state effects после `ENTITY_DESPAWNED` не являются cleanup contract; финальная синхронизация проверяется через reaction.
- Regression test: subscribers после transition видят уже удаленные rows как `has(entity) === false`.

#### Критерий завершения

- Focused lifecycle tests проходят.
- `pnpm run check-types` проходит.
- `pnpm run test:types` проходит, если изменились type-visible contracts или docs examples.

### Этап 4 — Tests, benchmarks и документация

#### Цель

Закрыть observable contract, обновить diagnostic model и зафиксировать performance result.

#### Зависит от

Этапы 1-3.

#### Контракт этапа

- Обновить тесты, которые ожидали очистку колонок dead rows, на контракт `has(entity) === false` и snapshot sanitation.
- Добавить тест `dehydrate()` для dead slots: stale runtime columns не попадают в JSON, вместо них сериализуются defaults из `initialContext`.
- Обновить `tests/bench/entities/diagnostics.fixture.mjs`, чтобы raw entity kernel cleanup использовал batch removal модель без `rows.slice()` и per-row refresh.
- Добавить diagnostics breakdown cleanup фаз:
  - `schedule despawn`;
  - `despawn lifecycle plan`;
  - `batch remove actor rows`;
  - `remove entity records`;
  - `public commit`.
- Сохранить существующие gate labels и scenario keys, чтобы records сравнивались с baseline `codex-baseline-2026-06-14`.
- Обновить `packages/entities/README.md`:
  - чтение колонок только для live rows;
  - `ENTITY_DESPAWNED` как локальный reducer/reaction cleanup hook;
  - `version` как invalidation token.
- Обновить `packages/entities/PERFORMANCE.md` новым record, выводом по problem 1 и следующими приоритетами.
- Обновить `API-CHEATSHEET.md` и `TYPES-CHEATSHEET.md`, потому что они уже содержат разделы `@lite-fsm/entities`.

#### Не делать в этом этапе

- Не менять runtime behavior, кроме исправления gaps, найденных тестами.
- Не запускать docs build.
- Не переписывать cheatsheets как changelog.
- Не менять public examples на API, которого нет в runtime.

#### Documentation acceptance checklist

- `README.md` описывает, что dead row columns не являются public state.
- `README.md` указывает `reactions.ENTITY_DESPAWNED` как место для финальной внешней синхронизации.
- `API-CHEATSHEET.md` и `TYPES-CHEATSHEET.md` синхронизированы с README и не обещают meaningful column reads без `has(entity)`.
- `PERFORMANCE.md` содержит новую запись benchmark и compare с baseline.

#### Тесты этапа

- `pnpm exec vitest run tests/entities/entities-plugin.test.ts tests/react/entities.test.tsx tests/entities/entities-examples.test.ts`
- `pnpm run test:types`
- `pnpm run check-types`
- `pnpm run bench:entities:record -- --runs 5 --label after-despawn-cleanup --include gate,diagnostics`
- `pnpm run bench:entities:compare -- .bench/entities/codex-baseline-2026-06-14.json .bench/entities/after-despawn-cleanup.json`
- Сохранить вывод compare в `.bench/entities/after-despawn-cleanup-vs-codex-baseline-2026-06-14.md`.

#### Критерий завершения

- `despawnOn cleanup / 50 000` public median улучшился до `1-2ms` первым шагом или причина недостижения зафиксирована в `PERFORMANCE.md`.
- RSD `despawnOn cleanup / 50 000` ниже `15%`.
- Соседние gate scenarios не получили регрессию больше `10%`.
- Diagnostics объясняет основную цену cleanup path через новые breakdown фазы.
- `.bench/entities/after-despawn-cleanup.json`, `.bench/entities/after-despawn-cleanup.md` и `.bench/entities/after-despawn-cleanup-vs-codex-baseline-2026-06-14.md` созданы.
- Документация и cheatsheets описывают новый контракт без changelog-формулировок.

### Этап 5 — Рефакторинг, чистка и полировка

#### Цель

Закрыть качество реализации после behavior, benchmark и docs этапов.

#### Зависит от

Этапы 1-4.

#### Контракт этапа

- Убрать временные helpers, transitional branches, debug logging, TODO/FIXME и dead code в `packages/entities` и `tests/bench/entities`.
- Удалить неиспользуемые imports, locals, types, feature flags и тестовые scaffolds.
- Оставить одного владельца для validation, lifecycle planning, ownership mutation, batch removal, snapshot sanitation и diagnostics.
- Сохранить линейность кода: validate -> plan -> mutate/commit.
- Не оставлять abstractions или type aliases без второго места использования или явного снижения сложности.
- Привести comments/docs к финальному контракту, а не к истории оптимизации.
- Проверить, что cleanup не изменил public API, lifecycle ordering, snapshot format, routing и React read layer.

#### Не делать в этом этапе

- Не добавлять новые performance features.
- Не делать декоративные переименования без снижения сложности.
- Не объединять helpers с разными владельцами.
- Не менять benchmark thresholds без нового record.

#### Must fix

- Active dead code.
- Дублирование владельцев удаления rows или ownership refs.
- Source audit hits по устаревшему обещанию очистки колонок dead rows.
- Tests, которые проверяют точный per-row инкремент `version`.

#### Inspect only

- Декоративные переименования.
- Перенос кода между файлами без уменьшения coupling.
- Micro-optimizations вне `despawnOn cleanup`.

#### Тесты этапа

- Focused regressions по cleanup/lifecycle/snapshot.
- `pnpm run check-types`
- `pnpm run lint`
- `git diff --check`
- Source audit:
  - `rg -n "writeInitialColumnValues|ENTITY_DESPAWNED|despawnOn|version|rowVersion|dead row|columns" packages/entities tests/entities tests/react tests/bench API-CHEATSHEET.md TYPES-CHEATSHEET.md`

#### Критерий завершения

- Cleanup/refactor не меняет benchmark result больше чем на `10%` относительно record этапа 4.
- Нет stale comments/docs в active scope.
- Все focused checks проходят.

## 6. Критерий полной готовности

- Все этапы в журнале реализации имеют статус `done`.
- Public API exports и public types не расширены.
- Runtime tests покрывают fast path, lifecycle reducer/reaction path, mixed actor cleanup, snapshot sanitation, routing indexes и repeated spawn reuse.
- Затронутая чистая runtime-логика имеет 100% coverage по statements/branches/functions/lines или documented exclusion с причиной.
- `pnpm run test:types`, `pnpm run check-types`, `pnpm run lint`, `pnpm run build:packages` проходят.
- `pnpm run bench:entities:record -- --runs 5 --label after-despawn-cleanup --include gate,diagnostics` выполнен и артефакты сохранены в `.bench/entities/`.
- `pnpm run bench:entities:compare -- .bench/entities/codex-baseline-2026-06-14.json .bench/entities/after-despawn-cleanup.json` показывает ускорение целевого сценария и отсутствие регрессий соседних scenarios больше `10%`.
- Compare output сохранен в `.bench/entities/after-despawn-cleanup-vs-codex-baseline-2026-06-14.md`.
- `packages/entities/PERFORMANCE.md` содержит раздел `Итог problem 1: despawnOn cleanup` с таблицей до/после и ссылками на итоговые артефакты.
- `despawnOn cleanup / 50 000` имеет RSD ниже `15%`.
- `packages/entities/PERFORMANCE.md`, `packages/entities/README.md`, `API-CHEATSHEET.md` и `TYPES-CHEATSHEET.md` обновлены как справочники контрактов, а не changelog.
- Запрещенные docs build команды не запускались.
