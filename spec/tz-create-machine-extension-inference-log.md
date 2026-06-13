# Журнал реализации ТЗ TypedCreateMachineFn plugin source

ТЗ: [`tz-create-machine-extension-inference.md`](./tz-create-machine-extension-inference.md)

Цель журнала - восстановить состояние реализации после сжатия контекста. Журнал не заменяет ТЗ и не пересказывает diff.

## Правила ведения

- Перед продолжением работы прочитать ТЗ и этот журнал.
- Продолжать первый этап со статусом не `done`.
- Не переходить к следующему этапу, пока текущий этап не прошел свой `stage gate`.
- Обновлять журнал после закрытия этапа, blocker или значимого промежуточного результата.
- Записи держать короткими: scope, измененные модули, проверки, coverage, риски, следующее действие.
- Не фиксировать каждую мелкую правку и не вставлять полный diff.
- Не запускать docs build и команды, которые транзитивно запускают docs build.

## Статусы

- `not started`
- `in progress`
- `done`
- `blocked`

## Текущий указатель

- Активное ТЗ: `spec/tz-create-machine-extension-inference.md`
- Активный этап: Этап 5 - Рефакторинг, чистка и полировка
- Статус: `done`
- Следующее действие: финальный completion audit по ТЗ.

## Сводка по этапам

| Этап | Название | Статус | Последнее обновление |
| ---- | -------- | ------ | -------------------- |
| 1 | Public API collapse to plugin source | `done` | 2026-06-13 |
| 2 | Cfg-dependent machine-facing fields | `done` | 2026-06-13 |
| 3 | Entity-facing proof без `@lite-fsm/entities` | `done` | 2026-06-13 |
| 4 | Документация public API | `done` | 2026-06-13 |
| 5 | Рефакторинг, чистка и полировка | `done` | 2026-06-13 |

## Ход реализации

### Этап 1 - Public API collapse to plugin source

Статус: `done`

Записи:

- Scope: `TypedCreateMachineFn` принимает plugin source как third generic; direct extension union и unknown object third generic отклоняются constraint. `PluginMachineExtensions` и `MachineRuntimeExtension` удалены из root exports; internal machine extension shape перенесен в storage typing.
- Измененные модули: `createMachine.types.ts`, `createMachine.ts`, `pluginHelpers.ts`, `pluginStorage.ts`, `pluginStorageTypes.ts`, `index.ts`, `plugin.ts`; обновлены public Tstyche tests и documentation fixture на `TypedCreateMachineFn<P, D, typeof plugins>`.
- Проверки: focused `pnpm exec tstyche tests/types/create-machine-plugin-source.tst.ts tests/types/plugin-system-stage2.tst.ts tests/types/plugin-system-stage3.tst.ts tests/types/plugin-system-stage5-storage-binding.tst.ts tests/types/plugin-system-stage7.tst.ts tests/types/plugin-system-stage8.tst.ts tests/types/plugin-system-documentation.tst.ts tests/types/exports-surface.tst.ts tests/types/plugins.tst.ts` — pass; `pnpm --filter @lite-fsm/core check-types` — pass; root export audit по `PluginMachineExtensions|MachineRuntimeExtension` — только negative tests.
- Риски: cheatsheets еще не обновлены, это scope этапа 4; direct runtime `createMachine` сохраняет internal assignability overload для присваивания typed wrapper.

### Этап 2 - Cfg-dependent machine-facing fields

Статус: `done`

Записи:

- Scope: добавлен dependent field contract для machine-facing fields в `StorageRuntimeExtension` / internal extension shape; `TypedCreateMachineFn` вычисляет concrete `resultMetadata`, `publicState`, reducer meta и effect/reaction deps из storage input. Runtime behavior не менялся.
- Измененные модули: `pluginStorageTypes.ts`, `createMachine.types.ts`; добавлен focused test `tests/types/create-machine-dependent-storage.tst.ts`.
- Проверки: focused `pnpm exec tstyche tests/types/create-machine-plugin-source.tst.ts tests/types/create-machine-dependent-storage.tst.ts tests/types/plugin-system-stage2.tst.ts tests/types/plugin-system-stage3.tst.ts tests/types/plugin-system-stage5-storage-binding.tst.ts tests/types/plugin-system-stage7.tst.ts tests/types/plugin-system-stage8.tst.ts tests/types/plugin-system-documentation.tst.ts tests/types/exports-surface.tst.ts tests/types/plugins.tst.ts` — pass; `pnpm --filter @lite-fsm/core check-types` — pass.
- Реализация blocker: extension overload теперь выводит весь `cfg` через `const Cfg` и mapped identity, затем вычисляет storage input, config, context и dependent fields из `Cfg`; это дает contextual typing callbacks от sibling fields без изменения runtime value shape.

