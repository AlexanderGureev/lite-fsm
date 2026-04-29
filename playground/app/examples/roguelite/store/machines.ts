import type { ManagerAction } from "lite-fsm";

import {
  ENEMY_BASE_HP,
  ENEMY_BASE_SPEED,
  ENEMY_LIMIT,
  ENEMY_RADIUS,
  ENEMY_SPAWN_INTERVAL,
  ENEMY_SPAWN_MAX_INTERVAL,
  ENEMY_SPAWN_MIN_INTERVAL,
  FIRE_COOLDOWN,
  PLAYER_MAX_HP,
  PLAYER_RADIUS,
  PLAYER_SPEED,
  PLAYER_TOUCH_DAMAGE,
  PROJECTILE_DAMAGE,
  PROJECTILE_RADIUS,
  PROJECTILE_SPEED,
  PROJECTILE_TTL,
  WORLD,
} from "./constants";
import { createMachine } from "./create-machine";
import type { AppEvents, EnemyBodyContext, Vec2 } from "./types";

import type { AppState } from ".";

const routed = (action: ManagerAction<AppEvents>) => action as AppEvents;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const length = ({ x, y }: Vec2) => Math.hypot(x, y);

const normalize = (vector: Vec2): Vec2 => {
  const size = length(vector);
  if (size === 0) return { x: 0, y: 0 };
  return { x: vector.x / size, y: vector.y / size };
};

const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

type ActorEntry<T extends object> = {
  actorId: string;
  state: string;
  context: T;
};

const actorEntries = <T extends object>(record: Record<string, { state: string; context: T }>): Array<ActorEntry<T>> =>
  Object.entries(record).map(([actorId, slice]) => ({ actorId, state: slice.state, context: slice.context }));

const getPlayer = (state: AppState) => actorEntries(state.playerBody)[0] ?? null;

const getEnemyHealthByEntity = (state: AppState, entityId: string) =>
  actorEntries(state.enemyHealth).find((actor) => actor.context.entityId === entityId) ?? null;

const getNearestEnemy = (state: AppState, origin: Vec2) => {
  let nearest: ActorEntry<EnemyBodyContext> | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const enemy of actorEntries(state.enemyBody)) {
    if (!enemy.context.entityId || !getEnemyHealthByEntity(state, enemy.context.entityId)) continue;

    const currentDistance = distance(origin, enemy.context);
    if (currentDistance < nearestDistance) {
      nearest = enemy;
      nearestDistance = currentDistance;
    }
  }

  return nearest;
};

const createEnemySpawn = (random: () => number, entityId: string) => {
  const side = Math.floor(random() * 4);
  const x =
    side === 0
      ? WORLD.padding
      : side === 1
        ? WORLD.width - WORLD.padding
        : WORLD.padding + random() * (WORLD.width - WORLD.padding * 2);
  const y =
    side === 2
      ? WORLD.padding
      : side === 3
        ? WORLD.height - WORLD.padding
        : WORLD.padding + random() * (WORLD.height - WORLD.padding * 2);

  return {
    entityId,
    x,
    y,
    hp: ENEMY_BASE_HP,
    maxHp: ENEMY_BASE_HP,
    speed: ENEMY_BASE_SPEED + random() * 34,
  };
};

export const gameSession = createMachine({
  config: {
    RUNNING: {
      GAME_BOOT: null,
      TICK: null,
      ENEMY_SPAWN: null,
      PROJECTILE_SPAWN: null,
      ENEMY_KILLED: null,
      PLAYER_HIT: null,
      PLAYER_DEAD: "GAME_OVER",
    },
    GAME_OVER: { GAME_BOOT: "RUNNING" },
  },
  initialState: "RUNNING",
  initialContext: {
    status: "running",
    startedAt: 0,
    tick: 0,
    kills: 0,
    shots: 0,
    hits: 0,
  },
  reducer: (state, action, { nextState }) => {
    state.state = nextState;

    switch (action.type) {
      case "GAME_BOOT": {
        state.context.status = "running";
        state.context.startedAt = action.payload.now;
        state.context.tick = 0;
        state.context.kills = 0;
        state.context.shots = 0;
        state.context.hits = 0;
        break;
      }
      case "TICK":
        state.context.tick += 1;
        break;
      case "PROJECTILE_SPAWN":
        state.context.shots += 1;
        break;
      case "ENEMY_KILLED":
        state.context.kills += 1;
        break;
      case "PLAYER_HIT":
        state.context.hits += 1;
        break;
      case "PLAYER_DEAD":
        state.context.status = "game-over";
        break;
    }
  },
});

