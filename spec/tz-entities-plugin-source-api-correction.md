# @lite-fsm/entities plugin source API — корректирующее ТЗ

## 1. Цель

Исправить public API `@lite-fsm/entities` после этапа 5 основного ТЗ: убрать необходимость создавать `entitiesPlugin<AppDeps>()` как type-only plugin value для `TypedCreateMachineFn` и сохранить один очевидный runtime-вызов `entitiesPlugin({ spawn })`.

Целевой контракт:

- `TypedCreateMachineFn` остается единственным способом заранее типизировать `createMachine` под приложение;
- `@lite-fsm/entities` экспортирует type-only plugin source `EntitiesPlugin<AppDeps = unknown, PluginEvents extends AnyEvent = never>`;
- `entitiesPlugin(...)` остается runtime factory и не принимает `AppDeps` generic;
- `entitiesPlugin({ spawn })` сохраняет точный вывод spawn events для `manager.transition(...)`;
- будущие этапы `effectDeps` и `reactionDeps` используют `EntitiesPlugin<AppDeps>` как источник `AppDeps`, а не generic runtime factory.

## 2. Как выполнять это ТЗ

Это корректирующее ТЗ выполняется после завершенного этапа 5 `spec/tz-entities-implementation.md` и до начала этапа 6. Нельзя продолжать основное ТЗ, пока это ТЗ не пройдет full readiness gate.

Перед началом реализации прочитать:

- `spec/tz-entities-implementation.md`;
- `spec/tz-entities-implementation-part-2.md`;
- `spec/tz-entities-implementation-log.md`;
- `packages/entities/src/plugin.ts`;
- `packages/entities/src/machine-extension.ts`;
- `packages/core/src/createMachine.types.ts`;
- `packages/core/src/pluginStorageTypes.ts`;
- `tests/types/entities-api.tst.ts`;
- `tests/types/create-machine-dependent-storage.tst.ts`;

Запрещенные проверки сохраняются из основного ТЗ:

- `pnpm run build`;
- `pnpm --filter @lite-fsm/docs build`;
- `pnpm run docs:build`;
- `pnpm run pages:build*`;
- любой `next build` внутри `apps/docs`.

Для package build использовать только scoped commands, если они нужны для gate:

- `pnpm --filter @lite-fsm/core build`;
- `pnpm --filter @lite-fsm/entities build`.

### Область работ

- `packages/entities/src/plugin.ts`;
- `packages/entities/src/machine-extension.ts`;
- `packages/entities/src/index.ts`;
- при необходимости точечные generic type helpers в `packages/core/src/createMachine.types.ts` и `packages/core/src/pluginStorageTypes.ts`;
- type tests в `tests/types/entities-api.tst.ts` и, при изменении core generic storage typing, `tests/types/create-machine-dependent-storage.tst.ts`;
- runtime regression tests в `tests/entities/entities-plugin.test.ts`, если меняется runtime shape или validation;
- `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md`, `packages/entities/README.md`;
- `spec/tz-entities-implementation.md`, `spec/tz-entities-implementation-part-2.md` и журналы только для синхронизации контракта.

### Вне области работ

- новые runtime возможности entity storage;
- этап 6 columnar reduce pipeline, routing, buckets и hot path guarantees;
- `despawnOn`, entity effects, reactions, snapshot/hydrate, React hooks и benchmarks;
- новый public helper вроде `createEntityMachine(...)`;
- автоматическое добавление spawn events в `AppEvents`;
- изменение public semantics `MachineManager`, middleware, subscribers или storage dispatch pipeline.

## 3. Целевой public API

### Type-only plugin source

```ts
import {
  createMachine as createLiteFsmMachine,
  type TypedCreateMachineFn,
} from "@lite-fsm/core";
import { entitiesPlugin, type EntitiesPlugin, type EntityAccess } from "@lite-fsm/entities";

type AppMachines = typeof machines;
type AppDeps = {
  readonly api: Api;
  readonly entities?: EntityAccess<AppMachines>;
};

export const createMachine: TypedCreateMachineFn<
  AppEvents,
  AppDeps,
  EntitiesPlugin<AppDeps>
> = createLiteFsmMachine;
```

Контракт:

- `EntitiesPlugin<AppDeps = unknown, PluginEvents extends AnyEvent = never>` является exported type alias.
- `EntitiesPlugin<AppDeps>` совместим с третьим generic параметром `TypedCreateMachineFn`.
- `EntitiesPlugin<AppDeps>` не требует runtime value и не должен создаваться через `entitiesPlugin<AppDeps>()`.
- `AppDeps` используется только type-level storage extension contract.
- `PluginEvents` используется для runtime plugin manager events и позволяет `entitiesPlugin({ spawn })` сохранить точный `SpawnEventsFrom<typeof spawnEvents>` в return type.
- На этапе 5 `AppDeps` может не влиять на runtime-visible entity reducer context, потому что `effectDeps` и `reactionDeps` добавляются позже.
- На этапах 9 и 10 `EntitiesPlugin<AppDeps>` должен стать источником `AppDeps` для `EntityMachineExtension.effectDeps` и `EntityMachineExtension.reactionDeps`.

