# Журнал реализации ТЗ public plugin API finalization

Этот файл фиксирует краткий прогресс реализации ТЗ:

- [`tz-plugin-system-public-api-finalization.md`](./tz-plugin-system-public-api-finalization.md)

Цель журнала — дать следующему агенту точку продолжения после сброса контекста. Журнал не заменяет ТЗ, не является changelog и не должен подробно пересказывать diff.

## Правила ведения

- Перед продолжением работы прочитать ТЗ и этот журнал.
- Продолжать первый этап со статусом не `done`.
- Не переходить к следующему этапу, если текущий этап не прошел gate из ТЗ.
- Если этап имеет статус `blocked`, не продолжать следующий этап до ручного решения блокера и обновления статуса.
- Обновлять журнал в конце каждого этапа и после значимого промежуточного результата, если этап большой.
- Записи держать короткими: что сделано, какие файлы/модули затронуты, какие проверки запускались, какие риски остались.
- Не фиксировать каждую мелкую правку тестов. Фиксировать закрытие сценариев, coverage gaps, перенос ownership поведения и важные решения.
- Для нового и измененного чистого кода требуется 100% coverage по statements/branches/functions/lines.
- 100% coverage не считается достаточным без сценарных тестов: happy path, негативные type-level контракты, runtime validation, composition errors, взаимодействие нескольких plugins, порядок выполнения и регрессия без plugins.
- Агент не запускает docs build и команды, которые транзитивно запускают docs build.
- Полная документация сайта в `apps/docs` выполняется отдельной задачей; это ТЗ закрывает только cheatsheets, documentation fixture и отсутствие legacy examples.
- Builder plugin values не подключаются к `MachineManager` до этапа 3; этапы 1-2 закрывают builder/local validation и type-level extraction.

## Статусы

- `not started` — этап еще не начат.
- `in progress` — этап начат, но критерии приемки или test/coverage gate еще не закрыты.
- `done` — этап реализован, критерии приемки выполнены, проверки и coverage gate закрыты.
- `blocked` — продолжение невозможно без решения, которое должен принять человек.

## Текущий указатель

- Активное ТЗ: `tz-plugin-system-public-api-finalization.md`
- Активный этап: ТЗ завершено
- Статус: `done`
- Следующее действие: нет.

## Сводка по этапам

| Этап | Название | Статус | Последнее обновление |
| --- | --- | --- | --- |
| 1 | Builder API, opaque plugin value и local validation | `done` | 2026-05-25 |
| 2 | Type-level capabilities и helper types | `done` | 2026-05-25 |
| 3 | Normalized registry и встроенный `instance` storage | `done` | 2026-05-25 |
| 4 | `routeMeta` и `manager` | `done` | 2026-05-25 |
| 5 | `intercept` и `hooks` | `done` | 2026-05-25 |
| 6 | `scopedDeps` и `scopedTransition` | `done` | 2026-05-26 |
| 7 | `defineStorageRuntime` и helper types | `done` | 2026-05-26 |
| 8 | Runtime storage section | `done` | 2026-05-26 |
| 9 | Рефакторинг, чистка и полировка | `done` | 2026-05-26 |
| 10 | Документация и финальная проверка | `done` | 2026-05-26 |

## Шаблон записи

Копировать шаблон в раздел нужного этапа.

```md
### YYYY-MM-DD — Этап N — Название

- Статус: `in progress | done | blocked`
- Scope: кратко какие пункты этапа закрывались.
- Реализация: ключевые модули и решения, без подробного diff.
- Тесты: какие runtime/type/documentation fixture tests добавлены или обновлены.
- Проверки: команды и результат.
- Coverage: статус 100% coverage по новому и измененному коду; если не закрыто, перечислить gaps.
- Сценарии: какие реальные public API сценарии и негативные контракты покрыты.
- Совместимость: какие behavior tests подтвердили сохранение public behavior.
- Открыто: конкретные риски, TODO или blocker.
- Следующее действие: один короткий следующий шаг.
```

## Ход реализации

### Этап 1 — Builder API, opaque plugin value и local validation

Статус: `done`

Записи:

### 2026-05-25 — Этап 1 — Builder API, opaque plugin value и local validation

