# Журнал реализации ТЗ @lite-fsm/entities lazy deps provider

ТЗ: [`tz-entities-lazy-deps-provider.md`](./tz-entities-lazy-deps-provider.md)

Цель журнала — восстановить состояние реализации после сжатия контекста. Журнал не заменяет ТЗ и не пересказывает diff.

## Правила ведения

- Перед продолжением работы прочитать ТЗ и этот журнал.
- Продолжать первый этап со статусом не `done`.
- Не переходить к следующему этапу, пока текущий этап не прошел свой `stage gate`.
- Обновлять журнал после закрытия этапа, blocker или значимого промежуточного результата.
- Записи держать короткими: scope, измененные модули, проверки, coverage, риски, следующее действие.
- Не фиксировать каждую мелкую правку и не вставлять полный diff.
- Не запускать запрещенные docs build commands из `AGENTS.md`.

## Статусы

- `not started`
- `in progress`
- `done`
- `blocked`

## Текущий указатель

- Активное ТЗ: `spec/tz-entities-lazy-deps-provider.md`
- Активный этап: все этапы завершены
- Статус: `done`
- Следующее действие: готово к review.

## Сводка по этапам

| Этап | Название | Статус | Последнее обновление |
| ---- | -------- | ------ | -------------------- |
| 1 | Public types для deps provider | `done` | 2026-06-14 |
| 2 | Runtime providers | `done` | 2026-06-14 |
| 3 | Примеры, docs и cheatsheets | `done` | 2026-06-14 |
| 4 | Рефакторинг, чистка и полировка | `done` | 2026-06-14 |
| 5 | Финальная проверка release scope | `done` | 2026-06-14 |

## Ход реализации

### Этап 1 — Public types для deps provider

Статус: `done`

Записи:

- 2026-06-14 — Старт этапа. Исполнитель: `019ec5b0-cdd1-7153-b945-6c73fc1d538a`. Corrective: `0/3`. Baseline до dispatch: `git status --short` показывал изменения в `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`, `ecs_example/store/**`, `packages/core/src/{index.ts,interfaces.ts,plugin.ts,pluginHelpers.ts,pluginTypes.ts}`, `packages/entities/src/plugin.ts`, `tests/types/{entities-api.tst.ts,exports-surface.tst.ts}`; staged diff отсутствовал; `spec/tz-entities-lazy-deps-provider.md` и этот журнал были untracked. Baseline diff stat: 17 файлов, 123 вставки, 104 удаления. Active scope этапа: `packages/entities/src/machine-extension.ts`, `packages/entities/src/plugin.ts`, `tests/types/entities-api.tst.ts` и минимально необходимые public type exports/tests. Чужие baseline-изменения не откатывать и не перезаписывать. Следующее действие: dispatch brief исполнителю.
- 2026-06-14 — Review/Verify: `accept`, этап закрыт. Исполнитель: `019ec5b0-cdd1-7153-b945-6c73fc1d538a`. Corrective: `0/3`. Stage-owned delta: удален `EntityAccessMachinesFromDeps`; `EntityEffectDeps` больше не синтезирует `entities`; `EntityReactionUserDeps` сохраняет пользовательский `entities`; `EntityReactionDeps` не выводит `AppMachines`; `manager.entities` в public types стал `() => EntityAccess<AppMachines>`; type tests обновлены на `entities().get(...)`, проверку отсутствия auto-`entities` и unified `MachineDeps` без цикла. Измененные модули: `packages/entities/src/machine-extension.ts`, `packages/entities/src/plugin.ts`, `tests/types/entities-api.tst.ts`. Проверки: `pnpm exec tstyche tests/types/entities-api.tst.ts` — pass, 34 tests; `pnpm run test:types` — pass, 44 files / 492 tests; `pnpm --filter @lite-fsm/entities run check-types` — pass; `git diff --check -- packages/entities/src/machine-extension.ts packages/entities/src/plugin.ts tests/types/entities-api.tst.ts` — pass; `rg "EntityAccessMachinesFromDeps" packages/entities/src tests/types/entities-api.tst.ts` — no hits. Coverage: runtime coverage не применимо, этап type-only. Риск: runtime provider body и scoped wiring еще не изменены, это scope этапа 2. Следующее действие: этап 2.

