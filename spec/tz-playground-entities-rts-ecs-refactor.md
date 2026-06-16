# entities-rts ordered ECS refactor — ТЗ для реализации

## 1. Цель

Перевести `apps/playground/app/examples/entities-rts` с централизованного `runRtsSimulationTick` на ordered ECS-модель поверх `@lite-fsm/entities`.

Целевой результат:

- один `manager.transition({ type: "TICK" })` обновляет RTS simulation через ordered entity reducers;
- hot-path логика не использует цепочку `reaction -> module-level scratch -> flush events`;
- пространственные и pathfinding cache принадлежат `rtsSpatialIndex` через `resource(...)`;
- игровые владельцы разделены по зонам ответственности: spatial index, combat, health, command, enemy AI, movement;
- renderer, metrics и UI остаются тонкими adapters/selectors поверх committed state;
- behavior сохраняется настолько, насколько это не противоречит принятым упрощениям: overkill damage внутри одного `TICK` допустим, `ATTACK_MOVE` продолжает двигаться как `MOVE`.

## 2. Как выполнять это ТЗ

Реализация идет строго по этапам. Этап `N+1` начинается только после прохождения `stage gate` этапа `N`.

Перед началом реализации прочитать:

- `API-CHEATSHEET.md`, разделы `@lite-fsm/entities`, `Runtime resources`, `Reducer`;
- `TYPES-CHEATSHEET.md`, разделы `@lite-fsm/entities`, `Schema resources`, `EntityAccess`;
- `packages/entities/README.md`, разделы про `resource(...)`, `entities()` в reducer и ordered semantics;
- `apps/playground/app/examples/entities-rts/store/index.ts`;
- `apps/playground/app/examples/entities-rts/store/types.ts`;
- `apps/playground/app/examples/entities-rts/store/machines/*.ts`;
- `apps/playground/app/examples/entities-rts/store/sim/tick.ts`;
- `apps/playground/app/examples/entities-rts/store/sim/runtime.ts`;
- `apps/playground/app/examples/entities-rts/store/sim/spatial-grid.ts`;
- `apps/playground/app/examples/entities-rts/store/sim/flow-field.ts`;
- `apps/playground/app/examples/entities-rts/store/sim/spawn-placement.ts`;
- `apps/playground/app/examples/entities-rts/store/selectors.ts`;
- `apps/playground/app/examples/entities-rts/components/phaser-scene.ts`;
- `tests/playground/entities-rts/*.test.ts`.

Запрещенные проверки:

- `pnpm run build`;
- `pnpm --filter @lite-fsm/docs build`;
- `pnpm run docs:build`;
- `pnpm run pages:build*`;
- любой `next build` внутри `apps/docs`.

Если нужна сборка пакетов, использовать `pnpm run build:packages`.

### Область работ

- `apps/playground/app/examples/entities-rts/store/**`;
- `apps/playground/app/examples/entities-rts/components/phaser-scene.ts`;
- `apps/playground/app/examples/entities-rts/components/Game.tsx` только если меняются metrics/status projections;
- `tests/playground/entities-rts/**`;
- `spec/tz-playground-entities-rts-ecs-refactor-log.md`.

### Вне области работ

- изменения public API `@lite-fsm/entities`;
- изменения пакетов `@lite-fsm/core`, `@lite-fsm/entities`, `@lite-fsm/react`;
- docs build и docs app;
- визуальный redesign RTS страницы;
- новые gameplay features: projectiles, aggro tables, target priorities, fog of war, advanced formations;
- browser e2e coverage, если focused Vitest и type checks закрывают этап.

### Общие инварианты