### Этап 3 - Entity-facing proof без `@lite-fsm/entities`

Статус: `done`

Записи:

- Scope: добавлен fake entity storage/plugin в `tests/types/create-machine-entity-proof.tst.ts` без импорта `@lite-fsm/entities`.
- Проверено: `TypedCreateMachineFn<P, D, typeof plugins>` через plugin tuple; два `storage: "entity"` templates получают разные `MachineResultMetadata`; reducer meta `payloadFor()` выводит concrete `spawnSchema`; `MachinesState` использует concrete `initialContext`; metadata не `any` и не broad `Record`; обычные domain machines и actor templates работают в том же wrapper.
- Проверки: `pnpm exec tstyche tests/types/create-machine-entity-proof.tst.ts` — pass; focused этапы 1-3 `pnpm exec tstyche tests/types/create-machine-plugin-source.tst.ts tests/types/create-machine-dependent-storage.tst.ts tests/types/create-machine-entity-proof.tst.ts tests/types/plugin-system-stage2.tst.ts tests/types/plugin-system-stage3.tst.ts tests/types/plugin-system-stage5-storage-binding.tst.ts tests/types/plugin-system-stage7.tst.ts tests/types/plugin-system-stage8.tst.ts tests/types/plugin-system-documentation.tst.ts tests/types/exports-surface.tst.ts tests/types/plugins.tst.ts` — pass; `pnpm --filter @lite-fsm/core check-types` — pass.

### Этап 4 - Документация public API

Статус: `done`

Записи:

- Scope: обновлены `API-CHEATSHEET.md` и `TYPES-CHEATSHEET.md` под единый plugin-aware pattern `TypedCreateMachineFn<P, D, typeof plugins>`.
- Удалены public mentions `PluginMachineExtensions`, `MachineRuntimeExtension` и `TypedCreateMachineFn<P, D, Extensions>`; добавлено явное требование вручную расширять `P` через `PluginManagerEvents` и `D` через `EffectDeps`; описан storage author dependent field contract.
- Проверки: `rg -n "PluginMachineExtensions|MachineRuntimeExtension|TypedCreateMachineFn<[^\\n]*Extensions|TypedCreateMachineFn<P, D, Extensions>|Extensions>" API-CHEATSHEET.md TYPES-CHEATSHEET.md` — no hits; `git diff --check` — pass. Docs build не запускался.

### Этап 5 - Рефакторинг, чистка и полировка

Статус: `done`

Записи:

- Scope: internal aliases переименованы с legacy `MachineRuntimeExtension` / `PluginMachine...` names на `StorageMachineTypingExtension` / `StorageTypingExtensionsForPluginSource`; stale public helper path удален из quick cheatsheet.
- Проверки: `pnpm run test:types` — pass; `pnpm run check-types` — pass; `pnpm run lint` — pass; `git diff --check` — pass.
- Source audit: exact `PluginMachineExtensions` / `MachineRuntimeExtension` вне `spec/**` остаются только в negative export tests; `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md` и `PLUGIN-SYSTEM-QUICK-CHEATSHEET.md` не описывают старый public path. Expected hit: internal `PluginStorageTypingExtensions` helper name в `createMachine.types.ts`.

## Финальная проверка

- Статус: `done`
- Проверки: `pnpm run test:types`; `pnpm run check-types`; `pnpm run lint`; `git diff --check`; source audit по `TypedCreateMachineFn`, `PluginMachineExtensions`, `MachineRuntimeExtension`.
- Запрещенные docs build команды не запускались.