- Статус: `done`
- Scope: введен public builder `definePlugin().create(...)`, opaque value с internal marker/payload, local validation DSL sections; `MachineManager` runtime pipeline не менялся и builder values к нему не подключались.
- Реализация: `packages/core/src/plugin.ts` переписан на builder API и normalized payload; legacy `definePlugin({ ... })` теперь бросает `LITE_FSM_INVALID_PLUGIN_DEFINITION`; внутренний preset-путь `install(ctx)` отделен через `defineRuntimePlugin`; public entrypoint больше не экспортирует legacy registry/install/capability types.
- Тесты: добавлены `tests/core/plugin-system-stage1.test.ts` и `tests/types/plugin-system-stage1.tst.ts`; покрыты literal `name`, opaque marker/payload, contextual typing для `AnyEvent`, `PluginEvents`, `HostEvents | PluginEvents`, запрет direct-call/install/storage и runtime validation ошибок.
- Проверки: `pnpm --filter @lite-fsm/core check-types` — pass; `pnpm exec vitest run tests/core/plugin-system-stage1.test.ts` — pass; `pnpm exec tstyche tests/types/plugin-system-stage1.tst.ts` — pass; `pnpm exec vitest run tests/core/plugin-system-stage1.test.ts --coverage --coverage.include=packages/core/src/plugin.ts` — pass.
- Coverage: focused coverage для нового runtime builder кода `packages/core/src/plugin.ts` — 100% statements/branches/functions/lines. Полный `pnpm run test:coverage` не запускался на этапе 1; общий gate по ТЗ остается для этапов 9-10.
- Сценарии: happy path no-op plugin, DSL normalization без callback side effects, invalid name/unknown section/empty sections/non-function entries/invalid hooks/intercept/storage/direct-call/install, регрессия `MachineManager` без пользовательских plugins.
- Совместимость: поведение `MachineManager` без plugins подтверждено focused runtime test; пользовательские builder plugins намеренно не передаются в `MachineManager` до этапа 3.
- Открыто: helper extraction, `defineStorageRuntime`, runtime registry integration и удаление внутреннего legacy install path из manager pipeline остаются для следующих этапов.
- Следующее действие: при отдельном разрешении начать этап 2 — type-level capabilities и helper types.

### Этап 2 — Type-level capabilities и helper types

Статус: `done`

Записи:

### 2026-05-25 — Этап 2 — Type-level capabilities и helper types

- Статус: `done`
- Scope: реализованы public helper types для extraction из `definePlugin().create(...)` values и runtime tuple/union без runtime-регистрации plugin sections.
- Реализация: `packages/core/src/plugin.ts` извлекает `PluginManagerEvents`, raw `PluginRouteMeta`, `PluginScopedDeps`, `PluginScopedTransition`, `PluginManagerExtensions`, `PluginMachineExtensions` и `EffectDeps`; `packages/core/src/index.ts` экспортирует только новые helper names; `interfaces.ts` использует новые helper types для type-level composition без изменения `MachineManager` pipeline.
- Тесты: добавлен `tests/types/plugin-system-stage2.tst.ts`; обновлен `tests/types/exports-surface.tst.ts` под новый public surface без legacy `PluginCapabilities`, `PluginInstallContext`, `PluginTransitionEvents`, `PluginActionMeta`, `PluginDeps`, `PluginTransitionExtensions`.
- Проверки: `pnpm --filter @lite-fsm/core check-types` — pass; `pnpm exec tstyche tests/types/plugin-system-stage2.tst.ts` — pass; `pnpm exec tstyche tests/types/exports-surface.tst.ts` — pass; regression `pnpm exec tstyche tests/types/plugin-system-stage1.tst.ts` — pass; regression `pnpm exec vitest run tests/core/plugin-system-stage1.test.ts` — pass; `git diff --check` — pass.
- Coverage: runtime-код не менялся; этап закрыт focused type tests. Новый/измененный чистый runtime code отсутствует, full coverage gate остается для этапов 9-10.
- Сценарии: annotated `routeMeta` resolver `(value: string, ctx) => ...`, unannotated route meta value как `unknown`, tuple/union extraction, HostEvents exclusion из manager events, scoped deps/transition extraction, `EffectDeps` без callable core transition, manager event composition только из текущего tuple, явное включение `PluginManagerEvents` в machine events.
- Совместимость: builder plugin values не передавались в `MachineManager`; runtime registration sections не подключались; storage builder не добавлялся.
- Открыто: manager runtime pipeline, normalized registry, route meta optional semantics в `manager.transition(...).meta`, scoped runtime и storage DSL остаются для следующих этапов.
- Следующее действие: после проверки главным агентом начинать этап 3 только отдельной задачей.

### Этап 3 — Normalized registry и встроенный `instance` storage

Статус: `done`

Записи:

### 2026-05-25 — Этап 3 — Normalized registry и встроенный `instance` storage

