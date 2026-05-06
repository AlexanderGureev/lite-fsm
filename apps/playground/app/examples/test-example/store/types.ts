import type { AppState } from ".";
import * as onboarding from "./machines/onboarding";
import * as profile from "./machines/profile";

export type AppEvents = onboarding.Event | profile.Event;

export type AppDeps = {
  getState: () => AppState;
};
