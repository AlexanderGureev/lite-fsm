# `@lite-fsm/entities` reaction scope — ТЗ для реализации

## 1. Цель

Ускорить problem 2 из `packages/entities/PERFORMANCE.md`: `sprite sync reaction` и внутренний reaction scope runtime.

Целевой результат первого шага:

- `sprite sync reaction / 50 000 / raw entity kernel` должен опуститься ниже `2ms`;
- `sprite sync reaction / 50 000 / public manager.transition` должен следовать за kernel и добавлять не больше `0.3ms`;
- соседние gate-сценарии `movement update`, `projectile lifetime update`, `despawnOn cleanup` не должны получить регрессию entity median больше `10%`.

Stretch-цель:

- `sprite sync reaction / 50 000 / raw entity kernel` ниже `1ms`;
- public gate приближается к бюджету `2.00x` от SoA, если оставшаяся цена не находится в общем reducer pipeline problem 3.

Текущая актуальная база после problem 1:

- `.bench/entities/after-despawn-cleanup.md`;
- `sprite sync reaction / 50 000` gate median: `8.259ms`, ratio `16.85x`;
- diagnostics `raw entity kernel`: `7.916ms`;
- diagnostics `public manager.transition`: `7.941ms`;
- diagnostics `semantic SoA`: `0.328ms`.

## 2. Как выполнять это ТЗ

### Область работ

- Runtime `@lite-fsm/entities`: `packages/entities/src/runtime/transaction.ts`, `reactions.ts`, `access.ts`, `reduce.ts`, `state.ts`, при необходимости `compile.ts`.
- Benchmark fixtures и reporting: `tests/bench/entities/diagnostics.fixture.mjs`, `tests/bench/entities/composition-lite-fsm-entities.fixture.mjs`, `tests/bench/entities/record-node.mjs`, `tests/bench/entities/reporting.mjs`.
- Runtime tests: `tests/entities/entities-plugin.test.ts`, при необходимости `tests/entities/entities-examples.test.ts`.
- Type tests: `tests/types/entities-api.tst.ts`, если меняются public types.
- Документация контракта: `packages/entities/README.md`, `packages/entities/PERFORMANCE.md`, `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`.
- Benchmark artifacts: `.bench/entities/after-reaction-scope.json`, `.bench/entities/after-reaction-scope.md`, compare Markdown.

### Вне области работ

- Problem 3: per-event reduce plans, identity-transition reducer fast path, объединение post-processing loops и stable reducer self.
- Problem 4: spawn validators, payload arrays, capacity reservation.
- Problem 5: core `manager.transition` и bucket runtime overhead.
- Изменение public exports, public options, event routing API или синтаксиса `reactions`.
- Перевод `self.indices` на array-like объект вместо настоящего массива.
- Поддержка async `reactions` или разрешение dispatch из `reactions`.
- Оптимизация `effects` scope. Effect scope остается captured-entry моделью.
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

- `reactions` остаются sync-only и выполняются после commit и до subscribers/effects согласно текущему core pipeline.
- Promise из `reaction` остается runtime error через `onError`; результат transition и subscribers не должны блокироваться.
- `reaction` не может dispatch-ить события и не получает `transition`.
- `self.indices`, `self`, `deps` и scoped `entities()` внутри `reaction` валидны только во время текущего синхронного вызова `reaction`.
- `self.indices` остается настоящим `readonly EntityIndex[]`; runtime не обязан защищать от runtime-мутаций через `push`, `splice` или cast к mutable array.
- Порядок `self.indices` должен совпадать с текущим порядком accepted rows/state bucket. Runtime не должен сортировать, dedupe-ить или группировать scope иначе.
- `self.has(entity)` и `self.entityId(entity)` должны проверять, что `entity` входит в текущий reaction scope, generation не стала stale, entity live и actor row present.
- `self.entityId(entity)` может читать id лениво из `runtime.entityStore.ids[entity]`, если scope marker и generation snapshot подтверждают валидность entity.
- `entities().get(key)` и `entities().maybe(key)` возвращают readonly store view как сейчас; unknown template продолжает бросать ошибку.
- `entities().get(key)` не обязан выполнять eager full-scope scan всех rows ради missing-row diagnostics.
- Original event reactions не должны получать rows, удаленные через `despawnOn` в том же transition.
- `ENTITY_SPAWNED` и `ENTITY_DESPAWNED` reactions должны использовать ту же fast reaction scope модель, что и обычные events.
- Effect scope не переводится на fast reaction scope. Для effects остаются stable `CapturedEntityScopeEntry[]`, потому что effect scope может пережить текущий transition и вызвать `transition.despawn(self.indices)`.

