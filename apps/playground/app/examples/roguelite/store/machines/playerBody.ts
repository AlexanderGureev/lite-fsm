import { PLAYER_MAX_HP, PLAYER_RADIUS, WORLD } from "../constants";
import { createMachine } from "../create-machine";

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