### Этап 2 — Runtime providers

Статус: `done`

Записи:

- 2026-06-14 — Старт этапа. Исполнитель: `019ec5b7-3639-7bc0-9ac8-6b504b0cbd7d`. Corrective: `0/3`. Baseline до dispatch: этап 1 уже `done`; `git status --short` показывал изменения в `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`, `ecs_example/store/**`, `packages/core/src/{index.ts,interfaces.ts,plugin.ts,pluginHelpers.ts,pluginTypes.ts}`, `packages/entities/src/{machine-extension.ts,plugin.ts}`, `tests/types/{entities-api.tst.ts,exports-surface.tst.ts}`; staged diff отсутствовал; `spec/tz-entities-lazy-deps-provider.md` и этот журнал untracked. Baseline diff stat: 18 файлов, 222 вставки, 146 удалений. Active scope этапа: `packages/entities/src/plugin.ts`, `packages/entities/src/runtime/{effects.ts,reactions.ts,access.ts,state.ts}`, `packages/entities/src/react/index.ts`, `tests/entities/entities-plugin.test.ts`, `tests/react/entities.test.tsx` и точечные тестовые helper updates. Чужие baseline-изменения не откатывать и не перезаписывать. Следующее действие: dispatch brief исполнителю.
- 2026-06-14 — Review/Verify: `accept`, этап закрыт. Исполнитель: `019ec5b7-3639-7bc0-9ac8-6b504b0cbd7d`. Corrective: `0/3`. Stage-owned delta: `manager.entities` runtime factory возвращает stable provider, provider возвращает stable root access; entity effects/reactions подставляют `entities: () => scopedEntities`; `scopedEntities` создается один раз на deps object; scoped diagnostic spelling обновлен на `entities().get(...)`; React и internal tests читают runtime через `manager.entities()`. Измененные модули: `packages/entities/src/plugin.ts`, `packages/entities/src/runtime/{effects.ts,reactions.ts,access.ts}`, `packages/entities/src/react/index.ts`, `tests/entities/entities-plugin.test.ts`, `tests/react/entities.test.tsx`. Проверки: `pnpm exec vitest run tests/entities/entities-plugin.test.ts` — pass, 114 tests; `pnpm exec vitest run tests/react/entities.test.tsx` — pass, 22 tests; `pnpm --filter @lite-fsm/entities run check-types` — pass; `git diff --check -- <active files>` — pass; `rg "entities\\.(get|maybe)\\(" packages/entities/src tests/entities/entities-plugin.test.ts tests/react/entities.test.tsx` — no hits; `rg "manager\\.entities\\.get\\(" packages/entities/src tests/entities tests/react` — no hits; `rg "getEntityRuntimeState\\((manager|target\\.manager)\\.entities\\)" packages/entities/src tests/entities/entities-plugin.test.ts tests/react/entities.test.tsx` — no hits. Coverage: focused runtime suites без coverage. Риск: старые provider формы могут оставаться в examples/docs/bench вне active scope этапа 2, это scope этапа 3. Следующее действие: этап 3.

### Этап 3 — Примеры, docs и cheatsheets

Статус: `done`

Записи:

