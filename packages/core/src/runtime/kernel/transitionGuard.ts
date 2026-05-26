import type { DispatchHookPhase } from "../../pluginTypes";
import { LiteFsmError } from "../../utils";

export type TransitionGuardPhase =
  | "storage.prepareAction"
  | "storage.beforeReduce"
  | "storage.acceptsEvent"
  | "storage.reduce"
  | "storage.reduceBucket"
  | "storage.commit"
  | "storage.reactions"
  | "plugin.intercept"
  | `hook.${DispatchHookPhase}`;

export type GuardedCallbackRunner = <Result>(phase: TransitionGuardPhase, run: () => Result) => Result;

export const throwTransitionGuardError = (phase: TransitionGuardPhase): never => {
  throw new LiteFsmError(
    "LITE_FSM_REENTRANT_TRANSITION_FORBIDDEN",
    `[lite-fsm] transition cannot be called during dispatch phase '${phase}'.`,
  );
};
