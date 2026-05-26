# Журнал реализации ТЗ Plugin System Public API Hardening

ТЗ: [`tz-plugin-system-public-api-hardening.md`](./tz-plugin-system-public-api-hardening.md)

Цель журнала — восстановить состояние реализации после сжатия контекста. Журнал не заменяет ТЗ и не пересказывает diff.

## Правила ведения

- Перед продолжением работы прочитать ТЗ и этот журнал.
- Продолжать первый этап со статусом не `done`.
- Не переходить к следующему этапу, пока текущий этап не прошел свой `stage gate`.
- Обновлять журнал после закрытия этапа, blocker или значимого промежуточного результата.
- Записи держать короткими: scope, измененные модули, проверки, coverage, риски, следующее действие.
- Не фиксировать каждую мелкую правку и не вставлять полный diff.
- При изменении public API или public types обновлять `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md` и `PLUGIN-SYSTEM-CHEATSHEET.md`.
- Агентам запрещено запускать docs build и команды, которые транзитивно запускают docs build.
- Для package build использовать `pnpm run build:packages`, а не `pnpm run build`.

## Статусы

- `not started`
- `in progress`
- `done`
- `blocked`

## Текущий указатель

- Активное ТЗ: `spec/tz-plugin-system-public-api-hardening.md`
- Активный этап: Финальная проверка
- Статус: `done`
- Следующее действие: цель выполнена.

## Сводка по этапам

| Этап | Название                                      | Статус        | Последнее обновление |
| ---- | --------------------------------------------- | ------------- | -------------------- |
| 1    | Foundation public types и boundary audit      | `done`        | 2026-05-26           |
| 2    | Storage contexts без internal kernel          | `done`        | 2026-05-26           |
| 3    | Immutable action contract                     | `done`        | 2026-05-26           |
| 4    | Manager extensions по `PluginEvents`          | `done`        | 2026-05-26           |
| 5    | Документация и примеры                        | `done`        | 2026-05-26           |
| 6    | Рефакторинг, чистка и полировка               | `done`        | 2026-05-26           |
| 7    | Release checks                                | `done`        | 2026-05-26           |

## Ход реализации

### Этап 1 — Foundation public types и boundary audit

Статус: `done`

Записи:

- 2026-05-26: добавлены `ReadonlyManagerAction`, internal `DeepReadonly`, generic `ManagerRuntimeContext<Events>` и `ManagerExtensionFactory<Events, Value>`. `LiteFsmStorageRuntimeDefinition` переведен на opaque hidden payload без public `StorageRuntime`; `pluginStorageTypes.ts` получил self-contained public route/dispatch/context shapes без source import из `runtime/kernel/*`. Обновлены type tests `exports-surface` и `plugin-system-public-api-hardening-stage1`. Проверки: focused `pnpm exec tstyche tests/types/exports-surface.tst.ts tests/types/plugin-system-public-api-hardening-stage1.tst.ts` — pass; `pnpm run test:types` — pass; source audit `rg "runtime/kernel" packages/core/src/pluginStorage.ts packages/core/src/pluginStorageTypes.ts` — no hits; `git diff --check` — pass. Coverage: runtime behavior не менялся, Vitest coverage не запускался. Риски: `packages/core/dist/pluginStorage.d.ts` и `packages/core/dist/pluginStorageTypes.d.ts` еще содержат expected audit hits на `runtime/kernel/*`, потому dist не пересобирался по stage policy. Следующее действие: главный агент проверяет diff и stage gate, затем отдельный подагент начинает этап 2.

### Этап 2 — Storage contexts без internal kernel

Статус: `done`

Записи:

- 2026-05-26: добавлен public `StorageManagerContext<Events>` и root export; public storage context aliases с `manager` переведены на `StorageManagerContext<Extension["observedEvents"]>` с `AnyEvent` fallback. `pluginStorageTypes.ts` объявляет self-contained result aliases без импорта `runtime/kernel/*`; `StorageDispatchContext` остается локальным и не экспортируется из root API. Opaque storage payload cast в `StorageRuntime` локализован в normalization helper, registry больше не приводит `entry.value` напрямую. Обновлены `exports-surface` и focused type tests `plugin-system-public-api-hardening-stage2`. Проверки: focused `pnpm exec tstyche tests/types/exports-surface.tst.ts tests/types/plugin-system-public-api-hardening-stage2.tst.ts` — pass; focused `pnpm exec vitest run tests/core/storage-runtime-dispatch-pipeline.test.ts` — pass; `pnpm run test:types` — pass; `pnpm run build:packages` — pass; `pnpm run test:types:dist` — pass; source/dist audits `rg "runtime/kernel" packages/core/src/pluginStorage.ts packages/core/src/pluginStorageTypes.ts` и public declaration globs для `packages/core/dist` — no hits; audit root `StorageDispatchContext` — no hits; `git diff --check` — pass. Coverage: отдельный coverage-run не запускался, runtime behavior не менялся; focused runtime pipeline tests прошли. Риски: cheatsheets не обновлялись по порядку этапов, это область этапа 5; docs build не запускался по policy. Следующее действие: главный агент проверяет diff и stage gate этапа 2, затем отдельный подагент начинает этап 3.