export const bootSystem = createMachine({
  config: {
    READY: { GAME_BOOT: "SPAWNING" },
    SPAWNING: { BOOT_DONE: "READY" },
  },
  initialState: "READY",
  initialContext: {},
  reducer: (state, _action, { nextState }) => {
    state.state = nextState;
  },
  effects: {
    SPAWNING: ({ transition }) => {
      transition({
        type: "PLAYER_SPAWN",
        payload: { x: WORLD.width / 2, y: WORLD.height / 2, hp: PLAYER_MAX_HP },
      });
      transition({ type: "BOOT_DONE" });
    },
  },
});

export const enemySpawner = createMachine({
  config: {
    READY: { TICK: "CHECKING", BOOST_SPAWN_RATE: null },
    CHECKING: { ENEMY_SPAWN: "READY", SPAWN_SKIP: "READY" },
  },
  initialState: "READY",
  initialContext: {
    total: 0,
    lastSpawnAt: -ENEMY_SPAWN_INTERVAL,
    interval: ENEMY_SPAWN_INTERVAL,
  },
  reducer: (state, action, { nextState }) => {
    state.state = nextState;

    if (action.type === "ENEMY_SPAWN") {
      state.context.total += 1;
      state.context.lastSpawnAt = Date.now();
    }

    if (action.type === "BOOST_SPAWN_RATE") {
      const next = action.payload.reset
        ? ENEMY_SPAWN_INTERVAL
        : state.context.interval * (action.payload.multiplier ?? 1);
      state.context.interval = clamp(next, ENEMY_SPAWN_MIN_INTERVAL, ENEMY_SPAWN_MAX_INTERVAL);
    }
  },
  effects: {
    CHECKING: ({ action, transition, getState, random }) => {
      const root = getState();
      const aliveEnemies = Object.keys(root.enemyBody).length;
      const hasPlayer = Boolean(getPlayer(root));
      const now = action.type === "TICK" ? action.payload.now : Date.now();
      const canSpawn =
        root.gameSession.context.status === "running" &&
        hasPlayer &&
        aliveEnemies < ENEMY_LIMIT &&
        now - root.enemySpawner.context.lastSpawnAt >= root.enemySpawner.context.interval;

      if (!canSpawn) {
        transition({ type: "SPAWN_SKIP" });
        return;
      }

      transition({
        type: "ENEMY_SPAWN",
        payload: createEnemySpawn(random, `enemy-${root.enemySpawner.context.total}`),
      });
    },
  },
});

export const movementSystem = createMachine({
  config: {
    READY: { TICK: "STEPPING" },
    STEPPING: { MOVE_DONE: "READY" },
  },
  initialState: "READY",
  initialContext: {},
  reducer: (state, _action, { nextState }) => {
    state.state = nextState;
  },
  effects: {
    STEPPING: ({ action, transition, getState, getInputVector }) => {
      const root = getState();
      const player = getPlayer(root);
      const delta = action.type === "TICK" ? Math.min(action.payload.delta / 1000, 0.05) : 0;

      if (root.gameSession.context.status !== "running" || !player) {
        transition({ type: "MOVE_DONE" });
        return;
      }

      const input = normalize(getInputVector());
      transition(
        routed({
          type: "PLAYER_MOVE",
          payload: {
            x: clamp(player.context.x + input.x * PLAYER_SPEED * delta, WORLD.padding, WORLD.width - WORLD.padding),
            y: clamp(player.context.y + input.y * PLAYER_SPEED * delta, WORLD.padding, WORLD.height - WORLD.padding),
            vx: input.x * PLAYER_SPEED,
            vy: input.y * PLAYER_SPEED,
          },
          meta: { groupTag: "player" },
        }),
      );

      for (const enemy of actorEntries(root.enemyBody)) {
        const direction = normalize({
          x: player.context.x - enemy.context.x,
          y: player.context.y - enemy.context.y,
        });

        transition(
          routed({
            type: "ENEMY_MOVE",
            payload: {
              x: enemy.context.x + direction.x * enemy.context.speed * delta,
              y: enemy.context.y + direction.y * enemy.context.speed * delta,
              vx: direction.x * enemy.context.speed,
              vy: direction.y * enemy.context.speed,
            },
            meta: { actorId: enemy.actorId },
          }),
        );
      }

      for (const projectile of actorEntries(root.projectileBody)) {
        const ttl = projectile.context.ttl - delta;
        const next = {
          x: projectile.context.x + projectile.context.vx * delta,
          y: projectile.context.y + projectile.context.vy * delta,
          ttl,
        };

        if (
          ttl <= 0 ||
          next.x < -WORLD.padding ||
          next.x > WORLD.width + WORLD.padding ||
          next.y < -WORLD.padding ||
          next.y > WORLD.height + WORLD.padding
        ) {
          transition(routed({ type: "DESPAWN", meta: { actorId: projectile.actorId } }));
        } else {
          transition(routed({ type: "PROJECTILE_MOVE", payload: next, meta: { actorId: projectile.actorId } }));
        }
      }

      transition({ type: "MOVE_DONE" });
    },
  },
});