### Матрица проверок

- Runtime behavior changed: focused Vitest regressions, 100% coverage по statements/branches/functions/lines для измененных чистых runtime-модулей, `pnpm run check-types`, `pnpm run lint`, `git diff --check`.
- Public types changed: `pnpm run test:types`, `pnpm run check-types`, audit `tests/types/entities-api.tst.ts`.
- Docs changed: audit `packages/entities/README.md`, `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`; не запускать docs build.
- Benchmark fixture changed: smoke record с `--row-counts 1000`, затем stable record на `runs 5`.
- Performance gate: compare с `.bench/entities/after-despawn-cleanup.json` и, при необходимости, с `.bench/entities/codex-baseline-2026-06-14.json`.

### Артефакты результата

- Итоговый record:
  - `.bench/entities/after-reaction-scope.json`;
  - `.bench/entities/after-reaction-scope.md`.
- Compare с актуальной базой:
  - `.bench/entities/after-reaction-scope-vs-after-despawn-cleanup.md`.
- При необходимости compare с исходной базой:
  - `.bench/entities/after-reaction-scope-vs-codex-baseline-2026-06-14.md`.
- `packages/entities/PERFORMANCE.md` должен получить раздел `Итог problem 2: reaction scope и sprite sync reaction`:
  - baseline median и after median для `sprite sync reaction / 10 000` и `50 000`;
  - diagnostics `raw entity kernel`, `public manager.transition`, `semantic SoA`;
  - ускорение и ratio до/после;
  - RSD after;
  - вывод, достигнут ли first gate и stretch gate.

## 3. Целевой public API

Новые public exports, options, event types и type helpers не добавляются.

Публичный контракт уточняется без смены ментальной модели:

- `reactions` предназначены для синхронной внешней синхронизации после commit.
- `self.indices` — readonly sync-only view текущего reaction scope. Его нельзя мутировать и нельзя сохранять для использования после завершения `reaction`.
- `self`, `deps` и результат `entities()` также являются sync-only runtime views.
- `self.has(entity)` возвращает `true` только для entity из текущего scope, если entity live, generation не stale и actor row present.
- `self.entityId(entity)` возвращает id только для entity из текущего scope; для entity вне scope или stale scope бросается `LiteFsmError`.
- `entities().get(key)` и `entities().maybe(key)` возвращают typed readonly actor store view; чтение колонок остается корректным через entity из `self.indices` и проверку `view.has(entity)`, если наличие actor row не гарантировано моделью приложения.
- Reserved deps keys остаются runtime-owned: `action`, `self`, `entities`, `transition`, `condition`. Пользовательские deps с такими именами не должны подменять runtime deps внутри reaction.
- Runtime не гарантирует, что deps является свежим плоским объектом с own enumerable properties. Поддерживаемый контракт — чтение dependency properties по имени.

## 4. Целевая архитектура

- Reaction scope и effect scope становятся разными internal models:
  - `reaction scope`: sync-only, быстрый, без `CapturedEntityScopeEntry[]` и без `Map`;
  - `effect scope`: captured entries, stable ids/generation, поддержка delayed `transition.despawn(self.indices)`.
- `EntityReactionBatch` должен хранить стабильный scope до reaction phase через один из режимов:
  - `borrowed`: ссылка на стабильный `EntityIndex[]`, который не будет перезаписан или перестроен до выполнения reaction;
  - `owned`: индексы принадлежат reaction batch через transaction arena/pool или отдельный pooled real array.
- `borrowed` разрешен только для консервативно безопасных batch:
  - unscoped batch из одного accepting state bucket;
  - compiled identity transition для event/state;
  - runtime после reducer подтверждает, что `stateCode[entity] === prevStateCode[entity]` для accepted rows;
  - template/event не требует cleanup, despawn, terminal cleanup или effect scheduling, которые могут убрать rows до ordinary reaction.
