# Журнал оптимизации reduce/reactions

Цель: итеративно оптимизировать слои `reduce` и `reactions` в `@lite-fsm/core` и `@lite-fsm/entities` без изменения публичного API, если это возможно. Пакет находится в тестах, поэтому обратная совместимость не является ограничением, но публичную поверхность не расширять без необходимости.

Источник baseline: [`PERFORMANCE.md`, раздел `Итог trace baseline`](./PERFORMANCE.md#итог-trace-baseline).

## Рабочий цикл

1. Перед продолжением читать этот журнал и актуальный `PERFORMANCE.md`.
2. Выбирать узкую гипотезу по trace/gate данным.
3. Вносить минимальное изменение в hot path.
4. Запускать один релевантный прогон benchmark:

   ```bash
   pnpm run bench:entities:record -- --runs 3 --label <short-name> --include gate,trace --row-counts 50000
   pnpm run bench:entities:compare -- .bench/entities/transition-trace-baseline.json .bench/entities/<short-name>.json
   ```

5. Записать результат: что изменилось, какие цифры получили, есть ли регрессии соседних сценариев больше `10%`, что делать дальше.

## Важные ссылки

- [`packages/core/src/runtime/kernel/createMachineManagerFactory.ts`](../../packages/core/src/runtime/kernel/createMachineManagerFactory.ts) — top-level transition pipeline.
- [`packages/core/src/runtime/kernel/bucketRuntime.ts`](../../packages/core/src/runtime/kernel/bucketRuntime.ts) — bucket phases `prepareAction`, `reduce`, `commit`, `reactions`, `effects`.
- [`packages/entities/src/runtime/storage.ts`](./src/runtime/storage.ts) — entities storage runtime entrypoint.
- [`packages/entities/src/runtime/reduce.ts`](./src/runtime/reduce.ts) — reducer batch pipeline, cleanup, lifecycle.
- [`packages/entities/src/runtime/reactions.ts`](./src/runtime/reactions.ts) — reaction batches, scope capture, deps creation.
- [`packages/entities/src/runtime/access.ts`](./src/runtime/access.ts) — `self`, `entities()` and scoped access views.
- [`packages/entities/src/runtime/transaction.ts`](./src/runtime/transaction.ts) — transaction scratch, reaction/effect/despawn batches.
- [`packages/entities/src/runtime/state.ts`](./src/runtime/state.ts) — column stores, state buckets, cached reducer self.
- [`tests/bench/entities/composition-lite-fsm-entities.fixture.mjs`](../../tests/bench/entities/composition-lite-fsm-entities.fixture.mjs) — public gate scenarios.
- [`tests/bench/entities/trace.fixture.mjs`](../../tests/bench/entities/trace.fixture.mjs) — trace attribution groups.

## Baseline

Команда baseline:

```bash
pnpm run bench:entities:record -- --runs 3 --label transition-trace-baseline --include gate,trace --row-counts 50000
```

Gate `50 000` из `transition-trace-baseline`:

| Сценарий                     | SoA median | entities median |  Ratio | Бюджет | Статус |   RSD |
| ---------------------------- | ---------: | --------------: | -----: | -----: | ------ | ----: |
| `movement update`            |    0.250ms |         0.832ms |  3.39x |  1.50x | fail   | 32.5% |
| `projectile lifetime update` |    0.181ms |         0.404ms |  2.27x |  1.50x | fail   | 32.9% |
| `despawnOn cleanup`          |    0.276ms |         0.512ms |  1.86x |  2.00x | fail   |  1.9% |
| `sprite sync reaction`       |    0.320ms |         3.723ms | 11.70x |  2.00x | fail   |  5.2% |

Top trace attribution:

- `movement update`: `core.rootReducer` `0.805ms`; `entities.reduce.publicBatch.userReducer` `0.523ms`; `postProcess` `0.239ms`.
- `projectile lifetime update`: `core.rootReducer` `0.402ms`; `postProcess` `0.239ms`; `userReducer` `0.122ms`.
- `despawnOn cleanup`: `core.rootReducer` `0.477ms`; `entities.reduce.publicBatch.total` `0.448ms`.
- `sprite sync reaction`: `core.reactions.total` `2.369ms`; `entities.reactions.user` `1.701ms`; `entities.reactions.captureScope` `0.586ms`; `entities.reduce.publicBatch.total` `1.087ms`.

Legacy diagnostics `raw entity kernel` не считать production truth для выбора следующего шага.

## Текущий указатель

- Активная гипотеза: после lazy `prevStateCode` sync локальный runtime overhead для identity default transitions почти снят; оставшийся лимит находится в пользовательских reducer/reaction loops и в том, что `sprite` в entities выполняет два user loop вместо одного fused SoA loop.
- Текущие hot spots после `after-lazy-prevstate-sync`: для `sprite sync reaction / 50 000` `entities.reduce.publicBatch.total` около `0.717ms`, внутри `userReducer` около `0.532ms`, `postProcess` около `0.179ms`, `defaultTransitions` около `0.000ms`; `core.reactions.total` около `0.646ms`, почти целиком `entities.reactions.user` около `0.591ms`.
- Статус: `in progress`.
- Следующее действие: не искать больше выигрыш в `defaultTransitions`; оценить более крупный дизайн-рычаг для `sprite` — event-level reducer opt-out, explicit reaction/reducer fusion hook или документированное изменение authoring pattern, потому что без этого runtime уже ограничен пользовательскими циклами.
- Примечание пользователя от 2026-06-15: следующие benchmark records запускать на `--runs 3`, чтобы цикл был короче.

## Ход работы

### 2026-06-15 — Старт цикла

- `git status --short`: clean.
- Прочитан `PERFORMANCE.md#Итог trace baseline`.
- Прочитаны основные hot modules: `reactions.ts`, `access.ts`, `reduce.ts`, `transaction.ts`, `state.ts`, `routing.ts`, `compile.ts`, `bucketRuntime.ts`.
- Вывод: первый рабочий фокус — `sprite sync reaction`, потому что он имеет ratio `11.70x`, а trace относит большую часть времени в `core.reactions.total` и `entities.reactions.user`.
- Следующее действие: изучить benchmark fixture и проверить, можно ли уменьшить стоимость repeated `entities().get(...)`/view access или scope capture без изменения API.

### 2026-06-15 — Цикл 1: data properties для public column view

- Гипотеза: в `sprite sync reaction` callback один раз получает `movement = entities().get("movementActor")`, но внутри цикла на `50 000` строк вызывает `movement.x` и `movement.y` как accessor getters. Замена column getters на readonly data properties должна убрать десятки тысяч getter-вызовов.
- Изменено: `access.ts` хранит column refs на public store view как `writable: false` data properties; `rebindEntityStoreView` обновляет refs после `ensureActorCapacity`, hydrate commit и rollback restore. Тесты в `entities-reducer-self.test.ts` проверяют актуальность refs после capacity growth, hydrate и rollback.
- Проверки: `pnpm exec vitest run tests/entities/entities-reducer-self.test.ts` — pass (`9` tests); `pnpm exec vitest run tests/entities/entities-plugin.test.ts tests/entities/entities-reducer-self.test.ts tests/entities/entities-reducer-post-processing.test.ts --coverage --coverage.include=packages/entities/src/runtime/access.ts --coverage.include=packages/entities/src/runtime/state.ts --coverage.include=packages/entities/src/runtime/snapshot.ts --coverage.include=packages/entities/src/runtime/mutation-snapshot.ts --coverage.reporter=text` — pass, coverage `100%`; `pnpm run check-types` — pass (`7` package checks, Tstyche `44` files / `492` tests); `pnpm run lint` — pass; `git diff --check` — pass.
- Benchmark: `pnpm run bench:entities:record -- --runs 5 --label after-access-view-columns --include gate,trace --row-counts 50000`; compare: `pnpm run bench:entities:compare -- .bench/entities/transition-trace-baseline.json .bench/entities/after-access-view-columns.json`.
- Gate `sprite sync reaction / 50 000`: `3.723ms -> 2.593ms`, `-1.130ms`, `-30.3%`; ratio `11.70x -> 8.08x`. Соседние gate entity medians: `movement` `0.832ms -> 0.813ms` (`-2.3%`), `projectile` `0.404ms -> 0.419ms` (`+3.7%`), `despawnOn cleanup` `0.512ms -> 0.514ms` (`+0.4%`), регрессий выше `10%` нет.
- Trace `sprite sync reaction / 50 000`: `core.transition.total` `3.529ms -> 2.503ms`; `core.reactions.total` `2.369ms -> 1.354ms`; `entities.reactions.total` `2.367ms -> 1.350ms`; `entities.reactions.user` `1.701ms -> 0.612ms`; `entities.reactions.captureScope` `0.586ms -> 0.671ms`.
- Итог: гипотеза подтверждена, правка полезная. Полный budget не достигнут: `sprite sync reaction` остается `2.593ms` и `8.08x`; основная оставшаяся цена — `entities.reduce.publicBatch.total` `1.092ms`, `entities.reactions.captureScope` `0.671ms`, `entities.reactions.user` `0.612ms`.
- Следующее действие: проверить возможность ускорить `captureReactionScope` для borrowed single-state identity batches без потери stale/generation checks либо сократить `reduce.publicBatch.postProcess` для reaction scenario.

### 2026-06-15 — Цикл 2: O(1) cleanup для reaction scope

- Гипотеза: `captureReactionScope` помечает `50 000` rows, а cleanup снова проходит touched rows, чтобы занулить `markers` и `generation`. Token lifetime может инвалидировать escaped `self` за O(1), не меняя sync-only reaction contract.
- Изменено: `ReactionScopeScratch` получил `lifetime.token`; `cleanupReactionScope` сбрасывает только active token и scratch compact array; `createReactionEntitySelf` проверяет `scope.lifetime.token === scope.token`. Тест `reaction self helpers проверяют captured scope и generation` теперь проверяет, что escaped `self` после callback уже не видит scope.
- Проверки: `pnpm exec vitest run tests/entities/entities-plugin.test.ts --coverage --coverage.include=packages/entities/src/runtime/reactions.ts --coverage.include=packages/entities/src/runtime/access.ts --coverage.reporter=text` — pass, coverage `100%`; `pnpm exec vitest run tests/entities/entities-plugin.test.ts tests/entities/entities-reducer-self.test.ts tests/entities/entities-reducer-post-processing.test.ts --coverage --coverage.include=packages/entities/src/runtime/access.ts --coverage.include=packages/entities/src/runtime/reactions.ts --coverage.include=packages/entities/src/runtime/state.ts --coverage.include=packages/entities/src/runtime/snapshot.ts --coverage.include=packages/entities/src/runtime/mutation-snapshot.ts --coverage.reporter=text` — pass, coverage `100%`; `pnpm run check-types` — pass (`7` package checks, Tstyche `44` files / `492` tests); `pnpm run lint` — pass; `git diff --check` — pass.
- Benchmark: `pnpm run bench:entities:record -- --runs 5 --label after-reaction-scope-lifetime --include gate,trace --row-counts 50000`; compare с `after-access-view-columns` и `transition-trace-baseline`.
- Incremental gate относительно `after-access-view-columns`: `sprite sync reaction / 50 000` `2.593ms -> 1.723ms`, `-0.871ms`, `-33.6%`; ratio `8.08x -> 5.37x`. Соседние gate entity medians: `movement` `0.813ms -> 0.819ms` (`+0.7%`), `projectile` `0.419ms -> 0.415ms` (`-0.8%`), `despawnOn cleanup` `0.514ms -> 0.510ms` (`-0.8%`), регрессий выше `10%` нет.
- Incremental trace относительно `after-access-view-columns`: `entities.reactions.captureScope` `0.671ms -> 0.515ms`; `entities.reactions.total` `1.350ms -> 1.127ms`; `core.reactions.total` `1.354ms -> 1.129ms`; `core.transition.total` `2.503ms -> 2.312ms`.
- Итог относительно `transition-trace-baseline`: gate `sprite sync reaction / 50 000` `3.723ms -> 1.723ms`, `-53.7%`; ratio `11.70x -> 5.37x`; trace `core.reactions.total` `2.369ms -> 1.129ms`; `entities.reactions.user` `1.701ms -> 0.595ms`; `entities.reactions.captureScope` `0.586ms -> 0.515ms`.
- Риск: gate RSD для `sprite sync reaction` после цикла `12.7%`, поэтому следующий шаг должен опираться на trace medians и фазовую атрибуцию, а не на отдельные stdout runs.
- Следующее действие: следующий крупный кандидат — `entities.reduce.publicBatch.total` около `1.101ms` для `sprite sync reaction`; внутри него `userReducer` около `0.530ms` и `postProcess` около `0.484ms`.

### 2026-06-15 — Цикл 3: fast capture для borrowed reaction scope

- Гипотеза: borrowed reaction batch создается только для unscoped single-state identity path без cleanup/state movement. Для такого batch state bucket уже является валидным источником, поэтому `captureReactionScope` может не выполнять per-row `presence`/`alive`/`id` validation и оставить строгую фильтрацию только для owned batches.
- Изменено: `captureReactionScope` принимает `ownership`; borrowed path только пишет `markers` и captured `generation`, owned path сохраняет прежнюю фильтрацию и compact scope.
- Проверки: `pnpm exec vitest run tests/entities/entities-plugin.test.ts --coverage --coverage.include=packages/entities/src/runtime/reactions.ts --coverage.include=packages/entities/src/runtime/access.ts --coverage.reporter=text` — pass, coverage `100%`.
- Benchmark: `pnpm run bench:entities:record -- --runs 5 --label after-borrowed-reaction-scope --include gate,trace --row-counts 50000`; compare с `after-reaction-scope-lifetime` и `transition-trace-baseline`.
- Incremental gate относительно `after-reaction-scope-lifetime`: `sprite sync reaction / 50 000` `1.723ms -> 1.790ms`, `+0.067ms`, `+3.9%`; ratio `5.37x -> 5.55x`. Это не считается целевым gate-улучшением, но регрессия ниже порога `10%`. Соседние gate entity medians: `movement` `0.819ms -> 0.806ms` (`-1.6%`), `projectile` `0.415ms -> 0.411ms` (`-1.0%`), `despawnOn cleanup` `0.510ms -> 0.518ms` (`+1.5%`).
- Incremental trace относительно `after-reaction-scope-lifetime`: `entities.reactions.captureScope` `0.515ms -> 0.049ms`; `entities.reactions.total` `1.127ms -> 0.647ms`; `core.reactions.total` `1.129ms -> 0.648ms`; `core.transition.total` `2.312ms -> 1.797ms`; `traceTotal / gateEntityMedian` стал `1.00x`.
- Итог относительно `transition-trace-baseline`: gate `sprite sync reaction / 50 000` `3.723ms -> 1.790ms`, `-51.9%`; ratio `11.70x -> 5.55x`; trace `core.transition.total` `3.529ms -> 1.797ms`; `core.reactions.total` `2.369ms -> 0.648ms`; `entities.reactions.captureScope` `0.586ms -> 0.049ms`; `entities.reactions.user` `1.701ms -> 0.595ms`.
- Решение: правку оставить, потому что она устраняет измеренный trace hot spot без gate-регрессий выше `10%`; при следующем цикле не продолжать локальный reaction scope, а перейти к `entities.reduce.publicBatch`.
- Следующее действие: смотреть `reduce.publicBatch.postProcess`/`userReducer` для `sprite sync reaction` и reducer-only scenarios; локальный reaction scope больше не доминирует.

### 2026-06-15 — Цикл 4: previous state source для identity post-process

- Гипотеза: для unscoped single-state identity batch предыдущий state известен из reduce plan. `postProcessAcceptedRows` и dirty bucket update могут сравнивать итоговый `stateCode` с этим source-кодом, не читая `prevStateCode[entity]` на каждой accepted row.
- Изменено: `applyDefaultTransitions` возвращает `previousStateCodeForAccepted`; `postProcessAcceptedRows` использует его для dirty detection; `updateActorStateBuckets` получает тот же source для dirty rows. Тест `entities-reducer-post-processing.test.ts` обновлен: hot identity path теперь не читает `prevStateCode` в post-process/update bucket, при этом reducer self по-прежнему видит корректный `prevStateCode`.
- Проверки: `pnpm exec vitest run tests/entities/entities-reducer-post-processing.test.ts tests/entities/entities-reducer-self.test.ts tests/entities/entities-plugin.test.ts --coverage --coverage.include=packages/entities/src/runtime/reduce.ts --coverage.include=packages/entities/src/runtime/reactions.ts --coverage.include=packages/entities/src/runtime/access.ts --coverage.reporter=text` — pass (`157` tests), coverage `100%`; `pnpm run check-types` — pass (`7` package checks, Tstyche `44` files / `492` tests); `pnpm run lint` — pass; `git diff --check` — pass.
- Benchmark: `pnpm run bench:entities:record -- --runs 5 --label after-identity-prev-source --include gate,trace --row-counts 50000`; compare с `after-borrowed-reaction-scope` и `transition-trace-baseline`.
- Incremental gate относительно `after-borrowed-reaction-scope`: `sprite sync reaction / 50 000` `1.790ms -> 1.749ms`, `-2.3%`; `movement` `0.806ms -> 0.824ms`, `+2.3%`; `projectile` `0.411ms -> 0.394ms`, `-4.2%`; `despawnOn cleanup` `0.518ms -> 0.516ms`, `-0.3%`. Регрессий соседних gate entity medians выше `10%` нет.
- Incremental trace относительно `after-borrowed-reaction-scope`: `sprite sync reaction / 50 000` `core.transition.total` `1.797ms -> 1.742ms`, `-3.0%`; `entities.reduce.publicBatch.total` `1.097ms -> 1.074ms`, `-2.2%`; `entities.reduce.publicBatch.postProcess` `0.485ms -> 0.468ms`, `-3.6%`; `core.reactions.total` `0.648ms -> 0.640ms`, `-1.2%`. Для reducer-only trace post-process также снизился: `movement` `0.241ms -> 0.233ms`, `projectile` `0.239ms -> 0.231ms`.
- Итог относительно `transition-trace-baseline`: gate `sprite sync reaction / 50 000` `3.723ms -> 1.749ms`, `-53.0%`; trace `core.transition.total` `3.529ms -> 1.742ms`, `-50.6%`; `core.reactions.total` `2.369ms -> 0.640ms`, `-73.0%`; `entities.reduce.publicBatch.total` `1.087ms -> 1.074ms`, `-1.2%`.
- Решение: правку оставить. Выигрыш небольшой, но находится в целевом bottleneck, не расширяет public API и не дает gate-регрессий выше `10%`.
- Следующее действие: искать более крупный источник. Текущий остаток: `entities.reduce.publicBatch.userReducer` около `0.522ms`, `entities.reactions.user` около `0.588ms`, `entities.reduce.publicBatch.postProcess` около `0.468ms`.

### 2026-06-15 — Цикл 5: skip validation для clean identity rows

- Гипотеза: на unscoped single-state identity batch clean rows уже имеют известный валидный source state из reduce plan. `postProcessAcceptedRows` может не выполнять `assertValidStateCode` для clean rows; если reducer записал другой `stateCode`, row становится dirty и сохраняет прежнюю validation, effects/despawn/terminal scheduling и bucket update.
- Изменено: `postProcessAcceptedRows` вычисляет `dirty` до validation и пропускает validation только для clean rows при наличии `previousStateCodeForAccepted`. Публичный API и типы не менялись.
- Проверки перед benchmark: `pnpm exec vitest run tests/entities/entities-reducer-post-processing.test.ts tests/entities/entities-reducer-self.test.ts tests/entities/entities-plugin.test.ts --coverage --coverage.include=packages/entities/src/runtime/reduce.ts --coverage.reporter=text` — pass (`157` tests), coverage `100%`.
- Benchmark: `pnpm run bench:entities:record -- --runs 5 --label after-identity-validation-skip --include gate,trace --row-counts 50000`; compare с `after-identity-prev-source` и `transition-trace-baseline`. Во время этого record пользователь попросил следующие циклы запускать с `--runs 3`; текущий record уже был запущен, поэтому он завершен на `5` runs.
- Incremental gate относительно `after-identity-prev-source`: `movement` `0.824ms -> 0.742ms`, `-10.0%`; `projectile` `0.394ms -> 0.343ms`, `-12.8%`; `despawnOn cleanup` `0.516ms -> 0.449ms`, `-13.1%`; `sprite sync reaction` `1.749ms -> 1.653ms`, `-5.5%`. Регрессий соседних gate entity medians выше `10%` нет.
- Incremental trace относительно `after-identity-prev-source`: `movement` `core.transition.total` `0.819ms -> 0.761ms`, `postProcess` `0.233ms -> 0.179ms`; `projectile` `0.410ms -> 0.357ms`, `postProcess` `0.231ms -> 0.179ms`; `despawnOn cleanup` `0.526ms -> 0.446ms`, `postProcess` `0.289ms -> 0.213ms`; `sprite sync reaction` `1.742ms -> 1.651ms`, `entities.reduce.publicBatch.total` `1.074ms -> 0.961ms`, `postProcess` `0.468ms -> 0.358ms`.
- Итог относительно `transition-trace-baseline`: gate `sprite sync reaction / 50 000` `3.723ms -> 1.653ms`, `-55.6%`; ratio `11.70x -> 5.18x`; trace `core.transition.total` `3.529ms -> 1.651ms`, `-53.2%`; `entities.reduce.publicBatch.total` `1.087ms -> 0.961ms`, `-11.6%`; `entities.reactions.captureScope` `0.586ms -> 0.048ms`; `core.reactions.total` `2.369ms -> 0.661ms`.
- Проверки после benchmark: `pnpm run check-types` — pass (`7` package checks, Tstyche `44` files / `492` tests); `pnpm run lint` — pass; `git diff --check` — pass.
- Решение: правку оставить. Это первый post-process шаг с заметным trace-win (`sprite` public batch `-10.5%`) и без gate-регрессий выше `10%`.
- Следующее действие: следующий record запускать с `--runs 3`; искать выигрыш в `entities.reactions.user` около `0.607ms` и `entities.reduce.publicBatch.userReducer` около `0.523ms`, а также проверить, можно ли дальше сузить post-process для identity+reaction templates без потери dirty/error semantics.

### 2026-06-15 — Цикл 6: specialized identity post-process без lifecycle

- Гипотеза: для identity batch без `despawnOn` и effects generic `postProcessAcceptedRows` сохраняет лишние ветки lifecycle. Узкий fast path может оставить dirty detection, `rowVersion`, terminal cleanup и validation dirty rows, но убрать постоянные проверки `scheduleEffects`/`scheduleDespawnOn`.
- Изменено: добавлен `postProcessIdentityRowsWithoutLifecycle`; `postProcessAcceptedRows` делегирует в него, когда `previousStateCodeForAccepted` известен и lifecycle scheduling отключен. Тест `identity fast path планирует terminal cleanup после reducer write` проверяет, что terminal write внутри reducer сохраняет cleanup semantics. Публичный API и типы не менялись.
- Проверки перед benchmark: `pnpm exec vitest run tests/entities/entities-reducer-post-processing.test.ts tests/entities/entities-reducer-self.test.ts tests/entities/entities-plugin.test.ts --coverage --coverage.include=packages/entities/src/runtime/reduce.ts --coverage.reporter=text` — pass (`158` tests), coverage `100%`.
- Benchmark: `pnpm run bench:entities:record -- --runs 3 --label after-identity-postprocess-fastpath --include gate,trace --row-counts 50000`; compare с `after-identity-validation-skip` и `transition-trace-baseline`.
- Incremental gate относительно `after-identity-validation-skip`: `movement` `0.742ms -> 0.655ms`, `-11.7%`; `projectile` `0.343ms -> 0.267ms`, `-22.1%`; `despawnOn cleanup` `0.449ms -> 0.451ms`, `+0.6%`; `sprite sync reaction` `1.653ms -> 1.464ms`, `-11.4%`; ratio `5.18x -> 4.43x`. Регрессий соседних gate entity medians выше `10%` нет.
- Incremental trace относительно `after-identity-validation-skip`: `movement` `core.transition.total` `0.761ms -> 0.688ms`, `postProcess` `0.179ms -> 0.097ms`; `projectile` `0.357ms -> 0.275ms`, `postProcess` `0.179ms -> 0.097ms`; `despawnOn cleanup` `0.446ms -> 0.454ms`, `postProcess` `0.213ms -> 0.215ms`; `sprite sync reaction` `1.651ms -> 1.482ms`, `entities.reduce.publicBatch.total` `0.961ms -> 0.804ms`, `postProcess` `0.358ms -> 0.198ms`.
- Итог относительно `transition-trace-baseline`: gate `movement update / 50 000` `0.832ms -> 0.655ms`, `-21.3%`, ratio `3.39x -> 2.83x`; `projectile lifetime update` `0.404ms -> 0.267ms`, `-33.8%`, ratio `2.27x -> 1.50x`; `despawnOn cleanup` `0.512ms -> 0.451ms`, `-11.9%`, ratio `1.86x -> 1.60x`; `sprite sync reaction` `3.723ms -> 1.464ms`, `-60.7%`, ratio `11.70x -> 4.43x`. Trace `sprite`: `core.transition.total` `3.529ms -> 1.482ms`, `-58.0%`; `entities.reduce.publicBatch.total` `1.087ms -> 0.804ms`, `-26.0%`; `postProcess` `0.481ms -> 0.198ms`, `-58.9%`; `core.reactions.total` `2.369ms -> 0.643ms`, `-72.9%`.
- Проверки после benchmark: `pnpm run check-types` — pass (`7` package checks, Tstyche `44` files / `492` tests); `pnpm run lint` — pass; `git diff --check` — pass.
- Решение: правку оставить. Она дает заметный выигрыш в reducer-only scenarios и `sprite`, а `despawnOn cleanup` остается стабильным.
- Следующее действие: перейти от post-process к проверке runtime overhead вокруг `entities.reactions.user` и `entities.reduce.publicBatch.userReducer`; текущие ratios еще выше бюджетов (`movement` около `2.83x`, `sprite` около `4.43x`).

### 2026-06-15 — Цикл 7: indexed loops и локальные refs в internal accepted-row loops

- Гипотеза: после specialized identity post-process в hot path остались короткие, но полные проходы по `50 000` accepted rows. Внутренние `for...of` и повторные `store.*` lookups можно заменить на индексные циклы и локальные refs без изменения поведения и публичного API.
- Изменено: в `reduce.ts` индексные циклы и локальные ссылки на typed arrays добавлены для `updateActorStateBuckets`, `postProcessIdentityRowsWithoutLifecycle`, generic `postProcessAcceptedRows`, `getAcceptedIndices`, `applyDefaultTransitions` и `applyIdentityDefaultTransitions`.
- Проверки перед benchmark: `pnpm exec vitest run tests/entities/entities-reducer-post-processing.test.ts tests/entities/entities-reducer-self.test.ts tests/entities/entities-plugin.test.ts --coverage --coverage.include=packages/entities/src/runtime/reduce.ts --coverage.reporter=text` — pass (`158` tests), coverage `100%`.
- Benchmark: `pnpm run bench:entities:record -- --runs 3 --label after-indexed-internal-loops --include gate,trace --row-counts 50000`; compare с `after-identity-postprocess-fastpath` и `transition-trace-baseline`.
- Incremental gate относительно `after-identity-postprocess-fastpath`: `movement` `0.655ms -> 0.339ms`, ratio `2.83x -> 1.42x`, но RSD `33.4%` и record status остается `fail`; `projectile` `0.267ms -> 0.250ms`, ratio `1.50x -> 1.32x`, status `pass`; `despawnOn cleanup` `0.451ms -> 0.457ms`, `+1.3%`, ratio `1.60x -> 1.63x`; `sprite sync reaction` `1.464ms -> 1.517ms`, `+3.6%`, ratio `4.43x -> 4.53x`. Регрессий gate entity median выше `10%` нет.
- Incremental trace относительно `after-identity-postprocess-fastpath`: `movement` `core.transition.total` `0.688ms -> 0.664ms`, `entities.reduce.publicBatch.total` `0.667ms -> 0.645ms`, `defaultTransitions` `0.036ms -> 0.027ms`, `postProcess` `0.097ms -> 0.088ms`; `projectile` `0.275ms -> 0.257ms`, `publicBatch.total` `0.259ms -> 0.240ms`, но trace RSD `42.8%`; `despawnOn cleanup` `0.454ms -> 0.472ms`; `sprite sync reaction` `1.482ms -> 1.467ms`, `publicBatch.total` `0.804ms -> 0.759ms`, `defaultTransitions` `0.073ms -> 0.054ms`, `postProcess` `0.198ms -> 0.178ms`, `entities.reactions.user` `0.590ms -> 0.628ms`.
- Итог относительно `transition-trace-baseline`: gate `movement update / 50 000` `0.832ms -> 0.339ms`, ratio `3.39x -> 1.42x`; `projectile lifetime update` `0.404ms -> 0.250ms`, ratio `2.27x -> 1.32x`; `despawnOn cleanup` `0.512ms -> 0.457ms`, ratio `1.86x -> 1.63x`; `sprite sync reaction` `3.723ms -> 1.517ms`, ratio `11.70x -> 4.53x`. Trace `sprite`: `core.transition.total` `3.529ms -> 1.467ms`, `entities.reduce.publicBatch.total` `1.087ms -> 0.759ms`, `postProcess` `0.481ms -> 0.178ms`, `core.reactions.total` `2.369ms -> 0.680ms`.
- Проверки после benchmark: `pnpm run check-types` — pass (`7` package checks, Tstyche `44` files / `492` tests); `pnpm run lint` — pass; `git diff --check` — pass.
- Решение: правку оставить. Она дает измеримый trace-win в `defaultTransitions`/`postProcess` и не дает gate-регрессий выше `10%`; при этом `sprite` gate не улучшился, потому что выигрыш в reduce перекрывается шумом и оставшейся ценой `entities.reactions.user`.
- Следующее действие: следующий крупный кандидат требует семантического решения. Без изменения публичного API почти весь оставшийся `sprite` budget сидит в пользовательских циклах; стоит отдельно оценить контракт `prevStateCode` для identity events и возможность не писать его на каждый accepted row.

### 2026-06-15 — Цикл 8: lazy `prevStateCode` sync для identity events

- Гипотеза: identity transition пишет `prevStateCode` для всех accepted rows на каждом steady `TICK`, хотя после предыдущих dirty transitions достаточно синхронизировать только dirty rows один раз перед следующим identity reducer. Это должно сохранить reducer/reaction/effect semantics внутри transition и убрать полный write-pass из steady identity path.
- Изменено: `ColumnarActorStore` получил pending-list `pendingPrevStateCodeSync` с mark/token для dedupe; dirty rows ставятся в очередь после state bucket update; `applyIdentityDefaultTransitions` вызывает `syncPendingPrevStateCode` вместо записи по всему accepted bucket. Rollback mutation snapshot сохраняет pending state; hydrate помечает present rows как pending, чтобы первый identity event после snapshot сохранил прежний reducer contract. Публичный API и типы не менялись.
- Проверки перед benchmark: `pnpm exec vitest run tests/entities/entities-reducer-post-processing.test.ts tests/entities/entities-reducer-self.test.ts tests/entities/entities-plugin.test.ts --coverage --coverage.include=packages/entities/src/runtime/reduce.ts --coverage.include=packages/entities/src/runtime/state.ts --coverage.include=packages/entities/src/runtime/snapshot.ts --coverage.include=packages/entities/src/runtime/mutation-snapshot.ts --coverage.reporter=text` — pass (`160` tests), coverage `100%`.
- Benchmark: `pnpm run bench:entities:record -- --runs 3 --label after-lazy-prevstate-sync --include gate,trace --row-counts 50000`; compare с `after-indexed-internal-loops` и `transition-trace-baseline`.
- Incremental gate относительно `after-indexed-internal-loops`: `movement` `0.339ms -> 0.325ms`, ratio `1.42x -> 1.31x`, record status остается `fail` из-за RSD `37.0%`; `projectile` `0.250ms -> 0.218ms`, `-12.6%`, ratio `1.32x -> 1.22x`, record status `fail` из-за RSD `49.1%`; `despawnOn cleanup` `0.457ms -> 0.443ms`, ratio `1.63x -> 1.56x`, status `pass`; `sprite sync reaction` `1.517ms -> 1.378ms`, `-9.2%`, ratio `4.53x -> 4.30x`. Регрессий gate entity median выше `10%` нет.
- Incremental trace относительно `after-indexed-internal-loops`: `movement` `core.transition.total` `0.664ms -> 0.654ms`, `defaultTransitions` `0.027ms -> 0.000ms`; `projectile` `0.257ms -> 0.226ms`, `publicBatch.total` `0.240ms -> 0.211ms`, `defaultTransitions` `0.027ms -> 0.000ms`, но trace RSD `44.7%`; `despawnOn cleanup` `0.472ms -> 0.436ms`; `sprite sync reaction` `1.467ms -> 1.412ms`, `publicBatch.total` `0.759ms -> 0.717ms`, `defaultTransitions` `0.054ms -> 0.000ms`, `entities.reactions.user` `0.628ms -> 0.591ms`.
- Итог относительно `transition-trace-baseline`: gate `movement update / 50 000` `0.832ms -> 0.325ms`, ratio `3.39x -> 1.31x`; `projectile lifetime update` `0.404ms -> 0.218ms`, ratio `2.27x -> 1.22x`; `despawnOn cleanup` `0.512ms -> 0.443ms`, ratio `1.86x -> 1.56x`; `sprite sync reaction` `3.723ms -> 1.378ms`, ratio `11.70x -> 4.30x`. Trace `sprite`: `core.transition.total` `3.529ms -> 1.412ms`, `entities.reduce.publicBatch.total` `1.087ms -> 0.717ms`, `postProcess` `0.481ms -> 0.179ms`, `core.reactions.total` `2.369ms -> 0.646ms`.
- Проверки после benchmark: `pnpm run check-types` — pass (`7` package checks, Tstyche `44` files / `492` tests); `pnpm run lint` — pass; `git diff --check` — pass.
- Решение: правку оставить. Она убирает последний крупный identity default write-pass, дает стабильный trace-win и не меняет публичный API.
- Следующее действие: для `sprite` следующий выигрыш уже не в default transition. Надо выбирать между изменением authoring/API contract, которое позволит не запускать no-op reducer или сливать reaction с producer loop, и фиксацией текущего ограничения как архитектурного budget gap.
