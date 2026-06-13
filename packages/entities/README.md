# @lite-fsm/entities

Alpha-пакет для entity storage в `lite-fsm`.

На текущем этапе пакет экспортирует `entitiesPlugin()`, schema descriptors,
spawn helpers, `EntityId`, `EntityIndex`, `EntityAccess<AppMachines>`,
`LiteFsmEntityLifecycleEvents`, `EntityMachineExtension` и reducer context
types. Плагин регистрирует storage kind `"entity"` через публичный core plugin
DSL, валидирует entity actor templates при создании `MachineManager`, создает
manager-owned entity runtime state, добавляет `manager.entities`, создает live
entity rows через public spawn events и выполняет lifecycle cleanup через
`despawnOn`. Плагин добавляет routing по `meta.entityId` и entity enter-state
effects, sync-only entity reactions и durable snapshot через
`snapshot.storage.entity`. React read hooks доступны отдельной точкой входа
`@lite-fsm/entities/react`.

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
  i32,
  optional,
  spawnEvent,
  string,
  u8,
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

React hooks импортируются только из subpath:

```ts
import { useEntityCount, useEntityList, useEntitySnapshot } from "@lite-fsm/entities/react";
import type {
  EntityListOptions,
  EntityRowSnapshot,
  TypedUseEntityCountHook,
  TypedUseEntityListHook,
  TypedUseEntitySnapshotHook,
} from "@lite-fsm/entities/react";
```

Main export `@lite-fsm/entities` не импортирует React runtime. Для subpath
`@lite-fsm/entities/react` нужны peer dependencies `react` и `@lite-fsm/react`;
они объявлены optional, потому что runtime entrypoint работает без React.

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
`config`, reducer и reactions entity template. Эти события не входят в
пользовательский `AppEvents`, не добавляются в public `manager.transition(...)`
и не проходят через middleware, interceptors или subscribers как public actions.
Public dispatch `ENTITY_SPAWNED` или `ENTITY_DESPAWNED` бросает `LiteFsmError`,
даже если приложение вручную добавило эти names в свой event union.

`__INIT` в entity template должен быть transition map и может содержать только
transition по `ENTITY_SPAWNED`. Custom event edge из `__INIT` отклоняется при
инициализации `MachineManager`. Для `storage: "instance"` обычный custom
`__INIT` сохраняет текущую semantics.

## Despawn

Entity actor template может объявить `despawnOn`:

```ts
const lifetimeActor = createMachine({
  storage: "entity",
  initialState: "__INIT",
  initialContext: {
    ticksLeft: i32(),
  },
  spawnSchema: {
    ticksLeft: i32(),
  },
  config: {
    __INIT: { ENTITY_SPAWNED: "active" },
    active: { TICK: "expired" },
    expired: {},
  },
  despawnOn: "expired",
});
```

`despawnOn` принимает state name или readonly array state names и доступен только
для `storage: "entity"`. Каждый state должен существовать в `config`; `__INIT`,
`__RESOLVED`, `__REJECTED` и `__CANCELLED` запрещены. После default transition и
reducer row в state из `despawnOn` синхронно планирует despawn всей entity в том
же dispatch. Если несколько rows одной entity планируют despawn, runtime
дедуплицирует entity.

Перед физическим cleanup runtime создает scoped delivery internal события
`ENTITY_DESPAWNED` для attached actor rows. Reducer вызывается только у rows, чей
текущий state принимает `ENTITY_DESPAWNED`; rows без edge удаляются без lifecycle
reducer call. Subscribers видят состояние после удаления rows. Переход row в
`__RESOLVED`, `__REJECTED` или `__CANCELLED` удаляет эту row, но не despawn-ит
entity автоматически, если у нее остаются другие actor rows.

После despawn `EntitySpawnSpec.id` можно использовать повторно. Runtime
переиспользует свободный slot, увеличивает `generation` и не сохраняет прежние
actor rows, columns или `rowVersion`. Public `manager.despawn(...)` не
предоставляется; внешний despawn выражается обычным event и actor behavior через
`meta.entityId` или `meta.groupTag`.

## Effects

Entity actor template может объявлять effects по public target state:

```ts
const aiActor = createMachine({
  storage: "entity",
  initialState: "__INIT",
  initialContext: {
    alert: u8(),
  },
  spawnSchema: {},
  config: {
    __INIT: { ENTITY_SPAWNED: "idle" },
    idle: { WAKE: "active" },
    active: {},
  },
  effects: {
    active: ({ self, entities, transition }) => {
      const movement = entities.maybe("movementActor");

      for (const entity of self.indices) {
        if (!self.has(entity) || !movement.has(entity)) continue;
        transition.entity(self.entityId(entity), { type: "SYNC_POSITION" });
      }
    },
  },
});
```

Effect запускается один раз на captured batch rows, которые после reducer вошли
в target state. Если row приняла event, но осталась в прежнем state, reducer
вернул `self.stateCode[entity]` к `self.prevStateCode[entity]` или row была
удалена через `despawnOn` до effect phase, effect не запускается. Effects
выполняются core-managed phase после subscribers и после возврата middleware
`next`.

