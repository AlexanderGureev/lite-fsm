import type { DemoProfile } from "../ssr-demo";
import type { AppStore } from "./index";

export type StoreInitialSeeds = {
  profileSession?: DemoProfile;
};

type StoreSeedTarget = Pick<AppStore, "getState" | "transition">;

export const applyStoreInitialSeeds = (store: StoreSeedTarget, seeds?: StoreInitialSeeds) => {
  const profile = seeds?.profileSession;

  if (profile && store.getState().profileSession.context.profile?.id !== profile.id) {
    store.transition({ type: "INITIAL_PROFILE_SESSION", payload: profile });
  }
};