- `TICK` остается одним public событием frame update.
- Порядок entity templates в `machines` является simulation contract.
- Entity reducer мутирует только `self`; другие entity stores читает через `entities()`.
- `resource(...)` используется только для runtime cache и scratch structures, не для авторитативных domain facts.
- Raw mutable resources не expose-ятся потребителям. Exposed resource view должен быть query-only.
- Нельзя сохранять `self`, `entities()` views, exposed resources или resource scratch references за пределами текущего reducer/effect/reaction вызова.
- Reducers остаются sync-only: без deps, IO, async, `transition`, renderer calls и metrics adapter calls.
- Reactions используются только для синхронной внешней интеграции без dispatch.
- Effects используются только для редких событий и lifecycle: `UNIT_DIED`, `HERO_DEAD`, despawn.
- `unitHealth.hp`, `unitCommand.command`, `unitMovement.x/y/vx/vy`, `unitCombat.attackTimerMs` остаются source of truth своих владельцев.
- `unitCombat.incomingDamage` является hot-path handoff column последней combat phase, а не долговременным domain fact.
- `incomingDamage` очищает только `unitCombat` в начале своего `TICK`.
- Overkill damage внутри одного `TICK` допустим: все атаки текущей combat phase читают `unitHealth` до применения damage в `unitHealth`.
- `ATTACK_MOVE` для `unitMovement` движется так же, как `MOVE`; combat считается независимо.
- `enemyAi` создается только для enemies. Player units управляются через `unitCommand`.
- Resources `rtsSpatialIndex` живут дольше rows, поэтому owner reducer обязан reset/rebuild resources на `ENTITY_SPAWNED`, `GAME_RESTART` и `TICK` по своему контракту.

## 3. Целевой public API

Новый public API пакетов не добавляется.

Из `AppEvents` удалить hot-path batch events, если после миграции нет активных отправителей:

- `UNIT_COMMANDS_UPDATED`;
- `UNIT_MOVEMENT_UPDATED`;
- `UNIT_COMBAT_TIMERS_UPDATED`;
- `UNIT_DAMAGE_APPLIED`.

Оставить domain/process events:

- `GAME_CONFIG_CHANGED`;
- `GAME_START`;
- `GAME_RESTART`;
- `GAME_PAUSE`;
- `GAME_RESUME`;
- `TICK`;
- `SELECT_RECT`;
- `SELECT_ENTITY`;
- `CLEAR_SELECTION`;
- `ISSUE_MOVE`;
- `ISSUE_ATTACK_MOVE`;
- `UNIT_SELECTION_UPDATED`;
- `UNIT_SELECTION_RESOLVED`;
- `UNIT_COMMAND_ASSIGNED`;
- `UNIT_COMMAND_RESOLVED`;
- `UNIT_DIED`;
- `HERO_DEAD`.

Если в процессе этапа временно нужны legacy events для совместимости, они должны быть удалены до cleanup gate.

## 4. Целевая архитектура

### Ordered machines

Целевой порядок в `machines`:

```ts
export const machines = {
  gameMap,
  gameSession,
  unitOrders,
  unitIdentity,
  rtsSpatialIndex,
  unitCombat,
  unitHealth,
  unitCommand,
  enemyAi,
  unitMovement,
  unitSelection,
};
```

Обязательные ordered dependencies:

- `rtsSpatialIndex` до `unitCombat`, `enemyAi` и `unitMovement`;
- `unitCombat` до `unitHealth`;
- `unitHealth` до `unitCommand`, `enemyAi` и `unitMovement`;
- `unitCommand` до `unitMovement`;
- `enemyAi` до `unitMovement`;
- `unitIdentity` до `rtsSpatialIndex` для чтения kind/faction/radius.

`unitSelection` не участвует в hot-path simulation order и может стоять после movement.

### Spawn plan

`GAME_START` создает:

- hero и allies с `unitIdentity`, `unitMovement`, `unitHealth`, `unitCombat`, `unitSelection`, `unitCommand`;
- enemies с `unitIdentity`, `unitMovement`, `unitHealth`, `unitCombat`, `enemyAi`;
- system entity `system/rts-spatial-index` с actor `rtsSpatialIndex`, если template требует row lifecycle. Resource доступен и при `0` rows, но row полезна для явного lifecycle и `GAME_RESTART` cleanup.

`rtsSimulation` и `rtsSimulationTick` должны быть удалены из `machines` и spawn plan.

### `rtsSpatialIndex`

Форма модуля:

```text
store/machines/rts-spatial-index/
  index.ts
  spatial-grid.ts
  flow-field.ts
```

`rtsSpatialIndex` является `storage: "entity"` owner для resources:

- `unitGrid`: grid всех живых units для separation;
- `enemyGrid`: grid живых enemies для target lookup;
- `flowField`: cache направления к hero;
- `metrics`: timing values `flowFieldRebuildMs`, `spatialGridBuildMs`;
- private scratch для hero position/flow direction только если нужен owner-у.

Exposed view должен быть query-only:

