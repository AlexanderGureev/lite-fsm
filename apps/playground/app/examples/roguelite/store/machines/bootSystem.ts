import { PLAYER_MAX_HP, WORLD } from "../constants";
import { createMachine } from "../create-machine";

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
    SPAWNING: ({ transition, getState }) => {
      const root = getState();
      const actorIds = [
        ...Object.keys(root.playerBody),
        ...Object.keys(root.enemyBody),
        ...Object.keys(root.enemyHealth),
        ...Object.keys(root.enemyHitFeedback),
        ...Object.keys(root.projectileBody),
      ];

      if (actorIds.length) {
        transition({ type: "DESPAWN", meta: { actorId: actorIds } });
      }

      transition({
        type: "PLAYER_SPAWN",
        payload: { x: WORLD.width / 2, y: WORLD.height / 2, hp: PLAYER_MAX_HP },
      });
      transition({ type: "BOOT_DONE" });
    },
  },
});