### Этап 3 — Immutable action contract

Статус: `done`

Записи:

- 2026-05-26: plugin dispatch contexts, route resolver context, scoped invocation context и action-aware storage contexts переведены на `ReadonlyManagerAction`; replacement result contracts оставлены на `ManagerAction`. Добавлен internal `createReadonlyActionView`: в dev mode создает shallow copy action, shallow copy `meta` и freeze только верхнего уровня; `payload` и исходный action не замораживаются. Runtime callbacks route/storage/plugin/scoped получают action views, condition predicate оборачивается readonly view; route recalculation replacement protocol сохранен. Обновлены focused runtime/type tests и существующие type expectations; identity expectation `ctx.originalAction` заменен на structural equality. Проверки: focused `pnpm exec tstyche tests/types/plugin-system-public-api-hardening-stage3.tst.ts tests/types/exports-surface.tst.ts` — pass; focused `pnpm exec vitest run tests/core/plugin-system-public-api-hardening-stage3.test.ts tests/core/plugin-system-stage5.test.ts` — pass; `pnpm run test` — pass; `pnpm run test:types` — pass; `pnpm run test:coverage` — pass, 100% statements/branches/functions/lines; `git diff --check` — pass. Риски: docs/cheatsheets не обновлялись по порядку этапов; production branch action view остается allocation-free и не покрывается отдельным production-mode runtime run. Следующее действие: главный агент проверяет diff и stage gate этапа 3, затем отдельный подагент начинает этап 4.

### Этап 4 — Manager extensions по `PluginEvents`

Статус: `done`

Записи:

- 2026-05-26: `PluginDefinitionBase["manager"]` переведен на `ManagerExtensionFactory<PluginEvents>`, без изменений runtime registry и manager extension factories. Добавлен focused type test `plugin-system-public-api-hardening-stage4`: `ctx.transition` принимает `PluginEvents`, отвергает `HostEvents`/unknown events, `definePlugin().create({ manager })` не получает `AnyEvent` fallback, `PluginManagerExtensions<Plugin>` остается one-generic helper и сохраняет `ManagerAction<PluginEvents>`. Обновлены legacy type expectations в `plugin-system-stage4`, `plugins`, `plugin-system-stage8` и helper expectation документационного type test; fixture, cheatsheets и docs не менялись. Проверки: focused `pnpm exec tstyche tests/types/plugin-system-public-api-hardening-stage4.tst.ts tests/types/plugin-system-stage4.tst.ts tests/types/plugins.tst.ts tests/types/plugin-system-stage8.tst.ts` — pass; focused `pnpm exec vitest run tests/core/plugin-system-stage4.test.ts` — pass; `pnpm run test:types` — pass; `pnpm run test` — pass; `git diff --check` — pass. Coverage: отдельный coverage-run не запускался, runtime behavior не менялся; runtime regression покрыт focused/full Vitest. Риски: `tests/fixtures/plugin-system-documentation.ts` и cheatsheets все еще содержат документационный legacy return `ManagerAction<AnyEvent>` для `manager.cache.refresh`, это scope этапа 5; docs build не запускался по policy. Следующее действие: отдельный подагент начинает этап 5.

### Этап 5 — Документация и примеры

Статус: `done`

Записи:

- 2026-05-26: обновлены `PLUGIN-SYSTEM-CHEATSHEET.md`, `API-CHEATSHEET.md` и `TYPES-CHEATSHEET.md` под public hardening contract: `ReadonlyManagerAction`, immutable callback action contract, replacement protocol, `StorageManagerContext`, отсутствие public `StorageDispatchContext` и типизация manager extensions по `PluginEvents`. Documentation fixture и type test переведены с legacy `ManagerAction<AnyEvent>` для `manager.cache.refresh()` на `ManagerAction<CachePluginEvent>`. Проверки: focused `pnpm exec tstyche tests/types/plugin-system-documentation.tst.ts` — pass; audit `rg "ManagerAction<AnyEvent>" tests/fixtures/plugin-system-documentation.ts tests/types/plugin-system-documentation.tst.ts` — no hits; `pnpm run test:types` — pass; `git diff --check` — pass. Coverage: runtime behavior не менялся, Vitest coverage не запускался. Docs build не запускался по policy. Риски: package build/dist не обновлялись, это не требуется stage gate этапа 5. Следующее действие: главный агент проверяет diff и stage gate этапа 5, затем отдельный подагент начинает этап 6.

### Этап 6 — Рефакторинг, чистка и полировка

Статус: `done`

Записи:

