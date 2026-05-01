import {
  FIRE_COOLDOWN,
  PLAYER_RADIUS,
  PROJECTILE_DAMAGE,
  PROJECTILE_RADIUS,
  PROJECTILE_SPEED,
  PROJECTILE_TTL,
} from "../constants";
import { createMachine } from "../create-machine";
import type { EnemyBodyContext } from "../types";
import { distance, normalize } from "../utils";

export const playerAutoFire = createMachine({
  config: {
    READY: { TICK: "AIMING" },
    AIMING: { PROJECTILE_SPAWN: "READY", FIRE_SKIP: "READY" },
  },
  initialState: "READY",
  initialContext: { lastShotAt: -FIRE_COOLDOWN },
  reducer: (state, action, { nextState }) => {
    state.state = nextState;
    if (action.type === "PROJECTILE_SPAWN") state.context.lastShotAt = action.payload.firedAt;
  },
  effects: {
    AIMING: ({ action, transition, getState }) => {
      const root = getState();
      const player = Object.values(root.playerBody)[0]?.context;
      const now = action.payload.now;

      if (
        root.gameSession.context.status !== "running" ||
        !player ||
        now - root.playerAutoFire.context.lastShotAt < FIRE_COOLDOWN
      ) {
        transition({ type: "FIRE_SKIP" });
        return;
      }

      let target: EnemyBodyContext | null = null;
      let targetDistance = Number.POSITIVE_INFINITY;

      for (const { context: enemy } of Object.values(root.enemyBody)) {
        if (!enemy.entityId) continue;

        const hasHealth = Object.values(root.enemyHealth).some((health) => health.context.entityId === enemy.entityId);
        if (!hasHealth) continue;

        const currentDistance = distance(enemy, player);
        if (currentDistance < targetDistance) {
          target = enemy;
          targetDistance = currentDistance;
        }
      }

      if (!target) {
        transition({ type: "FIRE_SKIP" });
        return;
      }

      const direction = normalize({ x: target.x - player.x, y: target.y - player.y });

      transition({
        type: "PROJECTILE_SPAWN",
        payload: {
          x: player.x + direction.x * (PLAYER_RADIUS + PROJECTILE_RADIUS + 2),
          y: player.y + direction.y * (PLAYER_RADIUS + PROJECTILE_RADIUS + 2),
          vx: direction.x * PROJECTILE_SPEED,
          vy: direction.y * PROJECTILE_SPEED,
          damage: PROJECTILE_DAMAGE,
          ttl: PROJECTILE_TTL,
          firedAt: now,
        },
      });
    },
  },
});
