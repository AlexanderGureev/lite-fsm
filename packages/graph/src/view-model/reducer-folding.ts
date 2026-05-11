import type { GraphTransition, LiteFsmGraphMachine } from "../types";
import { sourcesEqual, targetKey } from "./indexes";

export const isFoldedReducerTransition = (
  accepted: GraphTransition,
  candidate: GraphTransition,
): boolean =>
  accepted.layer === "config" &&
  candidate.layer === "reducer" &&
  !candidate.guard &&
  candidate.event.type === accepted.event.type &&
  sourcesEqual(candidate.source, accepted.source) &&
  targetKey(candidate.target) === targetKey(accepted.target);

export const foldedReducerTransitions = (
  machine: LiteFsmGraphMachine,
  accepted: GraphTransition,
): GraphTransition[] => machine.transitions.filter((candidate) => isFoldedReducerTransition(accepted, candidate));
