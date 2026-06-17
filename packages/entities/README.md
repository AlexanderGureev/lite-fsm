# @lite-fsm/entities

Alpha-плагин для `lite-fsm`, который добавляет колоночное (SoA) хранилище сущностей поверх обычных машин. Одна машина описывает шаблон сущности, а её состояние и контекст хранятся в типизированных массивах для тысяч строк сразу. Подход близок к ECS: данные лежат в колонках, переходы выполняются батчами по всем живым строкам.

> Статус: alpha. Публичный API и формат снимков могут меняться. Текущие замеры производительности см. в [`PERFORMANCE.md`](./PERFORMANCE.md).

## Возможности

- Колоночное хранилище: каждое поле контекста — отдельный `TypedArray` (`f32`/`i16`/`i32`/`u8`) или массив строк.
- Машина-шаблон с `storage: "entity"`: один `config`/`reducer` обслуживает все строки сразу.
- Декларативный спавн: события спавна и рецепты, которые создают одну или несколько сущностей из одного payload.
- Управляемый жизненный цикл: внутренние события `ENTITY_SPAWNED`/`ENTITY_DESPAWNED` и авто-удаление по `despawnOn`.
- Runtime resources через `resource(...)`: общий объект шаблона на один manager instance для spatial grid, flow field, physics world, pathfinding cache и scratch buffers.
- `effects` для диспатча новых событий и `reactions` для синхронизации с внешним миром (рендер, звук) без диспатча.
- Маршрутизация по `entityId`, `groupId`, `groupTag` через `meta`.
- Типобезопасный доступ к колонкам через `manager.entities()` и React-хуки.

## Установка

```bash
pnpm add @lite-fsm/core @lite-fsm/entities
# React-хуки (опционально)
pnpm add @lite-fsm/react react
```

## Быстрый старт

```ts
import {
  createMachine as createLiteFsmMachine,
  MachineManager,
  type MachinesState,
  type TypedCreateMachineFn,
} from "@lite-fsm/core";
import {
  defineEntitySpawn,
  defineSpawnEvents,
  entitiesPlugin,
  f32,
  spawnEvent,
  type EntitiesPlugin,
  type EntityAccess,
  type EntityIndex,
} from "@lite-fsm/entities";

type AppEvent = { readonly type: "TICK" };
type Deps = { readonly entities: () => EntityAccess<AppMachines> };

// Типизированный createMachine, который знает про storage: "entity".
const createMachine: TypedCreateMachineFn<AppEvent, Deps, EntitiesPlugin<Deps>> = createLiteFsmMachine;

const movement = createMachine({
  storage: "entity",
  initialState: "__INIT",
  // Колонки строки: значение по умолчанию задаёт тип столбца.
  initialContext: { x: f32({ default: 0 }), dx: f32({ default: 0 }) },
  // Поля, которые приходят при спавне (без default).
  spawnSchema: { x: f32(), dx: f32() },
  config: {
    __INIT: { ENTITY_SPAWNED: "active" },
    active: { TICK: "active", ENTITY_DESPAWNED: "removed" },
    removed: {},
  },
  reducer(_state, action, { self, payloadFor }) {
    for (const entity of self.indices) {
      if (action.type === "ENTITY_SPAWNED") {
        const payload = payloadFor(entity);
        self.x[entity] = payload.x;
        self.dx[entity] = payload.dx;
        continue;
      }
      if (action.type === "TICK") self.x[entity] += self.dx[entity];
    }
  },
});

const machines = { movement };
type AppMachines = typeof machines;
type AppState = MachinesState<AppMachines>;

// События спавна и их payload.
const spawnEvents = defineSpawnEvents({
  SPAWN_UNIT: spawnEvent<{ id: string; x: number; dx: number }>(),
});

// Рецепт превращает payload события в одну или несколько сущностей.
const spawn = defineEntitySpawn(
  machines,
  spawnEvents,
)({
  SPAWN_UNIT: (p) => ({
    id: `unit/${p.id}`,
    groupTag: "unit",
    actors: { movement: { x: p.x, dx: p.dx } },
  }),
});

const manager = MachineManager(machines, {
  plugins: [entitiesPlugin({ spawn })],
});
manager.setDependencies({ entities: manager.entities });

manager.transition({ type: "SPAWN_UNIT", payload: { id: "a", x: 0, dx: 2 } });
manager.transition({ type: "TICK" });

const view = manager.entities().get("movement");
view.count; // 1
const entity = 0 as EntityIndex;
if (view.has(entity)) {
  view.x[entity]; // 2 — колонки индексируются по EntityIndex
  view.state(entity); // "active"
}
```

