export const SAMPLE_SOURCE = `import { createMachine } from "@lite-fsm/core";

export const playerMachine = createMachine({
  initialState: "idle",
  initialContext: { trackId: "intro" },
  config: {
    idle: {
      PLAY: "playing",
    },
    playing: {
      PAUSE: "paused",
      STOP: "idle",
    },
    paused: {
      PLAY: "playing",
      STOP: "idle",
    },
  },
});
`;