```ts
export type RtsSpatialIndexView = {
  heroEntity(): EntityIndex | null;
  heroPosition(out: Point): Point | null;
  collectUnitNeighborsAt(x: number, y: number, out: Int32Array): number;
  collectEnemyNeighborsAt(x: number, y: number, out: Int32Array): number;
  readFlowDirectionAt(x: number, y: number, out: Point): Point;
  readMetrics(): RtsSimulationMetrics;
};
```

Запрещено expose-ить raw `SpatialGrid`, raw `FlowField`, `heads`, `next`, `dx`, `dy` или общий mutable `neighborBuffer`.

`rtsSpatialIndex.reducer(TICK)`:

- читает `unitIdentity`, `unitMovement`, `unitHealth`;
- reset-ит grids;
- добавляет в `unitGrid` только живые rows с нужными components;
- добавляет в `enemyGrid` только живых enemies;
- находит живого hero и его позицию;
- пересобирает flow field только если hero перешел в другую flow cell;
- сбрасывает metrics перед build и записывает времена build/rebuild;
- не считает combat, damage, command arrival, enemy AI intent или movement.

Если hero отсутствует или dead, `heroEntity()` возвращает `null`, `heroPosition(out)` возвращает `null`, `readFlowDirectionAt(...)` возвращает `{ x: 0, y: 0 }`.

### `unitCombat`

`unitCombat` владеет:

- `attackRange`;
- `attackDamage`;
- `attackCooldownMs`;
- `attackTimerMs`;
- `incomingDamage`;
- private `targetBuffer: resource(() => new Int32Array(...))`.

`unitCombat.reducer(TICK)`:

- сначала очищает `incomingDamage` для rows в `self.indices`;
- уменьшает `attackTimerMs` для living combat rows;
- читает `unitIdentity`, `unitMovement`, `unitHealth`, `rtsSpatialIndex`;
- для player units ищет ближайшего living enemy в `enemyGrid` и атакует, если cooldown готов;
- для enemy units атакует hero, если hero жив, находится в range и cooldown готов;
- при атаке пишет `self.incomingDamage[target] += self.attackDamage[attacker]`;
- при атаке ставит `self.attackTimerMs[attacker] = self.attackCooldownMs[attacker]`;
- не использует `projectedHp`; overkill внутри tick допустим;
- не отправляет events.

`UNIT_DIED` остается допустимым редким событием и сбрасывает combat state погибшей row.

### `unitHealth`

`unitHealth.reducer(TICK)`:

- читает `unitCombat.incomingDamage`;
- для living rows применяет `hp = Math.max(0, hp - incomingDamage)`;
- переводит row в `DEAD`, если `hp <= 0`;
- не мутирует `unitCombat`.

Effect `DEAD` сохраняет текущую ответственность:

- отправляет `UNIT_DIED` конкретной entity через `transition.entity(...)`;
- despawn-ит non-hero dead units;
- отправляет `HERO_DEAD` unscoped для hero death.

### `unitCommand`

`unitCommand` владеет player commands:

- `IDLE`;
- `MOVE`;
- `ATTACK_MOVE`;
- `targetX`;
- `targetY`;
- `formationOffsetX`;
- `formationOffsetY`.

`unitCommand.reducer(TICK)`:

- читает `unitMovement` и `unitHealth`;
- работает только с living player rows, у которых есть `unitCommand`;
- если `MOVE` или `ATTACK_MOVE` достигли `TARGET_ARRIVAL_DISTANCE`, переводит `command` в `IDLE`;
- не пишет movement и не отправляет `UNIT_COMMANDS_UPDATED`.

`UNIT_COMMAND_ASSIGNED`, `UNIT_DIED`, `ENTITY_SPAWNED` сохраняются как non-hot-path events.

### `enemyAi`

Форма модуля:

```text
store/machines/enemy-ai/
  index.ts
```

`enemyAi` создается только для enemies.

Добавить модель:

```ts
export const ENEMY_INTENT = {
  IDLE: 0,
  CHASE_HERO: 1,
  HOLD_ATTACK_RANGE: 2,
} as const;
```

`enemyAi` context:

- `intent: u8({ default: ENEMY_INTENT.IDLE })`.

`enemyAi.reducer(TICK)`:

- читает `unitIdentity`, `unitMovement`, `unitHealth`, `unitCombat`, `rtsSpatialIndex`;
- если enemy dead, missing required components, hero отсутствует или hero dead: `IDLE`;
- если enemy находится в `attackRange + heroRadius`: `HOLD_ATTACK_RANGE`;
- иначе: `CHASE_HERO`;
- не хранит `targetX/targetY`, потому что `CHASE_HERO` означает движение к hero через `rtsSpatialIndex` flow field.

### `unitMovement`

`unitMovement` владеет:

- `x`, `y`, `vx`, `vy`, `speed`;
- private `neighborBuffer: resource(() => new Int32Array(...))`;
- private `flowDirection: resource(() => ({ x: 0, y: 0 }))`.

`unitMovement.reducer(TICK)`:

- читает `unitIdentity`, `unitHealth`, `unitCommand`, `enemyAi`, `unitCombat`, `rtsSpatialIndex`;
- для dead/missing rows пишет `vx = 0`, `vy = 0` и не двигает;
- применяет separation через `rtsSpatialIndex.collectUnitNeighborsAt(...)`;
- для player rows с `MOVE` или `ATTACK_MOVE` добавляет направление к command target;
- для enemy rows:
  - `CHASE_HERO`: добавляет `rtsSpatialIndex.readFlowDirectionAt(...)`;
  - `HOLD_ATTACK_RANGE`: не добавляет flow direction, оставляет только separation;
  - `IDLE`: не добавляет flow direction;
- clamp-ит позицию к `RTS_MAP`;
- не меняет `unitCommand` и `enemyAi`.

### Shared helpers and file ownership

Целевая структура:

```text
store/machines/
  game-map/index.ts
  game-session/index.ts
  unit-orders/index.ts
  unit-orders/formation.ts
  unit-identity/index.ts
  unit-selection/index.ts
  unit-command/index.ts
  unit-combat/index.ts
  unit-health/index.ts
  unit-movement/index.ts
  enemy-ai/index.ts
  rts-spatial-index/index.ts
  rts-spatial-index/spatial-grid.ts
  rts-spatial-index/flow-field.ts
store/spawn/placement.ts
store/spawn/random.ts
```

Правила:

- helper, используемый одним автоматом, лежит рядом с этим автоматом;
- helper, используемый spawn wiring, лежит в `store/spawn/`;
- общий helper выше machine folders допустим только при двух и более владельцах;
- `store/sim/tick.ts` и `store/sim/runtime.ts` должны быть удалены;
- `store/sim/batches.ts` должен быть удален или сокращен до non-simulation helpers до полного исчезновения `store/sim`.

## 5. Этапы реализации

### Этап 1 — `rtsSpatialIndex` и resource-based spatial cache

#### Цель

Добавить `rtsSpatialIndex` как owner spatial/flow resources и источник query-only view для последующих systems.

#### Зависит от

- Реализованный `resource(...)` в `@lite-fsm/entities`.
- Текущие helpers `spatial-grid.ts`, `flow-field.ts`, `spawn-placement.ts`.

#### Контракт этапа

- Создать `store/machines/rts-spatial-index/index.ts`.
- Использовать `resource(factory, expose)` для `unitGrid`, `enemyGrid`, `flowField`/flow cache и metrics.
- Exposed view должен предоставлять только query methods и `readMetrics()`.
- Перенести или временно импортировать `spatial-grid` и `flow-field` helpers так, чтобы raw mutable resources не были доступны consumers.
- Добавить `rtsSpatialIndex` в `machines` до `unitCombat`, `unitHealth`, `unitCommand`, `unitMovement`.
- Добавить spawn row `system/rts-spatial-index` в `GAME_START`, если это нужно для lifecycle; resource view должен быть корректен и при `0` rows.
- `rtsSpatialIndex.reducer(TICK)` должен пересобирать grids и hero/flow cache из live entity columns.
- Metrics `flowFieldRebuildMs` и `spatialGridBuildMs` должны читаться из `rtsSpatialIndex` view.
- `phaser-scene.ts` должен перестать читать `readRtsSimulationMetrics()` из `sim/runtime.ts`, если новый view уже доступен.
- Старый `runRtsSimulationTick` может временно оставаться активным до Этапа 2, но не должен владеть новыми resources.

#### Не делать в этом этапе