## Модель данных: схемы, колонки и resources

Авторитативные данные строки хранятся в колонках. Поле колонки описывается дескриптором, который задаёт тип столбца и значение по умолчанию.

| Дескриптор    | Колонка        | Значение                                 |
| ------------- | -------------- | ---------------------------------------- |
| `f32()`       | `Float32Array` | `number`                                 |
| `i32()`       | `Int32Array`   | `number`                                 |
| `i16()`       | `Int16Array`   | `number`                                 |
| `u8()`        | `Uint8Array`   | `number`                                 |
| `string()`    | `string[]`     | `string`                                 |
| `optional(d)` | —              | `value \| null` (только в `spawnSchema`) |

Две схемы решают разные задачи:

- `initialContext` — постоянные колонки строки и template-level runtime resources. Дескрипторы колонок требуют `default`, `optional(...)` запрещён.
- `spawnSchema` — данные, приходящие при спавне. `default` запрещён, `optional(...)` разрешён (значение может быть `null`), `resource(...)` запрещён.

Часть имён зарезервирована рантаймом (`count`, `capacity`, `ids`, `version`, `presence`, `stateCode` и др.) и не может использоваться как имя колонки или resource.

### Runtime resources

`resource(...)` объявляет template-level shared runtime field. Значение создаётся один раз при создании actor store внутри конкретного `MachineManager` instance и принадлежит шаблону, а не строке. Если передан `expose`, exposed view тоже создаётся один раз; owner object и exposed view сохраняют identity на время жизни менеджера. Resource не требует единственной активной строки, доступен как runtime ресурс шаблона и не индексируется по `EntityIndex`.

```ts
type SpatialGrid = {
  clear(): void;
  insert(entity: EntityIndex, x: number, y: number): void;
  queryRadius(x: number, y: number, radius: number): readonly EntityIndex[];
};

type SpatialGridView = {
  queryRadius(x: number, y: number, radius: number): readonly EntityIndex[];
};

declare function createSpatialGrid(): SpatialGrid;

const movement = createMachine({
  storage: "entity",
  initialState: "__INIT",
  initialContext: {
    x: f32({ default: 0 }),
    y: f32({ default: 0 }),
    unitGrid: resource(
      createSpatialGrid,
      (grid): SpatialGridView => ({
        queryRadius: grid.queryRadius.bind(grid),
      }),
    ),
    scratch: resource(() => new Int32Array(256)),
  },
  spawnSchema: {
    x: f32(),
    y: f32(),
  },
  config: {
    __INIT: { ENTITY_SPAWNED: "active" },
    active: { TICK: "active" },
  },
  reducer(_state, action, { self }) {
    if (action.type !== "TICK") return;

    self.unitGrid.clear();
    self.scratch.fill(-1);

    for (const entity of self.indices) {
      self.unitGrid.insert(entity, self.x[entity], self.y[entity]);
    }
  },
});
```

Правила доступа:

- `resource(factory)` создаёт private owner-only resource. Он доступен владельцу как `self.<resource>` в reducer, effect и reaction этого же шаблона, но отсутствует в `EntityAccess`.
- `resource(factory, expose)` создаёт owner resource и публикует значение, возвращённое `expose`, в `entities().get(key)`. Consumer видит ровно exposed view, а не owner object.
- Owner `self` получает mutable owner object. Например, `self.unitGrid.clear()` и `self.scratch.fill(...)` разрешены; `self.unitGrid` не является колонкой и не читается по индексу строки.
- Exposed view доступен через `manager.entities()` и `entities()` даже при `0` active rows у шаблона. Без `expose` поле не публикуется.
- `expose` отвечает за форму и безопасность consumer surface. Runtime не анализирует mutating methods и не создаёт proxy, freeze или deep-freeze для owner object или exposed view.

