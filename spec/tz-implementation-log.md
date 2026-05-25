# Журнал реализации ТЗ plugin system и entities

> Исторический журнал выполненной реализации. Не использовать как источник требований для финализации public plugin API.
> Актуальная работа описана в [`tz-plugin-system-public-api-finalization.md`](./tz-plugin-system-public-api-finalization.md).

Этот файл фиксирует краткий прогресс реализации трех актуальных реализационных ТЗ:

- [`tz-plugin-system-implementation.md`](./tz-plugin-system-implementation.md)
- [`tz-entities-implementation.md`](./tz-entities-implementation.md)
- [`tz-entities-implementation-part-2.md`](./tz-entities-implementation-part-2.md)

Цель журнала — дать следующему агенту точку продолжения после сброса контекста. Журнал не заменяет ТЗ, не является changelog и не должен подробно пересказывать diff.

## Правила ведения

- Перед продолжением работы прочитать соответствующее реализационное ТЗ и этот журнал.
- Продолжать первый этап со статусом не `done`, учитывая зависимости: сначала `tz-plugin-system-implementation.md`, затем `tz-entities-implementation.md`, затем `tz-entities-implementation-part-2.md`.
- Если первый незавершенный этап имеет статус `blocked`, не переходить к следующим этапам до ручного решения блокера и обновления статуса.
- Этапы 7-12 entities реализуются по `tz-entities-implementation-part-2.md`; этот файл самодостаточен, но начинать его можно только после gate этапа 6 из `tz-entities-implementation.md`.
- Обновлять журнал в конце каждого этапа и после значимого промежуточного результата, если этап большой.
- Записи должны быть короткими: что сделано, какие файлы/модули затронуты, какие проверки запускались, какие риски остались.
- Не фиксировать каждую мелкую правку тестов. Фиксировать только закрытие сценариев, coverage gaps, обновление tests под нового владельца поведения или важные решения.
- Не переходить к следующему этапу, если текущий этап не прошел gate из соответствующего ТЗ.
- Если тест поведения падает, сначала считать это regression. Тест обновляется только если он был привязан к удаленной или перенесенной internal function и поведение теперь принадлежит другому модулю.
- Агент не запускает docs build и команды, которые транзитивно запускают docs build.

## Статусы

- `not started` — этап еще не начат.
- `in progress` — этап начат, но критерии приемки или тестовый gate еще не закрыты.
- `done` — этап реализован, критерии приемки выполнены, проверки и coverage gate закрыты.
- `blocked` — продолжение невозможно без решения, которое должен принять человек.

## Текущий указатель

- Активное ТЗ: `tz-plugin-system-implementation.md`
- Активный этап: закрыт
- Статус: `done`
- Следующее действие: переходить к `tz-entities-implementation.md` / Этап 1 только отдельным стартом.

## Сводка по этапам

### `tz-plugin-system-implementation.md`

| Этап | Название | Статус | Последнее обновление |
| --- | --- | --- | --- |
| 1 | Plugin value и install registry | `done` | 2026-05-24 |
| 2 | Storage registry, runtime preset и default `"instance"` wiring | `done` | 2026-05-24 |
| 3 | `instanceStorageRuntime` и разделение ownership | `done` | 2026-05-24 |
| 4 | Routing meta registry | `done` | 2026-05-24 |
| 5 | Action interceptors и dispatch hooks | `done` | 2026-05-24 |
| 6 | TypeScript surface для machine extensions, transition events и action meta | `done` | 2026-05-24 |
| 7 | Scoped deps и scoped transition extensions | `done` | 2026-05-25 |
| 8 | Manager extensions | `done` | 2026-05-25 |
| 9 | Storage snapshot extension points | `done` | 2026-05-25 |
| 10 | Документация, examples и final verification | `done` | 2026-05-25 |

### `tz-entities-implementation.md`

| Этап | Название | Статус | Последнее обновление |
| --- | --- | --- | --- |
| 1 | Пакет `@lite-fsm/entities`, exports, plugin shell и `storage: "entity"` registration | `not started` | — |
| 2 | Schema descriptors и `EntityMachineExtension` | `not started` | — |
| 3 | Compile metadata, empty `EntityStore`, `ColumnarActorStore`, public lightweight state и `manager.entities` | `not started` | — |
| 4 | Entity lifecycle events, `__INIT`, internal `ENTITY_SPAWNED`/`ENTITY_DESPAWNED`, `payloadFor` | `not started` | — |
| 5 | Spawn events, entity spawn и public spawn event interceptor | `not started` | — |
| 6 | Columnar reduce pipeline, numeric event/state codes, buckets, routing и hot path guarantees | `not started` | — |

### `tz-entities-implementation-part-2.md`

| Этап | Название | Статус | Последнее обновление |
| --- | --- | --- | --- |
| 7 | Despawn, `despawnOn`, `transition.despawn(...)` и lifecycle cleanup | `not started` | — |
| 8 | Entity effects и scoped transition extensions | `not started` | — |
| 9 | Reactions и reaction error semantics | `not started` | — |
| 10 | Snapshot/hydrate через `snapshot.storage.entity` | `not started` | — |
| 11 | React hooks: `useEntitySnapshot`, `useEntityCount`, `useEntityList` | `not started` | — |
| 12 | Benchmarks, README/examples и final verification | `not started` | — |

## Шаблон записи

Копировать шаблон в раздел нужного ТЗ и этапа.

```md
### YYYY-MM-DD — tz-plugin-system-implementation.md / Этап N — Название

- Статус: `in progress | done | blocked`
- Scope: кратко какие пункты этапа закрывались.
- Реализация: ключевые модули и решения, без подробного diff.
- Тесты: какие runtime/type/snapshot/react/benchmark tests добавлены или обновлены.
- Проверки: команды и результат.
- Coverage: статус 100% coverage по новому и измененному коду; если не закрыто, перечислить gaps.
- Совместимость: какие behavior tests подтвердили сохранение public behavior.
- Открыто: конкретные риски, TODO или blocker.
- Следующее действие: один короткий следующий шаг.
```

