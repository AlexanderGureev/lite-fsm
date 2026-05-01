import { PLAYER_TOUCH_DAMAGE } from "../constants";
import { createMachine } from "../create-machine";
import { distance, normalize } from "../utils";

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
    CHECKING: ({ action, transition, getState }) => {
      const root = getState();
      const player = Object.values(root.playerBody)[0]?.context;
      const now = action.payload.now;

      if (root.gameSession.context.status !== "running" || !player) {
        transition({ type: "COMBAT_DONE" });
        return;
      }

      const enemies = Object.entries(root.enemyBody)
        .filter(([, enemy]) => enemy.context.entityId)
        .map(([actorId, enemy]) => {
          const healthEntry = Object.entries(root.enemyHealth).find(
            ([, health]) => health.context.entityId === enemy.context.entityId,
          );
          return {
            actorId,
            groupId: enemy.meta.groupId,
            context: enemy.context,
            health: healthEntry ? { actorId: healthEntry[0], context: healthEntry[1].context } : null,
          };
        });
      const usedProjectiles = new Set<string>();
      const removedEnemies = new Set<string>();

      for (const [projectileId, { context: projectile }] of Object.entries(root.projectileBody)) {
        for (const enemy of enemies) {
          if (usedProjectiles.has(projectileId) || removedEnemies.has(enemy.context.entityId)) continue;
          if (distance(projectile, enemy.context) > projectile.radius + enemy.context.radius) {
            continue;
          }

          const enemyWillDie = enemy.health ? enemy.health.context.current - projectile.damage <= 0 : true;
          const recoilDirection = normalize({ x: enemy.context.x - player.x, y: enemy.context.y - player.y });
          const feedbackDirection =
            recoilDirection.x === 0 && recoilDirection.y === 0 ? { x: 0, y: -1 } : recoilDirection;

          transition({
            type: "ENEMY_HIT_FEEDBACK_START",
            payload: {
              entityId: enemy.context.entityId,
              x: enemy.context.x,
              y: enemy.context.y,
              direction: feedbackDirection,
              now,
            },
            meta: { groupId: enemy.groupId },
          });

          if (enemy.health) {
            transition({
              type: "DAMAGE",
              payload: { amount: projectile.damage },
              meta: { actorId: enemy.health.actorId },
            });
          }

          transition({ type: "DESPAWN", meta: { actorId: projectileId } });
          usedProjectiles.add(projectileId);

          if (enemyWillDie) {
            removedEnemies.add(enemy.context.entityId);
            transition({ type: "ENEMY_KILLED" });
            transition({
              type: "DESPAWN",
              meta: { actorId: enemy.health ? [enemy.actorId, enemy.health.actorId] : enemy.actorId },
            });
          }
        }
      }

      for (const enemy of enemies) {
        if (removedEnemies.has(enemy.context.entityId)) continue;
        if (distance(player, enemy.context) > player.radius + enemy.context.radius) continue;

        transition({
          type: "PLAYER_DAMAGE",
          payload: { amount: PLAYER_TOUCH_DAMAGE },
          meta: { groupTag: "player" },
        });
        transition({ type: "PLAYER_HIT" });
        transition({
          type: "DESPAWN",
          meta: { actorId: enemy.health ? [enemy.actorId, enemy.health.actorId] : enemy.actorId },
        });

        if (player.hp - PLAYER_TOUCH_DAMAGE <= 0) transition({ type: "PLAYER_DEAD" });
      }

      transition({ type: "COMBAT_DONE" });
    },
  },
});