- Не переносить combat, health, command, enemy AI или movement logic.
- Не удалять `rtsSimulation` и `rtsSimulationTick`, если это ломает runtime до Этапа 2.
- Не менять gameplay semantics.
- Не expose-ить raw `SpatialGrid` или mutable buffers.

#### Тесты этапа

- Добавить или обновить focused tests для `rtsSpatialIndex`:
  - после `GAME_START` и одного `TICK` hero находится через `heroEntity()`;
  - enemy neighbors доступны через `collectEnemyNeighborsAt`;
  - при `GAME_RESTART` resources reset/rebuild не оставляет старых hero/enemy фактов;
  - metrics доступны через `readMetrics()`.
- Запустить `pnpm exec vitest run tests/playground/entities-rts`.
- Запустить `pnpm --filter @lite-fsm/playground check-types`.
- Запустить `git diff --check`.

#### Критерий завершения

- `rtsSpatialIndex` добавлен, typed и строит spatial resources на `TICK`.
- Consumers получают только query-only exposed view.
- Existing RTS tests проходят без ухудшения behavior.
- Stage checks пройдены.

### Этап 2 — Hot-path migration в ordered reducers

#### Цель

Перенести tick simulation из `runRtsSimulationTick` в reducers `unitCombat`, `unitHealth`, `unitCommand`, `enemyAi`, `unitMovement` и удалить старый tick orchestrator из runtime path.

#### Зависит от

- Этап 1.

#### Контракт этапа

- Добавить `store/machines/enemy-ai/index.ts` с `ENEMY_INTENT`.
- Обновить spawn plan: enemies получают actor `enemyAi`, player units не получают `enemyAi`.
- Добавить в `unitCombat` column `incomingDamage: i32({ default: 0 })`.
- Добавить в `unitCombat` private `targetBuffer: resource(() => new Int32Array(...))`.
- `unitCombat.reducer(TICK)` очищает `incomingDamage`, обновляет timers и пишет damage handoff.
- `unitHealth.reducer(TICK)` применяет `unitCombat.incomingDamage` и переводит rows в `DEAD`.
- `unitCommand.reducer(TICK)` переводит arrived `MOVE`/`ATTACK_MOVE` в `IDLE`.
- `enemyAi.reducer(TICK)` выставляет `IDLE`, `CHASE_HERO`, `HOLD_ATTACK_RANGE`.
- `unitMovement.reducer(TICK)` применяет player commands и enemy intent через `rtsSpatialIndex`.
- Удалить `rtsSimulation` и `rtsSimulationTick` из `machines`.
- Удалить spawn row `system/rts-simulation-tick`.
- Убедиться, что на один `TICK` больше нет flush-событий `UNIT_MOVEMENT_UPDATED`, `UNIT_COMBAT_TIMERS_UPDATED`, `UNIT_COMMANDS_UPDATED`, `UNIT_DAMAGE_APPLIED`.
- `unitHealth.effects.DEAD` остается единственным владельцем `UNIT_DIED`, `HERO_DEAD` и despawn non-hero dead units.
- Renderer reset не добавлять в reducers. Если старый runtime reset был единственным reset owner для внешнего renderer, перенести reset в technical effect или UI lifecycle отдельно.

#### Не делать в этом этапе

- Не добавлять `projectedHp`; overkill внутри tick является допустимой семантикой.
- Не менять `ATTACK_MOVE` stop behavior: movement продолжает двигаться к target.
- Не вводить per-unit events.
- Не использовать `getState()` в entity reducers.
- Не выносить enemy target columns, пока `CHASE_HERO` однозначно означает hero flow field.

#### Тесты этапа

- Обновить `tests/playground/entities-rts/runtime.test.ts`:
  - movement command двигает player units после одного `TICK`;
  - `unitCommand` сбрасывает arrived command в `IDLE`;
  - enemy intent меняется на `CHASE_HERO` и `HOLD_ATTACK_RANGE` в контролируемом сценарии;
  - enemies атакуют hero через `incomingDamage` и `unitHealth`;
  - death lifecycle переводит hero в `GAME_OVER`;
  - attack-move удаляет enemies через lifecycle.
- Добавить regression, что hot-path batch events больше не нужны: тест не должен вызывать legacy events напрямую.
- Запустить `pnpm exec vitest run tests/playground/entities-rts`.
- Запустить `pnpm --filter @lite-fsm/playground check-types`.
- Запустить `git diff --check`.