export const playerAutoFire = createMachine({
  config: {
    READY: { TICK: "AIMING" },
    AIMING: { PROJECTILE_SPAWN: "READY", FIRE_SKIP: "READY" },
  },
  initialState: "READY",
  initialContext: { lastShotAt: -FIRE_COOLDOWN },
  reducer: (state, action, { nextState }) => {
    state.state = nextState;
    if (action.type === "PROJECTILE_SPAWN") state.context.lastShotAt = Date.now();
  },
  effects: {
    AIMING: ({ action, transition, getState }) => {
      const root = getState();
      const player = getPlayer(root);
      const now = action.type === "TICK" ? action.payload.now : Date.now();

      if (
        root.gameSession.context.status !== "running" ||
        !player ||
        now - root.playerAutoFire.context.lastShotAt < FIRE_COOLDOWN
      ) {
        transition({ type: "FIRE_SKIP" });
        return;
      }

      const enemy = getNearestEnemy(root, player.context);
      if (!enemy) {
        transition({ type: "FIRE_SKIP" });
        return;
      }

      const direction = normalize({
        x: enemy.context.x - player.context.x,
        y: enemy.context.y - player.context.y,
      });

      transition({
        type: "PROJECTILE_SPAWN",
        payload: {
          x: player.context.x + direction.x * (PLAYER_RADIUS + PROJECTILE_RADIUS + 2),
          y: player.context.y + direction.y * (PLAYER_RADIUS + PROJECTILE_RADIUS + 2),
          vx: direction.x * PROJECTILE_SPEED,
          vy: direction.y * PROJECTILE_SPEED,
          damage: PROJECTILE_DAMAGE,
          ttl: PROJECTILE_TTL,
        },
      });
    },
  },
});

export const combatSystem = createMachine({
  config: {
    READY: { TICK: "CHECKING" },
    CHECKING: { COMBAT_DONE: "READY" },
  },
  initialState: "READY",
  initialContext: {},
  reducer: (state, _action, { nextState }) => {
    state.state = nextState;
  },
  effects: {
    CHECKING: ({ transition, getState }) => {
      const root = getState();
      const player = getPlayer(root);
      const usedProjectiles = new Set<string>();
      const removedEnemies = new Set<string>();

      if (root.gameSession.context.status !== "running" || !player) {
        transition({ type: "COMBAT_DONE" });
        return;
      }

      const enemies = actorEntries(root.enemyBody).filter((enemy) => enemy.context.entityId);

      for (const projectile of actorEntries(root.projectileBody)) {
        for (const enemy of enemies) {
          if (usedProjectiles.has(projectile.actorId) || removedEnemies.has(enemy.context.entityId)) continue;
          if (distance(projectile.context, enemy.context) > projectile.context.radius + enemy.context.radius) continue;

          const health = getEnemyHealthByEntity(root, enemy.context.entityId);
          const willDie = health ? health.context.current - projectile.context.damage <= 0 : true;

          if (health) {
            transition(
              routed({
                type: "DAMAGE",
                payload: { amount: projectile.context.damage },
                meta: { actorId: health.actorId },
              }),
            );
          }
          transition(routed({ type: "DESPAWN", meta: { actorId: projectile.actorId } }));
          usedProjectiles.add(projectile.actorId);

          if (willDie) {
            removedEnemies.add(enemy.context.entityId);
            transition({ type: "ENEMY_KILLED" });
            transition(
              routed({ type: "DESPAWN", meta: { actorId: health ? [enemy.actorId, health.actorId] : enemy.actorId } }),
            );
          }
        }
      }

      for (const enemy of enemies) {
        if (removedEnemies.has(enemy.context.entityId)) continue;
        if (distance(player.context, enemy.context) > player.context.radius + enemy.context.radius) continue;

        const health = getEnemyHealthByEntity(root, enemy.context.entityId);
        const playerWillDie = player.context.hp - PLAYER_TOUCH_DAMAGE <= 0;

        transition(
          routed({
            type: "PLAYER_DAMAGE",
            payload: { amount: PLAYER_TOUCH_DAMAGE },
            meta: { groupTag: "player" },
          }),
        );
        transition({ type: "PLAYER_HIT" });
        transition(
          routed({ type: "DESPAWN", meta: { actorId: health ? [enemy.actorId, health.actorId] : enemy.actorId } }),
        );

        if (playerWillDie) transition({ type: "PLAYER_DEAD" });
      }

      transition({ type: "COMBAT_DONE" });
    },
  },
});