- 2026-06-14 — Старт этапа. Исполнитель: `019ec5bc-153f-7540-942a-e7b72c1c6077`. Corrective: `0/3`. Baseline до dispatch: этапы 1-2 уже `done`; `git status --short` показывал изменения в `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`, `ecs_example/store/**`, `packages/core/src/{index.ts,interfaces.ts,plugin.ts,pluginHelpers.ts,pluginTypes.ts}`, `packages/entities/src/{machine-extension.ts,plugin.ts,react/index.ts,runtime/access.ts,runtime/effects.ts,runtime/reactions.ts}`, `tests/entities/entities-plugin.test.ts`, `tests/react/entities.test.tsx`, `tests/types/{entities-api.tst.ts,exports-surface.tst.ts}`; staged diff отсутствовал; `spec/tz-entities-lazy-deps-provider.md` и этот журнал untracked. Baseline diff stat: 24 файлов, 294 вставки, 197 удалений. Pre-dispatch audit старого API нашел hits в `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`, `packages/entities/README.md`, `packages/entities/examples/composition-lite-fsm-entities.ts`, `ecs_example/{run-example.ts,composition-lite-fsm.ts,store/deps.ts,store/machines/enemy-sprite-actor.ts}`, `tests/bench/entities/composition-lite-fsm-entities.fixture.mjs`, `tests/entities/entities-examples.test.ts`. Active scope этапа: `ecs_example/**`, `packages/entities/examples/**`, `tests/bench/entities/**`, `tests/entities/entities-examples.test.ts`, `packages/entities/README.md`, `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`. Чужие baseline-изменения не откатывать и не перезаписывать. Следующее действие: dispatch brief исполнителю.
- 2026-06-14 — Corrective `1/3`: исполнитель вернул `blocked`, потому что полный audit `rg "entities\\.get" packages/entities ecs_example tests/bench tests/types tests/entities tests/react` и `rg "manager\\.entities\\.get" ...` остался с единственным hit в `tests/types/entities-api.tst.ts` — negative `@ts-expect-error` для старого `manager.entities.get(...)`. Это исправимо без решения пользователя; scope corrective расширен ровно на этот test literal, чтобы сохранить negative coverage и закрыть audit. Следующее действие: вернуть тому же исполнителю.
- 2026-06-14 — Review/Verify: `accept`, этап закрыт. Исполнитель: `019ec5bc-153f-7540-942a-e7b72c1c6077`. Corrective: `1/3`. Stage-owned delta: `ecs_example` перешел на `entities: () => EntityAccess<AppMachines>`, `RuntimeDeps` исключает `getState` и `entities`, `manager.setDependencies` передает `entities: manager.entities`, scoped reads используют `entities().get(...)`, root examples используют `manager.entities().get(...)`; README, package example, bench fixture, examples test, API/TYPES cheatsheets описывают provider contract и явное объявление deps key. Дополнительная точечная правка: negative type assertion в `tests/types/entities-api.tst.ts` сохраняет проверку `.get` на provider-функции без literal old API в audit. Проверки: `pnpm exec tsc --noEmit -p ecs_example/tsconfig.json --pretty false` — pass; `pnpm exec vitest run tests/entities/entities-examples.test.ts` — pass, 2 tests; `pnpm exec tstyche tests/types/entities-api.tst.ts` — pass, 34 tests; `git diff --check -- <stage 3 files + tests/types/entities-api.tst.ts>` — pass; `rg "entities\\.get" packages/entities ecs_example tests/bench tests/types tests/entities tests/react` — no hits; `rg "manager\\.entities\\.get" packages/entities ecs_example tests/bench tests/types tests/entities tests/react` — no hits; `rg "entities\\.maybe|manager\\.entities\\.maybe" packages/entities ecs_example tests/bench tests/types tests/entities tests/react` — no hits. Coverage: focused docs/examples tests без coverage; docs build не запускался. Риски: нет. Следующее действие: этап 4.

### Этап 4 — Рефакторинг, чистка и полировка

Статус: `done`

Записи:

