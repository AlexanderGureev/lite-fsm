# Entity Patterns

Канонические шаблоны для слоя entities. Адаптируй имена, колонки и payload под проект.

Все примеры предполагают typed-обёртку `createMachine` из `bootstrap.md`.

## Component actor

Актор-компонент владеет одной зоной данных и реагирует на `TICK` и lifecycle-события. Здесь — владелец `hp` с death lifecycle.

```ts
import { i32, type EntityIndex } from "@lite-fsm/entities";
import { createMachine } from "../../create-machine";

// Узкий тип для дешёвой проверки жизни в hot path соседних систем.
type HealthLiveness = { has(e: EntityIndex): boolean; readonly hp: { readonly [e: number]: number } };
export const isAlive = (h: HealthLiveness, e: EntityIndex) => h.has(e) && h.hp[e] > 0;

export const health = createMachine({
  storage: "entity",
  despawnOn: "REMOVED",
  config: {
    __INIT: { ENTITY_SPAWNED: "ALIVE" },
    ALIVE: { TICK: null, GAME_RESTART: "REMOVED" },
    DEAD: { GAME_RESTART: "REMOVED" },
    REMOVED: {},
  },
  initialState: "__INIT",
  initialContext: { hp: i32({ default: 0 }), maxHp: i32({ default: 0 }) },
  spawnSchema: { hp: i32(), maxHp: i32() },
  reducer: (_state, action, { entities, payloadFor, self }) => {
    switch (action.type) {
      case "ENTITY_SPAWNED":
        for (const entity of self.indices) {
          const p = payloadFor(entity);
          self.hp[entity] = p.hp;
          self.maxHp[entity] = p.maxHp;
        }
        return;

      case "TICK": {
        const combat = entities().get("combat");
        const projectiles = entities().get("projectiles").pool.readIncomingDamage();

        for (const entity of self.indices) {
          if (!combat.has(entity)) continue;
          const damage = combat.incomingDamage[entity] + (entity < projectiles.length ? projectiles[entity] : 0);
          if (damage <= 0) continue;

          self.hp[entity] = Math.max(0, self.hp[entity] - damage);
          if (self.hp[entity] <= 0) self.stateCode[entity] = self.states.DEAD;
        }
        return;
      }
    }
  },
  effects: {
    // Death lifecycle: владелец hp решает смерть и инициирует despawn.
    DEAD: ({ self, transition }) => {
      transition.despawn(self.indices);
    },
  },
});
```

Владелец колонки `hp` — единственный, кто меняет `hp` и переводит строку в `DEAD`. Соседние системы только читают `hp` через `isAlive`.

## System actor с resource

Системная сущность-одиночка владеет cache в `resource(...)`, пересобирает его из колонок каждый `TICK` и отдаёт узкий query-view. Сама gameplay-решений не принимает.

```ts
import { resource, type EntityIndex } from "@lite-fsm/entities";
import { createMachine } from "../../create-machine";
import { createSpatialGrid, resetGrid, insertAt, collectAt, type SpatialGrid } from "./spatial-grid";

type SpatialIndexResource = { grid: SpatialGrid };
export type SpatialIndexView = {
  collectNeighborsAt(x: number, y: number, out: Int32Array, limit?: number): number;
};

export const spatialIndex = createMachine({
  storage: "entity",
  despawnOn: "REMOVED",
  config: {
    __INIT: { ENTITY_SPAWNED: "ACTIVE" },
    ACTIVE: { TICK: null, GAME_RESTART: "REMOVED" },
    REMOVED: {},
  },
  initialState: "__INIT",
  initialContext: {
    index: resource(
      (): SpatialIndexResource => ({ grid: createSpatialGrid() }),
      (r): SpatialIndexView => ({
        collectNeighborsAt: (x, y, out, limit) => collectAt(r.grid, x, y, out, limit),
      }),
    ),
  },
  spawnSchema: {},
  reducer: (_state, action, { entities, self }) => {
    switch (action.type) {
      case "TICK": {
        const movement = entities().get("movement");
        const health = entities().get("health");
        const capacity = movement.x.length; // длина колонки = число слотов

        resetGrid(self.index.grid);
        for (let i = 0; i < capacity; i += 1) {
          const entity = i as EntityIndex;
          if (!health.has(entity) || health.hp[entity] <= 0) continue;
          insertAt(self.index.grid, entity, movement.x[entity], movement.y[entity]);
        }
        return;
      }
    }
  },
});
```

Consumer читает view: `entities().get("spatialIndex").index.collectNeighborsAt(...)`. Сетка пересобирается из колонок, не persist-ится и не является вторым источником истины.

## SoA-пул как система