### Runtime plugin factory

```ts
const spawn = defineEntitySpawn(machines, spawnEvents)({
  SPAWN_PROJECTILE: (payload) => ({
    id: payload.id,
    groupTag: "projectile",
    actors: {
      movementActor: { x: payload.x, y: payload.y },
    },
  }),
});

const manager = MachineManager(machines, {
  plugins: [entitiesPlugin({ spawn })],
});
```

Контракт:

- `entitiesPlugin()` остается валидным runtime plugin без public spawn events.
- `entitiesPlugin({ spawn })` остается валидным runtime plugin со spawn events.
- `entitiesPlugin(...)` не принимает `AppDeps` generic в public API.
- `entitiesPlugin<AppDeps>()` не является поддерживаемым public pattern.
- `entitiesPlugin<AppDeps>({ spawn })` не является поддерживаемым public pattern.
- `entitiesPlugin({ spawn })` выводит `SpawnEventsFrom<typeof spawnEvents>` из value `spawn` и расширяет тип `manager.transition(...)`.
- Runtime behavior `entitiesPlugin()` и `entitiesPlugin({ spawn })` не меняется относительно этапа 5.

## 4. Целевая архитектура

- `TypedCreateMachineFn<AppEvents, AppDeps, PluginSource>` остается владельцем app-level typing.
- `EntitiesPlugin<AppDeps>` является plugin source type, а не runtime factory result, который пользователь обязан создавать.
- `EntitiesPlugin<AppDeps, PluginEvents>` разделяет type-level app dependencies и plugin manager events: `AppDeps` обслуживает machine extension typing, `PluginEvents` обслуживает `manager.transition(...)`.
- Runtime factory `entitiesPlugin(...)` отвечает за registration, storage runtime, manager extension и spawn hook.
- Type-only `EntitiesPlugin<AppDeps>` и runtime result `ReturnType<typeof entitiesPlugin>` могут быть разными exported/internal types, если это упрощает inference и сохраняет public shape.
- `@lite-fsm/core` не должен хардкодить `@lite-fsm/entities`, `EntitiesPlugin`, `entity`, `spawn` или `AppDeps`.
- Если core generic helpers нужно расширить, расширение должно быть generic storage mechanism, покрытый независимым type proof.
- `AppDeps` не должен попадать в runtime value, plugin options, `defineEntitySpawn(...)` или spawn descriptor.

## 5. Этапы реализации

### Этап 1 — Public type source для entities

#### Цель

Добавить exported type-only plugin source `EntitiesPlugin<AppDeps>` и убрать зависимость пользовательского wrapper от dummy `entitiesPlugin<AppDeps>()`.

#### Зависит от

- Этап 5 основного ТЗ завершен.
- `TypedCreateMachineFn` уже принимает plugin source через третий generic.
- `entitiesPlugin({ spawn })` уже выводит spawn events из descriptor value.

#### Контракт этапа

- `@lite-fsm/entities` экспортирует `type EntitiesPlugin<AppDeps = unknown, PluginEvents extends AnyEvent = never>`.
- `EntitiesPlugin<AppDeps>` подходит как третий generic параметр `TypedCreateMachineFn<AppEvents, AppDeps, EntitiesPlugin<AppDeps>>`.
- `TypedCreateMachineFn<AppEvents, AppDeps, EntitiesPlugin<AppDeps>>` принимает `storage: "entity"` machine configs.
- `TypedCreateMachineFn<AppEvents, AppDeps, EntitiesPlugin<AppDeps>>` сохраняет текущую типизацию `initialContext`, `spawnSchema`, lifecycle events, `EntityReducerContext`, `self` и `payloadFor(entity)`.
- `entitiesPlugin()` runtime overload не требует и не принимает `AppDeps`.
- `entitiesPlugin()` runtime overload возвращает plugin type, совместимый с `EntitiesPlugin<unknown, never>`.
- `entitiesPlugin({ spawn })` runtime overload возвращает plugin type, совместимый с `EntitiesPlugin<unknown, EntitySpawnPluginEvents<Spawn>>`.
- `entitiesPlugin({ spawn })` runtime overload сохраняет точный `EntitySpawnPluginEvents<Spawn>` через второй generic `PluginEvents`.
- `entitiesPlugin<AppDeps>()` и `entitiesPlugin<AppDeps>({ spawn })` должны быть TypeScript errors или отсутствовать из public type surface.
- Существующий value-based pattern `TypedCreateMachineFn<AppEvents, AppDeps, typeof plugins>` остается рабочим для реальных runtime plugin values.
- `EntityMachineExtension` может получить generic `AppDeps` заранее, даже если он начнет использоваться только на этапах 9 и 10.

