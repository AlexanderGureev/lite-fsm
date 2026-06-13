import type { FSMEvent } from "@lite-fsm/core";

import { createMachine } from "../create-machine";
import type { TickPayload } from "./world-machine";

export type Events =
  | FSMEvent<"START_BLINK_ACTOR", { id: string; maxTicks: number }>
  | FSMEvent<"FLASH_FROM_ENTITY", { source: string; intensity: number }>
  | FSMEvent<"BLINK_FLASHED">
  | FSMEvent<"STOP_BLINK_ACTOR", { id: string }>
  | FSMEvent<"TICK", TickPayload>
  | FSMEvent<"RESET_WORLD">;

type BlinkContext = {
  id: string;
  ticks: number;
  maxTicks: number;
  flashes: number;
  lastSource: string | null;
};

const initialContext: BlinkContext = {
  id: "",
  ticks: 0,
  maxTicks: 0,
  flashes: 0,
  lastSource: null,
};

export const blinkActor = createMachine({
  persistence: "snapshot",
  groupTag: "screen-flash",
  config: {
    __INIT: {
      START_BLINK_ACTOR: "VISIBLE",
    },
    VISIBLE: {
      TICK: null,
      FLASH_FROM_ENTITY: "FLASHING",
      STOP_BLINK_ACTOR: "__RESOLVED",
      RESET_WORLD: "__CANCELLED",
    },
    FLASHING: {
      TICK: null,
      FLASH_FROM_ENTITY: "FLASHING",
      BLINK_FLASHED: "VISIBLE",
      STOP_BLINK_ACTOR: "__RESOLVED",
      RESET_WORLD: "__CANCELLED",
    },
  },
  initialState: "__INIT",
  initialContext,
  reducer: (state, action, { nextState }) => {
    state.state = nextState;

    switch (action.type) {
      case "START_BLINK_ACTOR":
        state.context.id = action.payload.id;
        state.context.maxTicks = action.payload.maxTicks;
        state.context.ticks = 0;
        state.context.flashes = 0;
        state.context.lastSource = null;
        return;

      case "TICK":
        state.context.ticks += 1;
        return;

      case "FLASH_FROM_ENTITY":
        state.context.flashes += 1;
        state.context.lastSource = action.payload.source;
        return;
    }
  },
  effects: {
    FLASHING: ({ action, sprites, transition }) => {
      if (action.type !== "FLASH_FROM_ENTITY") {
        transition({ type: "BLINK_FLASHED" });
        return;
      }

      sprites.flash(action.payload.source, action.payload.intensity);
      transition({ type: "BLINK_FLASHED" });
    },
  },
  dehydrate: (slice) => slice.context,
  hydrate: (prev, snapshot: BlinkContext) => ({
    state: prev?.state ?? "VISIBLE",
    context: { ...initialContext, ...snapshot },
  }),
});