`self.indices` является stable captured списком. `self`, columns и
`entities.get(...)`/`entities.maybe(...)` являются live read views текущего
committed store. В async effect после `await` проверяйте `self.has(entity)` или
`store.has(entity)` перед чтением columns: метод учитывает текущую presence и
captured `generation`. В dev diagnostics `entities.get(key)` проверяет, что
каждая entity из captured scope имеет requested actor row; `entities.maybe(key)`
не выполняет required-access validation.

В entity effects доступны обычный `transition(action)`, core helpers
`transition.tag(...)` и `transition.actor(...)`, а также entity helpers:

- `transition.entity(entityId | readonly entityId[], action)` доставляет action
  rows указанных live entities, дедуплицируя ids с сохранением первого появления;
- `transition.despawn(entityId | readonly entityId[])` удаляет live entities,
  unknown или уже удаленные ids являются no-op;
- `transition.despawn(self.indices)` удаляет rows из captured scope с проверкой
  generation; raw `EntityIndex[]`, не равный `self.indices`, отклоняется runtime.

`transition.tag(...)` сохраняет core semantics `meta.groupTag`: action получает
и entity rows с matching `EntitySpawnSpec.groupTag`, и обычные
`storage: "instance"` actors с тем же `groupTag`. `transition.actor(...)`
адресует только `storage: "instance"` actors. Wildcard `"*"` effects,
`condition()` как ожидание action и per-row `bag` не входят в entity MVP;
runtime `condition()` в entity effect бросает `LiteFsmError`.

## Reactions

Entity actor template может объявлять sync-only reactions по event names:

```ts
const spriteActor = createMachine({
  storage: "entity",
  initialState: "__INIT",
  initialContext: {
    spriteId: string(),
  },
  spawnSchema: {},
  config: {
    __INIT: { ENTITY_SPAWNED: "visible" },
    visible: { POSITION_CHANGED: "visible", ENTITY_DESPAWNED: "removed" },
    removed: {},
  },
  reactions: {
    POSITION_CHANGED: ({ self, entities, renderer }) => {
      const movement = entities.get("movementActor");

      for (const entity of self.indices) {
        renderer.sync(self.spriteId[entity], movement.x[entity], movement.y[entity]);
      }
    },
    ENTITY_DESPAWNED: ({ self, renderer }) => {
      for (const entity of self.indices) {
        renderer.remove(self.spriteId[entity]);
      }
    },
  },
});
```

Reaction привязана к accepted event, а не к target state. Runtime вызывает одну
reaction на actor template для batch rows, которые приняли event по `config` и
routing. Reaction запускается даже если reducer оставил columns и state без
изменений.

Обычные reactions выполняются storage `reactions.run(...)` после reducer,
`despawnOn`, lifecycle cleanup и commit, но до subscribers и effects. Rows,
удаленные через `despawnOn`, не попадают в reaction исходного event.
`ENTITY_DESPAWNED` reaction выполняется внутри entity lifecycle до физического
cleanup и видит columns удаляемых rows. Rows без edge `ENTITY_DESPAWNED` не
получают lifecycle reaction и удаляются cleanup phase.

Deps reaction включают `action`, readonly `self`, scoped `entities` и user deps
из `manager.setDependencies(...)`. Runtime не предоставляет `transition` и не
поддерживает dispatch/despawn из reaction. `entities.get(key)` выполняет ту же
required-access validation по captured scope и `generation`, что entity effects;
`entities.maybe(key)` возвращает optional live view.

Reaction должна выполняться синхронно. Exception и обнаруженный `Promise` return
передаются в `onError` через storage `reportError(...)`; reducer result,
cleanup, subscribers, effects и return value `manager.transition(...)` не
откатываются и не отменяются. Eventual rejection возвращенного Promise не входит
в contract entity reactions.

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

## Snapshot и hydrate

Entity storage участвует в `MachineManager.dehydrate()` через top-level
`snapshot.storage.entity`:

```ts
const snapshot = manager.dehydrate();

snapshot.machines.movementActor;
// { storage: "entity", version, count, capacity }

snapshot.storage?.entity; // durable entity storage payload
```

`machines[entityActorKey]` содержит только lightweight public slice. Durable
данные rows, columns, `EntityStore`, `generation`, `freeList`, actor presence,
states и `rowVersion` хранятся только в `storage.entity`. Typed arrays
сериализуются как plain JSON arrays.

Фильтры `machines` и `storage` независимы:

- `dehydrate()` выгружает eligible machines и `storage.entity`;
- `dehydrate({ machines })` фильтрует только `machines` и не отключает
  `storage.entity`;
- `dehydrate({ storage: ["entity"] })` фильтрует только storage и не отключает
  machines;
- `dehydrate({ storage: [] })` явно отключает storage payloads;
- `dehydrate({ machines: [], storage: ["entity"] })` выгружает только entity
  storage.