Система-пул держит множество короткоживущих объектов в `resource(...)`, читает intent из других колонок, обновляет пул и пишет handoff-урон. Структура и операции пула — в отдельном файле владельца (`resources.md`).

```ts
import { resource, type EntityIndex } from "@lite-fsm/entities";
import { createMachine } from "../../create-machine";
import { isAlive } from "../health";
import { createPool, exposePool, resetPool, clearProjectileDamage, appendProjectile, updatePool } from "./projectile-pool";

export const projectiles = createMachine({
  storage: "entity",
  despawnOn: "REMOVED",
  config: {
    __INIT: { ENTITY_SPAWNED: "ACTIVE" },
    ACTIVE: { TICK: null, GAME_RESTART: "REMOVED" },
    REMOVED: {},
  },
  initialState: "__INIT",
  initialContext: { pool: resource(createPool, exposePool) },
  spawnSchema: {},
  reducer: (_state, action, { entities, self }) => {
    switch (action.type) {
      case "ENTITY_SPAWNED":
      case "GAME_RESTART":
        resetPool(self.pool);
        return;

      case "TICK": {
        const combat = entities().get("combat");
        const health = entities().get("health");
        const movement = entities().get("movement");
        const dt = Math.max(0, action.payload.deltaMs) / 1000;

        clearProjectileDamage(self.pool); // очистка handoff-буфера в начале TICK
        updatePool(self.pool, dt, { health, x: movement.x, y: movement.y });

        // intent выстрела пришёл из combat этим же кадром
        const capacity = movement.x.length;
        for (let i = 0; i < capacity; i += 1) {
          const entity = i as EntityIndex;
          if (combat.projectileDamage[entity] <= 0 || !combat.has(entity)) continue;
          const target = combat.projectileTargetEntity[entity] as EntityIndex;
          if (!isAlive(health, target)) continue;

          appendProjectile(self.pool, {
            x: movement.x[entity],
            y: movement.y[entity],
            targetEntity: target,
            damage: combat.projectileDamage[entity],
            speed: combat.projectileSpeed[entity],
          });
        }
        return;
      }
    }
  },
});
```

Пул читает мир и мутирует только свои буферы. Авторитативное применение урона делает владелец `hp`, читая exposed damage-буфер.

## Coordinator над сущностями

Пользовательские намерения (выделение рамкой, приказ движения) — это не hot path. Их обрабатывает обычная machine-координатор в `effects`: она читает entity-views, вычисляет батч и эмитит batch-событие, которое entity-актор применяет в своём reducer. Так дорогой расчёт не попадает в `TICK`.

```ts
// coordinator (обычная machine): READY -> вычислить батч -> RESOLVED
export const orders = createMachine({
  config: {
    READY: { ISSUE_MOVE: "ISSUING", GAME_RESTART: null },
    ISSUING: { ORDER_RESOLVED: "READY", GAME_RESTART: "READY" },
  },
  initialState: "READY",
  initialContext: {},
  reducer: (state, _action, { nextState }) => {
    state.state = nextState;
  },
  effects: {
    ISSUING: ({ action, entities, transition }) => {
      if (action.type !== "ISSUE_MOVE") {
        transition({ type: "ORDER_RESOLVED" });
        return;
      }
      const selection = entities().get("selection");
      const command = entities().get("command");
      const capacity = command.command.length;
      const batch = createCommandBatch(capacity); // Uint8Array/Float32Array по слотам

      for (let i = 0; i < capacity; i += 1) {
        const entity = i as EntityIndex;
        if (!command.has(entity) || selection.selected[entity] !== SELECTED) continue;
        batch.touched[entity] = 1;
        batch.targetX[entity] = action.payload.x;
        batch.targetY[entity] = action.payload.y;
      }

      transition({ type: "COMMAND_ASSIGNED", payload: batch });
      transition({ type: "ORDER_RESOLVED" });
    },
  },
});
```

```ts
// command (entity actor): применяет батч в своём reducer
case "COMMAND_ASSIGNED":
  for (const entity of self.indices) {
    if (action.payload.touched[entity] !== 1) continue;
    self.command[entity] = MOVE;
    self.targetX[entity] = action.payload.targetX[entity];
    self.targetY[entity] = action.payload.targetY[entity];
  }
  return;
```

Координатор владеет cold-path orchestration и читает много stores; entity-актор владеет колонками и применяет батч. Это разделение держит hot-path reducer чистым.

## Когда не нужна entity-система

- Сущность не обновляется каждый `TICK`, имеет объектный context или малый lifecycle → обычная machine или actor template.
- Данных мало и нет batch-обработки тысяч строк → обычная machine с dictionary в context.
- Нужен runtime cache/scratch, а не факт строки → `resource(...)`, а не новая система.