Для entries по entities заменить имя ТЗ на `tz-entities-implementation.md` или `tz-entities-implementation-part-2.md`.

## Ход реализации `tz-plugin-system-implementation.md`

### Этап 1 — Plugin value и install registry

Статус: `done`

Записи:

### 2026-05-24 — tz-plugin-system-implementation.md / Этап 1 — Plugin value и install registry

- Статус: `done`
- Scope: добавлены plugin value, `definePlugin(...)`, пустой `PluginInstallContext`, `plugins` в `MachineManagerOptions` и install registry без future registry-полей.
- Реализация: `packages/core/src/plugin.ts` содержит public plugin types/helper и internal install registry с duplicate name диагностикой; `MachineManager(...)` устанавливает plugins один раз на init до разбора машин; public exports обновлены.
- Тесты: добавлены runtime tests `tests/core/plugins.test.ts`; добавлены type tests `tests/types/plugins.tst.ts`; обновлены export surface/regression matrix type canaries.
- Проверки: `pnpm exec vitest run tests/core/plugins.test.ts`; `pnpm exec tstyche tests/types/plugins.tst.ts tests/types/exports-surface.tst.ts`; `pnpm exec vitest run tests/core/plugins.test.ts --coverage --coverage.include=packages/core/src/plugin.ts --coverage.reporter=text --coverage.thresholds.statements=100 --coverage.thresholds.branches=100 --coverage.thresholds.functions=100 --coverage.thresholds.lines=100`; `pnpm exec vitest run tests/core tests/middleware tests/persist tests/react --coverage --coverage.include=packages/core/src/plugin.ts --coverage.include=packages/core/src/MachineManager.ts --coverage.reporter=text --coverage.thresholds.statements=100 --coverage.thresholds.branches=100 --coverage.thresholds.functions=100 --coverage.thresholds.lines=100`; `pnpm run check-types`; `pnpm run lint`.
- Coverage: 100% statements/branches/functions/lines для нового registry и измененной точки входа `MachineManager` в targeted coverage run.
- Совместимость: подтверждено, что `MachineManager(machines)`, `MachineManager(machines, { plugins: [] })` и no-op plugin сохраняют state, reducers, middleware, subscribers, effects, snapshot и hydrate.
- Открыто: docs build не запускался по правилу AGENTS.md; `pnpm run lint` прошел с существующими unrelated warnings в `ecs_example/*` про unused eslint-disable.
- Следующее действие: этап 2 — Storage registry, runtime preset и default `"instance"` wiring.

### 2026-05-24 — tz-plugin-system-implementation.md / Этап 1 — доработка type surface `definePlugin`

- Статус: `done`
- Scope: проверен gap `definePlugin<Capabilities>({ name, install })`: TypeScript сохраняет phantom capabilities, но не выводит literal `name` после явного первого generic.
- Реализация: `LiteFsmPlugin` оставлен с одним public generic `Capabilities`; `definePlugin<Capabilities, "name">(...)` зафиксирован как строгий контракт для одновременного сохранения phantom capabilities и literal `name`; runtime-поведение не расширялось.
- Тесты: `tests/types/plugins.tst.ts` покрывает обычный literal `name`, явный generic capabilities с `name: string`, explicit generic name с сохранением literal `name` и несовпадение explicit generic name со значением.
- Проверки: `pnpm exec tstyche tests/types/plugins.tst.ts`; `pnpm exec tstyche tests/types/plugins.tst.ts tests/types/exports-surface.tst.ts`; `pnpm exec vitest run tests/core/plugins.test.ts`; `pnpm exec vitest run tests/core/plugins.test.ts --coverage --coverage.include=packages/core/src/plugin.ts --coverage.reporter=text --coverage.thresholds.statements=100 --coverage.thresholds.branches=100 --coverage.thresholds.functions=100 --coverage.thresholds.lines=100`; `pnpm run check-types`.
- Coverage: targeted coverage для `packages/core/src/plugin.ts` — 100% statements/branches/functions/lines.
- Совместимость: `MachineManager(..., { plugins })` runtime tests прошли; общий `check-types` прошел.
- Открыто: docs build не запускался по правилу AGENTS.md.
- Следующее действие: этап 2 — Storage registry, runtime preset и default `"instance"` wiring, только после отдельного старта этапа.

### Этап 2 — Storage registry, runtime preset и default `"instance"` wiring

Статус: `done`

Записи:

### 2026-05-24 — tz-plugin-system-implementation.md / Этап 2 — Storage registry, runtime preset и default `"instance"` wiring

