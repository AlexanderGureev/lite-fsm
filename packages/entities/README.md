# @lite-fsm/entities

Alpha-пакет для entity storage в `lite-fsm`.

На текущем этапе пакет экспортирует `entitiesPlugin()`, schema descriptors,
spawn helpers, `EntityId`, `EntityIndex`, `EntityAccess<AppMachines>`,
`LiteFsmEntityLifecycleEvents`, `EntityMachineExtension` и reducer context
types. Плагин регистрирует storage kind `"entity"` через публичный core plugin
DSL, валидирует entity actor templates при создании `MachineManager`, создает
manager-owned entity runtime state, добавляет `manager.entities` и создает live
entity rows через public spawn events. Routing, React hooks и snapshot data еще
не предоставляются.

## Установка

```bash
npm install @lite-fsm/entities
```

## Точка входа

```ts
import {
  defineEntitySpawn,
  defineSpawnEvents,
  entitiesPlugin,
  f32,
  optional,
  spawnEvent,
  string,
} from "@lite-fsm/entities";
import type {
  EntityAccess,
  EntitiesPlugin,
  EntityId,
  EntityIndex,
  EntityMachineExtension,
  EntityReducerContext,
  EntityReducerSelf,
  LiteFsmEntityLifecycleEvents,
  SpawnEventsFrom,
} from "@lite-fsm/entities";
```

`EntityId` является публичной строкой. `EntityIndex` является branded number для
внутренних runtime структур и не предназначен для пользовательского input API.
`EntityMachineExtension` подключается к `TypedCreateMachineFn` через
`EntitiesPlugin<AppDeps>` или реальные runtime plugin values `typeof plugin` /
`typeof plugins`.

## Schema descriptors

```ts
import {
  createMachine as createLiteFsmMachine,
  type TypedCreateMachineFn,
} from "@lite-fsm/core";
import type { EntitiesPlugin } from "@lite-fsm/entities";

type AppEvent = { readonly type: "TICK" };
type AppDeps = {};

export const createMachine: TypedCreateMachineFn<
  AppEvent,
  AppDeps,
  EntitiesPlugin<AppDeps>
> = createLiteFsmMachine;

const movementActor = createMachine({
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
    __INIT: { ENTITY_SPAWNED: "active" },
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

`LiteFsmEntityLifecycleEvents` описывает internal события
`ENTITY_SPAWNED` и `ENTITY_DESPAWNED`. Они доступны только в type surface
`storage: "entity"` templates через `EntityMachineExtension`: их можно указать в
`config` и обработать в reducer entity template. Эти события не входят в
пользовательский `AppEvents`, не добавляются в public `manager.transition(...)`
и не проходят через middleware, interceptors или subscribers как public actions.
Public dispatch `ENTITY_SPAWNED` или `ENTITY_DESPAWNED` бросает `LiteFsmError`,
даже если приложение вручную добавило эти names в свой event union.

`__INIT` в entity template должен быть transition map и может содержать только
transition по `ENTITY_SPAWNED`. Custom event edge из `__INIT` отклоняется при
инициализации `MachineManager`. Для `storage: "instance"` обычный custom
`__INIT` сохраняет текущую semantics.

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

## Spawn events

```ts
const spawnEvents = defineSpawnEvents({
  SPAWN_PROJECTILE: spawnEvent<{
    id: string;
    x: number;
    y: number;
    label: string | null;
  }>(),
});

type SpawnEvents = SpawnEventsFrom<typeof spawnEvents>;

const spawn = defineEntitySpawn(machines, spawnEvents)({
  SPAWN_PROJECTILE: (payload) => ({
    id: `projectile/${payload.id}`,
    groupTag: "projectile",
    actors: {
      movementActor: {
        x: payload.x,
        y: payload.y,
        label: payload.label,
      },
    },
  }),
});

const manager = MachineManager(machines, {
  plugins: [entitiesPlugin({ spawn })],
});

manager.transition({
  type: "SPAWN_PROJECTILE",
  payload: { id: "1", x: 10, y: 20, label: null },
});
```

`spawnEvents` является источником event names, payload types и recipe keys.
`defineEntitySpawn(machines, spawnEvents)` требует recipe для каждого spawn event
и не принимает unknown keys. `entitiesPlugin()` без options остается валидным и
не добавляет public spawn events; `entitiesPlugin({ spawn })` расширяет тип
`manager.transition(...)` событиями из `spawnEvents`.

Recipe возвращает один `EntitySpawnSpec` или массив. Пустой массив означает
no-op spawn: public event delivery продолжается. `id` и `groupTag` обязательны и
должны быть непустыми строками. `actors` должен содержать хотя бы один entity
actor key из `machines`; payload каждого actor проверяется по `spawnSchema`.
`optional(...)` в `spawnSchema` означает required key со значением `T | null`;
отсутствующий ключ и `undefined` невалидны.

Spawn recipe выполняется в `hooks.beforeReduce` после middleware `next`, storage
`beforeReduce` и всех plugin `intercept` replacements. Если middleware не
вызывает `next` или финальный interceptor выставил `skipDelivery: true`, recipe
не запускается. Hook читает финальный action, валидирует результат recipe и
stage-ит операции в per-dispatch transaction slot; live runtime state меняется
только в entity storage reduce. Невалидный spec или payload прерывает dispatch до
storage reduce, subscribers и effects.

Internal `ENTITY_SPAWNED` доставляется созданным actor rows перед public spawn
event. Default transition из `__INIT` применяется до reducer. Reducer получает
`self.indices`, direct mutable schema columns, `stateCode`, `prevStateCode`,
`has(entity)`, `entityId(entity)` и `payloadFor(entity)`. `payloadFor(entity)`
возвращает actor-specific spawn payload только во время `ENTITY_SPAWNED` и
только для `EntityIndex` из текущего spawn scope.

Пакет пока не предоставляет `@lite-fsm/entities/react`.
