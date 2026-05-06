import { createMachine } from "../create-machine";

export const playerInput = createMachine({
  config: {
    READY: {
      GAME_BOOT: null,
      PAUSE_GAME: null,
      PLAYER_DEAD: null,
      PLAYER_INPUT: null,
    },
  },
  initialState: "READY",
  initialContext: { x: 0, y: 0 },
  reducer: (state, action, { nextState }) => {
    state.state = nextState;

    switch (action.type) {
      case "PLAYER_INPUT":
        state.context.x = action.payload.x;
        state.context.y = action.payload.y;
        break;
      case "GAME_BOOT":
      case "PAUSE_GAME":
      case "PLAYER_DEAD":
        state.context.x = 0;
        state.context.y = 0;
        break;
    }
  },
});
