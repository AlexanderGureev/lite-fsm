import { PROJECTILE_DAMAGE, PROJECTILE_RADIUS, PROJECTILE_TTL } from "../constants";
import { createMachine } from "../create-machine";

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
