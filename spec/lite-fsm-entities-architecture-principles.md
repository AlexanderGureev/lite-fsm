# lite-fsm + entities — архитектурные принципы

Короткий справочник по проектированию приложений на `lite-fsm` и `@lite-fsm/entities`.

## 1. Модель

`lite-fsm` — центр бизнес-логики приложения. UI отправляет доменные события и читает selectors. Машины, reducers, effects, reactions и entity actors владеют поведением.

`@lite-fsm/entities` добавляет ECS-подобный слой:

- entity template описывает компонент или систему;
- данные строк хранятся в колонках (`f32`, `i32`, `u8`, `string`);
- один reducer обрабатывает batch строк;
- порядок templates в `machines` может быть simulation contract.

Игровые данные, runtime cache и mutable scratch не должны жить в module-level глобальных переменных. Если данные влияют на поведение игры, у них должен быть владелец внутри store: обычная machine, actor template, `storage: "entity"` template или `resource(...)`.

## 2. Владельцы

Каждая машина должна иметь одного владельца ответственности.

Примеры:

- `unitHealth` владеет `hp`, `maxHp`, состояниями `ALIVE`/`DEAD` и death lifecycle;
- `unitCombat` владеет cooldown, attack stats и handoff-уроном;
- `unitCommand` владеет приказом player unit и completion/arrival;
- `enemyAi` владеет intent enemy unit;
- `unitMovement` владеет `x/y/vx/vy`;
- `rtsSpatialIndex` владеет spatial/flow runtime resources.

Reducer мутирует только `self`. Чужие stores читаются через `entities()`. Технический владелец cache, например `rtsSpatialIndex`, не должен принимать gameplay-решения.

## 3. Композиция

Проектируйте игру через композицию actor templates, а не через монолитные типы `enemy`, `player`, `hero`.

```text
hero:
  unitIdentity + unitMovement + unitHealth + unitCombat + unitCommand + unitSelection

enemy:
  unitIdentity + unitMovement + unitHealth + unitCombat + enemyAi
```

Actor реализует абстрактную механику для rows, которые подходят под его контракт:

- `unitMovement` двигает rows с movement data;
- `unitHealth` применяет hp/death lifecycle;
- `unitCombat` считает атаки для combat-capable rows;
- `unitCommand` описывает player-controlled command rows;
- `enemyAi` описывает enemy-controlled intent rows.

В `lite-fsm/entities` actor хранит данные и reducer-логику, поэтому композиция менее гибкая, чем в классическом ECS с data-only components. Но принцип остается тем же:

- не дублируйте movement/combat/health в отдельных `playerUnit` и `enemyUnit`;
- добавляйте новую способность как новый actor или расширение существующего владельца;
- optional behavior выражайте наличием или отсутствием actor row;
- generic system работает по контракту данных, а не по имени сущности.

## 4. Тип автомата

Любая игровая сущность может быть представлена обычной machine, actor template или `storage: "entity"` template.

Используйте обычную machine или actor, если сущность:

- не обновляется каждый `TICK`;
- имеет небольшой lifecycle;
- хранит объектный context;
- выполняет process, UI state, session state, modal state, настройки, spawn orchestration или редкие effects;
- не требует batch update тысяч строк.

Используйте `storage: "entity"`, если сущность или механика:

- обновляется каждый `TICK`;
- существует в большом количестве rows;
- хранит hot-path данные в typed columns;
- batch-обрабатывает rows без per-entity events;
- участвует в ordered ECS simulation.

Используйте `resource(...)`, если данные:

- нужны как cache/scratch для hot-path reducer;
- не являются авторитативным public state;
- не должны попадать в snapshot, selectors или persistence;
- принадлежат конкретному template owner.

## 5. События

Событие — контракт приложения, а не способ вызвать чужой reducer.

Подходящие события:

- пользовательские намерения: `ISSUE_MOVE`, `SELECT_RECT`;
- lifecycle: `GAME_START`, `GAME_RESTART`, `UNIT_DIED`, `HERO_DEAD`;
- process completion: `UNIT_COMMAND_RESOLVED`, `UNIT_SELECTION_RESOLVED`.

Не используйте события для hot-path синхронизации, если данные могут быть обновлены ordered reducers за один `TICK`.

Плохой признак:

```text
TICK -> global orchestrator -> batch scratch -> flush events
```

Предпочтительно:

```text
TICK -> ordered entity reducers -> committed state
```

## 6. Reducers

Entity reducer — основной слой синхронной hot-path логики.

Правила:

- reducer синхронный и детерминированный;
- reducer не получает deps внешнего мира;
- reducer не вызывает `transition`;
- reducer не выполняет IO, renderer sync, timers или async work;
- reducer не использует `Date.now()`, `performance.now()`, `Math.random()` как вход simulation;
- reducer сначала читает и валидирует вход, затем мутирует `self`;
- перед чтением optional row чужого store проверяйте `view.has(entity)`;
- в `TICK` не создавайте новые массивы, buffers и объекты для hot path; используйте `resource(...)` scratch.