- Статус: `done`
- Scope: подключен normalized registry path для preset и user plugins; открыт `MachineManager(..., { plugins })` только для marked builder values; legacy structural plugins отклоняются.
- Реализация: `createPluginRegistry` получил `addPlugin(normalizedPlugin)` и регистрирует entries в порядке `storage`, `routeMeta`, `scopedDeps`, `scopedTransition`, `manager`, `intercept`, `hooks`; на этапе 3 user sections кроме storage preset валидируются/игнорируются без runtime behavior. `instanceRuntimePlugin` стал internal `NormalizedPlugin` с storage owner `@lite-fsm/core/instance-runtime`; `PluginInstallContext`, `defineRuntimePlugin`, `assertInstallOpen`, `installContext` и `plugin.install(ctx)` убраны из `packages/core/src` runtime path.
- Тесты: добавлены `tests/core/plugin-system-stage3.test.ts` и `tests/types/plugin-system-stage3.tst.ts`; обновлен canary `tests/types/exports-surface.tst.ts` под открытый `plugins?`.
- Проверки: `pnpm --filter @lite-fsm/core check-types` — pass; `pnpm exec vitest run tests/core/plugin-system-stage3.test.ts` — pass; regression `pnpm exec vitest run tests/core/plugin-system-stage3.test.ts tests/core/plugin-system-stage1.test.ts` — pass; `pnpm exec tstyche tests/types/plugin-system-stage3.tst.ts tests/types/plugin-system-stage2.tst.ts tests/types/plugin-system-stage1.tst.ts tests/types/exports-surface.tst.ts` — pass; `git diff --check` — pass; source audit по legacy install names в `packages/core/src` — pass.
- Coverage: `pnpm exec vitest run tests/core/plugin-system-stage3.test.ts --coverage --coverage.include=packages/core/src/runtime/instance/plugin.ts --coverage.reporter=text` — 100% statements/branches/functions/lines для нового normalized `instance` preset file. Новый manager/registry path закрыт сценарными runtime tests: marked accept, structural reject, duplicate names, no-op invariants, disabled future sections и отсутствие legacy install path. Полный coverage gate остается для этапов 9-10.
- Сценарии: `MachineManager(machines)`, `MachineManager(machines, { plugins: [] })`, no-op builder plugin, duplicate plugin names, legacy `{ name, install }`, type-level tuple events, HostEvents exclusion и wide plugin array.
- Совместимость: no-op plugin не меняет reducers, middleware, subscribers, effects, snapshot, `dehydrate` и `hydrate`; dispatch order, routing priority и snapshot format не менялись; public storage builder не добавлялся.
- Открыто: runtime behavior для `routeMeta`, `manager`, `intercept`, `hooks`, `scopedDeps`, `scopedTransition` и user `storage` остается для этапов 4-8.
- Следующее действие: после проверки главным агентом начинать этап 4 отдельной задачей.

### Этап 4 — `routeMeta` и `manager`

Статус: `done`

Записи:

### 2026-05-25 — Этап 4 — `routeMeta` и `manager`

- Статус: `done`
- Scope: подключены runtime sections `routeMeta` и `manager` из builder plugins; sections `intercept`, `hooks`, `scopedDeps`, `scopedTransition` и пользовательский `storage` оставлены отключенными.
- Реализация: `routeMeta` entries регистрируются через normalized registry path в текущий routing runtime; reserved/duplicate route keys используют `LITE_FSM_DUPLICATE_ROUTE_META_KEY`. Для `manager` добавлен stage4 runtime store с проверками `LITE_FSM_DUPLICATE_MANAGER_EXTENSION_KEY` и `LITE_FSM_MANAGER_EXTENSION_CORE_KEY`; factory вызывается при создании manager после initial state. Типы `manager.transition(...).meta` включают optional route meta текущего plugin tuple; `PluginRouteMeta` остается raw map, `PluginManagerExtensions` — one-generic helper.
- Тесты: добавлены `tests/core/plugin-system-stage4.test.ts` и `tests/types/plugin-system-stage4.tst.ts`; обновлены stage3 regression type/runtime tests и `tests/types/exports-surface.tst.ts`.
- Проверки: `pnpm --filter @lite-fsm/core check-types` — pass; `pnpm exec vitest run tests/core/plugin-system-stage4.test.ts tests/core/plugin-system-stage3.test.ts tests/core/plugin-system-stage1.test.ts` — pass; `pnpm exec tstyche tests/types/plugin-system-stage4.tst.ts tests/types/plugin-system-stage1.tst.ts tests/types/plugin-system-stage2.tst.ts tests/types/plugin-system-stage3.tst.ts tests/types/exports-surface.tst.ts` — pass; `git diff --check` — pass.
- Coverage: `pnpm exec vitest run tests/core/plugin-system-stage4.test.ts --coverage --coverage.include=packages/core/src/runtime/kernel/pluginSections.ts --coverage.reporter=text` — 100% statements/branches/functions/lines для нового чистого runtime-модуля stage4. Полный `pnpm run test:coverage` не запускался; общий gate остается для этапов 9-10.
- Сценарии: route resolver участвует в routing и не валидирует input value; invalid resolver result бросает текущий route resolver error; duplicate/reserved route keys диагностируются; route meta optional в manager action meta и доступна только подключенному tuple; literal `ctx.key`; `ctx.action` как `ManagerAction<HostEvents | PluginEvents>`; manager extension доступен на returned manager; factory вызывается один раз после initial state и может читать state/deps и dispatch; duplicate/core manager keys диагностируются.
- Совместимость: no-op behavior и local validation stage1 сохранены; stage3 normalized plugin value/structural reject regressions сохранены; будущие DSL sections после этапа 4 не вызываются.
- Открыто: `intercept`, `hooks`, `scopedDeps`, `scopedTransition`, `defineStorageRuntime` и пользовательский `storage` остаются для этапов 5-8.
- Следующее действие: начинать этап 5 отдельной задачей.

### Этап 5 — `intercept` и `hooks`

Статус: `done`

Записи:

### 2026-05-25 — Этап 5 — `intercept` и `hooks`

