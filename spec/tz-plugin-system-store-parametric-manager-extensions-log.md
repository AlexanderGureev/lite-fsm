# Журнал реализации ТЗ store-parametric manager extensions

ТЗ: [`tz-plugin-system-store-parametric-manager-extensions.md`](./tz-plugin-system-store-parametric-manager-extensions.md)

Цель журнала — восстановить состояние реализации после сжатия контекста. Журнал не заменяет ТЗ и не пересказывает diff.

## Правила ведения

- Перед продолжением работы прочитать ТЗ и этот журнал.
- Продолжать первый этап со статусом не `done`.
- Не переходить к следующему этапу, пока текущий этап не прошел свой `stage gate`.
- Обновлять журнал после закрытия этапа, blocker или значимого промежуточного результата.
- Записи держать короткими: scope, измененные модули, проверки, coverage, риски, следующее действие.
- Не фиксировать каждую мелкую правку и не вставлять полный diff.

## Статусы

- `not started`
- `in progress`
- `done`
- `blocked`

## Текущий указатель

- Активное ТЗ: `spec/tz-plugin-system-store-parametric-manager-extensions.md`
- Активный этап: Финальная проверка
- Статус: `done`
- Следующее действие: нет.

## Сводка по этапам

| Этап | Название | Статус | Последнее обновление |
| ---- | -------- | ------ | -------------------- |
| 1 | Store-parametric public types | `done` | 2026-06-13 |
| 2 | Runtime wiring regression | `done` | 2026-06-13 |
| 3 | Документация public type surface | `done` | 2026-06-13 |
| 4 | Рефакторинг, чистка и полировка | `done` | 2026-06-13 |

## Ход реализации

### Этап 1 — Store-parametric public types

Статус: `done`

Записи:

- 2026-06-13: `ManagerRuntimeContext<Events, S = MachineStore>` добавлен в public type surface; `PluginManagerExtensions<Plugin, S = MachineStore>` теперь специализирует manager factory return types под store текущего `MachineManager`; `ManagerFromPlugins` передает `S` в helper. `definePlugin().create({ manager })` сохраняет существующий runtime DSL и generic manager factory signatures; новый public helper не добавлялся.
- 2026-06-13: internal `managerContext` в `createMachineManagerFactory` типизирован как `ManagerRuntimeContext<RuntimeEvents, S>`; storage-facing пути получают прежний широкий context через локальный cast без runtime перестановок.
- 2026-06-13: Type tests обновлены в `tests/types/plugin-system-stage4.tst.ts`: обратная совместимость `ManagerRuntimeContext<Events>`, store-parametric `getState`, `PluginManagerExtensions<Plugin, S>`, `ManagerFromPlugins`, generic manager method и tuple intersection. Проверки: `pnpm exec tstyche tests/types/plugin-system-stage4.tst.ts` — pass; focused plugin type tests — pass; `pnpm run check-types` — pass.
- 2026-06-13: Cheatsheets обновлены в `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`, фактическом tracked plugin справочнике `PLUGIN-SYSTEM-QUICK-CHEATSHEET.md`. Файл `PLUGIN-SYSTEM-CHEATSHEET.md` отсутствует в текущем workspace и не является tracked.

### Этап 2 — Runtime wiring regression

Статус: `done`

Записи:

- 2026-06-13: Runtime wiring не менялся по порядку установки plugins или order pipeline. Regression в `tests/core/plugin-system-stage4.test.ts` дополнен проверкой, что manager extension factory получает исходный `config` object, видит initial state и продолжает читать актуальный state/deps после transitions.
- 2026-06-13: Проверки: `pnpm exec vitest run tests/core/plugin-system-stage4.test.ts` — pass; `pnpm exec vitest run tests/core/plugin-system-stage2.test.ts tests/core/plugin-system-stage4.test.ts tests/core/plugins.test.ts` — pass. Coverage gate отдельно не запускался: измененный runtime path получил только type/cast wiring без изменения behavior.

### Этап 3 — Документация public type surface

Статус: `done`

Записи:

- 2026-06-13: `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md` и `PLUGIN-SYSTEM-QUICK-CHEATSHEET.md` описывают `ManagerRuntimeContext<PluginEvents, S = MachineStore>`, `PluginManagerExtensions<Plugins, S = MachineStore>` и пример manager extension, возвращающего `EntityAccess<MachinesState<S>>`. Runtime DSL `definePlugin().create({ manager })` оставлен прежним; новый helper `PluginManagerExtensionsFor` не документировался.
- 2026-06-13: Documentation audit `rg -n "PluginManagerExtensionsFor|ManagerRuntimeContext<[^,>]+, [^>]+,|install\\(ctx\\)" packages/core/src tests/types API-CHEATSHEET.md TYPES-CHEATSHEET.md PLUGIN-SYSTEM-QUICK-CHEATSHEET.md` — no hits. Docs build не запускался.

### Этап 4 — Рефакторинг, чистка и полировка

Статус: `done`

Записи:

- 2026-06-13: Cleanup audit не нашел `PluginManagerExtensionsFor`, третьего generic у `ManagerRuntimeContext`, `install(ctx)`, TODO/FIXME в активной области. Временные helpers или compatibility branches не добавлялись; helper-логика `PluginManagerExtensions` остается локальной в `pluginHelpers.ts`.
- 2026-06-13: Финальные проверки: `pnpm run check-types` — pass; `pnpm exec vitest run tests/core/plugin-system-stage2.test.ts tests/core/plugin-system-stage4.test.ts tests/core/plugins.test.ts` — pass; `pnpm run lint` — pass; `git diff --check` — pass; source audit по `packages/core/src`, `tests/types`, `tests/core`, `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`, `PLUGIN-SYSTEM-QUICK-CHEATSHEET.md` — no hits. Docs build не запускался.

## Финальная проверка

- Статус: `done`
- Записи:
  - 2026-06-13: Все этапы ТЗ закрыты. `ManagerRuntimeContext<Events, S>` сохраняет обратную совместимость `ManagerRuntimeContext<Events>`; `PluginManagerExtensions<Plugin, S>` работает для single plugin, tuple plugins и wide fallback; `ManagerFromPlugins<S, AppEvents, Plugins>` возвращает store-parametric manager extensions; generic manager factory возвращает тип, зависящий от `MachinesState<S>`. Runtime behavior manager extensions сохранен.