- 2026-05-26: выполнена cleanup-проверка public plugin/storage boundary. В `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md` и `PLUGIN-SYSTEM-CHEATSHEET.md` уточнены stale wording про observer action fields, `scope.event`, nested readonly contract и отсутствие runtime deep freeze. В `packages/core/src/runtime/kernel/storage.ts` internal result aliases переиспользуют public storage result aliases, чтобы не держать второго владельца для result contracts; routing priority и dispatch order не менялись. Проверки: focused `pnpm exec tstyche tests/types/plugin-system-public-api-hardening-stage2.tst.ts tests/types/plugin-system-public-api-hardening-stage3.tst.ts tests/types/plugin-system-public-api-hardening-stage4.tst.ts tests/types/plugin-system-documentation.tst.ts` — pass; focused `pnpm exec vitest run tests/core/plugin-system-public-api-hardening-stage3.test.ts tests/core/storage-runtime-dispatch-pipeline.test.ts` — pass, 51 tests; audit public `runtime/kernel` imports в source/dist plugin entrypoints — no hits; audit legacy public examples `rg -P '(?<!Readonly)ManagerAction<AnyEvent>' ...` — no hits; audit stale wording `scope.event.*видит`, `observer contexts используют`, wide `ManagerRuntimeContext` — no hits; audit TODO/FIXME в области работ — no hits; hidden payload exact audit на public `StorageRuntime` — no hits; `pnpm run lint` — pass; `git diff --check` — pass. Coverage: отдельный coverage-run не запускался, потому runtime behavior не менялся; измененный runtime file содержит только type-only alias cleanup, focused runtime regressions прошли. Expected remaining hits: internal imports из `@lite-fsm/core/internal/*` в tests, internal kernel types внутри `packages/core/src/runtime/kernel/*`, упоминания `runtime/kernel/*` в ТЗ/журнале, negative type tests для отсутствующих exports. Риски: package build/dist Tstyche не запускались на этапе 6; docs build не запускался по policy. Следующее действие: отдельный подагент начинает этап 7.

### Этап 7 — Release checks

Статус: `done`

Записи:

- 2026-05-26: выполнен release gate после этапов 1-6. Исправлены только blockers этапа 7 в test sources: runtime tests приведены к текущим `ManagerAction` payload/meta constraints, manager extension test параметризован `PluginEvents`, snapshot storage mocks переведены на public `StorageHydrateContext`/`StorageDehydrateContext`. Runtime behavior не менялся. Проверки: `pnpm run test` — pass, 98 files passed, 2 skipped; `pnpm run test:types` — pass, 40 files, 441 tests; `pnpm run check-types` — pass; `pnpm run lint` — pass; `pnpm run test:coverage` — pass, 100% statements/branches/functions/lines; `pnpm run build:packages` — pass; `pnpm run test:types:dist` — pass; `git diff --check` — pass. Audits: `rg "runtime/kernel" packages/core/dist --glob "index.d.*" --glob "plugin.d.*" --glob "pluginTypes.d.*" --glob "pluginStorage.d.*" --glob "pluginStorageTypes.d.*" --glob "pluginHelpers.d.*"` — no hits; `rg "ManagerAction<AnyEvent>" tests/fixtures/plugin-system-documentation.ts tests/types/plugin-system-documentation.tst.ts` — no hits. Docs build: not run by policy. Expected remaining hits: internal imports из `@lite-fsm/core/internal/*` в tests, internal kernel types внутри `packages/core/src/runtime/kernel/*`, упоминания `runtime/kernel/*` в ТЗ/журнале, negative type tests для отсутствующих exports. Риски: `pnpm run build:packages` транзитивно собирает CLI visualizer bundle и вывел только size warning; docs build не запускался. Следующее действие: главный агент выполняет финальную проверку раздела 6 ТЗ.

## Финальная проверка

- Статус: `done`
- 2026-05-26: главный агент проверил раздел 6 ТЗ после этапа 7. `ReadonlyManagerAction` и `StorageManagerContext` экспортируются из root API; `StorageDispatchContext` не экспортируется из root API; public storage declarations не импортируют `runtime/kernel/*`; hidden payload `LiteFsmStorageRuntimeDefinition` не раскрывает internal `StorageRuntime`; storage manager public context не содержит `routing`, `createScopedDeps`, `config`, `options`, `schemaVersion`; action-aware plugin/storage contexts используют `ReadonlyManagerAction`; replacement protocol остается единственным documented способом заменить action; manager extensions типизированы по `PluginEvents`, а `HostEvents` остаются observer-only. Documentation fixture и cheatsheets обновлены, legacy public example `ManagerAction<AnyEvent>` отсутствует. Проверки главного агента: `pnpm run test` — pass, 98 files passed, 1299 tests passed; `pnpm run test:types` — pass, 40 files, 441 tests; `pnpm run check-types` — pass; `pnpm run lint` — pass; `pnpm run test:coverage` — pass, 100% statements/branches/functions/lines; `pnpm run build:packages` — pass; `pnpm run test:types:dist` — pass, 40 files, 441 tests; `git diff --check` — pass. Audits: public dist `runtime/kernel` dependency — no hits; fixture legacy `ManagerAction<AnyEvent>` — no hits; root `StorageDispatchContext` — no hits; public hidden `StorageRuntime` payload/import — no hits. Docs build не запускался по policy.