- Статус: `done`
- Scope: добавлены storage registry в plugin registry, `RuntimePreset`, `createMachineManagerFactory(...)`, `defaultRuntimePreset`, `instanceRuntimePlugin` и default wiring для `storage: "instance"` без перехода к этапу 3.
- Реализация: public `MachineManager` создается через `createMachineManagerFactory(defaultRuntimePreset)`; preset plugins ставятся раньше user plugins; `instanceRuntimePlugin` регистрирует kind `"instance"` через `ctx.storage.register(...)`; init резолвит `machine.storage ?? defaultStorageKind`; standalone `Machine(...)` / `defineMachine().create(...)` принимают отсутствие `storage` или `"instance"`.
- Тесты: добавлены `tests/core/runtime-preset.test.ts`; обновлены plugin tests, standalone machine tests и type canaries для `PluginInstallContext.storage`, `MachineConfig.storage`, tuple inference и default event inference.
- Проверки: `pnpm exec vitest run tests/core/runtime-preset.test.ts tests/core/plugins.test.ts tests/core/createMachine.test.ts`; `pnpm exec vitest run tests/core`; `pnpm exec vitest run tests/middleware tests/persist tests/react`; `pnpm run check-types`; `pnpm run lint`; `pnpm run build:packages`.
- Coverage: targeted run `pnpm exec vitest run tests/core --coverage --coverage.include=packages/core/src/runtime/kernel/createMachineManagerFactory.ts --coverage.include=packages/core/src/runtime/kernel/registry.ts --coverage.include=packages/core/src/runtime/kernel/storage.ts --coverage.include=packages/core/src/runtime/defaultPreset.ts --coverage.include=packages/core/src/runtime/instance/plugin.ts --coverage.include=packages/core/src/runtime/instance/storage.ts --coverage.include=packages/core/src/MachineManager.ts --coverage.include=packages/core/src/Machine.ts --coverage.include=packages/core/src/plugin.ts --coverage.reporter=text --coverage.thresholds.statements=100 --coverage.thresholds.branches=100 --coverage.thresholds.functions=100 --coverage.thresholds.lines=100` — 100% statements/branches/functions/lines.
- Совместимость: подтверждены `MachineManager(machines)`, no-op plugin, reducers/effects/actors/middleware/snapshot/hydrate и standalone instance storage behavior; downstream middleware/persist/react runtime tests прошли.
- Открыто: docs build не запускался по правилу AGENTS.md; `pnpm run lint` прошел с существующими unrelated warnings в `ecs_example/*` про unused eslint-disable.
- Следующее действие: этап 3 — `instanceStorageRuntime` и разделение ownership.

### Этап 3 — `instanceStorageRuntime` и разделение ownership

Статус: `done`

Записи:

### 2026-05-24 — tz-plugin-system-implementation.md / Этап 3 — `instanceStorageRuntime` и разделение ownership

- Статус: `done`
- Scope: оформлено текущее `storage: "instance"` поведение как владелец runtime внутри `runtime/instance/*`; kernel runtime оставлен за registry, storage selection, generic reduce/commit/reactions/effects ordering, root commit, subscribers и middleware.
- Реализация: `createManagerRuntime` escape hatch удален из `StorageRuntimeBase` и `instanceStorageRuntime`; kernel factory создает `IMachineManager` сам и вызывает `StorageRuntimeBase`/capability blocks для prepare/reduce/commit/reactions/effects/snapshot/identity. `instanceStorageRuntime` владеет sidecar, indexes, actor lifecycle, effect target resolution и current instance snapshot hooks через runtime state; kernel больше не импортирует `runtime/instance/*`, единственная сборочная точка `instanceRuntimePlugin` остается в `runtime/defaultPreset.ts`.
- Тесты: добавлен `tests/core/runtime-ownership.test.ts` для optional effects/reactions capabilities, запрета прямого вызова subscribers/effects из storage runtime, порядка commit/reactions/subscribers/effects, `createRuntimeState(...)` по registered kind, diagnostics, отсутствия `createManagerRuntime` и import-boundary; `tests/core/runtime-preset.test.ts` покрывает capability blocks `instanceStorageRuntime`. Существующие snapshot/hydrate/actor/effects/routing сценарии `storage: "instance"` оставлены как backward compatibility contract.
- Проверки: `pnpm exec vitest run tests/core/runtime-ownership.test.ts tests/core/runtime-preset.test.ts`; `pnpm exec vitest run tests/core`; `pnpm exec vitest run tests/middleware tests/persist tests/react`; `pnpm exec tstyche tests/types/plugins.tst.ts tests/types/runtime-api.tst.ts tests/types/exports-surface.tst.ts`; `pnpm run check-types`; `pnpm run lint`; `pnpm run build:packages`.
- Coverage: targeted run `pnpm exec vitest run tests/core --coverage --coverage.include=packages/core/src/runtime/kernel/createMachineManagerFactory.ts --coverage.include=packages/core/src/runtime/kernel/storage.ts --coverage.include=packages/core/src/runtime/kernel/registry.ts --coverage.include=packages/core/src/runtime/instance/storage.ts --coverage.include=packages/core/src/runtime/instance/manager.ts --coverage.include=packages/core/src/runtime/defaultPreset.ts --coverage.reporter=text --coverage.thresholds.statements=100 --coverage.thresholds.branches=100 --coverage.thresholds.functions=100 --coverage.thresholds.lines=100` — 100% statements/branches/functions/lines.
- Совместимость: core runtime/snapshot/hydrate tests, middleware, persist и react affected suites прошли; `getSnapshot()`, `dehydrate(...)`, `hydrate(...)`, actor spawning/routing/effects и middleware `replaceReducer` сохраняются через перенесенный instance runtime.
- Открыто: docs build не запускался по правилу AGENTS.md; `pnpm run lint` прошел с существующими unrelated warnings в `ecs_example/*` про unused eslint-disable.
- Следующее действие: этап 4 — Routing meta registry.

### Этап 4 — Routing meta registry

Статус: `done`

Записи:

### 2026-05-24 — tz-plugin-system-implementation.md / Этап 4 — Routing meta registry