- Статус: `done`
- Scope: подключены runtime sections `intercept` и `hooks` из builder plugins; `scopedDeps`, `scopedTransition`, `defineStorageRuntime` и пользовательский `storage` оставлены отключенными.
- Реализация: `createPluginRegistry.addPlugin(...)` регистрирует interceptors и dispatch hooks в plugin order. Scoped sections остаются explicit no-op до этапа 6. Существующий dispatcher contract в `createMachineManagerFactory.ts` сохранен: interceptors идут после storage `prepareAction`, replacement пересчитывает route, hooks выполняются по фазам.
- Тесты: добавлены `tests/core/plugin-system-stage5.test.ts` и `tests/types/plugin-system-stage5.tst.ts`; stage3 regression обновлен так, чтобы будущими оставались только scoped sections.
- Проверки: `pnpm --filter @lite-fsm/core check-types` — pass; `pnpm exec vitest run tests/core/plugin-system-stage5.test.ts tests/core/plugin-system-stage4.test.ts tests/core/plugin-system-stage3.test.ts tests/core/plugin-system-stage1.test.ts` — pass; `pnpm exec tstyche tests/types/plugin-system-stage5.tst.ts tests/types/plugin-system-stage4.tst.ts tests/types/plugin-system-stage3.tst.ts tests/types/plugin-system-stage2.tst.ts tests/types/plugin-system-stage1.tst.ts tests/types/exports-surface.tst.ts` — pass.
- Coverage: `pnpm exec vitest run tests/core/plugin-system-stage5.test.ts tests/core/plugin-system-stage4.test.ts tests/core/plugin-system-stage3.test.ts tests/core/plugin-system-stage1.test.ts --coverage --coverage.include=packages/core/src/runtime/kernel/registry.ts --coverage.reporter=text` — 100% statements/branches/functions/lines для измененного runtime registry path.
- Сценарии: prepared action и original action, plugin order interceptors/hooks, replacement route recalc, visibility для следующих interceptors/hooks/reducers/subscribers/effects, `stopInterceptors`, `skipDelivery`, ignored hook return value, generic runtime no-filter, hook reentrancy guard, thrown errors before/after commit и `reportError`.
- Совместимость: stage1/stage3/stage4 runtime regressions и stage1-stage5 type regressions сохранены; dispatch order не менялся.
- Открыто: `scopedDeps`, `scopedTransition`, `defineStorageRuntime` и пользовательский `storage` остаются для этапов 6-8.
- Следующее действие: начинать этап 6 отдельной задачей.

### Этап 6 — `scopedDeps` и `scopedTransition`

Статус: `done`

Записи:

### 2026-05-26 — Этап 6 — `scopedDeps` и `scopedTransition`

- Статус: `done`
- Scope: подключены inline `scopedDeps` и `scopedTransition` без public registry context, `keys`, `Object.assign(...)` и ручной аннотации `scope`; пользовательский `storage` не реализовывался.
- Реализация: `plugin.ts` разделяет observer `scope.event` и plugin-only `scope.transition`; `registry.ts` регистрирует normalized scoped entries, валидирует ownership/core collisions и собирает invocation deps с сохранением callable core/actor transition helpers.
- Тесты: добавлены `tests/core/plugin-system-stage6.test.ts` и `tests/types/plugin-system-stage6.tst.ts`; обновлены stage1 type expectations и stage3/stage5 regression tests, которые раньше фиксировали scoped sections как no-op.
- Проверки: `pnpm --filter @lite-fsm/core check-types` — pass; `pnpm exec vitest run tests/core/plugin-system-stage6.test.ts tests/core/plugin-system-stage5.test.ts tests/core/plugin-system-stage4.test.ts tests/core/plugin-system-stage3.test.ts tests/core/plugin-system-stage1.test.ts` — pass; `pnpm exec tstyche tests/types/plugin-system-stage6.tst.ts tests/types/plugin-system-stage5.tst.ts tests/types/plugin-system-stage4.tst.ts tests/types/plugin-system-stage3.tst.ts tests/types/plugin-system-stage2.tst.ts tests/types/plugin-system-stage1.tst.ts tests/types/exports-surface.tst.ts` — pass; `git diff --check` — pass.
- Coverage: `pnpm exec vitest run tests/core/plugin-system-stage6.test.ts tests/core/plugin-system-stage5.test.ts tests/core/plugin-system-stage4.test.ts tests/core/plugin-system-stage3.test.ts tests/core/plugin-system-stage1.test.ts --coverage --coverage.include=packages/core/src/runtime/kernel/registry.ts --coverage.reporter=text --coverage.thresholds.statements=100 --coverage.thresholds.branches=100 --coverage.thresholds.functions=100 --coverage.thresholds.lines=100` — 100% statements/branches/functions/lines для измененного registry path.
- Сценарии: domain effects, storage reactions, actor transition helpers, command-style transition method, plugin-only `scope.transition`, no arbitrary transition events без `PluginEvents`, `EffectDeps` tuple/union, callable `transition(action)` плюс methods, `manager.transition` без methods, duplicate/core/app key diagnostics, invalid empty scoped key и empty section local validation.
- Совместимость: order effects/reactions не менялся; `manager.setDependencies(...)` не менялся; stage1/stage3/stage4/stage5 regression suites прошли.
- Открыто: returned/unowned-key diagnostic больше не применим к public key-mapped DSL, потому что factory result является значением declared key; legacy `ScopedDepsFactory`/`ScopedTransitionFactory` не экспортировались из public entrypoint.
- Следующее действие: начинать этап 7 — `defineStorageRuntime` и helper types — только отдельной задачей.

