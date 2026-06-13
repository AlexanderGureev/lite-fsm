# @lite-fsm/entities

Alpha-пакет для entity storage в `lite-fsm`.

На текущем этапе пакет экспортирует `entitiesPlugin()`, schema descriptors,
`EntityId`, `EntityIndex`, `EntityAccess<AppMachines>` и
`EntityMachineExtension`. Плагин регистрирует storage kind `"entity"` через
публичный core plugin DSL, валидирует entity actor templates при создании
`MachineManager`, создает пустой manager-owned entity runtime state и добавляет
`manager.entities`. Он еще не создает live entity rows, spawn recipes, lifecycle
events, routing, React hooks или snapshot data.

## Установка

```bash
npm install @lite-fsm/entities
```

## Точка входа

```ts
import { entitiesPlugin, f32, optional, string } from "@lite-fsm/entities";
import type { EntityAccess, EntityId, EntityIndex, EntityMachineExtension } from "@lite-fsm/entities";
```

`EntityId` является публичной строкой. `EntityIndex` является branded number для
внутренних runtime структур и не предназначен для пользовательского input API.
`EntityMachineExtension` подключается к `TypedCreateMachineFn` только через plugin
source: `typeof entitiesPlugin()` или tuple plugins.

## Schema descriptors

```ts
const movementActor = createEntityMachine({
  storage: "entity",
  initialState: "__INIT",
  initialContext: {
    x: f32({ default: 0 }),
    y: f32(),
  },
  spawnSchema: {
    x: f32(),
    y: f32(),
    label: optional(string()),
  },
  config: {
    __INIT: { SPAWNED: "active" },
    active: { TICK: "active" },
  },
});
```

`initialContext` описывает будущие колонки actor template. `spawnSchema`
описывает будущий payload actor row при spawn. Оба поля принимают только plain
object maps известных descriptors: `f32`, `i16`, `i32`, `u8`, `string` и
`optional(inner)`.

`optional(...)` разрешен только в `spawnSchema`; ключ payload остается
обязательным, value type становится `T | null`. `opts.default` разрешен только в
`initialContext`; отсутствие default означает будущий `0` для числовых колонок и
`""` для строковой колонки. Defaults в `spawnSchema` отклоняются при
инициализации менеджера.

Зарезервированные имена колонок запрещены: `count`, `capacity`, `ids`,
`indexById`, `alive`, `generation`, `freeList`, `stateCode`, `version`,
`columns`, `presence`, `rowVersion`, `indices`, `states`.

## Plugin

```ts
import { MachineManager } from "@lite-fsm/core";
import { entitiesPlugin } from "@lite-fsm/entities";

const manager = MachineManager(machines, {
  plugins: [entitiesPlugin()],
});
```

Entity actor template получает lightweight public state slice:

```ts
manager.getState().movementActor;
// { storage: "entity", version: 0, count: 0, capacity: 0 }
```

Columns не входят в `manager.getState()`. Пустые `EntityStore` и
`ColumnarActorStore` создаются внутри runtime state и остаются source of truth
для будущих rows.

`manager.entities` доступен только при установленном `entitiesPlugin()`:

```ts
type AppMachines = typeof machines;
type Entities = EntityAccess<AppMachines>;

const movement = manager.entities.get("movementActor");

movement.count; // 0
movement.version; // 0
movement.has(entityIndex); // false для отсутствующей строки
movement.state(entityIndex); // undefined для отсутствующей строки
movement.x[entityIndex]; // number, если x описан через f32()
```

`entities.get(key)` и `entities.maybe(key)` возвращают cached live store view для
известного entity actor key. Unknown key бросает `LiteFsmError`, если TypeScript
был обойден. Store view exposes indexed readonly columns из `initialContext`,
`count`, `version`, `has(entity)` и `state(entity)`.

`entitiesPlugin()` не принимает options на текущем этапе alpha. Передача объекта
options отклоняется при инициализации, чтобы будущие spawn API не принимались до
появления их runtime контракта.

Пакет пока не предоставляет `@lite-fsm/entities/react`.