#### Не делать в этом этапе

- Не добавлять `createEntityMachine(...)` или другой wrapper поверх core `createMachine`.
- Не менять runtime spawn transaction, lifecycle delivery, reducer pipeline или validation.
- Не менять `defineEntitySpawn(...)`, `defineSpawnEvents(...)`, `spawnEvent(...)` и `SpawnEventsFrom`.
- Не добавлять entity effects или reactions.
- Не добавлять entity-specific hardcode в `@lite-fsm/core`.

#### Тесты этапа

Type tests:

- `TypedCreateMachineFn<AppEvent, AppDeps, EntitiesPlugin<AppDeps>>` принимает `storage: "entity"`.
- Wrapper через `EntitiesPlugin<AppDeps>` сохраняет metadata `entityContextSchema` и `entitySpawnSchema`.
- Wrapper через `EntitiesPlugin<AppDeps>` типизирует reducer `meta.self` и `payloadFor(entity)`.
- `entitiesPlugin({ spawn })` по-прежнему расширяет `manager.transition(...)` spawn events с точным payload.
- `entitiesPlugin<AppDeps>()` является TypeScript error.
- `entitiesPlugin<AppDeps>({ spawn })` является TypeScript error.
- `typeof plugins` от runtime `entitiesPlugin()` или `entitiesPlugin({ spawn })` по-прежнему можно использовать как plugin source.

Runtime tests:

- Не требуются, если меняются только public types и exports.
- Если runtime overload implementation меняется, запустить существующий focused runtime suite `tests/entities/entities-plugin.test.ts`.

#### Критерий завершения

- Focused type tests по `tests/types/entities-api.tst.ts` проходят.
- При изменении generic storage helpers проходят `tests/types/create-machine-dependent-storage.tst.ts` и `tests/types/create-machine-entity-proof.tst.ts`.
- `pnpm --filter @lite-fsm/entities check-types` проходит.
- Runtime focused suite проходит, если менялся runtime код.

### Этап 2 — Синхронизация основного ТЗ, docs и examples

#### Цель

Привести основное entity ТЗ, package docs и cheatsheets к финальному API без dummy plugin value.

#### Зависит от

- Этап 1 завершен.

#### Контракт этапа

- `spec/tz-entities-implementation.md` описывает `EntitiesPlugin<AppDeps>` как type-only plugin source для `TypedCreateMachineFn`.
- `spec/tz-entities-implementation.md` больше не рекомендует `entitiesPlugin<AppDeps>()`.
- `spec/tz-entities-implementation.md` больше не фиксирует `entitiesPlugin<AppDeps>({ spawn })` как unsupported workaround; вместо этого объясняет, что `entitiesPlugin(...)` не несет `AppDeps`.
- `spec/tz-entities-implementation-part-2.md` обновлен тем же контрактом для будущих этапов 9 и 10.
- Future contracts `effectDeps` и `reactionDeps` ссылаются на `AppDeps` из `EntitiesPlugin<AppDeps>`, а не из runtime factory generic.
- `API-CHEATSHEET.md`, `TYPES-CHEATSHEET.md` и `packages/entities/README.md` показывают один стандартный pattern:
  - `TypedCreateMachineFn<AppEvents, AppDeps, EntitiesPlugin<AppDeps>>` для machines;
  - `entitiesPlugin({ spawn })` для runtime manager.
- В документации отсутствуют examples, где создается `const entityPlugin = entitiesPlugin<AppDeps>()` только ради typing.
- В документации отсутствуют references на `createEntityMachine(...)`.

#### Не делать в этом этапе

- Не менять behavior code.
- Не добавлять новые public API сверх `EntitiesPlugin<AppDeps>`.
- Не переписывать unrelated sections основного ТЗ.
- Не запускать docs build.

#### Тесты этапа

- `pnpm exec tstyche tests/types/entities-api.tst.ts`.
- `rg -n "entitiesPlugin<|createEntityMachine|dummy|type-only plugin value" API-CHEATSHEET.md TYPES-CHEATSHEET.md packages/entities/README.md spec/tz-entities-implementation.md spec/tz-entities-implementation-part-2.md` с разбором допустимых hits.
- `git diff --check`.

#### Критерий завершения

- Public docs и оба entity specs согласованы с `EntitiesPlugin<AppDeps>`.
- Source audit не показывает stale recommended pattern в active docs.
- Main implementation log содержит запись, что перед этапом 6 выполняется корректирующее ТЗ, либо это состояние отражено в текущем оркестраторском журнале.

