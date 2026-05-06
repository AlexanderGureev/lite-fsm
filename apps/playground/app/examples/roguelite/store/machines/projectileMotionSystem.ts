import { WORLD } from "../constants";
import { createMachine } from "../create-machine";

export const projectileMotionSystem = createMachine({
  config: {
    READY: { TICK: "STEPPING" },
    STEPPING: { PROJECTILE_MOTION_DONE: "READY" },
  },
  initialState: "READY",
  initialContext: {},
  reducer: (state, _action, { nextState }) => {
    state.state = nextState;
  },
  effects: {
    STEPPING: ({ action, transition, getState }) => {
      const root = getState();
      const delta = Math.min(action.payload.delta / 1000, 0.05);

      if (root.gameSession.context.status !== "running") {
        transition({ type: "PROJECTILE_MOTION_DONE" });
        return;
      }

      for (const [actorId, { context: projectile }] of Object.entries(root.projectileBody)) {
        const ttl = projectile.ttl - delta;
        const x = projectile.x + projectile.vx * delta;
        const y = projectile.y + projectile.vy * delta;
        const isOutside =
          ttl <= 0 ||
          x < -WORLD.padding ||
          x > WORLD.width + WORLD.padding ||
          y < -WORLD.padding ||
          y > WORLD.height + WORLD.padding;

        if (isOutside) {
          transition({ type: "DESPAWN", meta: { actorId } });
        } else {
          transition({ type: "PROJECTILE_MOVE", payload: { x, y, ttl }, meta: { actorId } });
        }
      }

      transition({ type: "PROJECTILE_MOTION_DONE" });
    },
  },
});