`hydrate(snapshot)` с `storage.entity` выполняет replace-only restore entity
runtime state независимо от `strategy`. Перед мутацией runtime валидируются
schema compatibility, длины `ids`, `alive`, `generation`, `groupTagByIndex`,
`freeList`, actor `presence`, `stateCode`, `rowVersion`, column payload types,
duplicate live ids и согласованность live rows. Ошибка hydrate не меняет текущие
rows, columns или sidecars.

Hydrate без `storage.entity` не меняет entity rows, columns, ids или
`generation`, даже если snapshot содержит `machines[entityActorKey]` с
поддельным lightweight slice. Runtime восстанавливает canonical public slice из
текущего entity storage. `getHydratedState(...)` валидирует `storage.entity` и
возвращает preview lightweight slices без мутации columns. `getSnapshot()` не
вызывает storage dehydrate и не включает top-level `storage`.

Legacy payload без `generation` восстанавливает `generation` как `0` и
пересобирает `freeList` по `alive`. Legacy actor payload без `rowVersion`
получает свежие versions при hydrate; runtime не доверяет удаленным
`rowVersion` для корректности будущих row caches.

## React hooks

`@lite-fsm/entities/react` использует существующий manager context из
`@lite-fsm/react`; отдельный provider не нужен:

```tsx
import { useEntityCount, useEntityList, useEntitySnapshot } from "@lite-fsm/entities/react";

function SelectedEntity({ entityId }: { readonly entityId: EntityId | null }) {
  const row = useEntitySnapshot("movementActor", entityId);
  const enemies = useEntityList("movementActor", { groupTag: "enemy" });
  const enemyCount = useEntityCount("movementActor", { groupTag: "enemy" });

  return (
    <output>
      {row?.state ?? "none"}:{row?.context.x ?? 0}:{enemyCount}:{enemies.join(",")}
    </output>
  );
}
```

`useEntitySnapshot(templateKey, entityId)` читает одну actor row и возвращает
`{ entityId, groupTag, state, context } | undefined`. `entityId: null |
undefined` возвращает стабильный `undefined` и не требует условного вызова
hook. Missing row также возвращает `undefined`. `context` является plain object,
собранным из `initialContext` schema values; raw columns и `EntityIndex` не
экспортируются через React hook.

`useEntityCount(templateKey, options?)` считает present rows выбранного actor
template. `useEntityList(templateKey, options?)` возвращает `readonly
EntityId[]`. `options.groupTag?: string` фильтрует по точному
`EntitySpawnSpec.groupTag`. Порядок списка определяется runtime и не
сортируется. Если membership и порядок не изменились, list hook сохраняет ту же
ссылку.

Hooks подписываются через `manager.onTransition` и возвращают прежний snapshot,
если соответствующая row/list/count не изменилась. Обновление одной row не
создает новый snapshot для другой row. Despawn и повторный spawn того же
`entityId` инвалидируют старую row даже при reuse внутреннего `EntityIndex`.

Во время `FSMHydrationBoundary` hooks читают active `snapshot.storage.entity`
preview через `useStorageHydrationPreview("entity")` из `@lite-fsm/react` без
мутации committed runtime. Если child boundary не содержит `storage.entity`, он
наследует parent entity preview; если содержит, заменяет его. Preview
валидируется теми же правилами, что hydrate `storage.entity`.

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
`self.indices`, `self.states`, `self.presence`, `self.rowVersion`, direct
mutable schema columns, `stateCode`, `prevStateCode`, `has(entity)`,
`entityId(entity)` и `payloadFor(entity)`. `payloadFor(entity)` возвращает
actor-specific spawn payload только во время `ENTITY_SPAWNED` и только для
`EntityIndex` из текущего spawn scope.

## Routing

`entitiesPlugin()` объявляет `routeMeta.entityId`, а entity storage runtime
требует `routeMetaKeys: ["entityId"]`. Поэтому `manager.transition(...)`
принимает `meta.entityId?: string | readonly string[]` только при подключенном
плагине:

```ts
manager.transition({ type: "TICK", meta: { entityId: "projectile/1" } });
manager.transition({
  type: "TICK",
  meta: { entityId: ["projectile/2", "projectile/1"] },
});
```

`meta.entityId` доставляет action всем actor rows указанных entities. Массив
дедуплицируется с сохранением первого появления. Unknown `entityId` является
no-op. Если TypeScript был обойден, resolver бросает `LiteFsmError`, когда raw
value не является строкой или массивом строк.

`meta.groupTag` сохраняет core semantics для `storage: "instance"` и
дополнительно доставляет action entity rows, у которых `EntitySpawnSpec.groupTag`
совпадает с route target. `meta.actorId` и `meta.groupId` адресуют только
`storage: "instance"` actor runtime. Один action может содержать только один
active routing key; например, `meta.entityId` вместе с `meta.groupTag` бросает
`LITE_FSM_AMBIGUOUS_ROUTE_META` до delivery.

`@lite-fsm/entities/react` не добавляет mutation API, arbitrary filters,
sorting, multi-tag filtering, raw column arrays или public `EntityIndex` input.