Resource не является источником авторитативного состояния домена. Не используйте resource для `hp`, `command`, `selected`, `ownership` и других авторитативных фактов домена; колонки и spawn payload остаются источником данных строки. Resource подходит для детерминированных cache и рабочих структур, которые owner reducer пересобирает из колонок в порядке шаблонов: spatial grid, flow field, physics world, pathfinding cache, scratch buffers.

Для большого числа временных объектов, например снарядов, предпочтителен system actor с SoA-пулом внутри `resource(...)`, если каждый объект живет недолго и не требует отдельного entity lifecycle. Такой owner reducer обновляет пул батчем, переиспользует typed buffers, выполняет bounded spatial query для попаданий или AoE, удаляет элементы через swap и публикует только узкий read view или handoff buffer. Авторитативный эффект попадания все равно должен применяться владельцем доменной колонки, например `health` читает damage buffer и меняет `hp`.

Resource не входит в public state: `dehydrate()`, `hydrate()` payload, persistence, `MachinesState`, `manager.getSnapshot()`, selectors, `useEntitySnapshot` и `useEntityList` содержат только строки, состояния и колонки. `hydrate()` существующего manager не заменяет resource values и exposed views.

Rollback для resource в v1 не реализован. Staged spawn rollback откатывает строки, колонки и индексы, но не восстанавливает мутации resource. Owner reducer должен сначала валидировать и читать входные данные, затем мутировать или пересобирать resource и не бросать ошибку после начала мутации. Для RTS-сценариев rebuild выполняется штатным событием, например `TICK`, без отдельного механизма восстановления resource.

## Жизненный цикл сущности

Машина-шаблон стартует из служебного состояния `__INIT`. Единственный разрешённый переход из него — по внутреннему событию `ENTITY_SPAWNED`.

- `ENTITY_SPAWNED` — рантайм диспатчит автоматически при создании строки. В этот момент доступен `payloadFor(entity)`.
- `ENTITY_DESPAWNED` — локальный hook для строк актёра, которые удаляются в текущем `transition`. Reducer и `reactions.ENTITY_DESPAWNED` видят колонки до физического удаления строки.
- `despawnOn: "state"` (или массив состояний) — как только строка переходит в указанное состояние, рантайм автоматически удаляет её.

Прямой публичный диспатч `ENTITY_SPAWNED`/`ENTITY_DESPAWNED` запрещён. Сущности создаются только через события спавна, а удаляются через `despawnOn` или `transition.despawn(...)` в эффекте.

Финальную синхронизацию с внешними системами выполняйте в `reactions.ENTITY_DESPAWNED`. `effects`, связанные с целевым состоянием перехода по `ENTITY_DESPAWNED`, не являются контрактом cleanup.

## Reducer

`storage: "entity"` reducer является entity system reducer: он выполняется один раз для батча затронутых строк, читает root entity runtime через `entities()` и мутирует только `self` текущей машины. Первый аргумент (`state`) не используется в entity-машинах.

`self` даёт доступ к колонкам, owner resources и метаданным строк текущего батча:

- `self.indices` — индексы (`EntityIndex`) строк текущего reducer batch.
- `self.<column>[entity]` — чтение и запись значения колонки текущей машины.
- `self.<resource>` — mutable owner resource текущего шаблона; значение общее для всех строк и не индексируется по `EntityIndex`.
- `self.states.<STATE>` — числовой код состояния; запись `self.stateCode[entity] = self.states.expired` планирует переход строки.
- `self.has(entity)`, `self.entityId(entity)` — проверка наличия и строковый id строки.
- `payloadFor(entity)` — данные спавна для строки (валидно на `ENTITY_SPAWNED`).
- `entities()` — live read view всего entity runtime, доступный на `ENTITY_SPAWNED`, public events и routed events.

