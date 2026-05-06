import type { FSMEvent } from "@lite-fsm/core";

import { createMachine } from "../create-machine";

export type Event = FSMEvent<"CHECK_ONBOARDING_RESOLVE"> | FSMEvent<"CHECK_ONBOARDING_REJECT">;

export const onboarding = createMachine({
  config: {
    "*": {
      SUBSCRIPTION_HYDRATED: "CHECK_ONBOARDING",
    },
    IDLE: {},
    CHECK_ONBOARDING: {
      CHECK_ONBOARDING_RESOLVE: "VISIBLE",
      CHECK_ONBOARDING_REJECT: "DISABLED",
    },
    VISIBLE: {},
    DISABLED: {},
  },
  initialState: "IDLE",
  initialContext: {
    checks: 0,
  },
  reducer: (state, event, { nextState }) => {
    state.state = nextState;
    if (event.type === "SUBSCRIPTION_HYDRATED") state.context.checks += 1;
  },
  effects: {
    CHECK_ONBOARDING: ({ action, getState, transition }) => {
      if (getState().profile.context.subscription?.id === "premium") {
        transition({ type: "CHECK_ONBOARDING_RESOLVE" });
      } else {
        transition({ type: "CHECK_ONBOARDING_REJECT" });
      }
    },
    "*": ({ action }) => {
      console.log(action);
    },
  },
});
