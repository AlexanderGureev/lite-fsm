# Журнал реализации ТЗ Plugin System Stable API

Этот файл фиксирует краткий прогресс реализации ТЗ:

- [`PLUGIN-SYSTEM-STABLE-API-TZ.md`](./PLUGIN-SYSTEM-STABLE-API-TZ.md)

Цель журнала — дать следующему агенту точку продолжения после сброса контекста. Журнал не заменяет ТЗ, не является changelog и не должен подробно пересказывать diff.

## Правила ведения

- Перед продолжением работы прочитать ТЗ и этот журнал.
- Продолжать первый этап со статусом не `done`.
- Не переходить к следующему этапу, если текущий этап не прошел gate из ТЗ.
- Если этап имеет статус `blocked`, не продолжать следующий этап до ручного решения блокера и обновления статуса.
- Обновлять журнал в конце каждого этапа и после значимого промежуточного результата, если этап большой.
- Записи держать короткими: что сделано, какие файлы/модули затронуты, какие проверки запускались, какие риски остались.
- Не фиксировать каждую мелкую правку тестов. Фиксировать закрытие сценариев, public type contracts, runtime validation, snapshot/hydrate behavior, coverage gaps и важные решения.
- Для нового и измененного чистого кода требуется 100% coverage по statements/branches/functions/lines.
- 100% coverage не считается достаточным без сценарных тестов: happy path, негативные type-level контракты, runtime validation, conflict diagnostics, snapshot round-trip, hydrate edge cases и регрессия без plugins.
- Агент не запускает docs build и команды, которые транзитивно запускают docs build.
- При изменении public API или public types обновлять `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md` и `PLUGIN-SYSTEM-CHEATSHEET.md`.
- Это ТЗ не вводит `install`, automatic prefixing, structural plugin objects и типизацию per-machine snapshot payload через `MachineStore` generic.

## Статусы

- `not started` — этап еще не начат.
- `in progress` — этап начат, но критерии приемки или test/coverage gate еще не закрыты.
- `done` — этап реализован, критерии приемки выполнены, проверки и coverage gate закрыты.
- `blocked` — продолжение невозможно без решения, которое должен принять человек.

## Текущий указатель

- Активное ТЗ: `./PLUGIN-SYSTEM-STABLE-API-TZ.md`
- Активный этап: Этап 7 — Рефакторинг, чистка и полировка
- Статус: `done`
- Следующее действие: ТЗ закрыто; финальная проверка раздела 6 выполнена.

## Сводка по этапам

