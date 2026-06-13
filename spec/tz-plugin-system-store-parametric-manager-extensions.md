# Store-parametric manager extensions — ТЗ для реализации

## 1. Цель

Сделать `manager` extensions в plugin system зависимыми от конкретного `MachineStore`, переданного в текущий `MachineManager(machines, ...)`.

Целевой результат: plugin может вернуть extension, тип которого выводится из `MachinesState<typeof machines>`, без кастов в user code и без нового public helper рядом с `PluginManagerExtensions`.

## 2. Как выполнять это ТЗ

### Область работ

- `packages/core/src/pluginTypes.ts`;
- `packages/core/src/plugin.ts`;
- `packages/core/src/pluginHelpers.ts`;
- `packages/core/src/interfaces.ts`;
- `packages/core/src/runtime/kernel/createMachineManagerFactory.ts`, если требуется уточнить internal typing `managerContext`;
- type tests в `tests/types`;
- focused runtime regression tests в `tests/core`, если меняется runtime context wiring;
- `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`, `PLUGIN-SYSTEM-CHEATSHEET.md`.

### Вне области работ

- Не менять runtime DSL `definePlugin().create({ manager: ... })`.
- Не возвращать `install(ctx)` или `PluginInstallContext`.
- Не добавлять public `PluginManagerExtensionsFor`.
- Не менять routing, interceptors, hooks, scoped deps, scoped transition, storage runtime или snapshot contracts.
- Не делать `manager` section app-parametric на runtime уровне: runtime продолжает получать тот же `managerContext`.
- Не реализовывать `@lite-fsm/entities`.

### Запрещенные команды

Агентам запрещено запускать:

- `pnpm run build`;
- `pnpm --filter @lite-fsm/docs build`;
- `pnpm run docs:build`;
- `pnpm run pages:build*`;
- любой `next build` внутри `apps/docs`.

Для package build проверки использовать только `pnpm run build:packages`, если этап требует build-проверки и команда не запускает docs build.

### Общие тестовые ожидания

- Runtime-поведение `MachineManager` без plugins и с существующими plugins должно сохраниться.
- Public types покрывать Tstyche.
- Названия новых `describe`, `it`, `test` писать на русском.
- Если меняется только type-level код, coverage не является gate этапа.
- Если меняется runtime code path, новый и измененный runtime code должен иметь 100% coverage по statements, branches, functions и lines.

## 3. Целевой public API

### `ManagerRuntimeContext`

Сохранить существующий порядок generic `Events` и добавить параметр `S` вторым:

```ts
type ManagerRuntimeContext<
  Events extends AnyEvent = AnyEvent,
  S extends MachineStore = MachineStore,
> = {
  readonly config: S;
  getState(): MachinesState<S>;
  transition(action: ManagerAction<Events>, options?: unknown): ManagerAction<Events>;
  // остальные поля сохраняют текущий контракт
};
```

Контракт:

- `ManagerRuntimeContext<Ping>` остается валидным и означает `Events = Ping`, `S = MachineStore`.
- `ManagerRuntimeContext<Ping, typeof machines>` дает `config: typeof machines` и `getState(): MachinesState<typeof machines>`.
- Runtime object, передаваемый в manager extension factory, не меняет behavior.

### `PluginManagerExtensions`

Расширить существующий helper вторым необязательным параметром:

```ts
type PluginManagerExtensions<
  Plugin,
  S extends MachineStore = MachineStore,
> = /* manager section return types, instantiated with S */;
```

Контракт:

- `PluginManagerExtensions<typeof plugin>` остается валидным.
- `PluginManagerExtensions<typeof plugin, typeof machines>` выводит manager extensions с учетом `typeof machines`.
- `ManagerFromPlugins<S, AppEvents, Plugins>` использует `PluginManagerExtensions<Plugins, S>`.
- Новый public helper `PluginManagerExtensionsFor` не добавляется.
- Helper сохраняет tuple/union traversal и intersection semantics для нескольких plugins.

### Store-parametric manager factory

Plugin author должен иметь возможность описать manager extension factory, возвращающую тип, зависящий от `S`:

```ts
const plugin = definePlugin().create({
  name: "typed-manager-extension",
  manager: {
    access<S extends MachineStore>(
      ctx: ManagerRuntimeContext<AnyEvent, S>,
    ): EntityAccess<MachinesState<S>> {
      return createAccess(ctx);
    },
  },
});
```