- 2026-06-14 — Старт этапа. Исполнитель: `019ec5c4-dbc1-7c50-9ef7-4f03a6fd982e`. Corrective: `0/3`. Baseline до dispatch: этапы 1-3 уже `done`; `git status --short` показывал изменения в 30 tracked files: `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`, `ecs_example/**`, `packages/core/src/{index.ts,interfaces.ts,plugin.ts,pluginHelpers.ts,pluginTypes.ts}`, `packages/entities/README.md`, `packages/entities/examples/composition-lite-fsm-entities.ts`, `packages/entities/src/{machine-extension.ts,plugin.ts,react/index.ts,runtime/access.ts,runtime/effects.ts,runtime/reactions.ts}`, `tests/bench/entities/composition-lite-fsm-entities.fixture.mjs`, `tests/entities/{entities-examples.test.ts,entities-plugin.test.ts}`, `tests/react/entities.test.tsx`, `tests/types/{entities-api.tst.ts,exports-surface.tst.ts}`; staged diff отсутствовал; `spec/tz-entities-lazy-deps-provider.md` и этот журнал untracked. Baseline diff stat: 30 файлов, 382 вставки, 277 удалений. Pre-cleanup source audit старого API (`EntityAccessMachinesFromDeps`, `entities.get`, `manager.entities.get`, `entities.maybe`, `manager.entities.maybe`, `EntityAccess<AppState>`) не показал hits в active scope. `TODO|FIXME|temporary|legacy fallback` audit не показал relevant hits; `compatibility` остался только в допустимом тексте schema compatibility. Active scope этапа: все измененные в stages 1-3 файлы и source audits из ТЗ. Чужие baseline-изменения не откатывать и не перезаписывать. Следующее действие: dispatch brief исполнителю.
- 2026-06-14 — Review/Verify: `accept`, этап закрыт. Исполнитель: `019ec5c4-dbc1-7c50-9ef7-4f03a6fd982e`. Corrective: `0/3`. Stage-owned delta: production/docs/test правок не потребовалось; cleanup audit не нашел stale imports/helpers/comments, old API, `EntityAccess<AppState>`, temporary compatibility code или relevant TODO/FIXME. Во время проверки transient generated change в `apps/docs/next-env.d.ts` был очищен и не остался в diff. Проверки: `pnpm run lint` — pass; `pnpm run check-types` — pass, включая `test:types` 44 files / 492 tests; `git diff --check` — pass; `rg "EntityAccessMachinesFromDeps" packages/entities ecs_example tests/types tests/entities tests/react API-CHEATSHEET.md TYPES-CHEATSHEET.md` — no hits; `rg "entities\\.get" packages/entities ecs_example tests/bench tests/types tests/entities tests/react` — no hits; `rg "manager\\.entities\\.get" packages/entities ecs_example tests/bench tests/types tests/entities tests/react` — no hits; `rg "EntityAccess<AppState>" packages/entities ecs_example tests/types` — no hits; additional `entities\\.maybe|manager\\.entities\\.maybe` audit — no hits. Coverage: не применимо, cleanup gate. Запрещенные docs build commands не запускались. Риски: нет. Следующее действие: этап 5.

### Этап 5 — Финальная проверка release scope

Статус: `done`

Записи:

