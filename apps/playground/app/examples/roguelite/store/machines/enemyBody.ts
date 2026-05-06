import { ENEMY_BASE_SPEED, ENEMY_RADIUS } from "../constants";
import { createMachine } from "../create-machine";

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