`MachineManager(machines, { plugins: [plugin] })` должен возвращать manager, где `manager.access` имеет тип `EntityAccess<MachinesState<typeof machines>>`.

## 4. Целевая архитектура

- `pluginTypes.ts` владеет store-parametric shape `ManagerRuntimeContext`.
- `plugin.ts` сохраняет `definePlugin` DSL и не стирает generic call signatures manager factory values.
- `pluginHelpers.ts` владеет вычислением `PluginManagerExtensions<Plugin, S>` и инстанцирует return type manager factory для текущего `S`.
- `interfaces.ts` связывает `ManagerFromPlugins<S, AppEvents, Plugins>` с `PluginManagerExtensions<Plugins, S>`.
- `createMachineManagerFactory.ts` может оставить runtime object прежним, но internal type `managerContext` должен соответствовать обновленному `ManagerRuntimeContext<RuntimeEvents, S>` без ухудшения runtime behavior.

## 5. Этапы реализации

### Этап 1 — Store-parametric public types

#### Цель

Обновить public type surface так, чтобы `manager` extensions могли зависеть от `MachineStore` текущего `MachineManager`.

#### Зависит от

- Существующая plugin DSL `definePlugin().create(...)`.
- Существующие helper types `PluginManagerExtensions`, `ManagerFromPlugins`, `ManagerRuntimeContext`.

#### Контракт этапа

- `ManagerRuntimeContext` получает второй generic `S extends MachineStore = MachineStore`.
- Порядок generic `Events` у `ManagerRuntimeContext` сохраняется.
- `ManagerExtensionFactory` и related internal types принимают store-parametric context без потери существующего `Events` contract.
- `PluginManagerExtensions<Plugin, S = MachineStore>` инстанцирует return type manager factories с конкретным `S`.
- `ManagerFromPlugins<S, AppEvents, Plugins>` возвращает `IMachineManager<...> & PluginManagerExtensions<Plugins, S>`.
- `definePlugin().create(...)` сохраняет literal `name`, manager section return types и generic call signatures manager factory methods.
- Tuple из нескольких plugins по-прежнему объединяет manager extensions через intersection.
- Широкий `readonly LiteFsmPlugin[]` не обязан сохранять plugin-specific manager extension inference.

#### Не делать в этом этапе

- Не менять runtime order установки plugins.
- Не менять runtime validation или normalized plugin payload.
- Не менять storage runtime type surface.
- Не добавлять новый public helper.
- Не обновлять entity ТЗ в этом этапе.

#### Тесты этапа

Type tests:

- `ManagerRuntimeContext<Ping>` сохраняет старую форму generic.
- `ManagerRuntimeContext<Ping, typeof machines>["getState"]` возвращает `MachinesState<typeof machines>`.
- `PluginManagerExtensions<typeof plugin>` остается совместимым с текущими tests.
- `PluginManagerExtensions<typeof plugin, typeof machines>` выводит extension, зависящий от `MachinesState<typeof machines>`.
- `ManagerFromPlugins<typeof machines, AppEvents, readonly [plugin]>` содержит store-parametric manager extension.
- Generic manager method внутри `manager` section не стирается до `MachineStore`.
- Несколько plugins с manager extensions сохраняют intersection type.

#### Критерий завершения

- Focused Tstyche tests этапа проходят.
- Existing plugin type tests проходят.
- `pnpm run check-types` проходит.
- Public type changes отражены в cheatsheets.

### Этап 2 — Runtime wiring regression

#### Цель

Подтвердить, что type-level доработка не изменила runtime behavior manager extensions.

#### Зависит от

- Этап 1.

#### Контракт этапа

- Runtime `managerContext.config` остается тем же объектом `machines`, который передан в `MachineManager`.
- Runtime `managerContext.getState()` возвращает current manager state.
- Manager extension factory вызывается один раз при создании manager, как раньше.
- Manager extension object навешивается после init runtime state, как раньше.
- Ошибки duplicate manager extension key и попытка перезаписать core manager method сохраняют существующие codes и messages.

#### Не делать в этом этапе

- Не добавлять новые runtime callbacks.
- Не менять order `storage`, `routeMeta`, `scopedDeps`, `scopedTransition`, `manager`, `intercept`, `hooks`.
- Не менять `MachineManager` public runtime methods.