- Статус: `done`
- Scope: добавлен runtime routing meta registry и registry-aware normalization без action interceptors, dispatch hooks, manager extensions, entity runtime и action meta inference.
- Реализация: `PluginInstallContext.routing.registerMetaKey(...)` регистрирует plugin route keys с duplicate diagnostics; `runtime/kernel/routing.ts` сохраняет registered keys при pre/post-normalization, срезает unknown `meta`, валидирует resolver result и вычисляет единый route constraint с priority `actorId > registered keys > groupId > groupTag > unscoped`. Kernel пишет constraint в `StorageDispatchContext.route`; `instanceStorageRuntime` применяет только built-in constraints и не пересчитывает priority.
- Тесты: добавлен `tests/core/routing-registry.test.ts` для plugin resolver, duplicate key, unknown meta, middleware rewrite, priority между `actorId`/plugin/`groupId`, порядка нескольких plugin keys, multi-runtime `groupTag`, invalid resolver result и отсутствия mutation до reduce; обновлены plugin/runtime/type canaries.
- Проверки: `pnpm exec vitest run tests/core/routing-registry.test.ts`; `pnpm exec vitest run tests/core/routing-registry.test.ts tests/core/actor.helpers.test.ts tests/core/managerRouting.test.ts tests/core/MachineManager.actors.effects.test.ts tests/core/MachineManager.actors.scenarios.test.ts tests/core/plugins.test.ts tests/core/runtime-preset.test.ts tests/core/runtime-ownership.test.ts`; `pnpm exec vitest run tests/core`; `pnpm exec vitest run tests/middleware tests/persist tests/react`; `pnpm exec tstyche tests/types/plugins.tst.ts tests/types/exports-surface.tst.ts tests/types/runtime-api.tst.ts`; `pnpm run check-types`; `pnpm run lint`; `pnpm run build:packages`.
- Coverage: targeted run `pnpm exec vitest run tests/core --coverage --coverage.include=packages/core/src/runtime/kernel/routing.ts --coverage.include=packages/core/src/runtime/kernel/registry.ts --coverage.include=packages/core/src/runtime/kernel/createMachineManagerFactory.ts --coverage.include=packages/core/src/runtime/kernel/storage.ts --coverage.include=packages/core/src/runtime/instance/manager.ts --coverage.include=packages/core/src/managerNormalize.ts --coverage.include=packages/core/src/plugin.ts --coverage.reporter=text --coverage.thresholds.statements=100 --coverage.thresholds.branches=100 --coverage.thresholds.functions=100 --coverage.thresholds.lines=100` — 100% statements/branches/functions/lines.
- Совместимость: существующие routing, actor effects/scenarios, plugins, runtime preset/ownership, middleware, persist и react suites прошли; no-op routing registry не меняет поведение.
- Открыто: docs build не запускался по правилу AGENTS.md; `pnpm run lint` прошел с существующими unrelated warnings в `ecs_example/*`; `pnpm run build:packages` прошел с существующими visualizer chunk-size warnings; этап 5 не начинался.
- Следующее действие: этап 5 — Action interceptors и dispatch hooks.

### Этап 5 — Action interceptors и dispatch hooks

Статус: `done`

Записи:

### 2026-05-24 — tz-plugin-system-implementation.md / Этап 5 — Action interceptors и dispatch hooks

- Статус: `done`
- Scope: добавлены action interceptors, dispatch hook phases и `DispatchContext.reportError(...)` без manager extensions, deps pipeline, machine extensions, action meta typing и entity-specific API.
- Реализация: `PluginInstallContext` получил рабочие `actions` и `dispatch`; kernel выполняет interceptors после post-normalization и hooks в фазах `beforeReduce`, `afterReduce`, `beforeCommit`, `beforeSubscribers`, `beforeEffects`, `afterEffects`; `skipDelivery`, `stopInterceptors`, replacement committed action, reentrant hook guard и fatal hook semantics реализованы в dispatch pipeline.
- Тесты: добавлен `tests/core/dispatch-hooks.test.ts`; обновлены plugin/runtime/type canaries и public export tests для новых registry/context типов.
- Проверки: `pnpm exec vitest run tests/core/dispatch-hooks.test.ts`; `pnpm exec vitest run tests/core/dispatch-hooks.test.ts tests/core/plugins.test.ts tests/core/runtime-ownership.test.ts tests/core/runtime-preset.test.ts tests/core/routing-registry.test.ts tests/core/MachineManager.test.ts tests/core/MachineManager.actors.effects.test.ts tests/middleware`; `pnpm exec vitest run tests/core tests/middleware tests/persist tests/react`; `pnpm exec tstyche tests/types/plugins.tst.ts tests/types/exports-surface.tst.ts tests/types/runtime-api.tst.ts tests/types/regression-matrix.tst.ts`; `pnpm run check-types`; `pnpm run lint`; `pnpm run build:packages`.
- Coverage: targeted run `pnpm exec vitest run tests/core --coverage --coverage.include=packages/core/src/plugin.ts --coverage.include=packages/core/src/runtime/kernel/registry.ts --coverage.include=packages/core/src/runtime/kernel/createMachineManagerFactory.ts --coverage.include=packages/core/src/runtime/kernel/storage.ts --coverage.include=packages/core/src/runtime/instance/manager.ts --coverage.include=packages/core/src/runtime/instance/storage.ts --coverage.include=packages/core/src/managerNormalize.ts --coverage.reporter=text --coverage.thresholds.statements=100 --coverage.thresholds.branches=100 --coverage.thresholds.functions=100 --coverage.thresholds.lines=100` — 100% statements/branches/functions/lines.
- Совместимость: middleware/effects ordering, actor effects, runtime preset/ownership, routing registry, persist и react suites прошли; no-op hooks не меняют state, middleware без `next(...)` не запускает interceptors/hooks/reducers/effects.
- Открыто: docs build не запускался по правилу AGENTS.md; `pnpm run lint` прошел с существующими unrelated warnings в `ecs_example/*`; `pnpm run build:packages` прошел с существующими visualizer chunk-size warnings.
- Следующее действие: этап 6 — TypeScript surface для machine extensions, transition events и action meta, только отдельным стартом.

### Этап 6 — TypeScript surface для machine extensions, transition events и action meta

Статус: `done`

Записи:

### 2026-05-24 — tz-plugin-system-implementation.md / Этап 6 — TypeScript surface для machine extensions, transition events и action meta