#### Критерий завершения

- `TICK` simulation работает без `runRtsSimulationTick`, `flushRtsSimulationTick`, `rtsSimulation`, `rtsSimulationTick`.
- Existing focused gameplay tests проходят с новой overkill semantics.
- Новый `enemyAi` участвует только у enemies.
- Stage checks пройдены.

### Этап 3 — Events, metrics и component integration cleanup

#### Цель

Удалить legacy hot-path batch API из app events, payload types и component integrations.

#### Зависит от

- Этап 2.

#### Контракт этапа

- Удалить из `AppEvents` hot-path batch events:
  - `UNIT_COMMANDS_UPDATED`;
  - `UNIT_MOVEMENT_UPDATED`;
  - `UNIT_COMBAT_TIMERS_UPDATED`;
  - `UNIT_DAMAGE_APPLIED`.
- Удалить больше не используемые payload types:
  - `UnitMovementBatchPayload`;
  - `UnitCombatBatchPayload`;
  - `UnitHealthDamageBatchPayload`;
  - `UnitCommandStateBatchPayload`;
  - `RtsSimulationBatch`.
- Сохранить `UnitSelectionBatchPayload` и `UnitCommandAssignmentBatchPayload`, если они нужны `unitOrders`.
- `phaser-scene.ts` должен читать simulation metrics через `rtsSpatialIndex` exposed view.
- `metrics.ts` должен сохранить public surface `recordSimulationMetrics`, если UI его использует.
- Удалить imports старого `readRtsSimulationMetrics`, `resetRtsSimulationRuntime`, `runRtsSimulationTick`, `flushRtsSimulationTick`.
- Обновить selectors only if projections changed.

#### Не делать в этом этапе

- Не менять visual layout.
- Не добавлять новые metrics categories beyond existing `flowFieldRebuildMs` и `spatialGridBuildMs`.
- Не переносить файлы массово, если это не нужно для удаления stale imports; structural moves идут в Этапе 4.

#### Тесты этапа

- Запустить `rg -n "UNIT_COMMANDS_UPDATED|UNIT_MOVEMENT_UPDATED|UNIT_COMBAT_TIMERS_UPDATED|UNIT_DAMAGE_APPLIED|runRtsSimulationTick|flushRtsSimulationTick|readRtsSimulationMetrics|resetRtsSimulationRuntime" apps/playground/app/examples/entities-rts tests/playground/entities-rts`.
- Ожидаемый результат: нет совпадений, кроме допустимых упоминаний в ТЗ/журнале вне active app/test scope.
- Запустить `pnpm exec vitest run tests/playground/entities-rts`.
- Запустить `pnpm --filter @lite-fsm/playground check-types`.
- Запустить `git diff --check`.

#### Критерий завершения

- Legacy hot-path events и helpers отсутствуют в active app/test scope.
- Metrics UI продолжает получать spatial/flow timings.
- Stage checks пройдены.

### Этап 4 — File ownership и удаление `store/sim`

#### Цель

Привести структуру RTS store к правилу: один автомат — одна папка, single-owner helpers рядом с owning machine.

#### Зависит от

- Этап 3.

#### Контракт этапа

- Перенести все machine modules в папки `store/machines/<machine-name>/index.ts`.
- `rtsSpatialIndex` оставить в `store/machines/rts-spatial-index/`.
- `enemyAi` оформить как `store/machines/enemy-ai/index.ts`.
- Перенести `formation.ts` в `store/machines/unit-orders/formation.ts`.
- Перенести spawn helpers в:
  - `store/spawn/placement.ts`;
  - `store/spawn/random.ts`.
- Перенести `spatial-grid.ts` и `flow-field.ts` в `store/machines/rts-spatial-index/`, если это не сделано в Этапе 1.
- Удалить `store/sim/tick.ts`.
- Удалить `store/sim/runtime.ts`.
- Удалить `store/sim/batches.ts`, если остатки helpers перенесены к owners.
- Удалить `store/sim/index.ts`, если каталог пуст.
- Обновить все imports в app и tests.

#### Не делать в этом этапе

- Не менять behavior reducers.
- Не делать декоративные переименования public constants.
- Не выносить helper в shared module без второго владельца.
- Не объединять machines ради сокращения файлов.