- 2026-06-14 — Старт этапа. Исполнитель: `019ec5c9-6713-7cd3-8b2e-f15949b62594`. Corrective: `0/3`. Baseline до dispatch: этапы 1-4 уже `done`; `git status --short` показывал изменения в 30 tracked files: `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`, `ecs_example/**`, `packages/core/src/{index.ts,interfaces.ts,plugin.ts,pluginHelpers.ts,pluginTypes.ts}`, `packages/entities/README.md`, `packages/entities/examples/composition-lite-fsm-entities.ts`, `packages/entities/src/{machine-extension.ts,plugin.ts,react/index.ts,runtime/access.ts,runtime/effects.ts,runtime/reactions.ts}`, `tests/bench/entities/composition-lite-fsm-entities.fixture.mjs`, `tests/entities/{entities-examples.test.ts,entities-plugin.test.ts}`, `tests/react/entities.test.tsx`, `tests/types/{entities-api.tst.ts,exports-surface.tst.ts}`; staged diff отсутствовал; `spec/tz-entities-lazy-deps-provider.md` и этот журнал untracked. Baseline diff stat: 30 файлов, 386 вставок, 278 удалений. Pre-dispatch old API audit (`entities.get`, `manager.entities.get`, `entities.maybe`, `manager.entities.maybe`, `EntityAccessMachinesFromDeps`, `EntityAccess<AppState>`) не показал hits в active scope. Active scope этапа: integrated release checks and journal only; implementation changes не ожидаются. Чужие baseline-изменения не откатывать и не перезаписывать. Следующее действие: dispatch brief исполнителю.
- 2026-06-14 — Review/Verify: `accept`, этап закрыт. Исполнитель: `019ec5c9-6713-7cd3-8b2e-f15949b62594`. Corrective: `0/3`. Stage-owned delta: реализационных правок не потребовалось. Финальные проверки оркестратора: `pnpm run test:types` — pass, 44 files / 492 tests; `pnpm run check-types` — pass, 7 package type checks + `tsconfig.test.json` + Tstyche; `pnpm run lint` — pass; `pnpm run test` — pass, 102 files / 1443 tests, existing skipped 2 files / 14 tests; `pnpm run build:packages` — pass, 7 packages; `pnpm exec tsc --noEmit -p ecs_example/tsconfig.json --pretty false` — pass; `git diff --check` — pass; source audit `rg "entities\\.get|entities\\.maybe|manager\\.entities\\.get|manager\\.entities\\.maybe|EntityAccessMachinesFromDeps|EntityAccess<AppState>" packages/entities ecs_example tests/bench tests/types tests/entities tests/react API-CHEATSHEET.md TYPES-CHEATSHEET.md` — no hits. README/API/TYPES и examples содержат provider contract `entities: () => EntityAccess<AppMachines>`, `entities().get(...)`, `entities().maybe(...)`, `manager.entities().get(...)`. Coverage: отдельный coverage report не запускался; full Vitest и Tstyche gates прошли. Запрещенные docs build commands не запускались; `pnpm run build` не запускался, вместо него выполнен разрешенный `pnpm run build:packages`. Риски: нет. Следующее действие: финальная запись readiness.

## Финальная проверка

- Статус: `done`
- 2026-06-14 — Final readiness gate: `accept`. Все этапы 1-5 имеют статус `done`; executor-id уникальны: `019ec5b0-cdd1-7153-b945-6c73fc1d538a`, `019ec5b7-3639-7bc0-9ac8-6b504b0cbd7d`, `019ec5bc-153f-7540-942a-e7b72c1c6077`, `019ec5c4-dbc1-7c50-9ef7-4f03a6fd982e`, `019ec5c9-6713-7cd3-8b2e-f15949b62594`. Сквозные проверки оркестратора: `pnpm run test:types` — pass, 44 files / 492 tests; `pnpm run check-types` — pass; `pnpm run lint` — pass; `pnpm run test` — pass, 102 files / 1443 tests, existing skipped 2 files / 14 tests; `pnpm run build:packages` — pass, 7 packages; `pnpm exec tsc --noEmit -p ecs_example/tsconfig.json --pretty false` — pass; `git diff --check` — pass; source audit старого API и `EntityAccess<AppState>` — no hits. README, API cheatsheet, TYPES cheatsheet, examples и tests отражают provider contract `entities: () => EntityAccess<AppMachines>`, `entities().get(...)`, `entities().maybe(...)`, `manager.entities().get(...)`. Запрещенные docs build commands не запускались: `pnpm run build`, `pnpm --filter @lite-fsm/docs build`, `pnpm run docs:build`, `pnpm run pages:build*`, `next build` внутри `apps/docs`. Residual risk: отдельный coverage report не запускался; покрытие подтверждено полным Vitest suite и Tstyche/type gates.