export const playerBody = createMachine({
  groupTag: "player",
  config: {
    __INIT: { PLAYER_SPAWN: "ALIVE" },
    ALIVE: {
      PLAYER_MOVE: null,
      PLAYER_DAMAGE: "ALIVE",
      DESPAWN: "__RESOLVED",
    },
  },
  initialState: "__INIT",
  initialContext: {
    x: WORLD.width / 2,
    y: WORLD.height / 2,
    vx: 0,
    vy: 0,
    hp: PLAYER_MAX_HP,
    maxHp: PLAYER_MAX_HP,
    radius: PLAYER_RADIUS,
  },
  reducer: (state, action, { nextState }) => {
    state.state = nextState;

    switch (action.type) {
      case "PLAYER_SPAWN":
        state.context.x = action.payload.x;
        state.context.y = action.payload.y;
        state.context.hp = action.payload.hp;
        state.context.maxHp = action.payload.hp;
        break;
      case "PLAYER_MOVE":
        state.context.x = action.payload.x;
        state.context.y = action.payload.y;
        state.context.vx = action.payload.vx;
        state.context.vy = action.payload.vy;
        break;
      case "PLAYER_DAMAGE":
        state.context.hp = Math.max(0, state.context.hp - action.payload.amount);
        if (state.context.hp <= 0) state.state = "__RESOLVED";
        break;
    }
  },
});

export const enemyBody = createMachine({
  groupTag: "enemy",
  config: {
    __INIT: { ENEMY_SPAWN: "ALIVE" },
    ALIVE: {
      ENEMY_MOVE: null,
      DESPAWN: "__RESOLVED",
    },
  },
  initialState: "__INIT",
  initialContext: {
    entityId: "",
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    speed: ENEMY_BASE_SPEED,
    radius: ENEMY_RADIUS,
  },
  reducer: (state, action, { nextState }) => {
    state.state = nextState;

    switch (action.type) {
      case "ENEMY_SPAWN":
        state.context.entityId = action.payload.entityId;
        state.context.x = action.payload.x;
        state.context.y = action.payload.y;
        state.context.speed = action.payload.speed;
        break;
      case "ENEMY_MOVE":
        state.context.x = action.payload.x;
        state.context.y = action.payload.y;
        state.context.vx = action.payload.vx;
        state.context.vy = action.payload.vy;
        break;
    }
  },
});

export const enemyHealth = createMachine({
  groupTag: "enemy",
  config: {
    __INIT: { ENEMY_SPAWN: "ALIVE" },
    ALIVE: {
      DAMAGE: "ALIVE",
      DESPAWN: "__RESOLVED",
    },
  },
  initialState: "__INIT",
  initialContext: {
    entityId: "",
    current: ENEMY_BASE_HP,
    max: ENEMY_BASE_HP,
  },
  reducer: (state, action, { nextState }) => {
    state.state = nextState;

    switch (action.type) {
      case "ENEMY_SPAWN":
        state.context.entityId = action.payload.entityId;
        state.context.current = action.payload.hp;
        state.context.max = action.payload.maxHp;
        break;
      case "DAMAGE":
        state.context.current = Math.max(0, state.context.current - action.payload.amount);
        if (state.context.current <= 0) state.state = "__RESOLVED";
        break;
    }
  },
});

export const projectileBody = createMachine({
  groupTag: "projectile",
  config: {
    __INIT: { PROJECTILE_SPAWN: "FLYING" },
    FLYING: {
      PROJECTILE_MOVE: null,
      DESPAWN: "__RESOLVED",
    },
  },
  initialState: "__INIT",
  initialContext: {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    damage: PROJECTILE_DAMAGE,
    ttl: PROJECTILE_TTL,
    radius: PROJECTILE_RADIUS,
  },
  reducer: (state, action, { nextState }) => {
    state.state = nextState;

    switch (action.type) {
      case "PROJECTILE_SPAWN":
        state.context.x = action.payload.x;
        state.context.y = action.payload.y;
        state.context.vx = action.payload.vx;
        state.context.vy = action.payload.vy;
        state.context.damage = action.payload.damage;
        state.context.ttl = action.payload.ttl;
        break;
      case "PROJECTILE_MOVE":
        state.context.x = action.payload.x;
        state.context.y = action.payload.y;
        state.context.ttl = action.payload.ttl;
        break;
    }
  },
});

export const rogueliteMachines = {
  gameSession,
  bootSystem,
  enemySpawner,
  movementSystem,
  playerAutoFire,
  combatSystem,
  playerBody,
  enemyBody,
  enemyHealth,
  projectileBody,
};
