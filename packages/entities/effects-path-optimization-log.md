# Журнал оптимизации effects path

Цель: итеративно оптимизировать слои `@lite-fsm/core` и `@lite-fsm/entities`, связанные с entity `effects`, для `unit frame composition` benchmark. По возможности не менять публичный API и не расширять публичную поверхность. Пакет находится в тестах, поэтому обратная совместимость не является отдельным ограничением.

Источник baseline: [`PERFORMANCE.md`, раздел `Итог unit composition benchmark`](./PERFORMANCE.md#итог-unit-composition-benchmark).

## Рабочий цикл

1. Перед продолжением читать этот журнал и актуальный `PERFORMANCE.md`.
2. Выбирать узкую гипотезу по `gate` и `trace`.
3. Вносить минимальное изменение в hot path.
4. Запускать один benchmark record и compare:

   ```bash
   pnpm run bench:entities:record -- --runs 3 --label <short-name> --include gate,trace --row-counts 50000
   pnpm run bench:entities:compare -- .bench/entities/unit-composition-baseline.json .bench/entities/<short-name>.json
   ```

5. Записать результат: что изменилось, целевые цифры, регрессии соседних сценариев больше `10%`, следующий шаг.

Запрещенные команды из `AGENTS.md` не запускать: `pnpm run build`, docs/pages builds и любой `next build` внутри `apps/docs`.

## Важные ссылки

- [`packages/entities/PERFORMANCE.md`](./PERFORMANCE.md) — текущие benchmark итоги и порядок работ.
- [`packages/entities/src/runtime/storage.ts`](./src/runtime/storage.ts) — storage runtime и entrypoint `effects.resolve`/`effects.invoke`.
- [`packages/entities/src/runtime/effects.ts`](./src/runtime/effects.ts) — resolve/invoke entity effect batches.
- [`packages/entities/src/runtime/transaction.ts`](./src/runtime/transaction.ts) — transaction scratch и `effectBatches`.
- [`packages/entities/src/runtime/access.ts`](./src/runtime/access.ts) — scoped `self`, `entities()` и public store views.
- [`packages/entities/src/runtime/reduce.ts`](./src/runtime/reduce.ts) — scheduling entered-state effects.
- [`packages/entities/src/runtime/reactions.ts`](./src/runtime/reactions.ts) — близкий scoped path для сравнения с reaction optimizations.
- [`packages/core/src/runtime/kernel/bucketRuntime.ts`](../core/src/runtime/kernel/bucketRuntime.ts) — core bucket effects pipeline.
- [`packages/core/src/runtime/kernel/createMachineManagerFactory.ts`](../core/src/runtime/kernel/createMachineManagerFactory.ts) — top-level transition pipeline.
- [`tests/bench/entities/composition-lite-fsm-entities.fixture.mjs`](../../tests/bench/entities/composition-lite-fsm-entities.fixture.mjs) — public gate scenarios, включая `unit frame composition`.
- [`tests/bench/entities/trace.fixture.mjs`](../../tests/bench/entities/trace.fixture.mjs) — trace aggregation для benchmark.

## Baseline

Команда:

```bash
pnpm run bench:entities:record -- --runs 3 --label unit-composition-baseline --include gate,trace --row-counts 50000
```

Gate `50 000`:

| Сценарий | SoA median | entities median | Ratio | Бюджет | Статус | RSD |
| --- | ---: | ---: | ---: | ---: | --- | ---: |
| `movement update` | 0.236ms | 0.285ms | 1.21x | 1.50x | pass | 3.8% |
| `projectile lifetime update` | 0.180ms | 0.218ms | 1.22x | 1.50x | fail | 49.5% |
| `despawnOn cleanup` | 0.277ms | 0.421ms | 1.51x | 2.00x | fail | 2.6% |
| `unit frame composition` | 1.121ms | 10.269ms | 9.26x | 2.00x | fail | 6.7% |

Trace `unit frame composition / 50 000`:

| Фаза | Median | Share |
| --- | ---: | ---: |
| `core.effects.total` | 6.406ms | 61.7% |
| `core.rootReducer` | 3.210ms | 31.1% |
| `core.reactions.total` | 0.682ms | 6.5% |
| `entities.effects.resolve` | 2.046ms | 99.9% от parent |
| `entities.effects.invoke` | 4.300ms | 99.8% от parent |
| `entities.reduce.publicBatch.total` | 2.957ms | 93.1% от `entities.reduce.total` |
| `entities.reactions.user` | 0.620ms | 91.6% от `entities.reactions.total` |

## Текущий указатель

- Текущая принятая точка: `after-single-state-transition-fast-path`.
- Текущий лучший gate `unit frame composition / 50 000`: `5.174ms`, ratio `4.51x` против бюджета `2.00x`.
- Улучшение относительно baseline: `10.269ms -> 5.174ms`, `-49.6%`; ratio `9.26x -> 4.51x`.
- Основные оставшиеся слои по trace: `entities.reduce.publicBatch.total` `3.528ms`, где `postProcess` `1.565ms` и `updateStateBuckets` `0.446ms`; `core.effects.total` `1.319ms`, почти полностью `entities.effects.invoke` `1.311ms`; `entities.reactions.user` `0.608ms`.
- Последняя проверка effects path: `after-sync-effect-fast-path`. Принятая точка не меняется; sync-classified fast path ухудшил target gate и `entities.effects.invoke`.
- Rejected подходы не повторять без новой атрибуции: broad parallel snapshot для scope, микрооптимизация dev validation без gate signal, cache liveness validation внутри scoped access, bulk move для полного state bucket без target gate signal, замена `enteredByState` Map на single-state структуру без target gate signal, lazy getter для effect `transition`, known-target `postProcess` fast path с preallocated `dirtyRows` и direct target effect capture, known-target direct capture при сохранении packed `dirtyRows`, sync-classified entity effects через marker/lifetime scope.
- Статус: `in progress`.
- Следующее действие: не продолжать effects-only микрооптимизации и двойной режим effects без новой subphase attribution. Для снижения общего цикла ниже текущего уровня нужна гипотеза по reducer/reaction total или явное изменение контракта benchmark/runtime.

## Ход работы

### 2026-06-15 — Старт цикла

- `git status --short`: clean.
- Прочитан `PERFORMANCE.md#Итог unit composition benchmark`.
- Создан этот журнал, чтобы переживать сбросы контекста и отделить effects path от старого журнала reduce/reactions.
- Вывод: первый фокус — `entities.effects.resolve` и `entities.effects.invoke`, потому что они вместе дают около `6.346ms` из `10.465ms` trace total в `unit frame composition`.
- Следующее действие: изучить `effects.ts`, `storage.ts`, `transaction.ts`, `access.ts`, core bucket effects pipeline и benchmark fixture.

### 2026-06-15 — Цикл 1: убрать лишние копии и eager `Map` в effect scope

- Гипотеза: текущий effects path делает лишнюю работу до пользовательского callback: `scheduleEntityEffectBatch` копирует `indices`, `resolveEntityEffectInvocations` после захвата `entries` делает `entries.map(...)`, а `createScopedEntitySelf` всегда строит `Map` на весь scope, даже если effect использует только `self.indices` и колонки.
- План правки: использовать уже owned arrays из `enteredByState` без `slice`, в resolve переиспользовать full `batch.indices`, если все rows прошли validation, и строить `Map` для effect `self.has`/`self.entityId` лениво. Заодно заменить spread deps в `invokeEntityEffect` на `Object.create(ctx.manager.getDependencies())`, как в reaction path.
- Ожидаемый эффект: снизить `entities.effects.invoke` за счет отсутствия eager `Map` на `50 000` rows и немного снизить `entities.effects.resolve`/reduce scheduling за счет удаления лишних копий.
- Изменено: `access.ts` лениво строит `entriesByEntity` для effect `self`; `effects.ts` избегает `entries.map(...)` и использует prototype deps; `transaction.ts` больше не делает `indices.slice()` для effect batches; test helper покрывает compact resolve path.
- Проверки: `pnpm exec vitest run tests/entities/entities-plugin.test.ts --coverage --coverage.include=packages/entities/src/runtime/access.ts --coverage.include=packages/entities/src/runtime/effects.ts --coverage.include=packages/entities/src/runtime/transaction.ts --coverage.reporter=text` — pass, coverage `100%`; `pnpm run check-types` — pass; `pnpm run lint` — pass; `git diff --check` — pass.
- Benchmark: `pnpm run bench:entities:record -- --runs 3 --label after-effect-scope-copies --include gate,trace --row-counts 50000`; compare с `.bench/entities/unit-composition-baseline.json`.
- Gate относительно `unit-composition-baseline`: `unit frame composition / 50 000` `10.269ms -> 8.231ms`, `-2.038ms`, `-19.8%`; ratio `9.26x -> 7.41x`; RSD `8.5%`. Соседние entity medians без регрессий выше `10%`: `movement` `+3.5%`, `projectile` `+0.5%`, `despawnOn cleanup` `+2.0%`.
- Trace `unit frame composition / 50 000`: `core.effects.total` `6.406ms -> 3.722ms`, `-41.9%`; `entities.effects.invoke` `4.300ms -> 1.362ms`, `-68.3%`; `entities.effects.resolve` `2.046ms -> 2.300ms`, `+12.5%`; `entities.reduce.publicBatch.scheduleEffects` `0.047ms -> 0.003ms`, `-92.8%`; `core.transition.total` `10.465ms -> 7.903ms`, `-24.5%`.
- Итог: гипотеза подтверждена для invoke и scheduling; правку оставить. Budget не достигнут: `unit frame composition` остается `7.41x` против `2.00x`. Новый главный effects bottleneck — `entities.effects.resolve` `2.300ms`; `entities.effects.invoke` теперь в основном пользовательский effect loop и scoped access overhead.
- Следующее действие: оптимизировать captured effect scope в resolve. Кандидат — заменить object-per-row `CapturedEntityScopeEntry[]` на более дешевое snapshot-представление с ленивым materialize для `transition.despawn`/dev diagnostics/`entityId`, сохранив async effect semantics.

### 2026-06-15 — Цикл 2: parallel snapshot для effect scope

- Гипотеза: `entities.effects.resolve` доминирует после цикла 1, потому что на каждый `50 000` batch создает `CapturedEntityScopeEntry` object для каждой строки. Для async semantics достаточно сохранить параллельные arrays `indices`, `generations`, `ids`; object entries нужны только редким путям `transition.despawn(self.indices)` и diagnostics.
- План правки: изменить private `EntityAccessScope` на snapshot arrays, переписать `createScopedEntitySelf`, scoped access validation и effect despawn на чтение snapshot по offset. Public API/types не менять.
- Проверки до benchmark: focused coverage по `access.ts`, `effects.ts`, `transaction.ts` — pass `100%`; `pnpm run check-types` — pass; `pnpm run lint` — pass; `git diff --check` — pass.
- Benchmark: `pnpm run bench:entities:record -- --runs 3 --label after-effect-scope-snapshot --include gate,trace --row-counts 50000`; compare с `unit-composition-baseline` и `after-effect-scope-copies`.
- Incremental относительно `after-effect-scope-copies`: gate `unit frame composition / 50 000` `8.231ms -> 8.242ms`, `+0.1%`; `core.effects.total` `3.722ms -> 4.209ms`, `+13.1%`; `entities.effects.resolve` `2.300ms -> 2.376ms`, `+3.3%`; `entities.effects.invoke` `1.362ms -> 1.857ms`, `+36.3%`.
- Соседний gate regression: `movement update / 50 000` `0.295ms -> 0.614ms`, `+108.5%`, trace `core.rootReducer` also high. Это не связано очевидно с effects path, но artifact не проходит acceptance rule.
- Решение: cycle 2 rejected и code/test changes reverted. Причина: нет целевого улучшения относительно cycle 1, есть >10% соседняя регрессия в record, а `resolve` не снизился.
- Следующее действие: не продолжать parallel snapshot без дополнительной атрибуции. Более перспективный путь — уменьшить работу resolve через trusted/versioned fast path или добавить subphase trace для resolve, чтобы отделить validation, id/generation capture и allocation.

### 2026-06-15 — Цикл 3: локальные refs в effects resolve

- Гипотеза: после cycle 1 `entities.effects.resolve` тратит существенное время в полном проходе по `50 000` rows. Без изменения semantics можно убрать часть overhead, локализовав `store`/`entityStore` arrays и constants внутри batch loop, чтобы hot loop не читал свойства через цепочки объектов на каждой строке.
- План правки: в `resolveEntityEffectInvocations` вынести `indices`, `presence`, `stateCode`, `alive`, `ids`, `generation`, `expectedStateCode`; в `liveCapturedEntries` вынести `alive`/`generation`. Public API/types не менять.
- Изменено: `effects.ts` использует локальные refs в `resolveEntityEffectInvocations` и `liveCapturedEntries`; rejected changes из cycle 2 не сохранены.
- Проверки: focused coverage по `access.ts`, `effects.ts`, `transaction.ts` — pass `100%`; `pnpm run check-types` — pass; `pnpm run lint` — pass; `git diff --check` — pass.
- Benchmark: `pnpm run bench:entities:record -- --runs 3 --label after-effect-resolve-local-refs --include gate,trace --row-counts 50000`; compare с `unit-composition-baseline` и `after-effect-scope-copies`.
- Gate относительно `unit-composition-baseline`: `unit frame composition / 50 000` `10.269ms -> 7.475ms`, `-27.2%`; ratio `9.26x -> 6.26x`; RSD `5.7%`. Соседние entity medians без регрессий выше `10%`: `movement` `+0.5%`, `projectile` `+0.8%`, `despawnOn cleanup` `+1.9%`.
- Incremental относительно `after-effect-scope-copies`: `unit frame composition / 50 000` `8.231ms -> 7.475ms`, `-9.2%`; ratio `7.41x -> 6.26x`; соседние entity medians: `movement` `-2.9%`, `projectile` `+0.3%`, `despawnOn cleanup` `-0.1%`.
- Trace относительно `after-effect-scope-copies`: `entities.effects.resolve` `2.300ms -> 1.853ms`, `-19.5%`; `entities.effects.invoke` `1.362ms -> 1.320ms`, `-3.1%`; `core.effects.total` `3.722ms -> 3.261ms`, `-12.4%`; `core.transition.total` `7.903ms -> 7.579ms`, `-4.1%`.
- Итог: cycle 3 accepted. Budget не достигнут: `unit frame composition` остается `6.26x` против `2.00x`. Основные оставшиеся слои: `entities.reduce.publicBatch.total` `3.051ms`, `entities.effects.resolve` `1.853ms`, `entities.effects.invoke` `1.320ms`, `entities.reactions.user` `0.603ms`.
- Следующее действие: не возвращаться к parallel snapshot без subphase evidence. После cycle 4 кандидат — перенести scheduled capture в уже существующий `postProcessAcceptedRows` loop, чтобы сохранить быстрый `effects.resolve`, но убрать отдельный `scheduleEffects` loop.

### 2026-06-15 — Цикл 4: versioned scheduled capture для effect batches

- Гипотеза: `entities.effects.resolve` после cycle 3 повторно проходит по строкам, которые уже были приняты в reduce и schedule. Можно захватывать `CapturedEntityScopeEntry[]` при `scheduleEntityEffectBatch`, записывать `store.version` и `entityStore.version`, а в resolve использовать этот snapshot только если версии не изменились. Если subscribers или middleware сделали nested transition до effects, версии изменятся и resolve останется на старом validating path.
- План правки: добавить private поля `capturedEntries`, `storeVersion`, `entityStoreVersion` в `EntityEffectBatch`; в `scheduleEntityEffectBatch` собрать entries из `ids/generation`; в `resolveEntityEffectInvocations` добавить fast path по совпавшим версиям. Public API/types не менять.
- Изменено: `transaction.ts` захватывает entries и версии при scheduling; `effects.ts` использует scheduled entries при совпавших версиях; тест helper проверяет fast path по reference equality, fallback при version mismatch и defensive missing id path.
- Проверки: focused coverage по `access.ts`, `effects.ts`, `transaction.ts` — pass `100%`; `pnpm run check-types` — pass; `pnpm run lint` — pass; `git diff --check` — pass; `pnpm run build:packages` — pass. `bench:entities:record` дополнительно пересобрал `@lite-fsm/core` и `@lite-fsm/entities`.
- Benchmark: `pnpm run bench:entities:record -- --runs 3 --label after-effect-schedule-capture --include gate,trace --row-counts 50000`; compare с `unit-composition-baseline` и `after-effect-resolve-local-refs`.
- Gate относительно `after-effect-resolve-local-refs`: `unit frame composition / 50 000` `7.475ms -> 6.603ms`, `-11.7%`; ratio `6.26x -> 5.71x`; RSD `4.4%`. Соседние entity medians без регрессий выше `10%`: `movement` `+0.6%`, `projectile` `-2.0%`, `despawnOn cleanup` `+1.5%`. `projectile` status снова fail из-за шумного baseline/RSD, но entity median не регрессировал.
- Trace относительно `after-effect-resolve-local-refs`: `entities.effects.resolve` `1.853ms -> 0.001ms`, `-99.9%`; `entities.effects.invoke` `1.320ms -> 1.315ms`, `-0.3%`; `core.effects.total` `3.261ms -> 1.325ms`, `-59.4%`; `core.transition.total` `7.579ms -> 6.746ms`, `-11.0%`.
- Цена правки: work сместился в reduce scheduling. `entities.reduce.publicBatch.scheduleEffects` `0.003ms -> 0.987ms`; `entities.reduce.publicBatch.total` `3.051ms -> 4.395ms`; `core.rootReducer` `3.495ms -> 4.662ms`. Это объяснимо: capture сейчас отдельным проходом после post-process.
- Gate относительно `unit-composition-baseline`: `unit frame composition / 50 000` `10.269ms -> 6.603ms`, `-35.7%`; ratio `9.26x -> 5.71x`. `core.effects.total` `6.406ms -> 1.325ms`, `-79.3%`; `entities.effects.resolve` `2.046ms -> 0.001ms`.
- Итог: cycle 4 accepted как целевое улучшение без >10% регрессии соседних entity medians. Budget не достигнут: `unit frame composition` остается `5.71x` против `2.00x`.
- Следующее действие: после cycle 5 основной кандидат — снизить цену object capture в `postProcessAcceptedRows`, не возвращая отдельный `scheduleEffects` loop.

### 2026-06-15 — Цикл 5: перенести scheduled capture в post-process

- Гипотеза: cycle 4 сделал `effects.resolve` почти бесплатным, но добавил отдельный полный проход в `scheduleEntityEffectBatch`. Если собирать `indices` и `CapturedEntityScopeEntry[]` в `postProcessAcceptedRows`, где строка уже проходит dirty/effect decision, можно сохранить fast path resolve и вернуть часть `rootReducer`.
- План правки: оставить private поля `capturedEntries`/versions у `EntityEffectBatch`, но сделать `scheduleEntityEffectBatch` только переносчиком готового snapshot. В `postProcessAcceptedRows` заменить `enteredByState: state -> indices[]` на `state -> { indices, entries }`, где `entries` собираются рядом с `indices`.
- Изменено: `reduce.ts` собирает `EnteredEffectRows` с `indices` и `entries`; `scheduleEnteredStateEffects` передает entries в `scheduleEntityEffectBatch`; `transaction.ts` больше не проходит по `indices`; helper test вызывает `scheduleEntityEffectBatch(..., capturedEntries)` для fast path.
- Проверки: `pnpm exec vitest run tests/entities --coverage --coverage.include=packages/entities/src/runtime/access.ts --coverage.include=packages/entities/src/runtime/effects.ts --coverage.include=packages/entities/src/runtime/transaction.ts --coverage.include=packages/entities/src/runtime/reduce.ts --coverage.reporter=text` — pass, coverage `100%`; `pnpm run check-types` — pass; `pnpm run lint` — pass; `git diff --check` — pass.
- Benchmark: `pnpm run bench:entities:record -- --runs 3 --label after-effect-postprocess-capture --include gate,trace --row-counts 50000`; compare с `after-effect-schedule-capture` и `unit-composition-baseline`.
- Gate относительно `after-effect-schedule-capture`: `unit frame composition / 50 000` `6.603ms -> 6.439ms`, `-2.5%`; ratio `5.71x -> 5.12x`; RSD `2.2%`. Соседние entity medians без регрессий выше `10%`: `movement` `+1.7%`, `projectile` `+1.8%`, `despawnOn cleanup` `-0.1%`.
- Trace относительно `after-effect-schedule-capture`: `entities.reduce.publicBatch.scheduleEffects` `0.987ms -> 0.003ms`, `-99.7%`; `entities.reduce.publicBatch.postProcess` `1.299ms -> 1.829ms`, `+40.9%`; `entities.reduce.publicBatch.total` `4.395ms -> 3.978ms`, `-9.5%`; `core.rootReducer` `4.662ms -> 4.235ms`, `-9.2%`; `core.effects.total` `1.325ms -> 1.377ms`, `+4.0%`; `core.transition.total` `6.746ms -> 6.319ms`, `-6.3%`.
- Gate относительно `unit-composition-baseline`: `unit frame composition / 50 000` `10.269ms -> 6.439ms`, `-37.3%`; ratio `9.26x -> 5.12x`. Соседние entity medians относительно baseline: `movement` `+2.8%`, `projectile` `+0.6%`, `despawnOn cleanup` `+3.4%`.
- Итог: cycle 5 accepted. Улучшение меньше 10% по entity median относительно cycle 4, но подтверждает перенос цены из `scheduleEffects` в общий `postProcess` и снижает total trace. Budget не достигнут: `unit frame composition` остается `5.12x` против `2.00x`.
- Следующее действие: оптимизировать object capture в `postProcessAcceptedRows` или dev validation в `invoke`. Текущие главные слои: `entities.reduce.publicBatch.total` `3.978ms` (`postProcess` `1.829ms`), `entities.effects.invoke` `1.368ms`, `entities.reactions.user` `0.599ms`. Не повторять broad parallel snapshot из cycle 2 без более узкой реализации и benchmark-защиты.

### 2026-06-15 — Цикл 6: local refs в scoped access validation

- Гипотеза: `entities.effects.invoke` в dev benchmark тратит часть времени на `validateRequiredScopedAccess` при `entities().get(...)`. Можно оставить semantics без memoization и снизить overhead, локализовав `alive`, `generation`, `presence` и перейдя на индексный loop вместо `capturedEntityScopeEntryIsLive(...)` на каждую строку.
- План правки: изменить только `access.ts`, без public API/types. Memoization специально не использовать: effect может вызвать `transition()` между двумя `entities().get(...)`, и повторная validation должна видеть stale scope.
- Проверки до benchmark: `pnpm exec vitest run tests/entities --coverage --coverage.include=packages/entities/src/runtime/access.ts --coverage.include=packages/entities/src/runtime/effects.ts --coverage.include=packages/entities/src/runtime/transaction.ts --coverage.include=packages/entities/src/runtime/reduce.ts --coverage.reporter=text` — pass, coverage `100%`; `pnpm run check-types` — pass; `pnpm run lint` — pass; `git diff --check` — pass.
- Benchmark: `pnpm run bench:entities:record -- --runs 3 --label after-effect-access-validation-local-refs --include gate,trace --row-counts 50000`; compare с `after-effect-postprocess-capture`.
- Gate относительно `after-effect-postprocess-capture`: `unit frame composition / 50 000` `6.439ms -> 6.479ms`, `+0.6%`; ratio `5.12x -> 5.19x`. Соседние entity medians без регрессий выше `10%`: `movement` `+2.3%`, `projectile` `-1.3%`, `despawnOn cleanup` `-1.1%`.
- Trace относительно `after-effect-postprocess-capture`: `entities.effects.invoke` `1.368ms -> 1.317ms`, `-3.8%`; `core.effects.total` `1.377ms -> 1.326ms`, `-3.7%`; `core.transition.total` `6.319ms -> 6.191ms`, `-2.0%`. `entities.reduce.publicBatch.total` также слегка снизился `3.978ms -> 3.935ms`, но это не от целевой правки и укладывается в шум.
- Решение: cycle 6 rejected и code change reverted. Причина: target gate median не улучшился, несмотря на trace improvement. Benchmark artifact оставить для истории: `.bench/entities/after-effect-access-validation-local-refs.json`.
- Следующее действие: не продолжать микрооптимизацию dev validation без gate signal. Возвращаемся к cycle 5 baseline; следующий полезный кандидат должен снижать `postProcess` capture allocation или менять representation точечно, с защитой от повторения rejected cycle 2.

### 2026-06-15 — Цикл 7: alias dirty rows для effect indices

- Гипотеза: в общем случае `unit frame composition` каждая accepted row входит в один effect state, но `postProcessAcceptedRows` после cycle 5 дублирует `dirtyRows` в отдельный `indices[]` для effect batch. Можно переиспользовать `dirtyRows` как `EnteredEffectRows.indices` для первого effect state, а для смешанных state или dirty rows без effect state компактно восстановить indices из captured entries перед scheduling.
- План правки: в `appendEnteredEffectRow` передавать `dirtyRows`, первый effect state alias-ит `indices` на owned `dirtyRows`, последующие states получают собственный массив. Перед `scheduleEntityEffectBatch` вызывать `getEnteredEffectIndices`, который возвращает alias без копии или строит компактный indices array, если `dirtyRows` содержит rows без effect state.
- Изменено: `reduce.ts` убирает лишнее копирование effect indices в common path; тест `effect self.indices не включает dirty rows без effect state` проверяет mixed roles и исключение accepted row без effect state из scope.
- Проверки: `pnpm exec vitest run tests/entities --coverage --coverage.include=packages/entities/src/runtime/access.ts --coverage.include=packages/entities/src/runtime/effects.ts --coverage.include=packages/entities/src/runtime/transaction.ts --coverage.include=packages/entities/src/runtime/reduce.ts --coverage.reporter=text` — pass, coverage `100%`; `pnpm run check-types` — pass; `pnpm run lint` — pass; `git diff --check` — pass.
- Benchmark: `pnpm run bench:entities:record -- --runs 3 --label after-effect-dirty-effect-index-alias --include gate,trace --row-counts 50000`; compare с `after-effect-postprocess-capture` и `unit-composition-baseline`.
- Gate относительно `after-effect-postprocess-capture`: `unit frame composition / 50 000` `6.439ms -> 6.122ms`, `-4.9%`; entity median улучшился, но ratio `5.12x -> 5.42x`, потому что SoA median в новом record быстрее `1.290ms -> 1.223ms`. Соседние entity medians без регрессий выше `10%`: `movement` `-0.5%`, `projectile` `-0.4%`, `despawnOn cleanup` `-0.0%`.
- Trace относительно `after-effect-postprocess-capture`: `core.transition.total` `6.319ms -> 6.067ms`, `-4.0%`; `core.rootReducer` `4.235ms -> 3.988ms`, `-5.8%`; `entities.reduce.publicBatch.total` `3.978ms -> 3.739ms`, `-6.0%`; `entities.reduce.publicBatch.postProcess` `1.829ms -> 1.605ms`, `-12.3%`; `core.effects.total` `1.377ms -> 1.364ms`, `-0.9%`; `entities.effects.invoke` `1.368ms -> 1.355ms`, `-1.0%`.
- Gate относительно `unit-composition-baseline`: `unit frame composition / 50 000` `10.269ms -> 6.122ms`, `-40.4%`; ratio `9.26x -> 5.42x`. Соседние entity medians относительно baseline: `movement` `+2.3%`, `projectile` `+0.2%`, `despawnOn cleanup` `+3.4%`.
- Итог: cycle 7 accepted. Несмотря на ratio noise, target entity median и trace total стали лучшими текущими значениями, соседних entity regression нет. Budget не достигнут: `unit frame composition` остается около `5.42x` против `2.00x`.
- Следующее действие: искать следующий узкий выигрыш в оставшихся слоях `postProcess`/`invoke`. Текущие главные слои: `entities.reduce.publicBatch.total` `3.739ms` (`postProcess` `1.605ms`), `entities.effects.invoke` `1.355ms`, `entities.reactions.user` `0.637ms`. Нельзя повторять rejected broad snapshot из cycle 2; нужен более локальный representation или сокращение работы в hot loop.

### 2026-06-15 — Цикл 8: alias единственного непустого accept state bucket

- Гипотеза: `unit frame composition` имеет `healthActor` с несколькими accepting states для `TICK`, но в каждый transition непустой только один state bucket. `collectUnscopedBatch` раньше из-за нескольких возможных buckets копировал `50 000` rows в `acceptedScratch`, хотя можно вернуть сам единственный непустой bucket. Это upstream effects path: лишняя копия feeding accepted batch, reducer и effect scheduling.
- План правки: изменить только `routing.ts`. Для multi-bucket event пройти buckets, вернуть единственный непустой bucket без копии, а `acceptedScratch` создавать только при втором непустом bucket. Public API/types не менять.
- Изменено: `collectUnscopedBatch` лениво заполняет `acceptedScratch`; тест `unscoped event переиспользует единственный непустой state bucket` проверяет alias, существующий multi-bucket тест расширен до трех непустых buckets, чтобы покрыть append после уже созданного scratch.
- Проверки: `pnpm exec vitest run tests/entities --coverage --coverage.include=packages/entities/src/runtime/access.ts --coverage.include=packages/entities/src/runtime/effects.ts --coverage.include=packages/entities/src/runtime/transaction.ts --coverage.include=packages/entities/src/runtime/reduce.ts --coverage.include=packages/entities/src/runtime/routing.ts --coverage.reporter=text` — pass, coverage `100%`; `pnpm run check-types` — pass; `pnpm run lint` — pass; `git diff --check` — pass.
- Benchmark: `pnpm run bench:entities:record -- --runs 3 --label after-routing-single-bucket-alias --include gate,trace --row-counts 50000`; compare с `after-effect-dirty-effect-index-alias` и `unit-composition-baseline`.
- Gate относительно `after-effect-dirty-effect-index-alias`: `unit frame composition / 50 000` `6.122ms -> 6.056ms`, `-1.1%`; ratio `5.42x -> 5.03x`. Соседние entity medians без регрессий выше `10%`: `movement` `+0.9%`, `projectile` `+0.9%`, `despawnOn cleanup` `-1.0%`.
- Trace относительно `after-effect-dirty-effect-index-alias`: `entities.reduce.collectPublicBatches` `0.218ms -> 0.002ms`, `-99.1%`; `entities.reduce.total` `3.980ms -> 3.783ms`, `-5.0%`; `core.rootReducer` `3.988ms -> 3.792ms`, `-4.9%`; `core.transition.total` `6.067ms -> 5.954ms`, `-1.9%`. Часть цены сместилась в шум/прочие фазы: `entities.reduce.publicBatch.total` `3.739ms -> 3.772ms`, `+0.9%`; `entities.effects.invoke` `1.355ms -> 1.402ms`, `+3.5%`; `entities.reactions.user` `0.637ms -> 0.645ms`, `+1.2%`.
- Gate относительно `unit-composition-baseline`: `unit frame composition / 50 000` `10.269ms -> 6.056ms`, `-41.0%`; ratio `9.26x -> 5.03x`. Соседние entity medians относительно baseline: `movement` `+3.2%`, `projectile` `+1.1%`, `despawnOn cleanup` `+2.3%`.
- Итог: cycle 8 accepted. Выигрыш небольшой по gate, но правка убирает подтвержденную `0.216ms` копию в target trace и не дает соседних entity regression. Budget не достигнут: `unit frame composition` остается `5.03x` против `2.00x`.
- Следующее действие: после routing-копии главный actionable слой снова `entities.reduce.publicBatch.total` `3.772ms` (`postProcess` около `1.644ms`, `updateStateBuckets` около `0.458ms`) и `entities.effects.invoke` `1.402ms`. Следующая гипотеза должна уменьшать работу `postProcessAcceptedRows` или effect invoke без дополнительной аллокации scope и без изменения public API.

### 2026-06-15 — Цикл 9: single-state default transition fast path

- Гипотеза: после cycle 8 `healthActor` чаще приходит в reduce как настоящий single state bucket. `applyDefaultTransitions` все еще делает `resolveTransitionTarget` для каждой row, хотя source bucket и target cell можно вычислить один раз. После этого `postProcessAcceptedRows` валидирует тот же скомпилированный target state на каждой row. Можно сохранить diagnostics, но убрать per-row table lookup и большую часть validation.
- План правки: для accepted batch, который является `store.stateBuckets[sourceCode]`, вычислять `targetCode` один раз. Для non-identity target одним циклом записывать `prevStateCode` и `stateCode`, проверяя, что row все еще находится в source state. В `postProcessAcceptedRows` передать `knownValidStateCodeForAccepted`, чтобы не вызывать `assertValidStateCode` для source/target codes, уже проверенных compile-time transition table. Routed scratch и multi-bucket scratch остаются на старом fallback.
- Изменено: `reduce.ts` добавляет `applySingleStateDefaultTransitions`, `knownValidStateCodeForAccepted` и source-state diagnostic в fast path; тесты покрывают invalid public `TICK -> MISSING` в новой fast path и сохраняют invalid source state diagnostic.
- Проверки: `pnpm exec vitest run tests/entities --coverage --coverage.include=packages/entities/src/runtime/access.ts --coverage.include=packages/entities/src/runtime/effects.ts --coverage.include=packages/entities/src/runtime/transaction.ts --coverage.include=packages/entities/src/runtime/reduce.ts --coverage.include=packages/entities/src/runtime/routing.ts --coverage.reporter=text` — pass, coverage `100%`; `pnpm run check-types` — pass; `pnpm run lint` — pass; `git diff --check` — pass.
- Benchmark: `pnpm run bench:entities:record -- --runs 3 --label after-single-state-transition-fast-path --include gate,trace --row-counts 50000`; compare с `after-routing-single-bucket-alias` и `unit-composition-baseline`.
- Gate относительно `after-routing-single-bucket-alias`: `unit frame composition / 50 000` `6.056ms -> 5.174ms`, `-14.6%`; ratio `5.03x -> 4.51x`, `-10.3%`. Соседние entity medians без регрессий: `movement` `-1.1%`, `projectile` `-1.2%`, `despawnOn cleanup` `-1.4%`.
- Trace относительно `after-routing-single-bucket-alias`: `entities.reduce.publicBatch.defaultTransitions` `0.278ms -> 0.083ms`, `-70.2%`; `entities.reduce.publicBatch.postProcess` `1.644ms -> 1.565ms`, `-4.8%`; `entities.reduce.publicBatch.total` `3.772ms -> 3.528ms`, `-6.5%`; `core.rootReducer` `3.792ms -> 3.546ms`, `-6.5%`; `core.effects.total` `1.412ms -> 1.319ms`, `-6.5%`; `entities.effects.invoke` `1.402ms -> 1.311ms`, `-6.5%`; `entities.reactions.user` `0.645ms -> 0.608ms`, `-5.7%`; `core.transition.total` `5.954ms -> 5.576ms`, `-6.4%`.
- Gate относительно `unit-composition-baseline`: `unit frame composition / 50 000` `10.269ms -> 5.174ms`, `-49.6%`; ratio `9.26x -> 4.51x`. Соседние entity medians относительно baseline: `movement` `+2.1%`, `projectile` `-0.1%`, `despawnOn cleanup` `+0.9%`.
- Итог: cycle 9 accepted. Это первый цикл после cycle 1 с target gate improvement больше `10%` относительно предыдущей принятой точки. Budget не достигнут: `unit frame composition` остается `4.51x` против `2.00x`.
- Следующее действие: дальше главный слой — `entities.reduce.publicBatch.total` `3.528ms`, особенно `postProcess` `1.565ms` и `updateStateBuckets` `0.446ms`; `core.effects.total` `1.319ms` почти полностью `entities.effects.invoke` `1.311ms`. Нужна следующая узкая гипотеза по post-process capture или effect invocation, без повторения rejected broad snapshot.

### 2026-06-15 — Цикл 10: cache liveness validation в scoped access

- Гипотеза: `entities.effects.invoke` в dev benchmark повторно проверяет liveness одного и того же effect scope при `entities().get(...)`. Можно кешировать liveness validation по `entityStore.version` внутри одного `createScopedEntityAccess`, но продолжать проверять `presence` запрошенного actor store на каждый `get`, чтобы `transition()` между двумя `get` инвалидировал stale scope.
- План правки: добавить private `ScopedAccessValidation` в `access.ts`; если `entityStore.version` не изменился, пропускать повторный проход по `alive/generation`; `presence` проверять всегда. Для теста добавить повторный `scopedEntities.get("siblingActor")` до async gate.
- Проверки до benchmark: `pnpm exec vitest run tests/entities --coverage --coverage.include=packages/entities/src/runtime/access.ts --coverage.include=packages/entities/src/runtime/effects.ts --coverage.include=packages/entities/src/runtime/transaction.ts --coverage.include=packages/entities/src/runtime/reduce.ts --coverage.include=packages/entities/src/runtime/routing.ts --coverage.reporter=text` — pass, coverage `100%`; `pnpm run check-types` — pass; `pnpm run lint` — pass; `git diff --check` — pass.
- Benchmark: `pnpm run bench:entities:record -- --runs 3 --label after-scoped-access-liveness-cache --include gate,trace --row-counts 50000`; compare с `after-single-state-transition-fast-path`.
- Gate относительно `after-single-state-transition-fast-path`: `unit frame composition / 50 000` `5.174ms -> 5.759ms`, `+11.3%`; ratio `4.51x -> 5.00x`. Соседние entity medians без регрессий выше `10%`: `movement` `+2.5%`, `projectile` `+0.4%`, `despawnOn cleanup` `+2.1%`.
- Trace относительно `after-single-state-transition-fast-path`: `core.transition.total` `5.576ms -> 5.485ms`, `-1.6%`; `entities.effects.invoke` `1.311ms -> 1.293ms`, `-1.3%`; `core.effects.total` `1.319ms -> 1.302ms`, `-1.3%`; `entities.reduce.publicBatch.total` `3.528ms -> 3.455ms`, `-2.1%`; `entities.reactions.user` `0.608ms -> 0.650ms`, `+6.8%`.
- Решение: cycle 10 rejected. Причина: несмотря на небольшое trace improvement, целевой gate median регрессировал больше `10%`. Code/test changes откатаны вручную через `apply_patch`; artifact оставить для истории: `.bench/entities/after-scoped-access-liveness-cache.json`.
- Проверки после отката: `pnpm exec vitest run tests/entities --coverage --coverage.include=packages/entities/src/runtime/access.ts --coverage.include=packages/entities/src/runtime/effects.ts --coverage.include=packages/entities/src/runtime/transaction.ts --coverage.include=packages/entities/src/runtime/reduce.ts --coverage.include=packages/entities/src/runtime/routing.ts --coverage.reporter=text` — pass, coverage `100%`; `pnpm run check-types` — pass; `pnpm run lint` — pass; `git diff --check` — pass.
- Следующее действие: продолжать от принятой точки `after-single-state-transition-fast-path`. Не развивать liveness cache без нового gate signal; следующий кандидат должен снижать `postProcess`/`updateStateBuckets`/`effect invoke` без добавления per-scope bookkeeping.

### 2026-06-15 — Цикл 11: bulk move полного state bucket

- Гипотеза: в `unit frame composition` `healthActor` полностью переходит между `reportA` и `reportB`, а `updateActorStateBuckets` делает для `50 000` rows per-row `swapRemove`/`push`. Если весь source bucket dirty и все rows переходят в один target state, можно очистить source bucket и append-ить rows в target bucket одним bulk path, сохранив текущий порядок следующего accepted batch.
- План правки: добавить private fast path перед `moveActorStateBucket`: если `previousStateCodeForAccepted` задан, `dirtyRows.length === sourceBucket.length` и все dirty rows имеют один `stateCode`, переносить bucket bulk-циклом; иначе оставлять текущий per-row fallback. Добавить тест на порядок следующего accepted batch при полном переносе bucket.
- Проверки до benchmark: `pnpm exec vitest run tests/entities --coverage --coverage.include=packages/entities/src/runtime/access.ts --coverage.include=packages/entities/src/runtime/effects.ts --coverage.include=packages/entities/src/runtime/transaction.ts --coverage.include=packages/entities/src/runtime/reduce.ts --coverage.include=packages/entities/src/runtime/routing.ts --coverage.reporter=text` — pass, coverage `100%`; `pnpm run check-types` — pass; `pnpm run lint` — pass; `git diff --check` — pass.
- Benchmark: `pnpm run bench:entities:record -- --runs 3 --label after-state-bucket-bulk-move --include gate,trace --row-counts 50000`; compare с `after-single-state-transition-fast-path`.
- Gate относительно `after-single-state-transition-fast-path`: `unit frame composition / 50 000` `5.174ms -> 5.200ms`, `+0.5%`; ratio `4.51x -> 4.22x`, но ratio улучшился из-за более медленного SoA baseline в новом record. Соседние entity medians без регрессий выше `10%`: `movement` `+2.2%`, `projectile` `+0.3%`, `despawnOn cleanup` `+3.8%`.
- Trace относительно `after-single-state-transition-fast-path`: `entities.reduce.publicBatch.updateStateBuckets` `0.446ms -> 0.291ms`, `-34.7%`; `entities.reduce.publicBatch.total` `3.528ms -> 3.282ms`, `-7.0%`; `core.rootReducer` `3.546ms -> 3.302ms`, `-6.9%`; `core.transition.total` `5.576ms -> 5.509ms`, `-1.2%`. Одновременно trace показал шум/смещение вне целевой фазы: `entities.effects.invoke` `1.311ms -> 1.417ms`, `+8.1%`, `entities.reactions.user` `0.608ms -> 0.646ms`, `+6.3%`.
- Решение: cycle 11 rejected. Причина: официальный target gate entity median не улучшился, несмотря на локальное trace improvement. Code/test changes откатаны вручную через `apply_patch`; artifact оставить для истории: `.bench/entities/after-state-bucket-bulk-move.json`.
- Проверки после отката: `pnpm exec vitest run tests/entities --coverage --coverage.include=packages/entities/src/runtime/access.ts --coverage.include=packages/entities/src/runtime/effects.ts --coverage.include=packages/entities/src/runtime/transaction.ts --coverage.include=packages/entities/src/runtime/reduce.ts --coverage.include=packages/entities/src/runtime/routing.ts --coverage.reporter=text` — pass, coverage `100%`; `pnpm run check-types` — pass; `pnpm run lint` — pass; `git diff --check` — pass.
- Следующее действие: продолжать от принятой точки `after-single-state-transition-fast-path`. Если возвращаться к bucket moves, сначала нужна атрибуция, почему gate не видит выигрыш, либо комбинированная гипотеза, которая одновременно снижает target gate.

### 2026-06-15 — Цикл 12: single-state структура для entered effect rows

- Гипотеза: `postProcessAcceptedRows` в hot path почти всегда входит в один effect state, но `appendEnteredEffectRow` делает `Map.get` на каждый dirty row. Если хранить первый effect state как прямые `{ stateCode, rows }`, а `Map` создавать только при втором state, можно снизить `postProcess` без изменения public API и без потери ordering.
- План правки: заменить private `enteredByState: Map<number, EnteredEffectRows>` на структуру с первым state и optional `rest` map; `scheduleEnteredStateEffects` сначала schedule-ит первый state, затем `rest` в insertion order. Existing mixed-effect tests покрывают fallback.
- Проверки до benchmark: `pnpm exec vitest run tests/entities --coverage --coverage.include=packages/entities/src/runtime/access.ts --coverage.include=packages/entities/src/runtime/effects.ts --coverage.include=packages/entities/src/runtime/transaction.ts --coverage.include=packages/entities/src/runtime/reduce.ts --coverage.include=packages/entities/src/runtime/routing.ts --coverage.reporter=text` — сначала поймал недостижимую ветку и после удаления лишнего condition прошел, coverage `100%`; `pnpm run check-types` — pass; `pnpm run lint` — pass; `git diff --check` — pass.
- Benchmark: `pnpm run bench:entities:record -- --runs 3 --label after-effect-entered-single-state --include gate,trace --row-counts 50000`; compare с `after-single-state-transition-fast-path`.
- Gate относительно `after-single-state-transition-fast-path`: `unit frame composition / 50 000` `5.174ms -> 5.388ms`, `+4.1%`; ratio `4.51x -> 4.33x`, но ratio улучшился из-за более медленного SoA baseline в новом record. Соседние entity medians без регрессий выше `10%`: `movement` `-0.2%`, `projectile` `+1.7%`, `despawnOn cleanup` `+3.8%`.
- Trace относительно `after-single-state-transition-fast-path`: `entities.reduce.publicBatch.postProcess` `1.565ms -> 1.407ms`, `-10.1%`; `entities.reduce.publicBatch.total` `3.528ms -> 3.383ms`, `-4.1%`; `core.rootReducer` `3.546ms -> 3.402ms`, `-4.0%`. Но `entities.effects.invoke` ухудшился `1.311ms -> 1.539ms`, `+17.4%`, `core.effects.total` `1.319ms -> 1.550ms`, `+17.4%`, и `core.transition.total` `5.576ms -> 5.670ms`, `+1.7%`.
- Решение: cycle 12 rejected. Причина: official target gate entity median ухудшился, а trace показал явную регрессию `effects.invoke`, которая перекрывает выигрыш `postProcess`. Code changes откатаны вручную через `apply_patch`; artifact оставить для истории: `.bench/entities/after-effect-entered-single-state.json`.
- Проверки после отката: `pnpm exec vitest run tests/entities --coverage --coverage.include=packages/entities/src/runtime/access.ts --coverage.include=packages/entities/src/runtime/effects.ts --coverage.include=packages/entities/src/runtime/transaction.ts --coverage.include=packages/entities/src/runtime/reduce.ts --coverage.include=packages/entities/src/runtime/routing.ts --coverage.reporter=text` — pass, coverage `100%`; `pnpm run check-types` — pass; `pnpm run lint` — pass; `git diff --check` — pass.
- Следующее действие: продолжать от принятой точки `after-single-state-transition-fast-path`. `postProcess` local wins без улучшения target gate пока не принимать; нужна гипотеза, которая не ухудшает `effects.invoke`.

### 2026-06-15 — Цикл 13: lazy effect transition

- Гипотеза: `invokeEntityEffect` создает `transition` helper с несколькими closures для каждого effect invocation, хотя `unit frame composition` effect его не читает. Lazy getter должен убрать эту работу из hot path callback без изменения публичного API.
- План правки: заменить прямое `deps.transition = createEffectTransition(...)` на private `attachLazyEffectTransition`, который делает `Object.defineProperty` и создает helper только при первом доступе к `transition`.
- Проверки до benchmark: `pnpm exec vitest run tests/entities --coverage --coverage.include=packages/entities/src/runtime/access.ts --coverage.include=packages/entities/src/runtime/effects.ts --coverage.include=packages/entities/src/runtime/transaction.ts --coverage.include=packages/entities/src/runtime/reduce.ts --coverage.include=packages/entities/src/runtime/routing.ts --coverage.reporter=text` — pass, coverage `100%`; `pnpm run check-types` — pass; `pnpm run lint` — pass; `git diff --check` — pass.
- Benchmark: `pnpm run bench:entities:record -- --runs 3 --label after-lazy-effect-transition --include gate,trace --row-counts 50000`; compare с `after-single-state-transition-fast-path`.
- Gate относительно `after-single-state-transition-fast-path`: `unit frame composition / 50 000` `5.174ms -> 5.380ms`, `+4.0%`; ratio `4.51x -> 4.36x`, но ratio улучшился из-за SoA variance. Соседние entity medians без регрессий выше `10%`: `movement` `+0.6%`, `projectile` `+0.3%`, `despawnOn cleanup` `+1.5%`.
- Trace относительно `after-single-state-transition-fast-path`: `entities.effects.invoke` `1.311ms -> 1.369ms`, `+4.4%`; `core.effects.total` `1.319ms -> 1.380ms`, `+4.6%`; `core.transition.total` `5.576ms -> 5.596ms`, `+0.4%`. Root reduce немного снизился `3.546ms -> 3.468ms`, но это не целевая правка и не компенсирует invoke regression.
- Решение: cycle 13 rejected. Причина: lazy accessor ухудшил target gate и целевую фазу `effects.invoke`; стоимость property descriptor/shape больше экономии closures. Code changes откатаны вручную через `apply_patch`; artifact оставить для истории: `.bench/entities/after-lazy-effect-transition.json`.
- Проверки после отката: `pnpm exec vitest run tests/entities --coverage --coverage.include=packages/entities/src/runtime/access.ts --coverage.include=packages/entities/src/runtime/effects.ts --coverage.include=packages/entities/src/runtime/transaction.ts --coverage.include=packages/entities/src/runtime/reduce.ts --coverage.include=packages/entities/src/runtime/routing.ts --coverage.reporter=text` — pass, coverage `100%`; `pnpm run check-types` — pass; `pnpm run lint` — pass; `git diff --check` — pass.
- Следующее действие: продолжать от принятой точки `after-single-state-transition-fast-path`. Не использовать getters/descriptor-based laziness в effect deps без новой атрибуции.

### 2026-06-15 — Цикл 14: known-target postProcess fast path

- Гипотеза: для `healthActor` в `unit frame composition` single-state non-identity transition уже знает source и target state. Можно уменьшить `postProcess` и effect capture одним связанным пакетом: заранее писать dirty rows в preallocated array, вынести common branch `stateCode === targetStateCode` и добавлять target effect entries напрямую без per-row `Map.get`. Public API/types не менять.
- План правки: добавить private `postProcessKnownTransitionRows` для `previousStateCodeForAccepted` + `knownValidStateCodeForAccepted`, оставить rollback к source clean, а override/despawnOn/terminal rows обрабатывать через прежние validation/cleanup paths. Тестом покрыть target effect, rollback, override в despawnOn, terminal override, target terminal и target без effect.
- Проверки до benchmark: `pnpm exec vitest run tests/entities --coverage --coverage.include=packages/entities/src/runtime/access.ts --coverage.include=packages/entities/src/runtime/effects.ts --coverage.include=packages/entities/src/runtime/transaction.ts --coverage.include=packages/entities/src/runtime/reduce.ts --coverage.include=packages/entities/src/runtime/routing.ts --coverage.reporter=text` — pass, coverage `100%`; `pnpm run check-types` — pass; `pnpm run lint` — pass; `git diff --check` — pass.
- Benchmark probe: `pnpm run bench:entities:record -- --runs 1 --label after-known-effect-target-postprocess-probe --include gate,trace --row-counts 50000`; compare с `.bench/entities/after-single-state-transition-fast-path.json`.
- Gate относительно `after-single-state-transition-fast-path`: `unit frame composition / 50 000` `5.174ms -> 5.582ms`, `+7.9%`; target entity median не улучшился. Соседние entity medians без регрессий выше `10%`: `movement` `+8.2%`, `projectile` `-10.5%`, `despawnOn cleanup` `+5.0%`.
- Trace относительно `after-single-state-transition-fast-path`: `entities.reduce.publicBatch.postProcess` `1.565ms -> 1.201ms`, `-23.3%`; `entities.reduce.publicBatch.total` `3.528ms -> 2.674ms`, `-24.2%`; `core.rootReducer` `3.546ms -> 2.700ms`, `-23.8%`. Но `entities.effects.invoke` ухудшился `1.311ms -> 1.455ms`, `+11.0%`; `core.effects.total` `1.319ms -> 1.469ms`, `+11.3%`; `entities.reactions.user` `0.608ms -> 0.713ms`, `+17.3%`; `core.reactions.total` `0.668ms -> 0.776ms`, `+16.1%`.
- Решение: cycle 14 rejected. Причина: probe не улучшил official target gate entity median, несмотря на сильный local trace win в `postProcess`; полный `--runs 3` не запускался по acceptance rule. Code/test changes откатаны вручную через `apply_patch`; artifact оставить для истории: `.bench/entities/after-known-effect-target-postprocess-probe.json`.
- Проверки после отката: `pnpm exec vitest run tests/entities --coverage --coverage.include=packages/entities/src/runtime/access.ts --coverage.include=packages/entities/src/runtime/effects.ts --coverage.include=packages/entities/src/runtime/transaction.ts --coverage.include=packages/entities/src/runtime/reduce.ts --coverage.include=packages/entities/src/runtime/routing.ts --coverage.reporter=text` — pass, coverage `100%`; `pnpm run check-types` — pass; `pnpm run lint` — pass; `git diff --check` — pass.
- Следующее действие: продолжать от принятой точки `after-single-state-transition-fast-path`. Не повторять known-target `postProcess` preallocation/direct capture без новой атрибуции, почему снижение rootReducer не превращается в gate improvement и почему `effects.invoke`/reactions растут.

### 2026-06-15 — Цикл 15: known-target direct capture с packed dirtyRows

- Новая атрибуция после cycle 14: preallocated `dirtyRows` мог создавать holey array, который затем попадал в effect `self.indices` и объяснял рост `entities.effects.invoke`. Поэтому повторять весь known-target fast path нельзя, но можно проверить более узкий вариант без holey array.
- Гипотеза: оставить текущий `dirtyRows.push(...)`, чтобы сохранить packed array и существующий `self.indices`, но для known target effect state убрать per-row `Map.get` в `appendEnteredEffectRow`. Direct capture использовать только когда known target effect state становится первым effect state в batch; fallback для mixed/override state оставить на прежнем `appendEnteredEffectRow`. Public API/types не менять.
- Изменено до probe: `reduce.ts` добавлял private `appendKnownTargetEffectRow`, `knownEffectTargetStateCode` и direct branch в `postProcessAcceptedRows`; тестовый сценарий покрывал mixed effect scope, где override effect state идет перед known target.
- Проверки до benchmark: `pnpm exec vitest run tests/entities --coverage --coverage.include=packages/entities/src/runtime/access.ts --coverage.include=packages/entities/src/runtime/effects.ts --coverage.include=packages/entities/src/runtime/transaction.ts --coverage.include=packages/entities/src/runtime/reduce.ts --coverage.include=packages/entities/src/runtime/routing.ts --coverage.reporter=text` — pass, coverage `100%`; `pnpm run check-types` — pass; `pnpm run lint` — pass; `git diff --check` — pass.
- Benchmark probe: `pnpm run bench:entities:record -- --runs 1 --label after-known-target-packed-capture-probe --include gate,trace --row-counts 50000`; compare с `.bench/entities/after-single-state-transition-fast-path.json`.
- Gate относительно `after-single-state-transition-fast-path`: `unit frame composition / 50 000` `5.174ms -> 5.247ms`, `+1.4%`; target entity median не улучшился. Соседние entity medians без регрессий выше `10%`: `movement` `+6.9%`, `projectile` `-10.6%`, `despawnOn cleanup` `+3.6%`. Ratio для соседних сценариев шумит из-за SoA baseline и не использовался для acceptance.
- Trace относительно `after-single-state-transition-fast-path`: `entities.reduce.publicBatch.postProcess` `1.565ms -> 1.492ms`, `-4.7%`; `entities.reduce.publicBatch.total` `3.528ms -> 2.592ms`, `-26.5%`; `core.rootReducer` `3.546ms -> 2.612ms`, `-26.3%`. Но `entities.effects.invoke` ухудшился `1.311ms -> 1.484ms`, `+13.2%`; `core.effects.total` `1.319ms -> 1.498ms`, `+13.5%`; `entities.reactions.user` `0.608ms -> 0.672ms`, `+10.4%`.
- Решение: cycle 15 rejected. Причина: probe не улучшил official target gate entity median. Полный `--runs 3` не запускался по acceptance rule. Code/test changes откатаны вручную через `apply_patch`; artifact оставить для истории: `.bench/entities/after-known-target-packed-capture-probe.json`.
- Проверки после отката: `pnpm exec vitest run tests/entities --coverage --coverage.include=packages/entities/src/runtime/access.ts --coverage.include=packages/entities/src/runtime/effects.ts --coverage.include=packages/entities/src/runtime/transaction.ts --coverage.include=packages/entities/src/runtime/reduce.ts --coverage.include=packages/entities/src/runtime/routing.ts --coverage.reporter=text` — pass, coverage `100%`; `pnpm run check-types` — pass; `pnpm run lint` — pass; `git diff --check` — pass.
- Следующее действие: продолжать от принятой точки `after-single-state-transition-fast-path`. Не продолжать known-target direct capture без новой атрибуции: два probe показывают снижение `rootReducer`, но target gate не улучшается и `effects.invoke` растет. Следующий кандидат должен идти в сам `effects.invoke`/scoped access или добавлять более детальную attribution перед очередной postProcess-правкой.

### 2026-06-15 — Проверка остаточного effects path

- Гипотеза проверки: после `after-single-state-transition-fast-path` remaining effects path может быть уже не главным ограничителем общего цикла; нужен свежий record поверх текущего рабочего дерева и отдельный `NODE_ENV=production` probe для оценки цены dev scope validation.
- Подготовка: `pnpm run build:packages` — pass. Команда не запускала docs/pages build; `@lite-fsm/cli` транзитивно собрал visualizer asset.
- Benchmark: `pnpm run bench:entities:record -- --runs 3 --label effects-path-current-assessment --include gate,trace --row-counts 50000`; compare с `unit-composition-baseline` и `after-single-state-transition-fast-path`.
- Артефакты: `.bench/entities/effects-path-current-assessment.json`, `.bench/entities/effects-path-current-assessment.md`.
- Gate относительно `after-single-state-transition-fast-path`: `unit frame composition / 50 000` `5.174ms -> 5.476ms`, `+5.8%`; ratio `4.51x -> 4.58x`. Соседние entity medians без регрессий выше `10%`: `movement` `-2.0%`, `projectile` `+0.5%`, `despawnOn cleanup` `-1.0%`.
- Gate относительно `unit-composition-baseline`: `unit frame composition / 50 000` `10.269ms -> 5.476ms`, `-46.7%`; ratio `9.26x -> 4.58x`. Соседние entity medians относительно baseline: `movement` `+0.0%`, `projectile` `+0.4%`, `despawnOn cleanup` `-0.2%`.
- Trace `unit frame composition / 50 000`: `core.transition.total` `5.749ms`; `core.rootReducer` `3.571ms` (`61.5%`), `core.effects.total` `1.428ms` (`25.1%`), `core.reactions.total` `0.715ms` (`12.7%`). Внутри effects: `entities.effects.resolve` `0.001ms`, `entities.effects.invoke` `1.419ms`. Внутри reducer: `entities.reduce.publicBatch.total` `3.554ms`, включая `postProcess` `1.595ms`, `userReducer` `0.908ms`, `updateStateBuckets` `0.451ms`, `defaultTransitions` `0.083ms`. Внутри reactions: `entities.reactions.user` `0.655ms`, `captureScope` `0.049ms`, `createDeps` `0.006ms`.
- Production probe: `NODE_ENV=production pnpm run bench:entities:record -- --runs 1 --label effects-path-production-env-probe --include gate,trace --row-counts 50000`. Артефакты: `.bench/entities/effects-path-production-env-probe.json`, `.bench/entities/effects-path-production-env-probe.md`.
- Production probe result: `unit frame composition / 50 000` gate `5.607ms`, ratio `4.45x`; trace total `4.935ms`; `entities.effects.resolve` `0.001ms`, `entities.effects.invoke` `1.433ms`. Одного run недостаточно для acceptance, но probe не показывает, что dev scope validation является главным остаточным effects bottleneck.
- Вывод: effects resolve/scheduling уже фактически сняты с hot path. Оставшийся `entities.effects.invoke` около `1.3-1.4ms` состоит в основном из обязательного вызова user effect и scoped deps вокруг него; полное устранение `core.effects.total` из свежего record теоретически снизило бы gate только до примерно `4.05ms`, что все еще сильно выше бюджета `2.00x` (`~2.27ms` при текущем SoA `1.134ms`).
- Решение: новую runtime-правку не делать. Без изменения семантики или контракта lite-fsm дальнейшие effects-only микрооптимизации не выглядят достаточными для budget. Следующий существенный выигрыш должен приходить из reducer/reaction total или из явного contract/API решения: fused frame/system path, opt-in scoped-access contract, отказ от async-retainable scope snapshots, либо другой режим, который меняет observability/runtime guarantees.

## Мини-промт следующего цикла: sync-classified entity effects

Задача: проверить на коде гипотезу, что внутренний sync-fast-path для `storage: "entity"` effects снижает `unit frame composition / 50 000` без изменения публичного API. Перед стартом перечитать этот журнал, `PERFORMANCE.md#Итог unit composition benchmark`, `effects.ts`, `reduce.ts`, `transaction.ts`, `access.ts`, `reactions.ts` и fixture `tests/bench/entities/composition-lite-fsm-entities.fixture.mjs`. Запрещенные docs/pages build команды из `AGENTS.md` не запускать.

Гипотеза:

- Текущий async-safe contract заставляет сохранять retained effect scope: `CapturedEntityScopeEntry[]` с `entity/generation/id` на каждую строку, чтобы async effect после `await` мог корректно пользоваться `self.has`, `self.entityId`, `entities().get/maybe` и `transition.despawn(self.indices)`.
- Большинство игровых frame effects синхронные. Если effect для конкретного actor state стабильно возвращает `void`, можно после первого вызова классифицировать его как sync и дальше не строить retained snapshot для этого state.
- Sync-classified effect получает deps, которые действительны только до возврата из callback. Поздний доступ к `self`/`entities()`/`transition` после возврата является ошибкой контракта или undefined behavior. В dev по возможности ловить поздний `self.has`, `self.entityId`, `transition.despawn(self.indices)` через lifetime token; прямой поздний доступ к column arrays можно не гарантировать.

Контракт и ограничения:

- Публичный API и публичные типы не менять. `MachineEffect` остается `Promise<void> | void`, пользователь не получает новый option.
- Классификация private и runtime-only: `unknown | sync | async` на actor state effect. Начальное состояние `unknown`.
- Первый вызов `unknown` идет через текущий safe path с retained snapshot. Если результат `Promise`, пометить `async` и навсегда оставить текущую семантику. Если результат `void`, пометить `sync`.
- Следующие вызовы `sync` идут через новый sync-fast-path без `CapturedEntityScopeEntry[]` в hot path. Если sync-classified effect вернул `Promise`, сообщить `LiteFsmError` через `ctx.dispatch.reportError`; дополнительно повесить `.catch(...)`, чтобы не получить unhandled rejection.
- Async-classified effects и первый unknown вызов должны сохранить текущие тестируемые гарантии async scope.
- Не повторять rejected подходы без новой атрибуции: broad parallel snapshot, lazy getter для `transition`, cache liveness validation, known-target direct capture, single-state `enteredByState` как самостоятельную правку.

Ожидаемая форма реализации:

- Добавить private storage для effect mode, вероятно рядом с compiled metadata или actor store runtime: `unknown | sync | async` по `stateCode`.
- В `reduce.ts`/`transaction.ts` при планировании entered-state effects различать async-safe batches и sync-candidate batches. Для `sync` не создавать `CapturedEntityScopeEntry[]`; использовать только `indices` и ephemeral scope metadata.
- В `effects.ts` добавить branch invoke для sync-classified effect. Он должен создавать lightweight scoped deps без retained entries. `self.indices` должен ссылаться на текущий batch indices. `entities().get(...)` во время callback должен читать текущие store views и, если нужна dev-проверка required scope, валидировать ее без object-per-row entries.
- Для dev lifetime можно использовать reaction-like marker/token arrays или более узкий механизм. После возврата callback invalidate token.
- В benchmark warmup первый вызов классифицирует effect, measured samples должны идти уже через sync-fast-path.

Тесты:

- Существующие async tests для entity effects должны остаться зелеными: async effect после `await` сохраняет captured scope; stale `transition.despawn(self.indices)` в dev/prod ведет себя как сейчас для async path.
- Добавить focused runtime tests:
  - sync effect после первого `void` вызова классифицируется и следующий вызов не требует retained entries в batch/helper path;
  - sync-classified effect, который позднее возвращает `Promise`, сообщает contract error через `onError` и не дает unhandled rejection;
  - sync effect, который сохраняет `self` и вызывает `self.entityId(...)` после возврата, в dev получает понятную ошибку stale sync effect scope, если выбран token-based guard;
  - async first invocation остается async-classified и не попадает в sync-fast-path.
- Если затронуты public types, обновить Tstyche и cheatsheets; при private-only правке cheatsheets не менять.

Проверки перед benchmark:

```bash
pnpm exec vitest run tests/entities --coverage --coverage.include=packages/entities/src/runtime/access.ts --coverage.include=packages/entities/src/runtime/effects.ts --coverage.include=packages/entities/src/runtime/transaction.ts --coverage.include=packages/entities/src/runtime/reduce.ts --coverage.include=packages/entities/src/runtime/routing.ts --coverage.reporter=text
pnpm run check-types
pnpm run lint
git diff --check
```

Benchmark:

```bash
pnpm run bench:entities:record -- --runs 3 --label after-sync-effect-fast-path --include gate,trace --row-counts 50000
pnpm run bench:entities:compare -- .bench/entities/after-single-state-transition-fast-path.json .bench/entities/after-sync-effect-fast-path.json
pnpm run bench:entities:compare -- .bench/entities/unit-composition-baseline.json .bench/entities/after-sync-effect-fast-path.json
```

Acceptance:

- Принять только если `unit frame composition / 50 000` entity median улучшается относительно `after-single-state-transition-fast-path` и нет соседних entity median regressions больше `10%` (`movement update`, `projectile lifetime update`, `despawnOn cleanup`).
- Strong accept: target gate improvement `>=10%` или явное снижение `entities.reduce.publicBatch.postProcess + entities.effects.invoke` без компенсационной регрессии в `reactions.user`.
- Reject: target gate не улучшился, либо `effects.invoke`/`reactions.user` выросли так, что перекрывают root/reduce win. При reject откатить code/test changes, оставить benchmark artifact и записать причину в этот журнал.

### 2026-06-15 — Цикл 16: sync-classified entity effects

- Гипотеза: private runtime classification `unknown | sync | async` для state effects позволит после первого `void` вызова не строить retained `CapturedEntityScopeEntry[]` и снизит `unit frame composition / 50 000` без публичного API.
- Реализация до benchmark: добавлен `effectModes` в actor store; `EntityEffectBatch` получил private `scopeMode`; `reduce.ts` для sync-classified state копил только `indices`; `effects.ts` получил sync branch с marker/generation/lifetime scope, dev stale diagnostics и contract error, если sync-classified effect позже вернул `Promise`; async/unknown retained path сохранял текущие гарантии. Public API/types и cheatsheets не менялись.
- Тесты до benchmark: добавлены focused runtime cases для `void -> sync`, `Promise -> async`, late `Promise` после sync classification, stale sync `self`/`entities()`/`transition`, sync `transition.despawn(self.indices)` и compact sync candidates. Проверки до benchmark: `pnpm exec vitest run tests/entities --coverage --coverage.include=packages/entities/src/runtime/access.ts --coverage.include=packages/entities/src/runtime/effects.ts --coverage.include=packages/entities/src/runtime/transaction.ts --coverage.include=packages/entities/src/runtime/reduce.ts --coverage.include=packages/entities/src/runtime/routing.ts --coverage.reporter=text` — pass, coverage `100%`; `pnpm run check-types` — pass; `pnpm run lint` — pass; `git diff --check` — pass; `pnpm run build:packages` — pass. Команды docs/pages build не запускались; `build:packages` транзитивно собрал visualizer asset для CLI.
- Benchmark: `pnpm run bench:entities:record -- --runs 3 --label after-sync-effect-fast-path --include gate,trace --row-counts 50000`; compare с `after-single-state-transition-fast-path` и `unit-composition-baseline`. Артефакты: `.bench/entities/after-sync-effect-fast-path.json`, `.bench/entities/after-sync-effect-fast-path.md`.
- Gate относительно `after-single-state-transition-fast-path`: `unit frame composition / 50 000` `5.174ms -> 6.670ms`, `+28.9%`; ratio `4.51x -> 6.04x`, `+33.8%`. Соседние entity medians: `movement update` `0.291ms -> 0.318ms`, `+9.4%`; `projectile lifetime update` `0.218ms -> 0.219ms`, `+0.6%`; `despawnOn cleanup` `0.425ms -> 0.418ms`, `-1.6%`. Соседние medians формально не превысили `10%`, но target gate провалил acceptance.
- Trace относительно `after-single-state-transition-fast-path`: `entities.effects.invoke` `1.311ms -> 3.213ms`, `+145.2%`; `core.effects.total` `1.319ms -> 3.221ms`, `+144.1%`; `core.transition.total` `5.576ms -> 7.486ms`, `+34.3%`. Локально снизились `entities.reduce.publicBatch.postProcess` `1.565ms -> 1.448ms`, `-7.4%`, и `entities.reduce.publicBatch.total` `3.528ms -> 3.458ms`, `-2.0%`, но выигрыш полностью перекрыт sync invoke branch.
- Gate относительно `unit-composition-baseline`: `unit frame composition / 50 000` `10.269ms -> 6.670ms`, `-35.0%`; это хуже принятой точки `after-single-state-transition-fast-path` и поэтому не является acceptance signal. `movement update` относительно baseline ухудшился `0.285ms -> 0.318ms`, `+11.7%`, но этот compare не является основным reject-критерием для текущего цикла.
- Решение: cycle 16 rejected. Причина: проверенный двойной режим снизил часть reducer work, но перенес цену в `entities.effects.invoke`; marker/lifetime sync deps оказались дороже retained invoke path для target effect. Code/test changes откатаны reverse patch; benchmark artifact оставлен для истории.
- Проверки после отката: `pnpm exec vitest run tests/entities --coverage --coverage.include=packages/entities/src/runtime/access.ts --coverage.include=packages/entities/src/runtime/effects.ts --coverage.include=packages/entities/src/runtime/transaction.ts --coverage.include=packages/entities/src/runtime/reduce.ts --coverage.include=packages/entities/src/runtime/routing.ts --coverage.reporter=text` — pass, coverage `100%`; `pnpm run check-types` — pass; `pnpm run lint` — pass; `git diff --check` — pass; `git status --short` — clean до обновления этого журнала.
- Следующее действие: продолжать от принятой точки `after-single-state-transition-fast-path`. Не повторять sync-classified entity effects через marker/lifetime scope без новой атрибуции, которая отдельно доказывает снижение `entities.effects.invoke`; следующий полезный шаг должен быть reducer/reaction-level или явным изменением runtime/benchmark contract.