### Этап 7 — `defineStorageRuntime` и helper types

Статус: `done`

Записи:

### 2026-05-26 — Этап 7 — `defineStorageRuntime` и helper types

- Статус: `done`
- Scope: добавлен public builder `defineStorageRuntime<Extension>().create(...)`, opaque storage definition для `definePlugin().create({ storage: [...] })` и extraction `PluginMachineExtensions<Plugins>` без runtime-регистрации пользовательского storage section.
- Реализация: storage builder и local validation вынесены в `packages/core/src/pluginStorage.ts`; `plugin.ts` принимает только marked storage definitions в array section и выводит normalized machine extensions с `storage: Kind`; `registry.ts` отличает user storage entries от internal preset entries и до этапа 8 бросает `LITE_FSM_INVALID_PLUGIN_DEFINITION`; встроенный `instance` preset остается internal normalized entry.
- Тесты: заменены legacy `tests/core/plugin-system-stage7.test.ts` и `tests/types/plugin-system-stage7.tst.ts`; обновлен public export canary `tests/types/exports-surface.tst.ts`.
- Проверки: `pnpm --filter @lite-fsm/core check-types` — pass; `pnpm exec vitest run tests/core/plugin-system-stage7.test.ts tests/core/plugin-system-stage6.test.ts tests/core/plugin-system-stage5.test.ts tests/core/plugin-system-stage4.test.ts tests/core/plugin-system-stage3.test.ts tests/core/plugin-system-stage1.test.ts` — pass; `pnpm exec tstyche tests/types/plugin-system-stage7.tst.ts tests/types/plugin-system-stage6.tst.ts tests/types/plugin-system-stage5.tst.ts tests/types/plugin-system-stage4.tst.ts tests/types/plugin-system-stage3.tst.ts tests/types/plugin-system-stage2.tst.ts tests/types/plugin-system-stage1.tst.ts tests/types/exports-surface.tst.ts` — pass.
- Coverage: `pnpm exec vitest run tests/core/plugin-system-stage7.test.ts tests/core/plugin-system-stage6.test.ts tests/core/plugin-system-stage5.test.ts tests/core/plugin-system-stage4.test.ts tests/core/plugin-system-stage3.test.ts tests/core/plugin-system-stage1.test.ts --coverage --coverage.include=packages/core/src/plugin.ts --coverage.include=packages/core/src/pluginStorage.ts --coverage.include=packages/core/src/runtime/kernel/registry.ts --coverage.reporter=text --coverage.thresholds.statements=100 --coverage.thresholds.branches=100 --coverage.thresholds.functions=100 --coverage.thresholds.lines=100` — 100% statements/branches/functions/lines.
- Сценарии: literal `kind`, normalized `PluginMachineExtensions`, multiple storage definitions union, plugin without storage `never`, tuple/union helper inputs, `TypedCreateMachineFn` declared storage kinds, public `compileTemplate` без ручных `key`/`kind`, optional runtime blocks, wide runtime contexts, object/inline storage section type/runtime reject, invalid storage runtime shape, empty `kind`, unknown fields, invalid optional blocks, stage7 manager guard и регрессия built-in `instance`.
- Совместимость: stage1-stage6 focused runtime/type regressions сохранены; snapshot format и dispatch order не менялись; пользовательский storage section в `MachineManager` намеренно не подключен.
- Открыто: этап 8 должен подключить runtime storage section, duplicate storage diagnostics и routeMetaKeys missing resolver validation для user storage.
- Следующее действие: начинать этап 8 отдельной задачей.

### Этап 8 — Runtime storage section

Статус: `done`

Записи:

### 2026-05-26 — Этап 8 — Runtime storage section

