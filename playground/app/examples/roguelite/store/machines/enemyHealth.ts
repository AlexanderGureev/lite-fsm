import { ENEMY_BASE_HP } from "../constants";
import { createMachine } from "../create-machine";

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