`entities()` в reducer — live view, а не snapshot на начало события. Reducer видит записи entity reducers, которые уже выполнились раньше в текущем `transition`, и не видит будущие записи reducers, которые стоят позже. Порядок entity machines в объекте `machines` является simulation contract для одного event.

`self.indices` ограничивает строки текущего батча, а `entities()` читает все entity stores без scoped validation по этому батчу. Перед чтением optional row другого store проверяйте `view.has(entity)`. Представления, полученные через `entities().get(...)`, типизированы только для чтения: писать можно только в `self`. Runtime не добавляет proxy или freeze для защиты от обхода типов через `as any`.

```ts
reducer(_state, action, { self, entities, payloadFor }) {
  if (action.type === "ENTITY_SPAWNED") {
    for (const entity of self.indices) {
      const payload = payloadFor(entity);
      self.x[entity] = payload.x;
      self.y[entity] = payload.y;
      self.vx[entity] = payload.vx;
      self.vy[entity] = payload.vy;
    }
    return;
  }

  if (action.type !== "TICK") return;

  const health = entities().get("health");

  for (const entity of self.indices) {
    if (!health.has(entity) || health.hp[entity] <= 0) continue;
    self.x[entity] += self.vx[entity];
    self.y[entity] += self.vy[entity];
  }
}
```

Reducer должен быть синхронным и детерминированным: в контекст не передаются deps или `transition`, нельзя возвращать Promise, запускать async work, IO или внешние side effects. `self`, `entities()` и store views действуют только во время текущего вызова reducer; не сохраняйте их для последующего использования.

Для hot-path entity state не используйте цепочку `reaction -> orchestrator -> scratch -> flush events`. Переносите расчёт в entity system reducer, оставляя `reactions` для внешней синхронизации, а `effects` — для редких событий, удаления сущностей и async/IO.

## Effects

`effects` объявляются по имени состояния и выполняются при входе строк в это состояние. Эффект может диспатчить новые события и удалять сущности. В аргументах: прикладные зависимости плюс `action`, `self`, `entities()` и `transition`.

`transition` — это функция и набор адресных методов:

- `transition(action)` — обычный диспатч.
- `transition.entity(id, action)` — только указанным сущностям.
- `transition.actor(actorId, action)` / `transition.group(...)` / `transition.tag(groupTag, action)` — по адресу.
- `transition.unscoped(action)` — без маршрутизации.
- `transition.despawn(ids | self.indices)` — удалить сущности.

```ts
effects: {
  EXPIRED: ({ self, transition }) => {
    transition.despawn(self.indices);
  },
}
```

## Reactions

`reactions` объявляются по типу события и выполняются после коммита транзакции. Они предназначены для синхронного обновления внешних систем и не могут диспатчить события. В аргументах: прикладные зависимости плюс `action` и `self`. Кросс-машинные колонки читаются через `entities()` (если он передан в зависимости).

```ts
reactions: {
  TICK: ({ self, entities, sprites }) => {
    const move = entities().get("movement");
    for (const entity of self.indices) {
      sprites.sync(self.spriteId[entity], { x: move.x[entity] });
    }
  },
}
```

`self.indices` в reaction — настоящий `readonly EntityIndex[]` для текущего синхронного вызова. `self`, `self.indices`, `deps` и представления из `entities()` нельзя мутировать и нельзя сохранять для использования после завершения reaction.

`effects` меняют состояние (диспатчат), `reactions` только читают и вызывают побочные эффекты.

## Спавн сущностей

Спавн описывается в три шага и подключается через `entitiesPlugin({ spawn })`:

```ts
// 1. События спавна и их payload.
const spawnEvents = defineSpawnEvents({
  SPAWN_UNIT: spawnEvent<{ id: string; x: number }>(),
});

// 2. Рецепты: payload -> одна сущность или массив сущностей.
const spawn = defineEntitySpawn(
  machines,
  spawnEvents,
)({
  SPAWN_UNIT: (p) => ({
    id: `unit/${p.id}`, // уникальный id сущности
    groupTag: "unit", // тег для группового адреса и фильтрации
    actors: {
      // какие машины-шаблоны получают строку
      movement: { x: p.x, dx: 0 },
    },
  }),
});
```