- Статус: `done`
- Scope: подключен пользовательский `storage` section к normalized runtime registry без изменения snapshot format и без custom runtime preset API.
- Реализация: `registry.ts` регистрирует plugin storage entries тем же путем, что и internal `instance`; `plugin.ts` валидирует duplicate storage `kind` внутри одного plugin как `LITE_FSM_INVALID_PLUGIN_DEFINITION`, межплагиновые дубликаты остаются `LITE_FSM_DUPLICATE_STORAGE_KIND`.
- Тесты: legacy stage8 runtime/type suites заменены на storage-section сценарии; stage7 regression обновлен после снятия runtime-block.
- Проверки: `pnpm --filter @lite-fsm/core check-types` — pass; `pnpm exec vitest run tests/core/plugin-system-stage8.test.ts tests/core/plugin-system-stage7.test.ts tests/core/plugin-system-stage6.test.ts tests/core/plugin-system-stage5.test.ts tests/core/plugin-system-stage4.test.ts tests/core/plugin-system-stage3.test.ts tests/core/plugin-system-stage1.test.ts` — pass; `pnpm exec tstyche tests/types/plugin-system-stage8.tst.ts tests/types/plugin-system-stage7.tst.ts tests/types/plugin-system-stage6.tst.ts tests/types/plugin-system-stage5.tst.ts tests/types/plugin-system-stage4.tst.ts tests/types/plugin-system-stage3.tst.ts tests/types/plugin-system-stage2.tst.ts tests/types/plugin-system-stage1.tst.ts tests/types/exports-surface.tst.ts` — pass; `git diff --check` — pass.
- Coverage: `pnpm exec vitest run tests/core/plugin-system-stage8.test.ts tests/core/plugin-system-stage7.test.ts tests/core/plugin-system-stage6.test.ts tests/core/plugin-system-stage5.test.ts tests/core/plugin-system-stage4.test.ts tests/core/plugin-system-stage3.test.ts tests/core/plugin-system-stage1.test.ts --coverage --coverage.include=packages/core/src/plugin.ts --coverage.include=packages/core/src/runtime/kernel/registry.ts --coverage.reporter=text --coverage.thresholds.statements=100 --coverage.thresholds.branches=100 --coverage.thresholds.functions=100 --coverage.thresholds.lines=100` — 100% statements/branches/functions/lines для измененного clean runtime path.
- Сценарии: runtime registration из plugin storage section, declared storage kind compile/init/transition, порядок storage definitions, duplicate kind внутри plugin и между plugins/preset, invalid/empty/object/inline storage sections, `routeMetaKeys` missing resolver и успешный resolver path.
- Совместимость: stage1/stage3/stage4/stage5/stage6/stage7 runtime regressions и stage1-stage8 type regressions сохранены; built-in `instance` preset продолжает регистрироваться через normalized path.
- Открыто: stage9 cleanup/refactor и финальная документационная полировка остаются отдельными этапами.
- Следующее действие: начинать этап 9 отдельной задачей.

### Этап 9 — Рефакторинг, чистка и полировка

Статус: `done`

Записи:

### 2026-05-26 — Этап 9 — Рефакторинг, чистка и полировка

- Статус: `done`
- Scope: проведена целевая чистка plugin runtime/source и plugin-stage tests без изменения public API, dispatch order, routing priority, snapshot format и error semantics этапов 1-8.
- Реализация: удален временный `source: "plugin"` marker из normalized storage entries; удалены неиспользуемые legacy scoped factory/context types с `keys`; internal routing registry method переименован с `registerMetaKey` на `registerRouteMeta`; `ManagerFromPlugins` больше не использует промежуточный `ManagerExtensionsForPlugins`; stale stage9 snapshot suite переведен на `defineStorageRuntime().create(...)` и normalized preset helper; options overload у `MachineManager` теперь тоже использует `Plugins = readonly []`, поэтому `MachineManager<S, P>(config, optsWithoutPlugins)` не расширяет события wide plugin union.
- Тесты: обновлены focused plugin-stage tests, включая stage9 storage snapshot regression; stale legacy tests `tests/core/plugins.test.ts`, `tests/core/routing-registry.test.ts`, `tests/core/dispatch-hooks.test.ts`, `tests/core/runtime-preset.test.ts`, `tests/core/runtime-ownership.test.ts` и `tests/types/plugins.tst.ts` переведены с `install(ctx)`/registry mutation на final builder sections, normalized internal preset entries и `defineStorageRuntime().create(...)`; `tests/types/plugins.tst.ts` добавляет regression на явные generic `MachineManager<S, P>(..., optsWithoutPlugins)`; `tests/types/regression-matrix.tst.ts` обновлен под final public value export `defineStorageRuntime`; source-scanning stage3 test удален как implementation-detail test, его покрывает stage9 `rg` audit.
- Проверки: `pnpm --filter @lite-fsm/core check-types` — pass; `pnpm exec vitest run tests/core/plugins.test.ts tests/core/routing-registry.test.ts` — pass; `pnpm exec tstyche tests/types/plugins.tst.ts` — pass; `pnpm exec vitest run tests/core/dispatch-hooks.test.ts tests/core/runtime-preset.test.ts tests/core/runtime-ownership.test.ts tests/core/plugins.test.ts tests/core/routing-registry.test.ts tests/core/plugin-system-stage9.test.ts tests/core/plugin-system-stage8.test.ts tests/core/plugin-system-stage7.test.ts tests/core/plugin-system-stage6.test.ts tests/core/plugin-system-stage5.test.ts tests/core/plugin-system-stage4.test.ts tests/core/plugin-system-stage3.test.ts tests/core/plugin-system-stage1.test.ts` — pass; `pnpm exec tstyche tests/types/plugins.tst.ts tests/types/plugin-system-stage9.tst.ts tests/types/plugin-system-stage8.tst.ts tests/types/plugin-system-stage7.tst.ts tests/types/plugin-system-stage6.tst.ts tests/types/plugin-system-stage5.tst.ts tests/types/plugin-system-stage4.tst.ts tests/types/plugin-system-stage3.tst.ts tests/types/plugin-system-stage2.tst.ts tests/types/plugin-system-stage1.tst.ts tests/types/exports-surface.tst.ts` — pass; `pnpm exec tstyche tests/types/lite-fsm.tst.tsx tests/types/manager-callback-performance.tst.ts tests/types/regression-matrix.tst.ts tests/types/plugins.tst.ts tests/types/plugin-system-stage9.tst.ts tests/types/exports-surface.tst.ts` — pass; `pnpm run test:types` — pass; `git diff --check` — pass.
- Coverage: `pnpm exec vitest run tests/core/dispatch-hooks.test.ts tests/core/runtime-preset.test.ts tests/core/runtime-ownership.test.ts tests/core/plugins.test.ts tests/core/routing-registry.test.ts tests/core/plugin-system-stage9.test.ts tests/core/plugin-system-stage8.test.ts tests/core/plugin-system-stage7.test.ts tests/core/plugin-system-stage6.test.ts tests/core/plugin-system-stage5.test.ts tests/core/plugin-system-stage4.test.ts tests/core/plugin-system-stage3.test.ts tests/core/plugin-system-stage1.test.ts --coverage --coverage.include=packages/core/src/plugin.ts --coverage.include=packages/core/src/pluginStorage.ts --coverage.include=packages/core/src/runtime/kernel/registry.ts --coverage.include=packages/core/src/runtime/kernel/pluginSections.ts --coverage.include=packages/core/src/runtime/kernel/routing.ts --coverage.reporter=text --coverage.thresholds.statements=100 --coverage.thresholds.branches=100 --coverage.thresholds.functions=100 --coverage.thresholds.lines=100` — 100% statements/branches/functions/lines.
- Сценарии: сохранены storage registration, storage snapshot round-trip/filter/hydrate errors, route meta registration, routing stripping/priority, invalid resolver diagnostics, duplicate route keys, stage1-stage8 runtime/type regressions и structural plugin reject.
- Совместимость: `MachineManager(machines)` без plugins, normalized `instance` preset, plugin storage, route meta, manager extensions, intercept/hooks, scoped deps/transition и storage snapshot behavior подтверждены focused regressions; runtime order и snapshot envelope не менялись.
- Аудит: `rg -n "install\\s*\\(|PluginInstallContext|PluginCapabilities|createPluginStorage|registerMetaKey|\\bcreatePlugin\\b|ctx\\.storage\\.register|ActionRegistry|DispatchRegistry|ManagerExtensionRegistry|DepsExtensionRegistry|ScopedDepsFactory|ScopedTransitionFactory" packages/core/src tests/core tests/types` — no matches. Отдельный audit по cheatsheets/docs показывает оставшиеся transitional `install(ctx)` упоминания в `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`, `PLUGIN-SYSTEM-CHEATSHEET.md` и `apps/docs/app/api/core/page.mdx`; эти файлы намеренно не переписывались на этапе 9 и переданы этапу 10.
- Открыто: stage10 должен переписать cheatsheets/documentation fixture/public docs examples и выполнить финальный search audit по public examples.
- Следующее действие: начинать этап 10 — Документация и финальная проверка — только отдельной задачей.