- Все остальные batch должны использовать `owned`.
- `owned` должен копировать только `EntityIndex[]`, без per-row `{ entity, generation, id }` и без `Map`.
- Transaction scratch должен владеть reusable arena/pool для owned reaction indices. Один batch не должен ссылаться на buffer, который может быть перезаписан другим batch до reaction phase.
- Перед вызовом reaction runtime должен установить current reaction scope:
  - записать scope token для entity из `self.indices`;
  - сохранить generation snapshot в typed array или эквивалентный reusable storage;
  - сохранить touched entity list для очистки marker-ов;
  - не создавать per-row objects.
- `createScopedEntitySelf` для reactions должен использовать fast scope marker/generation snapshot. Для effects можно сохранить текущую strict captured-entry реализацию или выделить отдельную функцию.
- `createScopedEntityAccess` для reactions не должен создавать `entries`-based validation path и не должен сканировать весь scope в `get(key)`.
- Reaction deps должны собираться без `{ ...ctx.manager.getDependencies() }` и серии `delete` на каждый batch:
  - runtime deps должны shadow reserved keys;
  - пользовательские deps должны читаться через нормализованный object/prototype/wrapper с предсказуемой формой;
  - cached normalization допустима по identity текущего `manager.getDependencies()`.
- Benchmark diagnostics должны измерять новую модель, а не старую имитацию `indices.slice() + entries[] + Map`.

## 5. Этапы реализации

### Этап 1 — Reaction diagnostics breakdown

#### Цель

Сделать стоимость reaction scope измеримой до runtime-оптимизации.

#### Зависит от

Нет.

#### Контракт этапа

- В `tests/bench/entities/diagnostics.fixture.mjs` добавить breakdown для `sprite sync reaction`.
- Минимальные слои:
  - `schedule reaction batch`;
  - `collect reaction scope`;
  - `create reaction deps`;
  - `run user reaction`;
  - итоговый `raw entity kernel`;
  - итоговый `public manager.transition`.
- Breakdown должен объяснять не менее `80%` времени `sprite sync reaction / 50 000 / raw entity kernel`.
- Diagnostic fixture на этом этапе может повторять старую модель, но слои должны быть названы так, чтобы после оптимизации показывать новую модель.
- `tests/bench/entities/record-node.mjs` должен явно фиксировать production benchmark режим или документированно выставлять `NODE_ENV=production` для benchmark process.
- Runtime tests не должны зависеть от production env; dev semantics проверяются отдельно.
- Existing gate tables должны остаться сопоставимыми с `.bench/entities/after-despawn-cleanup.json`.

#### Не делать в этом этапе

- Не менять runtime `packages/entities/src/runtime/*`.
- Не менять public docs и cheatsheets.
- Не оптимизировать reaction batches.
- Не менять semantic SoA и user checksum workload.

#### Тесты этапа

- Smoke record:
  - `pnpm run bench:entities:record -- --runs 1 --label reaction-breakdown-smoke --include diagnostics --row-counts 1000`.
- Compare smoke с самим собой:
  - `pnpm run bench:entities:compare -- .bench/entities/reaction-breakdown-smoke.json .bench/entities/reaction-breakdown-smoke.json`.
- Проверить, что Markdown diagnostics содержит новые reaction breakdown rows.

#### Критерий завершения

- Smoke record и compare проходят.
- `git diff --check` проходит.
- Stage log фиксирует baseline values новых breakdown слоев.

### Этап 2 — Reaction batch ownership

#### Цель

Убрать обязательное `indices.slice()` при scheduling reaction batches и ввести безопасные режимы `borrowed`/`owned`.

#### Зависит от

Этап 1.

#### Контракт этапа