Одна сущность может состоять из нескольких актёров (`movement`, `sprite`, ...), которые делят общий `id` и `groupTag`. Поля каждого актёра проверяются по его `spawnSchema`.

## Чтение состояния

`manager.entities()` возвращает корневой доступ ко всем entity stores:

- `entities().get(key)` — представление шаблона: `count`, `version`, `has(entity)`, `state(entity)` и колонки только для чтения. Строки индексируются по `EntityIndex` (`view.x[entity]`).
- `entities().maybe(key)` — на root access возвращает такой же read-only view; отличие от `get` по scoped validation относится к effects/reactions.

Значение колонки является публичным состоянием только для живой строки: сначала проверяйте `view.has(entity) === true`. После `has(entity) === false` значения `view.<column>[entity]` могут оставаться устаревшими до повторного использования слота и не являются частью публичного контракта. `dehydrate()` не публикует runtime values удалённых слотов: в JSON для них записываются defaults из `initialContext`.

`version` у entity store и actor store — монотонный invalidation token. Он меняется при видимом изменении хранилища, но точная величина инкремента не является счетчиком строк, событий или мутаций.

В reducer поле `entities()` предоставляет тот же root access object через storage runtime и не выполняет scoped validation. Для строгих ключей и колонок в reducer объявите `AppDeps.entities: () => EntityAccess<AppMachines>` в типе, который передаётся в `EntitiesPlugin<AppDeps>`; runtime reducer не читает это поле из deps. В effects и reactions runtime создает scoped access: там `get` проверяет текущий scope в dev, а `maybe` возвращает view без этой проверки. Для effects и reactions передавайте `manager.entities` через `manager.setDependencies(...)`.

## React

Хуки доступны из `@lite-fsm/entities/react` и подписываются на менеджер через `@lite-fsm/react`. Корректно работают с SSR и hydration preview.

```tsx
import { useEntityList, useEntitySnapshot } from "@lite-fsm/entities/react";

function Units() {
  const ids = useEntityList<AppMachines>("movement", { groupTag: "unit" });
  return (
    <ul>
      {ids.map((id) => (
        <Unit key={id} id={id} />
      ))}
    </ul>
  );
}

function Unit({ id }: { id: string }) {
  const row = useEntitySnapshot<AppMachines>("movement", id);
  if (!row) return null;
  // row: { entityId, groupTag, state, context: { x, dx } }
  return <div>{row.context.x}</div>;
}
```

| Хук                             | Возвращает                                               |
| ------------------------------- | -------------------------------------------------------- |
| `useEntitySnapshot(key, id)`    | `{ entityId, groupTag, state, context }` или `undefined` |
| `useEntityCount(key, options?)` | число живых строк                                        |
| `useEntityList(key, options?)`  | список `id` живых строк                                  |

`options.groupTag` фильтрует строки по тегу группы.

## Маршрутизация

Плагин регистрирует ключ маршрутизации `entityId`. События можно адресовать конкретным целям через `meta` или адресные методы `transition`:

- `entityId` — конкретные сущности;
- `groupId` — все актёры одной сущности;
- `groupTag` — все сущности с заданным тегом.

В одном событии может быть только один активный ключ маршрутизации.

## Ограничения

- Alpha: API и формат снимков нестабильны.
- `condition()` в entity-эффектах не поддерживается.
- Производительность пока не проходит целевые бюджеты относительно ручного SoA ECS (см. [`PERFORMANCE.md`](./PERFORMANCE.md)).

## Экспорты

- Корень: `entitiesPlugin`, `defineEntitySpawn`, `defineSpawnEvents`, `spawnEvent`, дескрипторы `f32`/`i16`/`i32`/`u8`/`string`/`optional`/`resource`, типы `EntitiesPlugin`, `EntityAccess`, `EntityId`, `EntityIndex` и др.
- `@lite-fsm/entities/react`: `useEntitySnapshot`, `useEntityCount`, `useEntityList`.