#### Тесты этапа

- Запустить `find apps/playground/app/examples/entities-rts/store/sim -type f`, если каталог остался.
- Ожидаемый результат: каталога нет или он пуст и удален.
- Запустить `pnpm exec vitest run tests/playground/entities-rts`.
- Запустить `pnpm --filter @lite-fsm/playground check-types`.
- Запустить `git diff --check`.

#### Критерий завершения

- Все machines лежат в папках с `index.ts`.
- Single-owner helpers лежат рядом с owners.
- `store/sim` больше не содержит active runtime code.
- Stage checks пройдены.

### Этап 5 — Рефакторинг, чистка и полировка

#### Цель

Убрать transitional code, stale identifiers и неочевидные остатки старой архитектуры после behavior migration и structural moves.

#### Зависит от

- Этап 4.

#### Контракт этапа

Must fix:

- module-level mutable scratch, который заменен resources;
- dead imports, unused types, unused events и stale batch helpers;
- comments, которые описывают старую схему `reaction -> orchestrator -> scratch -> flush`;
- duplicate owners для validation, target selection, damage application, command arrival, movement;
- helpers без второго владельца вне machine folder;
- leftover `rtsSimulation` / `rtsSimulationTick` references в active app/test scope;
- stale `sim` path references.

Inspect only:

- декоративные переименования constants без улучшения ownership;
- micro-optimizations без измеримого performance contract;
- перенос shared spawn helpers в machine folder;
- изменение gameplay balance beyond accepted overkill semantics.

#### Не делать в этом этапе

- Не добавлять новые features.
- Не менять public package API.
- Не запускать docs build.
- Не делать large refactor за пределами `entities-rts`.

#### Тесты этапа

- Source audit:
  - `rg -n "runRtsSimulationTick|flushRtsSimulationTick|resetRtsSimulationRuntime|readRtsSimulationMetrics|rtsSimulationTick|rtsSimulation|UNIT_MOVEMENT_UPDATED|UNIT_COMBAT_TIMERS_UPDATED|UNIT_COMMANDS_UPDATED|UNIT_DAMAGE_APPLIED" apps/playground/app/examples/entities-rts tests/playground/entities-rts`;
  - `rg -n "TODO|FIXME|debugger|test.only|test.skip|console.log" apps/playground/app/examples/entities-rts tests/playground/entities-rts`;
  - `rg -n "store/sim|/sim/" apps/playground/app/examples/entities-rts tests/playground/entities-rts`.
- Запустить `pnpm exec vitest run tests/playground/entities-rts`.
- Запустить `pnpm --filter @lite-fsm/playground check-types`.
- Запустить `pnpm run lint`.
- Запустить `git diff --check`.

#### Критерий завершения

- Source audit не показывает unexpected hits.
- Код читается по owners сверху вниз: validate/read → transform → mutate.
- No transitional runtime paths remain.
- Stage checks пройдены.

## 6. Критерий полной готовности

Полная готовность наступает только после выполнения всех этапов и отдельного final gate.

Final gate:

- `pnpm run build:packages`;
- `pnpm exec vitest run tests/playground/entities-rts tests/entities/entities-reducer-entities-access.test.ts`;
- `pnpm run check-types`;
- `pnpm run check-types:apps:dist`;
- `pnpm run lint`;
- `git diff --check`;
- source audits из Этапа 5 без unexpected hits.

Запрещенные команды не запускались:

- `pnpm run build`;
- `pnpm --filter @lite-fsm/docs build`;
- `pnpm run docs:build`;
- `pnpm run pages:build*`;
- любой `next build` внутри `apps/docs`.

Полный результат должен удовлетворять условиям:

- на `TICK` нет дополнительных hot-path batch events;
- `rtsSpatialIndex` является единственным владельцем spatial/flow resources;
- `unitCombat` является единственным владельцем combat timers и incoming damage;
- `unitHealth` является единственным владельцем hp/death lifecycle;
- `unitCommand` является единственным владельцем player command completion;
- `enemyAi` является единственным владельцем enemy movement intent;
- `unitMovement` является единственным владельцем position/velocity updates;
- renderer и metrics читают committed state/resources, но не владеют simulation logic;
- `store/sim` удален или не содержит active code;
- focused RTS tests проходят;
- app/package type checks проходят.