### Этап 10 — Документация и финальная проверка

Статус: `done`

Записи:

### 2026-05-26 — Этап 10 — Документация и финальная проверка

- Статус: `done`
- Scope: переписаны финальные plugin cheatsheets и placeholders в docs source без запуска docs build; добавлена documentation fixture и runtime/type tests для public examples.
- Реализация: `PLUGIN-SYSTEM-CHEATSHEET.md` создан как финальный контракт sections; plugin sections в `API-CHEATSHEET.md` и `TYPES-CHEATSHEET.md` переведены с transitional формулировок на `definePlugin<PluginEvents, HostEvents>().create(...)`, helper types, route meta, scoped extensions и advanced storage runtime; `apps/docs/app/api/core/page.mdx` и `apps/docs/app/packages/core/page.mdx` оставлены краткими placeholders без old plugin examples.
- Тесты: добавлены `tests/fixtures/plugin-system-documentation.ts`, `tests/core/plugin-system-documentation.test.ts`, `tests/types/plugin-system-documentation.tst.ts`; fixture покрывает no-op plugin, route meta, manager extension, intercept/hooks, scoped deps/transition, storage runtime и plugin event с явным `AppEvents = HostEvents | PluginManagerEvents<AppPlugins>`.
- Проверки: `pnpm exec tstyche tests/types/plugin-system-documentation.tst.ts` — pass; `pnpm exec vitest run tests/core/plugin-system-documentation.test.ts` — pass; `pnpm run test:types` — pass; focused runtime plugin-system suite с documentation test — pass, 14 files / 126 tests; `pnpm run check-types` — pass; `pnpm run lint` — pass; `git diff --check` — pass.
- Coverage: `pnpm run test:coverage` — pass, 94 files passed / 2 skipped, 1170 tests passed / 14 skipped, 100% statements/branches/functions/lines.
- Сценарии: public examples используют только final builder APIs; `routeMeta` описан как routing contract со scalar keys `entityId`, `cacheKey`, `documentId`, `tenantId`; storage examples используют `defineStorageRuntime<Extension>().create(...)`, `compileTemplate(ctx)` без ручных `key`/`kind` и inline contextual methods; `effectDeps`/`reactionDeps` описаны как type contract; configurable plugins показаны как factory functions.
- Совместимость: в test-only cleanup для root `check-types` уточнены аннотации уже существующих plugin-stage tests без изменения runtime expectations; focused runtime regressions stage1/stage3-stage9 и full coverage сохранены.
- Аудит: `rg -n "install\\s*\\(|PluginInstallContext|PluginCapabilities|createPluginStorage|registerMetaKey|ctx\\.storage\\.register|\\bcreatePlugin\\b|Object\\.assign\\([^\\n]*\\{ keys|auditTarget|as ManagerAction<" API-CHEATSHEET.md PLUGIN-SYSTEM-CHEATSHEET.md TYPES-CHEATSHEET.md apps/docs tests/fixtures/plugin-system-documentation.ts tests/core/plugin-system-documentation.test.ts tests/types/plugin-system-documentation.tst.ts` — no matches. `rg -n "install\\s*\\(|PluginInstallContext|PluginCapabilities|createPluginStorage|registerMetaKey|ctx\\.storage\\.register|ActionRegistry|DispatchRegistry|ManagerExtensionRegistry|DepsExtensionRegistry|ScopedDepsFactory|ScopedTransitionFactory|Object\\.assign\\([^\\n]*\\{ keys|auditTarget" packages/core/src tests/core tests/types` — no matches. `rg -n "Plugin system public API находится на финализации|финализации|storage DSL|install\\s*\\(" API-CHEATSHEET.md PLUGIN-SYSTEM-CHEATSHEET.md TYPES-CHEATSHEET.md apps/docs` — no matches.
- Открыто: docs build не запускался по правилу проекта; полноценная документация сайта остается отдельной задачей.
- Следующее действие: главному агенту выполнить итоговую сверку раздела 6 и закрыть ТЗ.