`entities()` в reducer возвращает live view. Reducer видит изменения templates, которые уже выполнились раньше в текущем `transition`.

Случайность, wall-clock время и external inputs передавайте через события, заранее подготовленное состояние или resource владельца. Эти значения не должны появляться в reducer как скрытая зависимость.

## 7. Ordered ECS

Для игр и симуляций допустимо сделать порядок templates явным contract.

```text
rtsSpatialIndex
-> unitCombat
-> unitHealth
-> unitCommand
-> enemyAi
-> unitMovement
```

Смысл порядка:

- `rtsSpatialIndex` строит spatial resources по позициям на начало кадра;
- `unitCombat` считает атаки;
- `unitHealth` применяет damage и смерть;
- `unitCommand` завершает player commands;
- `enemyAi` выбирает intent;
- `unitMovement` двигает только живые rows по актуальным command/intent.

Фазы simulation должны быть описаны явно: какие данные каждая фаза читает, какие пишет и какие изменения видит следующая фаза. Например, combat читает health до применения damage, а movement читает health после `unitHealth`.

Архитектурный refactor не должен молча менять gameplay. Если упрощение принято сознательно, например overkill damage в одном `TICK`, это должно быть зафиксировано как правило simulation.

## 8. Columns

Columns — авторитативные или handoff-значения на каждую entity row.

Подходящие данные:

- `hp`;
- `x`, `y`, `vx`, `vy`;
- `command`;
- `attackTimerMs`;
- `incomingDamage`.

Для handoff columns всегда фиксируйте владельца и lifetime:

- кто очищает значение;
- кто пишет;
- кто читает;
- до какого момента значение считается актуальным.

`incomingDamage` допустим как hot-path handoff column: пишет только `unitCombat`, читает `unitHealth`, очищает владелец в начале своего `TICK`. Значение после `TICK` не является долговременным domain fact.

Не используйте columns для runtime buffers или общих структур мира.

## 9. Resources

`resource(...)` — template-level runtime field для cache и рабочих структур.

Подходящие данные:

- spatial grid;
- flow field;
- physics/pathfinding cache;
- scratch `Int32Array`;
- временный `Point` buffer;
- metrics accumulator для owner system.

Контракт:

- resource создается на `MachineManager` instance;
- resource принадлежит template, а не row;
- owner получает mutable object через `self`;
- consumers видят только explicit exposed view;
- private resource без `expose` не доступен через `entities().get(...)`;
- resource не входит в public state, selectors, snapshot, hydrate payload или persistence.

У `resource(...)` нет rollback semantics. Owner reducer должен валидировать вход до мутации resource или уметь привести его в корректное состояние после частичного обновления.

Expose должен быть узким query-only API:

```ts
type RtsSpatialIndexView = {
  collectEnemyNeighborsAt(x: number, y: number, out: Int32Array): number;
  readFlowDirectionAt(x: number, y: number, out: Point): Point;
};
```

Не expose-ить raw mutable arrays (`heads`, `next`, `dx`, `dy`) без необходимости.

## 10. Effects

Effects — не hot-path слой. Используйте effects для редких событий и lifecycle.

Подходящие задачи:

- dispatch `UNIT_DIED`;
- dispatch `HERO_DEAD`;
- despawn dead entities;
- async process;
- external command, которому нужен `transition`.

Не используйте effects для per-frame movement, combat или damage, если это можно сделать reducers.

## 11. Reactions

Reactions выполняются после commit и не dispatch-ят события.

Подходящие задачи:

- синхронизация renderer/sprites;
- звук;
- metrics adapter;
- внешние observers.

Reactions читают committed state. Они не должны владеть бизнес-решениями simulation.

Metrics допустимы только как instrumentation. Они не должны становиться input для gameplay reducers или вторым источником истины.

## 12. Runtime Cache

Cache не является вторым источником истины, если:

- источник истины остается в columns;
- cache пересобирается owner reducer из columns;
- cache не persist-ится;
- cache не читается UI как domain state;
- cache не обновляет чужие stores.

```text
unitMovement.x/y + unitHealth.hp + unitIdentity.faction
-> rtsSpatialIndex.unitGrid resource
-> query API для combat/movement
```

Анти-паттерн:

```ts
const scratch = createRuntimeScratch();
```

Если `scratch` участвует в gameplay или frame simulation, перенесите его в `resource(...)` владельца. Module-level constants без mutable state допустимы.

## 13. Структура файлов

Для игровых систем предпочтительна папка на каждый автомат:

```text
store/machines/unit-combat/index.ts
store/machines/unit-movement/index.ts
store/machines/rts-spatial-index/index.ts
```

Правила:

- один автомат — одна зона ответственности;
- helper одного владельца лежит рядом с автоматом;
- общий helper допустим только при двух и более потребителях;
- spawn wiring можно держать отдельно от runtime machines.