- Статус: `done`
- Scope: закрыт public type surface для `MachineRuntimeExtension`, третьего generic `TypedCreateMachineFn`, plugin transition events текущего manager tuple и plugin action meta; runtime scope ограничен validation fixtures этапа.
- Реализация: `createMachine` сохранил core direct typing без global plugin pollution; app wrappers через `TypedCreateMachineFn<AppEvents, AppDeps, Extensions>` получают storage-specific input, internal events, reducer meta, effect deps, result metadata и `publicState`; `MachineEvents` читает public events из phantom metadata без публикации internal events; `MachineManager(...)` возвращает `ManagerFromPlugins` с `ManagerTransitionEvents` и `ManagerActionMeta`; storage runtimes могут объявить `routeMetaKeys`, registry проверяет наличие resolver.
- Тесты: добавлены `tests/types/plugin-system-stage6.tst.ts` и `tests/core/plugin-system-stage6.test.ts`; обновлены type/export canaries и plugin tests под новый manager tuple inference.
- Проверки: `pnpm exec vitest run tests/core/plugin-system-stage6.test.ts`; `pnpm exec vitest run tests/core/plugin-system-stage6.test.ts tests/core/routing-registry.test.ts tests/core/plugins.test.ts tests/core/runtime-preset.test.ts tests/core/dispatch-hooks.test.ts`; `pnpm exec vitest run tests/core --coverage --coverage.include=packages/core/src/runtime/kernel/registry.ts --coverage.include=packages/core/src/runtime/kernel/routing.ts --coverage.include=packages/core/src/runtime/kernel/storage.ts --coverage.include=packages/core/src/runtime/kernel/createMachineManagerFactory.ts --coverage.include=packages/core/src/createMachine.ts --coverage.reporter=text --coverage.thresholds.statements=100 --coverage.thresholds.branches=100 --coverage.thresholds.functions=100 --coverage.thresholds.lines=100`; `pnpm exec vitest run tests/middleware tests/persist tests/react`; `pnpm exec tstyche tests/types/plugin-system-stage6.tst.ts tests/types/plugins.tst.ts tests/types/exports-surface.tst.ts tests/types/runtime-api.tst.ts tests/types/factories.tst.ts tests/types/cfg-and-config.tst.ts tests/types/regression-matrix.tst.ts tests/types/actor-core-contracts.tst.ts`; `pnpm run check-types`; `pnpm run lint`; `pnpm run build:packages`.
- Coverage: targeted coverage для измененных runtime modules этапа — 100% statements/branches/functions/lines.
- Совместимость: core runtime suite, middleware, persist, react affected suites и полный `check-types` прошли; core `createMachine<AppEvents>` не принимает plugin-specific storage без wrapper; plugin events не попадают в machine `AppEvents`.
- Открыто: docs build не запускался по правилу AGENTS.md; `pnpm run lint` прошел с существующими unrelated warnings в `ecs_example/*`; `pnpm run build:packages` прошел с существующими visualizer chunk-size warnings.
- Следующее действие: этап 7 — Scoped deps и scoped transition extensions, только отдельным стартом.

### Этап 7 — Scoped deps и scoped transition extensions

Статус: `done`

Записи:

### 2026-05-25 — tz-plugin-system-implementation.md / Этап 7 — Scoped deps и scoped transition extensions

- Статус: `done`
- Scope: добавлены рабочее `PluginInstallContext.deps`, scoped deps/transition registry, runtime invocation scope для effects/reactions и type-level вывод `PluginCapabilities["deps"]`/`["transition"]`.
- Реализация: kernel registry владеет ownership diagnostics для deps/transition keys, core key protection и scoped deps assembly; `ManagerRuntimeContext.createScopedDeps(...)` передан storage runtimes; instance effect pipeline добавляет scope `{ source, event, indices, phase }` для domain и actor effects, сохраняя actor transition sugar; scoped deps не попадают в `manager.setDependencies(...)`.
- Тесты: добавлены `tests/core/plugin-system-stage7.test.ts` и `tests/types/plugin-system-stage7.tst.ts`; обновлены plugin/export/runtime preset canaries под `deps` registry и новый internal context method.
- Проверки: `pnpm exec vitest run tests/core/plugin-system-stage7.test.ts`; `pnpm exec tstyche tests/types/plugin-system-stage7.tst.ts`; `pnpm exec tstyche tests/types/plugin-system-stage7.tst.ts tests/types/plugins.tst.ts tests/types/exports-surface.tst.ts tests/types/plugin-system-stage6.tst.ts tests/types/runtime-api.tst.ts`; `pnpm exec vitest run tests/core/plugin-system-stage7.test.ts tests/core/MachineManager.test.ts tests/core/MachineManager.actors.effects.test.ts tests/core/createEffect.test.ts tests/core/createMachine.test.ts tests/core/dispatch-hooks.test.ts`; `pnpm exec vitest run tests/middleware tests/persist tests/react`; `pnpm exec vitest run tests/core/plugin-system-stage7.test.ts tests/core/runtime-preset.test.ts tests/core/plugins.test.ts`; `pnpm exec vitest run tests/core --coverage --coverage.include=packages/core/src/runtime/kernel/registry.ts --coverage.include=packages/core/src/runtime/kernel/createMachineManagerFactory.ts --coverage.include=packages/core/src/runtime/instance/manager.ts --coverage.include=packages/core/src/actorEffects.ts --coverage.include=packages/core/src/utils.ts --coverage.reporter=text --coverage.thresholds.statements=100 --coverage.thresholds.branches=100 --coverage.thresholds.functions=100 --coverage.thresholds.lines=100`; `pnpm run check-types`; `pnpm run lint`; `pnpm run build:packages`.
- Coverage: targeted coverage для измененного runtime-кода этапа — 100% statements/branches/functions/lines.
- Совместимость: существующие AppDeps, core `transition(...)`, actor transition sugar, no-op deps extension и effects phase ordering сохранены; affected middleware/persist/react suites прошли.
- Открыто: docs build не запускался по правилу AGENTS.md; `pnpm run lint` прошел с существующими unrelated warnings в `ecs_example/*`; `pnpm run build:packages` прошел с существующими visualizer warnings про externalized `perf_hooks` и крупные chunks.
- Следующее действие: этап 8 — Manager extensions, только отдельным стартом.