### Этап 3 — Рефакторинг, чистка и полировка

#### Цель

Убрать временные типы, stale comments и дублирование после API correction.

#### Зависит от

- Этапы 1 и 2 завершены.

#### Контракт этапа

Must fix:

- временные overloads, которые сохраняют `entitiesPlugin<AppDeps>()` как рабочий public path;
- stale comments, где runtime plugin factory описан как источник `AppDeps`;
- duplicated aliases для runtime plugin result и type-only plugin source, если один владелец уже очевиден;
- неиспользуемые imports, locals и types в `packages/entities/src/**`;
- лишние helper types без второго места использования или явного снижения сложности.

Inspect only:

- декоративные переименования private types;
- перенос core generic helpers без необходимости;
- объединение runtime и type-only plugin aliases, если это ухудшает читаемость или inference;
- micro-optimizations без performance contract.

Expected remaining hits:

- исторические строки в этом корректирующем ТЗ и его журнале;
- записи журнала основного ТЗ, где описана старая проблема этапа 5;
- negative type tests, которые явно проверяют, что `entitiesPlugin<AppDeps>()` больше не поддерживается.

#### Не делать в этом этапе

- Не менять публичные имена после закрытия этапа 1 без новой причины.
- Не менять runtime semantics.
- Не расширять scope на этап 6.

#### Тесты этапа

- Focused type tests из этапа 1.
- `pnpm --filter @lite-fsm/entities check-types`.
- `git diff --check`.
- Source audit по stale patterns:
  - `entitiesPlugin<`;
  - `createEntityMachine`;
  - `dummy plugin`;
  - `type-only plugin value`;
  - `AppDeps` рядом с `entitiesPlugin`.

#### Критерий завершения

- В active source/docs нет stale recommended pattern.
- Оставшиеся audit hits перечислены как допустимые.
- Измененный код читается без transitional branches и временных aliases.

### Этап 4 — Финальная проверка корректирующего ТЗ

#### Цель

Закрыть correctness gates перед продолжением основного ТЗ с этапа 6.

#### Зависит от

- Этапы 1-3 завершены.

#### Контракт этапа

- `@lite-fsm/entities` public type API согласован с docs и specs.
- Основное ТЗ больше не требует dummy plugin value.
- `entitiesPlugin({ spawn })` остается единственным runtime spawn plugin pattern.
- `TypedCreateMachineFn` остается единственным app-level createMachine typing pattern.
- Core не содержит entity-specific hardcode.
- Forbidden docs build commands не запускались.

#### Не делать в этом этапе

- Не начинать этап 6 основного ТЗ.
- Не делать новые cleanup-правки без обнаруженного gate failure.
- Не запускать запрещенные docs build commands.

#### Тесты этапа

Минимальный gate:

- `pnpm exec tstyche tests/types/entities-api.tst.ts tests/types/create-machine-dependent-storage.tst.ts tests/types/create-machine-entity-proof.tst.ts`;
- `pnpm --filter @lite-fsm/entities check-types`;
- `pnpm run test:types`;
- `pnpm run check-types`;
- `pnpm exec vitest run tests/entities/entities-plugin.test.ts`;
- `git diff --check`.

Build gate, если менялись exported declarations или core storage types:

- `pnpm --filter @lite-fsm/core build`;
- `pnpm --filter @lite-fsm/entities build`.

Coverage gate:

- Не обязателен для type-only/docs-only correction.
- Если менялся runtime behavior code, focused coverage по `packages/entities/src/**/*.ts` должен оставаться 100%.

#### Критерий завершения

- Все применимые проверки проходят.
- Журнал этого ТЗ обновлен до `done`.
- `spec/tz-entities-implementation-log.md` указывает, что после корректирующего ТЗ можно продолжать этап 6.
- Незакрытых blockers нет.

## 6. Критерий полной готовности

- Public API содержит `type EntitiesPlugin<AppDeps = unknown, PluginEvents extends AnyEvent = never>`.
- Public API не требует `entitiesPlugin<AppDeps>()` для типизации `TypedCreateMachineFn`.
- `entitiesPlugin(...)` не принимает `AppDeps` generic как public contract.
- `TypedCreateMachineFn<AppEvents, AppDeps, EntitiesPlugin<AppDeps>>` является documented pattern для entity actor templates.
- `entitiesPlugin({ spawn })` сохраняет точный spawn event typing для `manager.transition(...)`.
- Основное ТЗ и часть 2 синхронизированы с новым API до продолжения этапа 6.
- Type tests и package type checks проходят.
- Runtime regression suite entities проходит, если runtime touched.
- Docs build не запускался.