- `EntityReactionBatch` должен различать stable borrowed indices и owned indices.
- `scheduleEntityReactionBatch` не должен безусловно выполнять `indices.slice()`.
- `appendLifecycleReactionBatch` для `ENTITY_SPAWNED` и `ENTITY_DESPAWNED` должен использовать тот же механизм ownership.
- Borrowed batch должен ссылаться только на массив, который не будет изменен до reaction phase.
- Owned batch должен получить стабильное владение indices до reaction phase.
- Transaction scratch должен поддерживать reusable storage для owned indices:
  - arena segments или pooled real arrays допустимы;
  - каждый batch должен видеть свой стабильный `readonly EntityIndex[]`;
  - scratch очищается после reaction phase или при подготовке следующего dispatch.
- `self.indices` в reaction должен оставаться настоящим массивом для `for...of`, `.map`, `.join`, spread и текущих тестов.
- Runtime должен сохранять порядок accepted rows.
- При невозможности доказать stable source runtime должен выбирать owned.
- Консервативное правило для первого результата:
  - borrowed только для unscoped single-bucket identity transition без cleanup/effect/terminal/despawn риска;
  - routed events, merged buckets, lifecycle batches и possible state movement используют owned.
- Если reducer вручную меняет `stateCode`, borrowed batch должен быть запрещен или превращен в owned до reaction phase.

#### Не делать в этом этапе

- Не менять `createScopedEntitySelf` и deps shape.
- Не убирать `entries[]` и `Map` из reaction execution в этом этапе, если это мешает изолировать ownership.
- Не менять effect batches.
- Не оптимизировать reducer post-processing loops.

#### Тесты этапа

- Runtime test: ordinary unscoped single-bucket `TICK` reaction получает rows в прежнем порядке.
- Runtime test: routed event через `entityId` получает правильный owned scope после следующего routed batch.
- Runtime test: event, принимаемый из двух states одного actor, получает merged owned scope в прежнем порядке.
- Runtime test: lifecycle `ENTITY_SPAWNED` и `ENTITY_DESPAWNED` reactions получают корректный scope.
- Regression test: original event reaction не получает rows, удаленные через `despawnOn`.
- Internal test или targeted assertion: scheduling reaction batch не копирует stable borrowed array.

#### Критерий завершения

- Focused Vitest по reaction/lifecycle/routing scenarios проходит.
- `pnpm run check-types` проходит.
- Targeted coverage по измененным branches в `transaction.ts` и `reduce.ts` закрыт до `100%` для statements/branches/functions/lines, если модули остаются чистой runtime-логикой.

### Этап 3 — Fast reaction self, access и deps

#### Цель

Убрать `CapturedEntityScopeEntry[]`, `Map` и deps spread/delete из hot reaction path.

#### Зависит от

Этапы 1 и 2.

#### Контракт этапа

- `runReactionBatch` не должен строить `entries: CapturedEntityScopeEntry[]` для reaction hot path.
- `createScopedEntitySelf` должен быть разделен по scope mode или заменен отдельной reaction-specific функцией:
  - reaction mode использует scope marker и generation snapshot;
  - effect mode сохраняет captured entries.
- Перед вызовом reaction runtime должен capture generation для entity из current scope без создания объектов.
- `self.has(entity)` должен вернуть `false`, если:
  - entity не входит в current reaction scope;
  - generation изменилась после capture;
  - entity не live;
  - actor row отсутствует.
- `self.entityId(entity)` должен:
  - возвращать id для valid entity current scope;
  - бросать `LiteFsmError` для entity вне scope;
  - бросать или возвращать ошибку stale scope с сообщением, пригодным для debugging, если generation изменилась.
- Missing id или пустой id должен исключать row из reaction scope либо приводить к диагностируемой ошибке без per-row id capture.
- `entities().get(key)` и `maybe(key)` должны использовать cached root views и не строить scoped `entries` validation.
- Unknown template key должен по-прежнему бросать `LITE_FSM_INVALID_STORAGE_RUNTIME`.
- User deps normalization не должен выполнять spread и `delete` на каждый reaction batch.
- Runtime deps должны shadow reserved keys: `action`, `self`, `entities`, `transition`, `condition`.
- `transition` и `condition` не должны появляться как callable deps внутри reaction.
- Promise из reaction должен по-прежнему репортиться как sync-only error.
- Ошибка одной reaction не должна блокировать subscribers и не должна менять return value `manager.transition`.

#### Не делать в этом этапе