### Этап 8 — Manager extensions

Статус: `done`

Записи:

### 2026-05-25 — tz-plugin-system-implementation.md / Этап 8 — Manager extensions

- Статус: `done`
- Scope: добавлены runtime manager extensions на returned manager object и public/type surface для `ManagerExtensionRegistry`, manager extension factory/context, `ManagerExtensionCapability`, `PluginManagerExtensions` и обновленного `ManagerFromPlugins`.
- Реализация: `PluginInstallContext.manager.extend(key, factory)` регистрирует extension factory с duplicate key диагностикой и запретом core manager methods; kernel навешивает extensions после compile machines, runtime init и создания initial public state; factory получает stable `ManagerRuntimeContext`; no-op registry не меняет shape менеджера.
- Тесты: добавлены `tests/core/plugin-system-stage8.test.ts` и `tests/types/plugin-system-stage8.tst.ts`; обновлены plugin/export/runtime preset canaries под `ctx.manager`, `PluginManagerExtensions` и manager extension inference.
- Проверки: `pnpm exec vitest run tests/core/plugin-system-stage8.test.ts`; `pnpm exec tstyche tests/types/plugin-system-stage8.tst.ts`; `pnpm exec tstyche tests/types/plugin-system-stage8.tst.ts tests/types/plugins.tst.ts tests/types/exports-surface.tst.ts tests/types/plugin-system-stage6.tst.ts tests/types/plugin-system-stage7.tst.ts tests/types/runtime-api.tst.ts`; `pnpm exec vitest run tests/core/plugin-system-stage8.test.ts tests/core/plugins.test.ts tests/core/runtime-preset.test.ts tests/core/runtime-ownership.test.ts tests/core/dispatch-hooks.test.ts tests/core/plugin-system-stage6.test.ts tests/core/plugin-system-stage7.test.ts tests/core/MachineManager.test.ts tests/core/MachineManager.actors.effects.test.ts tests/core/createMachine.test.ts`; `pnpm exec vitest run tests/middleware tests/persist tests/react`; `pnpm exec vitest run tests/core --coverage --coverage.include=packages/core/src/runtime/kernel/registry.ts --coverage.include=packages/core/src/runtime/kernel/createMachineManagerFactory.ts --coverage.include=packages/core/src/plugin.ts --coverage.reporter=text --coverage.thresholds.statements=100 --coverage.thresholds.branches=100 --coverage.thresholds.functions=100 --coverage.thresholds.lines=100`; `pnpm run check-types`; `pnpm run lint`; `pnpm run build:packages`.
- Coverage: targeted coverage для измененного runtime-кода этапа — 100% statements/branches/functions/lines.
- Совместимость: существующие manager/core tests, middleware, persist, react affected suites и полный `check-types` прошли; без plugin extension TypeScript не показывает extension field; широкий `LiteFsmPlugin[]` не сохраняет plugin-specific manager extension inference; `manager.entities` не добавлялся.
- Открыто: docs build не запускался по правилу AGENTS.md; `pnpm run lint` прошел с существующими unrelated warnings в `ecs_example/*`; `pnpm run build:packages` прошел с существующим visualizer chunk-size warning.
- Следующее действие: этап 9 — Storage snapshot extension points, только отдельным стартом.

### Этап 9 — Storage snapshot extension points

Статус: `done`

Записи:

### 2026-05-25 — tz-plugin-system-implementation.md / Этап 9 — Storage snapshot extension points

- Статус: `done`
- Scope: добавлены top-level `snapshot.storage[kind]`, независимый `dehydrate({ storage })` filter, routing hydrate/getHydratedState к runtime-владельцу storage kind и diagnostics для unknown/unsupported/invalid storage snapshots.
- Реализация: `MachineManagerSnapshot`/`MachineManagerDehydratedSnapshot` получили optional `storage`; `DehydrateOptions` получил `storage?: readonly string[]`; kernel dehydrate собирает `machines` и storage payloads независимо, не добавляет `storage.instance` и не вызывает storage `dehydrate` из `getSnapshot()`; hydrate preview/commit валидирует `snapshot.storage` и вызывает только runtime нужного kind.
- Тесты: добавлены `tests/core/plugin-system-stage9.test.ts` и `tests/types/plugin-system-stage9.tst.ts`; обновлены `tests/core/hydration.applySnapshot.test.ts`, `tests/core/runtime-ownership.test.ts`, `tests/types/exports-surface.tst.ts`, `tests/types/runtime-api.tst.ts`.
- Проверки: `pnpm exec vitest run tests/core/plugin-system-stage9.test.ts`; `pnpm exec tstyche tests/types/plugin-system-stage9.tst.ts`; `pnpm exec vitest run tests/core/plugin-system-stage9.test.ts tests/core/dehydrate.test.ts tests/core/hydrate.test.ts tests/core/hydration.applySnapshot.test.ts tests/core/persistence.roundtrip.test.ts tests/core/MachineManager.actors.hydration.test.ts tests/core/MachineManager.actors.lifecycle.test.ts tests/core/runtime-ownership.test.ts`; `pnpm exec vitest run tests/middleware tests/persist tests/react`; `pnpm exec tstyche tests/types/plugin-system-stage9.tst.ts tests/types/runtime-api.tst.ts tests/types/exports-surface.tst.ts tests/types/plugins.tst.ts tests/types/plugin-system-stage6.tst.ts tests/types/plugin-system-stage7.tst.ts tests/types/plugin-system-stage8.tst.ts tests/types/persist-api.tst.tsx`; `pnpm run check-types`; `pnpm run lint`; `pnpm run build:packages`.
- Coverage: targeted run `pnpm exec vitest run tests/core --coverage --coverage.include=packages/core/src/runtime/kernel/createMachineManagerFactory.ts --coverage.include=packages/core/src/hydration.ts --coverage.include=packages/core/src/runtime/instance/storage.ts --coverage.reporter=text --coverage.thresholds.statements=100 --coverage.thresholds.branches=100 --coverage.thresholds.functions=100 --coverage.thresholds.lines=100` — 100% statements/branches/functions/lines.
- Совместимость: текущие instance `machines` snapshot format, `getSnapshot()` shape, legacy snapshots без `storage`, hydrate/dehydrate actor/domain behavior, middleware, persist и react affected suites подтверждены.
- Открыто: docs build не запускался по правилу AGENTS.md; `pnpm run lint` прошел с существующими unrelated warnings в `ecs_example/*`; `pnpm run build:packages` прошел с существующими visualizer warnings про externalized `perf_hooks`, plugin timings и крупные chunks.
- Следующее действие: этап 10 — Документация, examples и final verification, только отдельным стартом.