#### Тесты этапа

Runtime tests:

- Existing manager extension tests проходят без изменения ожидаемого behavior.
- Store-parametric fixture plugin на runtime получает `ctx.config` и `ctx.getState()` в прежних фазах.
- No-op plugin и plugin с обычным non-generic manager extension сохраняют behavior.

#### Критерий завершения

- Focused Vitest tests этапа проходят, если runtime файлы менялись.
- Existing plugin runtime tests проходят.
- Coverage gate закрыт только при изменении runtime behavior code.

### Этап 3 — Документация public type surface

#### Цель

Обновить справочники public API и public types под store-parametric `PluginManagerExtensions`.

#### Зависит от

- Этапы 1-2.

#### Контракт этапа

- `API-CHEATSHEET.md` показывает, что `definePlugin().create({ manager })` не меняет runtime DSL.
- `TYPES-CHEATSHEET.md` фиксирует `PluginManagerExtensions<Plugin, S = MachineStore>`.
- `PLUGIN-SYSTEM-CHEATSHEET.md` показывает store-parametric manager extension example.
- Документация не вводит `PluginManagerExtensionsFor`.
- Документация не обещает runtime app-parametric callbacks сверх существующего `managerContext`.

#### Не делать в этом этапе

- Не добавлять pages в `apps/docs`.
- Не запускать docs build.
- Не документировать internal helper types.

#### Тесты этапа

Documentation checks:

- Source audit не находит `PluginManagerExtensionsFor` в active docs/code.
- Type snippets из cheatsheets имеют mirrored Tstyche coverage или не являются компилируемыми examples.

#### Критерий завершения

- Cheatsheets обновлены.
- Documentation audit завершен.
- Docs build не запускался.

### Этап 4 — Рефакторинг, чистка и полировка

#### Цель

Убрать временные type helpers и проверить, что доработка не оставила лишнюю public surface.

#### Зависит от

- Этапы 1-3.

#### Контракт этапа

Must fix:

- временные aliases для `PluginManagerExtensionsFor`;
- dead type helpers в `pluginHelpers.ts`;
- stale comments про `PluginManagerExtensions` без `MachineStore`;
- duplicate logic для tuple traversal manager extensions;
- неиспользуемые imports, locals и test scaffolds.

Inspect only:

- декоративные переименования helper types без снижения сложности;
- перенос runtime code без изменения контракта;
- расширение `ManagerRuntimeContext` дополнительными generic параметрами сверх `Events` и `S`.

#### Не делать в этом этапе

- Не менять public behavior.
- Не добавлять новые capabilities.
- Не переписывать plugin system documentation шире измененного контракта.

#### Тесты этапа

- Focused type tests затронутого scope.
- Focused runtime regressions, если runtime files менялись.
- `pnpm run check-types`.
- `pnpm run lint`.
- `git diff --check`.
- Source audit: `rg "PluginManagerExtensionsFor|ManagerRuntimeContext<[^,>]+, [^>]+,|install\\(ctx\\)" packages/core/src tests/types API-CHEATSHEET.md TYPES-CHEATSHEET.md PLUGIN-SYSTEM-CHEATSHEET.md`.

#### Критерий завершения

- Cleanup audit не находит активные запрещенные identifiers.
- Все проверки этапа проходят.
- Нет незакрытых TODO/FIXME, debug logging или temporary compatibility branches в области работ.

## 6. Критерий полной готовности

ТЗ считается реализованным только когда выполнены все условия:

- `ManagerRuntimeContext<Events, S>` сохраняет обратную совместимость `ManagerRuntimeContext<Events>`.
- `PluginManagerExtensions<Plugin, S>` работает для single plugin, tuple plugins и wide plugin array fallback.
- `ManagerFromPlugins<S, AppEvents, Plugins>` возвращает manager extensions, зависящие от `S`.
- Generic manager extension factory может вернуть тип, зависящий от `MachinesState<S>`.
- Runtime behavior manager extensions не изменился.
- Existing plugin runtime tests проходят.
- Existing plugin type tests проходят.
- `pnpm run check-types` проходит.
- Lint проходит.
- Cheatsheets обновлены.
- Сборка документации не запускалась агентом.
- Нет нового public helper `PluginManagerExtensionsFor`.
- Нет известных type regressions, undocumented public type changes или открытых blockers.