- Не менять public type aliases, если runtime contract можно сохранить существующими типами.
- Не вводить runtime `Object.freeze`, `Proxy` или защиту от мутации `self.indices`.
- Не переводить effect scope на marker arrays.
- Не менять порядок phases core pipeline.

#### Тесты этапа

- Runtime test: `self.has`, `self.entityId`, stale generation и missing presence сохраняют текущую семантику.
- Runtime test: `entities().get` возвращает cross-actor columns без full-scope eager scan и unknown key бросает ошибку.
- Runtime test: user deps с reserved keys не подменяют runtime `action`, `self`, `entities`.
- Runtime test: Promise из reaction репортится как sync-only error.
- Runtime test: reaction error идет в `onError`, subscribers видят committed reducer state.
- Runtime test: `self.indices.map`, `join`, `for...of` работают как с настоящим массивом.
- Type test запускать, если менялись `EntityReactionDeps`, `EntityReactionSelf` или reserved deps types.

#### Критерий завершения

- Focused Vitest по reaction semantics проходит.
- Coverage `reactions.ts`, `access.ts` и затронутых частей `transaction.ts` достигает `100%` statements/branches/functions/lines.
- `pnpm run check-types` проходит.
- `pnpm run lint` проходит.
- `git diff --check` проходит.

### Этап 4 — Benchmarks, docs и performance report

#### Цель

Обновить benchmark fixtures под новую модель и зафиксировать итог problem 2.

#### Зависит от

Этапы 1-3.

#### Контракт этапа

- `tests/bench/entities/diagnostics.fixture.mjs` должен измерять новую reaction scope модель:
  - без `indices.slice()` там, где production runtime использует borrowed;
  - без `entries[]` и `Map`;
  - с тем же user checksum и чтением cross-actor columns.
- `tests/bench/entities/composition-lite-fsm-entities.fixture.mjs` должен сохранять текущий public scenario `sprite sync reaction`.
- Benchmark record должен выполняться в production hot path.
- `packages/entities/README.md` должен коротко описывать:
  - `reactions` sync-only;
  - `self.indices` как readonly sync-only view;
  - запрет сохранять или мутировать `self`, `deps`, `entities()` view после вызова.
- `API-CHEATSHEET.md` и `TYPES-CHEATSHEET.md` должны отражать тот же контракт без changelog-формулировок.
- `packages/entities/PERFORMANCE.md` должен получить итог problem 2 с таблицей и ссылками на artifacts.
- Сравнение с `.bench/entities/after-despawn-cleanup.json` должно быть сохранено в Markdown.

#### Не делать в этом этапе

- Не запускать docs build.
- Не менять public exports.
- Не переписывать unrelated benchmark scenarios.
- Не обновлять исторический `despawn-cleanup-performance-spec.md`.

#### Тесты этапа

- `pnpm run bench:entities:record -- --runs 1 --label reaction-scope-smoke --include gate,diagnostics --row-counts 1000`.
- `pnpm run bench:entities:record -- --runs 5 --label after-reaction-scope --include gate,diagnostics`.
- `pnpm run bench:entities:compare -- .bench/entities/after-despawn-cleanup.json .bench/entities/after-reaction-scope.json`.
- Сохранить compare output в `.bench/entities/after-reaction-scope-vs-after-despawn-cleanup.md`.
- Если исходный baseline нужен для отчета, выполнить compare с `.bench/entities/codex-baseline-2026-06-14.json`.

#### Критерий завершения

- First performance gate достигнут или stage возвращен как `blocked` с evidence breakdown, который показывает внешний лимит вне problem 2.
- `sprite sync reaction / 50 000 / raw entity kernel` ниже `2ms`.
- `public manager.transition` добавляет к kernel не больше `0.3ms`.
- Соседние gate-сценарии без регрессии entity median больше `10%`.
- `packages/entities/PERFORMANCE.md`, `README.md`, `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md` обновлены как contract docs.

### Этап 5 — Рефакторинг, чистка и полировка

#### Цель

Закрыть качество интегрированного diff после behavior, docs и benchmark этапов.

#### Зависит от

Этапы 1-4.

#### Контракт этапа

##### Must fix