### Этап 10 — Документация, examples и final verification

Статус: `done`

Записи:

### 2026-05-25 — tz-plugin-system-implementation.md / Этап 10 — Документация, examples и final verification

- Статус: `done`
- Scope: закрыты документация и cheatsheets для текущего public plugin system behavior, добавлен проверяемый documentation fixture и выполнена final verification без docs build.
- Реализация: обновлены `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`, `apps/docs/app/api/core/page.mdx`, `apps/docs/app/packages/core/page.mdx`; описаны lifecycle, `definePlugin(...)`, `MachineManager(..., { plugins })`, встроенный default `"instance"` preset, storage runtime contract, optional capability blocks, typed `createMachine` wrapper, manager extension, storage runtime snapshot через `snapshot.storage[kind]`, ограничения custom presets и `@lite-fsm/entities`.
- Тесты: добавлены `tests/fixtures/plugin-system-documentation.ts`, `tests/core/plugin-system-documentation-fixture.test.ts`, `tests/types/plugin-system-documentation-fixture.tst.ts`; fixture демонстрирует no-op plugin, plugin transition event, typed `action.meta`, typed test storage kind, typed scoped dep, typed scoped transition method, typed manager extension и storage runtime snapshot round-trip.
- Проверки: `pnpm exec vitest run tests/core/plugin-system-documentation-fixture.test.ts`; `pnpm exec tstyche tests/types/plugin-system-documentation-fixture.tst.ts`; `pnpm exec vitest run tests/core/plugin-system-documentation-fixture.test.ts tests/core/plugins.test.ts tests/core/runtime-preset.test.ts tests/core/runtime-ownership.test.ts tests/core/routing-registry.test.ts tests/core/dispatch-hooks.test.ts tests/core/plugin-system-stage6.test.ts tests/core/plugin-system-stage7.test.ts tests/core/plugin-system-stage8.test.ts tests/core/plugin-system-stage9.test.ts`; `pnpm exec tstyche tests/types/plugin-system-documentation-fixture.tst.ts tests/types/plugins.tst.ts tests/types/plugin-system-stage6.tst.ts tests/types/plugin-system-stage7.tst.ts tests/types/plugin-system-stage8.tst.ts tests/types/plugin-system-stage9.tst.ts tests/types/exports-surface.tst.ts tests/types/runtime-api.tst.ts`; search audit по `test.only`, временным skip, TODO/FIXME, debug logging и `not implemented`; `git diff --check`; `pnpm exec vitest run tests/core tests/middleware tests/persist tests/react`; `pnpm run check-types`; `pnpm run lint`; `pnpm run build:packages`.
- Coverage: production runtime-код на этапе 10 не менялся; новый fixture покрыт runtime и type tests. Coverage gates этапов 1-9 остаются закрытыми.
- Совместимость: full runtime suite `tests/core tests/middleware tests/persist tests/react` прошел; `MachineManager(machines)` и текущий default `"instance"` runtime не менялись; plugin-specific API не подмешивается без текущего `plugins` tuple.
- Открыто: docs build не запускался по правилу AGENTS.md; `pnpm run lint` прошел с существующими unrelated warnings в `ecs_example/*`; `pnpm run build:packages` прошел с существующими visualizer warnings про externalized `perf_hooks`, plugin timings и крупные chunks; runtime suite показал 2 skipped GC-only files / 14 skipped GC-only tests без `--expose-gc`.
- Следующее действие: `tz-plugin-system-implementation.md` закрыт; следующий отдельный шаг — `tz-entities-implementation.md` / Этап 1.

### 2026-05-25 — tz-plugin-system-implementation.md / Post-implementation review — Production readiness

