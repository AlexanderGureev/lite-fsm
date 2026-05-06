import { ENEMY_HIT_EFFECT_FRAMES, ENEMY_HIT_FEEDBACK_DURATION, ENEMY_HIT_RECOIL } from "../constants";
import { createMachine } from "../create-machine";
import type { EnemyHitFeedbackContext, Vec2 } from "../types";

const deriveFeedback = (phase: number, direction: Vec2) => {
  const fade = 1 - phase;
  const push = Math.sin(phase * Math.PI) * ENEMY_HIT_RECOIL * fade;

  return {
    phase,
    recoil: { x: direction.x * push, y: direction.y * push },
    spriteScale: 1 + 0.18 * fade,
    flash: phase < 0.45,
    ringScale: 0.78 + 0.67 * phase,
    ringAlpha: 0.95 * fade,
    effectFrame: Math.min(ENEMY_HIT_EFFECT_FRAMES - 1, Math.floor(phase * ENEMY_HIT_EFFECT_FRAMES)),
    effectScale: 0.82 + 0.24 * phase,
    effectAlpha: fade,
  };
};

const initialContext: EnemyHitFeedbackContext = {
  entityId: "",
  x: 0,
  y: 0,
  direction: { x: 0, y: 0 },
  startedAt: 0,
  phase: 0,
  recoil: { x: 0, y: 0 },
  spriteScale: 1,
  flash: false,
  ringScale: 1,
  ringAlpha: 0,
  effectFrame: 0,
  effectScale: 1,
  effectAlpha: 0,
};

export const enemyHitFeedback = createMachine({
  groupTag: "enemy",
  config: {
    __INIT: { ENEMY_HIT_FEEDBACK_START: "ACTIVE" },
    ACTIVE: {
      TICK: null,
      DESPAWN: "__RESOLVED",
    },
  },
  initialState: "__INIT",
  initialContext,
  reducer: (state, action, { nextState }) => {
    state.state = nextState;

    switch (action.type) {
      case "ENEMY_HIT_FEEDBACK_START": {
        state.context.entityId = action.payload.entityId;
        state.context.x = action.payload.x;
        state.context.y = action.payload.y;
        state.context.direction = action.payload.direction;
        state.context.startedAt = action.payload.now;
        Object.assign(state.context, deriveFeedback(0, action.payload.direction));
        break;
      }
      case "TICK": {
        const phase = Math.min(
          1,
          Math.max(0, (action.payload.now - state.context.startedAt) / ENEMY_HIT_FEEDBACK_DURATION),
        );
        Object.assign(state.context, deriveFeedback(phase, state.context.direction));
        if (phase >= 1) state.state = "__RESOLVED";
        break;
      }
    }
  },
});
