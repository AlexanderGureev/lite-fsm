# Prompt: типизация manager extensions для `MachineManager`

Работаем в `/Users/alexga/work/lite-fsm`.

## Постановка проблемы

В `ecs_example/store/index.ts` для `manager.entities.get("")` не выводятся ключи entity actor.

Ожидаемый тип ключей:

```ts
"enemyActor" | "enemySpriteActor"
```

Фактическое поведение: `manager.entities` получает тип `EntityAccess<MachineStore>`, из-за чего параметр `get(...)` схлопывается в `never`.

Проблема воспроизводится даже при явной передаче generic параметров:

```ts
MachineManager<AppMachines, AppEvents, AppPlugins>(machines, {
  plugins,
});
```

Все данные для корректного вывода уже есть в `MachineManager`: конкретный `AppMachines`, `AppEvents`, `AppPlugins` и значение `machines`.

Причина находится в `packages/core/src/pluginHelpers.ts`: тип `ManagerFactoryReturn` пытается извлечь результат plugin manager factory из generic function вида:

```ts
<S extends MachineStore>(ctx: ManagerRuntimeContext<AnyEvent, S>) => EntityAccess<S>
```

TypeScript не умеет применить внешний `S = AppMachines` к такой generic function внутри conditional type. Он инстанцирует generic по constraint и получает:

```ts
EntityAccess<MachineStore>
```

После этого `EntityActorKey<MachineStore>` становится `never`.

## Цель

Сделать так, чтобы `manager.entities` имел тип `EntityAccess<AppMachines>` без app-level обходов:

```ts
manager.entities.get("enemyActor");
manager.entities.get("enemySpriteActor");
```

Не должно требоваться:

```ts
const entities: EntityAccess<AppMachines> = manager.entities;
```

Также не должно требоваться менять app-код ради `as const`.

## Архитектурное решение

Не добавлять special-case для `@lite-fsm/entities` в core.

Не вводить обязательный runtime DSL вида:

```ts
manager: {
  foo: defineManagerExtension<FooExtension>((ctx) => value),
}
```

Такая форма усложняет plugin DSL и переносит type-level деталь в runtime-описание.

Нужно добавить в core общий type-only контракт для manager extension, зависящего от host manager context. Runtime-форма plugin DSL остается прежней:

```ts
definePlugin().create({
  name: "...",
  manager: {
    foo(ctx) {
      return value;
    },
  },
});
```

Зависимый тип объявляется в публичном типе plugin definition, а не через дополнительный вызов функции.

## Предлагаемые core types

Добавить type-only helpers примерно такого вида:

```ts
declare const managerExtensionTypeMarker: unique symbol;

export type ManagerExtensionTypeLambda = {
  readonly type: unknown;
};

export type ManagerExtensionType<Lambda extends ManagerExtensionTypeLambda> = {
  readonly [managerExtensionTypeMarker]?: Lambda;
};
```

Важно: базовая lambda не должна содержать `store: MachineStore`. Иначе при применении получится `MachineStore & AppMachines`, и ключи снова испортятся из-за index signature `Record<string, ...>`.

В `pluginHelpers.ts` вычислять зависимый результат примерно так:

```ts
type ApplyManagerExtensionType<
  Lambda extends ManagerExtensionTypeLambda,
  S extends MachineStore,
  Events extends AnyEvent,
> = (Lambda & {
  readonly context: ManagerRuntimeContext<Events, S>;
})["type"];
```

В `ManagerFactoryReturn` сначала проверять type-only marker:

```ts
type ManagerFactoryReturn<
  Factory,
  S extends MachineStore,
  Events extends AnyEvent,
> =
  Factory extends ManagerExtensionType<infer Lambda>
    ? ApplyManagerExtensionType<Lambda, S, Events>
    : /* текущий fallback */;
```

Вероятно, потребуется протащить `Events` через:

- `ManagerFactoryReturn<Factory, S, Events>`;
- `ManagerExtensionsForPlugin<Plugin, S, Events>`;
- `PluginManagerExtensions<Plugin, S, Events>`;
- `ManagerFromPlugins<...>` в `packages/core/src/interfaces.ts`.

`ManagerFromPlugins` должен передавать runtime event union:

```ts
PluginManagerExtensions<
  Plugins,
  S,
  ManagerTransitionEvents<AppEvents, Plugins>
>
```

## Правка в `@lite-fsm/entities`

В `packages/entities/src/plugin.ts` описать тип manager extension без runtime-оберток:

```ts
interface EntityAccessManagerExtension extends ManagerExtensionTypeLambda {
  readonly type: this extends {
    readonly context: ManagerRuntimeContext<any, infer AppMachines extends MachineStore>;
  }
    ? EntityAccess<AppMachines>
    : never;
}

type EntityManagerDefinition = {
  readonly entities: ManagerExtensionFactory &
    ManagerExtensionType<EntityAccessManagerExtension>;
};
```

Runtime implementation остается обычной функцией:

```ts
manager: {
  entities<S extends MachineStore>(ctx: ManagerRuntimeContext<AnyEvent, S>): EntityAccess<S> {
    return getEntityRuntimeState(ctx).access as EntityAccess<S>;
  },
},
```

Если `ManagerExtensionFactory`, `ManagerExtensionType` или `ManagerExtensionTypeLambda` становятся public plugin-author API, экспортировать их из `@lite-fsm/core` и обновить `API-CHEATSHEET.md` / `TYPES-CHEATSHEET.md` как справочники возможностей, не как changelog.

## Критерии приемки

- В `ecs_example/store/index.ts` `manager.entities` имеет тип `EntityAccess<AppMachines>`.
- `manager.entities.get("enemyActor")` принимается.
- `manager.entities.get("enemySpriteActor")` принимается.
- `manager.entities.get("worldMachine")` отклоняется.
- `manager.entities.get("blinkActor")` отклоняется.
- `manager.entities.get("unknownActor")` отклоняется.
- Не требуется `const entities: EntityAccess<AppMachines> = manager.entities`.
- Не требуется менять app-код ради `as const`.
- Core не импортирует и не special-case-ит `@lite-fsm/entities`.
- Runtime plugin DSL для `manager` section остается прежним.

## Тесты

Добавить или обновить type tests в `tests/types/entities-api.tst.ts`, особенно рядом с тестом `MachineManager добавляет .entities только при подключенном entitiesPlugin tuple`.

Нужен кейс с обычным массивом plugin из factory/return type, без `as const`, и/или с явным:

```ts
MachineManager<AppMachines, AppEvent, AppPlugins>(machines, {
  plugins,
});
```

Проверить, что `manager.entities.get(...)` принимает только entity actor keys.

## Ограничения

- Не запускать docs build и команды, которые его транзитивно запускают.
- Для проверки использовать focused type tests: `pnpm run test:types` или более узкий запуск Tstyche, если он доступен.
- При изменении public API или типов обновить `API-CHEATSHEET.md` и `TYPES-CHEATSHEET.md`.