- Статус: `done`
- Scope: проведены architecture, runtime behavior, type surface, scenario coverage, cleanup, refactoring и docs/release readiness ревью в рамках plugin system без перехода к entities.
- Реализация: закрыты найденные blockers: registry mutation ограничена синхронным `install(ctx)`, storage runtime валидирует `runtime.kind` и `compileTemplate(...).kind`, dispatch `touched` перенесен в per-dispatch context, `reactionDeps` включены в type metadata/invocation deps, non-empty storage-less machine extension отклоняется типами, `MachineDependencies` для custom storage оставляет только app deps. Локальный refactoring ограничен `createMachineManagerFactory.ts`: effect phase вынесена в helper, initial state использует готовый bucket index.
- Тесты: добавлены regression cases для late registry mutation, mismatched storage kind, nested dispatch из effect/reaction/subscriber и type-level проверки runtime-owned deps; обновлены plugin-system type tests и cheatsheets.
- Проверки: targeted Vitest/Tstyche для plugin/runtime/type suites; targeted coverage для измененных kernel/runtime файлов; `pnpm run check-types`; `pnpm run lint`; `pnpm run test`; `git diff --check`. Финальные проверки нужно повторять перед release после любых новых правок.
- Coverage: targeted coverage для измененного runtime/kernel кода подтвержден 100% statements/branches/functions/lines.
- Совместимость: no-op plugins, default `"instance"` runtime, middleware ordering, snapshot/hydrate, actors, scoped deps, manager extensions и plugin-specific type inference подтверждены targeted и full suites.
- Открыто: docs build не запускался по правилу AGENTS.md. Осознанные release risks: `ManagerRuntimeContext.config` передает исходный mutable machine store manager extensions; direct `createMachine` value сохраняет internal extension overload для assignability к `TypedCreateMachineFn`.
- Следующее действие: финальная release-readiness оценка текущего diff; не начинать `@lite-fsm/entities` в рамках этого review.

### 2026-05-25 — tz-plugin-system-implementation.md / Task 7 — Независимый docs/release readiness audit

- Статус: `done`
- Scope: повторно сверены cheatsheets, docs, documentation fixture, implementation log и public API/type definitions plugin system без перехода к `@lite-fsm/entities`.
- Реализация: устранены фактические пробелы в документации: `ManagerRuntimeContext.config` описан как исходный `MachineStore`, который manager extensions должны читать как immutable reference; прямой plugin-specific overload у value `createMachine` зафиксирован как implementation detail для assignability, публичный способ фиксации extensions остается app wrapper `TypedCreateMachineFn`; package page теперь явно относит plugin types к core type surface.
- Проверки: `pnpm exec vitest run tests/core/plugin-system-documentation-fixture.test.ts`; `pnpm exec tstyche tests/types/plugin-system-documentation-fixture.tst.ts tests/types/plugins.tst.ts tests/types/plugin-system-stage6.tst.ts tests/types/plugin-system-stage7.tst.ts tests/types/plugin-system-stage8.tst.ts tests/types/plugin-system-stage9.tst.ts tests/types/exports-surface.tst.ts tests/types/runtime-api.tst.ts`; search audit по focused tests, TODO/FIXME, debug leftovers, `not implemented` и временным markers в scoped docs/tests/source; `git diff --check`.
- Coverage: runtime/type код не менялся; documentation fixture и связанные plugin-system type cases прошли targeted checks.
- Открыто: docs build не запускался по правилу AGENTS.md. Осознанные release risks сохраняются: runtime не делает defensive copy/freeze для `ManagerRuntimeContext.config`; direct `createMachine` value сохраняет internal extension overload для совместимости с `TypedCreateMachineFn`.
- Итоговая оценка: `ready with risks`.

### 2026-05-25 — tz-plugin-system-implementation.md / Post-implementation coverage gate

- Статус: `done`
- Scope: закрыт global coverage gap после реализации plugin system без изменения runtime-поведения.
- Реализация: добавлен regression case в `tests/core/actor.helpers.test.ts` для нормализации routing meta, где `groupId` задан, а `groupTag` остается `undefined`; это покрывает пропущенную false-ветку `stripUndefined(...)` в `packages/core/src/actor.ts`.
- Тесты: обновлен существующий helper-suite нормализации actor meta.
- Проверки: `npm run test:coverage`.
- Coverage: `npm run test:coverage` прошел с 100% statements, branches, functions и lines.
- Открыто: docs build не запускался по правилу AGENTS.md; `@lite-fsm/entities` не начинался.

## Ход реализации `tz-entities-implementation.md`

### Этап 1 — Пакет `@lite-fsm/entities`, exports, plugin shell и `storage: "entity"` registration

Статус: `not started`

Записи:

- Пока нет записей.

### Этап 2 — Schema descriptors и `EntityMachineExtension`

Статус: `not started`

Записи:

- Пока нет записей.

### Этап 3 — Compile metadata, empty `EntityStore`, `ColumnarActorStore`, public lightweight state и `manager.entities`

Статус: `not started`

Записи:

- Пока нет записей.

### Этап 4 — Entity lifecycle events, `__INIT`, internal `ENTITY_SPAWNED`/`ENTITY_DESPAWNED`, `payloadFor`

Статус: `not started`

Записи:

- Пока нет записей.

### Этап 5 — Spawn events, entity spawn и public spawn event interceptor

Статус: `not started`

Записи:

- Пока нет записей.

### Этап 6 — Columnar reduce pipeline, numeric event/state codes, buckets, routing и hot path guarantees

Статус: `not started`

Записи:

- Пока нет записей.

## Ход реализации `tz-entities-implementation-part-2.md`

### Контракт перед этапом 7

Перед началом этапа 7 должны быть закрыты этапы 1-6 из `tz-entities-implementation.md`, включая их gates, coverage и запрет docs build.

### Этап 7 — Despawn, `despawnOn`, `transition.despawn(...)` и lifecycle cleanup

Статус: `not started`

Записи:

- Пока нет записей.

### Этап 8 — Entity effects и scoped transition extensions

Статус: `not started`

Записи:

- Пока нет записей.

### Этап 9 — Reactions и reaction error semantics

Статус: `not started`

Записи:

- Пока нет записей.

### Этап 10 — Snapshot/hydrate через `snapshot.storage.entity`

Статус: `not started`

Записи:

- Пока нет записей.

### Этап 11 — React hooks: `useEntitySnapshot`, `useEntityCount`, `useEntityList`

Статус: `not started`

Записи:

- Пока нет записей.

### Этап 12 — Benchmarks, README/examples и final verification

Статус: `not started`

Записи:

- Пока нет записей.