- Убрать временные helpers, transitional branches, debug logging, TODO/FIXME и dead code в области reaction scope.
- Удалить неиспользуемые imports, locals, types, feature flags и тестовые scaffolds.
- Убрать дублирование ownership, scope validation, deps normalization и access wrapping.
- Оставить одного владельца для каждого контракта:
  - reaction batch ownership;
  - scope marker/generation capture;
  - effect captured entries;
  - deps reserved-key normalization;
  - scoped access view lookup.
- Сделать код читаемым сверху вниз: validate source stability, choose ownership, schedule batch, capture scope, run reaction, cleanup scratch.
- Не оставлять abstractions или type aliases без второго места использования или явного снижения сложности.
- Comments/docs должны описывать финальный контракт, а не историю оптимизации.
- Проверить, что cleanup problem 1 contracts не изменились.

##### Inspect only

- Декоративные переименования без снижения сложности.
- Перенос кода между файлами без смены владельца ответственности.
- Оптимизация reducer-only path problem 3.
- Изменение effect scope.
- Изменение public docs вне `@lite-fsm/entities`.

##### Expected remaining hits

- `reaction-scope-performance-spec.md` и `reaction-scope-performance-spec-log.md`.
- Исторические упоминания problem 2 в `packages/entities/PERFORMANCE.md`.
- Benchmark docs, если они описывают diagnostics layer names.

#### Не делать в этом этапе

- Не добавлять новые public API.
- Не запускать forbidden docs build commands.
- Не менять benchmark artifacts без повторного record.
- Не смешивать cleanup с problem 3.

#### Тесты этапа

- Focused runtime regressions по reaction scope.
- Coverage gate для `reactions.ts`, `access.ts`, `transaction.ts` и `reduce.ts`, если они менялись на этапе.
- `pnpm run test:types`, если менялись types или cheatsheets.
- `pnpm run check-types`.
- `pnpm run lint`.
- `git diff --check`.
- Source audit по stale identifiers:
  - `rg -n "entriesByEntity|collectReactionScopeEntries|indices\\.slice\\(\\)|CapturedEntityScopeEntry" packages/entities/src tests/bench/entities tests/entities`
  - оставшиеся hits должны быть effect scope, исторические docs/specs или явно допустимые tests.

#### Критерий завершения

- Cleanup/refactor diff не меняет public API и performance contract.
- Runtime behavior tests и type checks проходят.
- Coverage по затронутой чистой runtime-логике соответствует `100%`.
- Source audit не показывает stale production reaction-scope hits.
- Журнал реализации обновлен с финальным состоянием этапа и остаточными рисками.

## 6. Критерий полной готовности

- Все этапы имеют статус `done` в `reaction-scope-performance-spec-log.md`.
- Public exports `packages/entities/src/index.ts` и package surface не получили новых API.
- Runtime tests покрывают:
  - borrowed и owned reaction batches;
  - lifecycle reactions;
  - routed events;
  - merged state buckets;
  - stale generation;
  - missing presence;
  - reserved deps keys;
  - Promise error semantics;
  - cleanup exclusion для rows, удаленных через `despawnOn`.
- Type tests проходят, если менялись public types или cheatsheets.
- `pnpm run check-types` проходит.
- `pnpm run lint` проходит.
- `pnpm run build:packages` проходит и не запускает docs build.
- `git diff --check` проходит.
- Benchmark artifacts сохранены:
  - `.bench/entities/after-reaction-scope.json`;
  - `.bench/entities/after-reaction-scope.md`;
  - `.bench/entities/after-reaction-scope-vs-after-despawn-cleanup.md`.
- `sprite sync reaction / 50 000 / raw entity kernel` ниже `2ms`.
- Public `sprite sync reaction / 50 000` добавляет к kernel не больше `0.3ms`.
- Соседние gate-сценарии не имеют регрессии entity median больше `10%`.
- `packages/entities/PERFORMANCE.md` содержит итог problem 2 и ссылки на artifacts.
- `README.md`, `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md` описывают sync-only `reaction` contract без changelog-формулировок.
- Forbidden docs build commands не запускались.
- Если first performance gate не достигнут, журнал фиксирует `blocked` только после evidence breakdown, который показывает, что оставшаяся цена относится к problem 3 или core overhead, а не к reaction scope.
