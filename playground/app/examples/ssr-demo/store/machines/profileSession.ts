import type { FSMEvent } from "lite-fsm";

import { createMachine } from "../create-machine";
import type { DemoProfile } from "../ssr";

type ProfileSessionContext = { profile: DemoProfile | null };

export type ProfileSessionEvent = FSMEvent<"INITIAL_PROFILE_SESSION", DemoProfile>;

export const profileSession = createMachine({
  config: {
    ANONYMOUS: { INITIAL_PROFILE_SESSION: "AUTHENTICATED" },
    AUTHENTICATED: {},
  },
  initialState: "ANONYMOUS",
  initialContext: { profile: null } as ProfileSessionContext,
  reducer: (state, action, { nextState }) => {
    state.state = nextState;
    if (action.type === "INITIAL_PROFILE_SESSION") {
      state.context.profile = action.payload;
    }
  },
});

export const selectProfileSessionProfile = (state: { profileSession: { context: ProfileSessionContext } }) =>
  state.profileSession.context.profile;