| Этап | Название                                    | Статус        | Последнее обновление |
| ---- | ------------------------------------------- | ------------- | -------------------- |
| 1    | Типовая семантика `definePlugin`            | `done`        | 2026-05-26           |
| 2    | Плоский namespace и owner-aware diagnostics | `done`        | 2026-05-26           |
| 3    | Public model storage extension              | `done`        | 2026-05-26           |
| 4    | Generic storage contexts                    | `done`        | 2026-05-26           |
| 5    | Snapshot API storage runtime                | `done`        | 2026-05-26           |
| 6    | Public exports и документация               | `done`        | 2026-05-26           |
| 7    | Рефакторинг, чистка и полировка             | `done`        | 2026-05-26           |

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
- Совместимость: какие behavior/type tests подтвердили сохранение public behavior.
- Открыто: конкретные риски, TODO или blocker.
- Следующее действие: один короткий следующий шаг.
```

## Ход реализации

### Этап 1 — Типовая семантика `definePlugin`

Статус: `done`

Записи:

### 2026-05-26 — Этап 1 — Типовая семантика `definePlugin`

- Статус: `done`
- Scope: закрыт type contract observer callbacks для `definePlugin`, без изменений storage runtime, registry diagnostics, snapshot API и runtime pipeline.
- Реализация: в `packages/core/src/plugin.ts` observer events теперь нормализуются в `AnyEvent` для default host generic и остаются `HostEvents | PluginEvents` при явном host generic; `scope.transition` по-прежнему ограничен `PluginEvents`, `PluginManagerEvents` извлекает только `PluginEvents`.
- Тесты: обновлены Tstyche контракты `definePlugin()` / `definePlugin<PluginEvents>()` / `definePlugin<PluginEvents, HostEvents>()`; добавлен runtime сценарий без фильтрации callbacks по `PluginEvents`.
- Проверки: `pnpm exec vitest run tests/core/plugin-system-stage1.test.ts` — pass; `pnpm exec tstyche tests/types/plugin-system-stage1.tst.ts tests/types/plugin-system-stage2.tst.ts` — pass; `pnpm exec vitest run tests/core/plugin-system-stage1.test.ts tests/core/plugin-system-stage5.test.ts` — pass; `pnpm exec tstyche tests/types/plugin-system-*.tst.ts tests/types/plugins.tst.ts tests/types/exports-surface.tst.ts` — pass; `pnpm run test` — pass; `pnpm run test:types` — pass; `pnpm run check-types` — pass; `pnpm run lint` — pass; `pnpm run test:coverage` — pass.
- Coverage: 100% statements/branches/functions/lines по `pnpm run test:coverage`; измененный source code является type-level contract без новых runtime веток.
- Сценарии: покрыты `ctx.action`, `ctx.originalAction`, route/scoped observer contexts, `scope.transition` positive/negative contracts, `PluginManagerEvents` без `HostEvents`, runtime delivery app action в plugin с `PluginEvents`.
- Совместимость: расширенный plugin-system Tstyche surface и полный runtime suite проходят; delivery callbacks не фильтруются по generics.
- Открыто: нет blockers для этапа 1; cheatsheets/export-документация не обновлялись и остаются на этап 6 по ТЗ.
- Следующее действие: начать этап 2 отдельным подагентом.

### 2026-05-26 — Этап 1 — Дополнительное routeMeta type coverage

- Статус: `done`
- Scope: усилен stage1 Tstyche fixture для `routeMeta` observer context без изменений runtime pipeline, storage runtime, registry diagnostics и snapshot API.
- Тесты: `tests/types/plugin-system-stage1.tst.ts` теперь явно проверяет `routeMeta` `ctx.action` для `definePlugin()`, `definePlugin<PluginEvent>()` и `definePlugin<PluginEvent, HostEvent>()`; двух-generic сценарий дополнительно фиксирует `ctx.originalAction`.
- Проверки: `pnpm exec tstyche tests/types/plugin-system-stage1.tst.ts tests/types/plugin-system-stage2.tst.ts` — pass.
- Coverage: runtime coverage не менялся; правка только в type coverage, runtime files не затронуты.
- Открыто: нет.
- Следующее действие: начать этап 2 отдельным подагентом.

### Этап 2 — Плоский namespace и owner-aware diagnostics

Статус: `done`

Записи:

### 2026-05-26 — Этап 2 — Плоский namespace и owner-aware diagnostics

- Статус: `done`
- Scope: закрыты owner-aware diagnostics для duplicate `routeMeta`, `manager`, `scopedDeps`, `scopedTransition` и `storage kind`; автоматическое prefixing, публичные key names, runtime order, actor sender semantics, middleware pipeline и standalone `Machine` не менялись.
- Реализация: `registry.ts` хранит owner первого registered key для manager/scoped/storage conflicts; storage registry принимает owner при регистрации; `routing.ts` хранит owner рядом с route resolver и сохраняет плоское пространство meta key.
- Тесты: добавлен `tests/core/plugin-system-stage2.test.ts`; обновлены ожидания duplicate diagnostics в routing/runtime tests и direct storage registry вызовы stage5.
- Проверки: `pnpm exec vitest run tests/core/plugin-system-stage2.test.ts tests/core/plugin-system-stage4.test.ts tests/core/plugin-system-stage6.test.ts tests/core/plugin-system-stage8.test.ts` — pass; `pnpm exec vitest run tests/core/plugin-system-stage2.test.ts tests/core/plugin-system-stage4.test.ts tests/core/plugin-system-stage6.test.ts tests/core/plugin-system-stage8.test.ts tests/core/routing-registry.test.ts tests/core/runtime-preset.test.ts tests/core/runtime-ownership.test.ts tests/core/plugin-system-stage9.test.ts` — pass; `pnpm run test` — pass; `pnpm run test:types` — pass; `pnpm run check-types` — pass; `pnpm run lint` — pass; `git diff --check` — pass; `pnpm run test:coverage` — pass.
- Coverage: 100% statements/branches/functions/lines по `pnpm run test:coverage`.
- Сценарии: каждый обязательный duplicate key бросает прежний `LiteFsmError.code`; сообщения содержат section/key, owner первого зарегистрированного plugin и конфликтующий owner; reserved core key diagnostics подтверждены.
- Совместимость: полный Vitest и Tstyche suite проходят; storage runtime typing, snapshot API, cheatsheets и public key names не изменялись.
- Открыто: нет.
- Следующее действие: начать этап 3 отдельным подагентом.

### Этап 3 — Public model storage extension

Статус: `done`

Записи:

### 2026-05-26 — Этап 3 — Public model storage extension

- Статус: `done`
- Scope: закрыт public shape single-generic `defineStorageRuntime<Extension>()`: добавлены runtime-only поля модели, `StorageTemplate`, запрет unknown keys и запрет `storage` внутри `Extension`.
- Реализация: `pluginStorageTypes.ts` вводит `StorageRuntimeExtension` с machine-facing и runtime-only полями; `NormalizedStorageMachineExtension` оставляет в `PluginMachineExtensions` только `input`, `internalEvents`, `reducerContext`, `effectDeps`, `reactionDeps`, `resultMetadata`, `publicState` и literal `storage`; `pluginStorage.ts` переведен на новый generic constraint без runtime behavior изменений.
- Тесты: `tests/types/plugin-system-stage3.tst.ts` покрывает полный storage extension с runtime-only полями, отсутствие runtime-only ключей в `PluginMachineExtensions`, а также негативные контракты unknown key и `storage` key.
- Проверки: `pnpm exec tstyche tests/types/plugin-system-stage3.tst.ts` — pass; `pnpm exec tstyche tests/types/plugin-system-stage7.tst.ts tests/types/plugin-system-stage8.tst.ts tests/types/plugins.tst.ts` — pass; `pnpm run test` — pass; `pnpm run test:types` — pass; `pnpm run check-types` — pass; `pnpm run lint` — pass; `git diff --check` — pass; `pnpm run test:coverage` — pass.
- Coverage: 100% statements/branches/functions/lines по `pnpm run test:coverage`; измененный runtime source затронут только type-level сигнатурами, новых runtime веток нет.
- Сценарии: `PluginMachineExtensions<typeof plugin>` содержит только machine-facing storage поля и `storage`; `runtimeState`, `templateData`, `snapshotData`, `invocation`, `identity` остаются runtime-only; `Extension` с optional unknown key и optional `storage` отклоняется.
- Совместимость: полный Vitest и Tstyche suite проходят; snapshot runtime behavior, public dehydrate shape, root exports, cheatsheets, runtime order и registry diagnostics не менялись.
- Открыто: нет blockers для этапа 3; root exports и cheatsheets остаются на этап 6.
- Следующее действие: начать этап 4 отдельным подагентом.

### Этап 4 — Generic storage contexts

Статус: `done`

Записи:

### 2026-05-26 — Этап 4 — Generic storage contexts

- Статус: `done`
- Scope: закрыта generic typing для storage callbacks на базе `Extension`: runtime-only поля протянуты в `ctx.state`, `ctx.template.data`, `ctx.templates`, `ctx.invocation`, `identity.resolve()` и return contracts `compileTemplate`, `createRuntimeState`, `createPublicInitialState`, `resolveInvocations`.
- Реализация: `pluginStorageTypes.ts` добавляет public generic context types для всех storage callbacks и использует их в `PluginStorageRuntime`; `snapshot.dehydrate()` временно сохраняет текущий `{ storage }` result shape с generic `snapshotData`; `runtime/kernel/storage.ts` принимает readonly результат `resolveInvocations()` без изменения runtime object shapes.
- Тесты: добавлен `tests/types/plugin-system-stage4-storage-contexts.tst.ts` с inline callback typing, negative return contracts, readonly invocations, identity return, fallback `unknown` и internal import context aliases для `acceptsEvent` / `effects.condition`.
- Проверки: `pnpm exec tstyche tests/types/plugin-system-stage4-storage-contexts.tst.ts` — pass; `pnpm exec tstyche tests/types/plugin-system-stage3.tst.ts tests/types/plugin-system-stage4-storage-contexts.tst.ts tests/types/plugin-system-stage7.tst.ts tests/types/plugin-system-stage8.tst.ts tests/types/plugins.tst.ts tests/types/plugin-system-documentation.tst.ts` — pass; `pnpm run test` — pass; `pnpm run test:types` — pass; `pnpm run check-types` — pass; `pnpm run lint` — pass; `git diff --check` — pass; `pnpm run test:coverage` — pass.
- Coverage: 100% statements/branches/functions/lines по `pnpm run test:coverage`; измененный source code является type-level contract без новых runtime веток.
- Сценарии: покрыты `compileTemplate().data` как `templateData`, `ctx.template.data`, `ctx.templates`, `ctx.state`, return type `runtimeState`/`publicState`, readonly `resolveInvocations`, `ctx.invocation`, `identity.resolve()` и callbacks без runtime-only fields.
- Совместимость: root exports из `packages/core/src/index.ts` не добавлялись и остаются на этап 6; snapshot API behavior и public `{ storage }` shape не менялись; cheatsheets не обновлялись.
- Открыто: нет blockers для этапа 4; public root exports context types и документация остаются на этап 6.
- Следующее действие: начать этап 5 отдельным подагентом.

### Этап 5 — Snapshot API storage runtime

Статус: `done`

Записи:

### 2026-05-26 — Этап 5 — Snapshot API storage runtime

- Статус: `done`
- Scope: закрыт storage snapshot API: public `snapshot.dehydrate()` возвращает `{ machines?, snapshot? }`, `snapshot.hydrate()` получает `ctx.machines` и payload `ctx.snapshot` без полного manager envelope.
- Реализация: `runtime/kernel/storage.ts` и `pluginStorageTypes.ts` переведены на новый result/context contract; `runtime/kernel/snapshot.ts` сохраняет top-level `MachineManagerSnapshot.storage[kind]`, раскладывает per-kind machine snapshots и валидирует unknown fields, включая legacy `storage`; `runtime/instance/manager.ts` собирает внутренний envelope только для встроенного instance runtime.
- Тесты: обновлены snapshot runtime сценарии в `tests/core/plugin-system-stage9.test.ts`, документационный fixture и type coverage; добавлен `tests/types/plugin-system-stage5-storage-snapshot.tst.ts` для typed `snapshotData`, `ctx.snapshot` и `ctx.machines`.
- Проверки: focused `pnpm exec vitest run tests/core/plugin-system-stage9.test.ts tests/core/plugin-system-documentation.test.ts tests/core/hydrate.test.ts tests/core/dehydrate.test.ts` — pass; focused `pnpm exec tstyche tests/types/plugin-system-stage4-storage-contexts.tst.ts tests/types/plugin-system-stage5-storage-snapshot.tst.ts tests/types/plugin-system-stage7.tst.ts` — pass; `pnpm run test` — pass; `pnpm run test:types` — pass; `pnpm run check-types` — pass; `pnpm run lint` — pass; `git diff --check` — pass; `pnpm run test:coverage` — pass.
- Coverage: 100% statements/branches/functions/lines по `pnpm run test:coverage`; новые validation branches для invalid `snapshot.dehydrate()` result покрыты.
- Сценарии: покрыты `{ snapshot }` в `manager.dehydrate().storage[kind]`, `ctx.snapshot` конкретного kind, `ctx.machines` только своего kind, round-trip custom storage snapshot, отсутствие snapshot capability, legacy `{ storage }`, unknown top-level field, non-object result и invalid `machines`.
- Совместимость: top-level `MachineManagerSnapshot["storage"]` не менялся; legacy manager snapshot без `storage` сохраняет hydrate/getHydratedState behavior; schemaVersion и unknown machine callbacks для instance hydrate сохранены.
- Открыто: root exports и cheatsheets не обновлялись по запрету этапа 5; это остается на этап 6.
- Следующее действие: начать этап 6 отдельным запросом/подагентом.

### Этап 6 — Public exports и документация

Статус: `done`

Записи:

### 2026-05-26 — Этап 6 — Public exports и документация

- Статус: `done`
- Scope: закрыты root exports storage runtime types и обновление public cheatsheets; runtime behavior, stage 7 cleanup и docs build не затрагивались.
- Реализация: `packages/core/src/index.ts` экспортирует `StorageRuntimeExtension`, `StorageTemplate` и public generic `Storage*Context`; `PLUGIN-SYSTEM-CHEATSHEET.md`, `API-CHEATSHEET.md` и `TYPES-CHEATSHEET.md` описывают generics `definePlugin`, flat namespace, owner-aware diagnostics, storage runtime-only fields, snapshot API `{ machines?, snapshot? }`, hydrate context и `routeMetaKeys`.
- Тесты: `tests/types/exports-surface.tst.ts` проверяет новые root exports, импорт public context types из `@lite-fsm/core`, сохранение старых exports и отсутствие runtime-only fields в `PluginMachineExtensions`.
- Проверки: `pnpm exec tstyche tests/types/exports-surface.tst.ts` — pass; `pnpm run test` — pass; `pnpm run test:types` — pass; `pnpm run check-types` — pass; `pnpm run lint` — pass; `git diff --check` — pass; `pnpm run test:coverage` — pass.
- Coverage: 100% statements/branches/functions/lines по `pnpm run test:coverage`; новых runtime веток нет, изменения поведения не вносились.
- Сценарии: покрыты public exports `StorageRuntimeExtension`, `StorageTemplate`, все public storage context types, typed `snapshot.dehydrate()` / `hydrate()` contexts, runtime-only storage fields и machine-facing extension boundary.
- Совместимость: старые public exports продолжают проверяться в `exports-surface.tst.ts`; полный Vitest, Tstyche, package typecheck и lint проходят.
- Открыто: нет blockers; docs build не запускался по запрету ТЗ.
- Следующее действие: этап 7 начинать только по отдельному запросу.

### Этап 7 — Рефакторинг, чистка и полировка

Статус: `done`

Записи:

### 2026-05-26 — Этап 7 — Рефакторинг, чистка и полировка

- Статус: `done`
- Scope: выполнен cleanup active plugin/storage type plumbing после этапов 1-6; public API, public types, runtime order, snapshot format, routing priority и error semantics не менялись.
- Реализация: в `plugin.ts` удален старый `ObserverEvents` alias, observer type normalizer оставлен под финальный контракт `AnyEvent`/`HostEvents | PluginEvents`; в `pluginStorageTypes.ts` удалены старые `PluginMachineExtensionInput`, `StorageTemplatePayload`, `NormalizedStorageMachineExtension`, machine-facing extension вывод переведен на `StorageMachineExtension`; в `pluginStorage.ts` и `pluginStorageNormalize.ts` убраны imports старых aliases, compile payload typing локализован в normalizer.
- Тесты: новых сценариев не добавлялось; сохранены focused runtime/type regression-аудиты этапов 1-6 для callbacks, owner conflicts, storage builder validation, storage context typing, snapshot round-trip, hydrate edge cases, exported surface и documentation fixture.
- Проверки: `pnpm exec vitest run tests/core/plugin-system-stage1.test.ts tests/core/plugin-system-stage2.test.ts tests/core/plugin-system-stage7.test.ts tests/core/plugin-system-stage9.test.ts tests/core/hydrate.test.ts tests/core/dehydrate.test.ts tests/core/storage-runtime-dispatch-pipeline.test.ts` — pass; `pnpm exec tstyche tests/types/plugin-system-stage1.tst.ts tests/types/plugin-system-stage3.tst.ts tests/types/plugin-system-stage4-storage-contexts.tst.ts tests/types/plugin-system-stage5-storage-snapshot.tst.ts tests/types/plugin-system-stage7.tst.ts tests/types/plugin-system-documentation.tst.ts tests/types/exports-surface.tst.ts` — pass; `pnpm run test` — pass; `pnpm run test:types` — pass; `pnpm run check-types` — pass; `pnpm run lint` — pass; `git diff --check` — pass; `pnpm run test:coverage` — pass.
- Coverage: 100% statements/branches/functions/lines по `pnpm run test:coverage`.
- Сценарии: audit подтвердил отсутствие active source hits для `ObserverEvents`, `PluginMachineExtensionInput`, `StorageTemplatePayload`, `NormalizedStorageMachineExtension`; `snapshot.dehydrate()` продолжает валидировать legacy `{ storage }`, unknown top-level field, non-object result и invalid `machines`.
- Совместимость: focused и общие проверки подтвердили сохранение public behavior/type surface; docs build и запрещенные команды не запускались.
- Audit hits: оставлены осознанно только final-contract `snapshot.storage`/`storage` references в cheatsheets, `hydration.ts`, `runtime/kernel/snapshot.ts`, snapshot runtime/type tests и persist/stress configs; негативные regression-аудиты `legacy { storage }` в `tests/core/plugin-system-stage9.test.ts` и `tests/types/plugin-system-stage5-storage-snapshot.tst.ts`; negative private dispatch field checks `preparedAction`, `committedAction`, `dispatch.dropped` в `tests/core/storage-runtime-dispatch-pipeline.test.ts` и `tests/types/plugin-system-stage7.tst.ts`; final type assertion `HostEvents` не попадает в `PluginManagerEvents` в `tests/types/plugin-system-stage2.tst.ts`.
- Открыто: blockers и TODO отсутствуют; оставшиеся search hits относятся к final top-level snapshot contract, unrelated storage configs или явно негативным regression-аудитам.
- Следующее действие: выполнить финальную проверку раздела 6 ТЗ.

## Финальная проверка раздела 6

### 2026-05-26 — Полная готовность

- Статус: `done`
- Scope: проверены все пункты раздела 6 ТЗ после завершения этапов 1-7.
- Проверки: `pnpm run test` — pass; `pnpm run test:types` — pass; `pnpm run check-types` — pass; `pnpm run lint` — pass; `git diff --check` — pass; `pnpm run test:coverage` — pass.
- Coverage: 100% statements/branches/functions/lines по `pnpm run test:coverage`.
- Audit: обязательный `rg` audit выполнен; оставшиеся hits относятся к final top-level snapshot contract, unrelated persist/stress configs или явно негативным regression-аудитам.
- Сценарии: stable plugin API, owner-aware diagnostics, storage extension shape, generic storage contexts, snapshot API `{ machines?, snapshot? }`, public exports, cheatsheets и отсутствие legacy public examples проверены runtime/type/doc fixtures.
- Открыто: нет.
