import { PLAYER_SPEED, WORLD } from "../constants";
import { createMachine } from "../create-machine";
import { clamp, normalize } from "../utils";

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
    STEPPING: ({ action, transition, getState }) => {
      const root = getState();
      const player = Object.values(root.playerBody)[0]?.context;
      const delta = Math.min(action.payload.delta / 1000, 0.05);

      if (root.gameSession.context.status !== "running" || !player) {
        transition({ type: "MOVE_DONE" });
        return;
      }

      const input = normalize(root.playerInput.context);
      transition({
        type: "PLAYER_MOVE",
        payload: {
          x: clamp(player.x + input.x * PLAYER_SPEED * delta, WORLD.padding, WORLD.width - WORLD.padding),
          y: clamp(player.y + input.y * PLAYER_SPEED * delta, WORLD.padding, WORLD.height - WORLD.padding),
          vx: input.x * PLAYER_SPEED,
          vy: input.y * PLAYER_SPEED,
        },
        meta: { groupTag: "player" },
      });

      for (const [actorId, { context: enemy }] of Object.entries(root.enemyBody)) {
        const direction = normalize({ x: player.x - enemy.x, y: player.y - enemy.y });

        transition({
          type: "ENEMY_MOVE",
          payload: {
            x: enemy.x + direction.x * enemy.speed * delta,
            y: enemy.y + direction.y * enemy.speed * delta,
            vx: direction.x * enemy.speed,
            vy: direction.y * enemy.speed,
          },
          meta: { actorId },
        });
      }

      transition({ type: "MOVE_DONE" });
    },
  },
});