## Итоговая сверка

### 2026-05-26 — Финальный аудит раздела 6

- Статус: `done`
- Scope: главный агент сверил текущий worktree с полным критерием готовности из раздела 6 ТЗ после этапов 1-10.
- Проверки: `pnpm exec vitest run tests/core/plugin-system-documentation.test.ts tests/core/plugins.test.ts tests/core/routing-registry.test.ts tests/core/dispatch-hooks.test.ts tests/core/runtime-preset.test.ts tests/core/runtime-ownership.test.ts tests/core/plugin-system-stage9.test.ts tests/core/plugin-system-stage8.test.ts tests/core/plugin-system-stage7.test.ts tests/core/plugin-system-stage6.test.ts tests/core/plugin-system-stage5.test.ts tests/core/plugin-system-stage4.test.ts tests/core/plugin-system-stage3.test.ts tests/core/plugin-system-stage1.test.ts` — pass; `pnpm exec tstyche tests/types/plugin-system-documentation.tst.ts tests/types/plugins.tst.ts tests/types/plugin-system-stage9.tst.ts tests/types/plugin-system-stage8.tst.ts tests/types/plugin-system-stage7.tst.ts tests/types/plugin-system-stage6.tst.ts tests/types/plugin-system-stage5.tst.ts tests/types/plugin-system-stage4.tst.ts tests/types/plugin-system-stage3.tst.ts tests/types/plugin-system-stage2.tst.ts tests/types/plugin-system-stage1.tst.ts tests/types/exports-surface.tst.ts` — pass; `pnpm run test:types` — pass; `pnpm run check-types` — pass; `pnpm run test:coverage` — pass; `pnpm run lint` — pass; `git diff --check` — pass.
- Coverage: `pnpm run test:coverage` — 94 files passed / 2 skipped, 1170 tests passed / 14 skipped, 100% statements/branches/functions/lines.
- Аудит public examples: `rg -n "install\\s*\\(|PluginInstallContext|PluginCapabilities|createPluginStorage|registerMetaKey|ctx\\.storage\\.register|\\bcreatePlugin\\b|Object\\.assign\\([^\\n]*\\{ keys|auditTarget|as ManagerAction<" API-CHEATSHEET.md PLUGIN-SYSTEM-CHEATSHEET.md TYPES-CHEATSHEET.md apps/docs tests/fixtures/plugin-system-documentation.ts tests/core/plugin-system-documentation.test.ts tests/types/plugin-system-documentation.tst.ts` — no matches.
- Аудит source/tests: `rg -n "install\\s*\\(|PluginInstallContext|PluginCapabilities|createPluginStorage|registerMetaKey|ctx\\.storage\\.register|ActionRegistry|DispatchRegistry|ManagerExtensionRegistry|DepsExtensionRegistry|ScopedDepsFactory|ScopedTransitionFactory|Object\\.assign\\([^\\n]*\\{ keys|auditTarget" packages/core/src tests/core tests/types` — no matches.
- Сверка раздела 6: финальный authoring API задокументирован как `definePlugin<PluginEvents, HostEvents>().create(...)`; `MachineManager(..., { plugins })` принимает только marked values; capabilities выводятся из DSL sections; normalized runtime использует `addPlugin(normalizedPlugin)` и normalized `instance` preset; storage builder связывает runtime и machine extension без public `TemplateData`/`RuntimeState`/`SnapshotPayload` generics; cheatsheets и documentation fixture не содержат legacy examples.
- Открыто: docs build не запускался по правилу проекта; полноценная документация сайта остается отдельной задачей.
