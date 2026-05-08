import type {
  GraphState,
  GraphTarget,
  GraphTransition,
  LiteFsmGraphMachine,
} from "../../types";

const INCOMPLETE_UNKNOWN_LABELS = new Set([
  "*",
  "number",
  "boolean",
  "null",
  "undefined",
  "array",
  "object",
  "function",
]);

export const RESERVED_STATE_KEYS = new Set(["__INIT", "__RESOLVED", "__REJECTED", "__CANCELLED"]);

export const configTransitions = (machine: LiteFsmGraphMachine): GraphTransition[] => {
  return machine.transitions.filter((transition) => transition.layer === "config");
};

export const transitionSourceState = (
  statesById: ReadonlyMap<string, GraphState>,
  transition: GraphTransition,
): GraphState | undefined => {
  if (transition.source.kind !== "state") return undefined;

  return statesById.get(transition.source.stateId);
};

export const targetStateId = (target: GraphTarget): string | undefined => {
  if (target.kind !== "state") return undefined;

  return target.stateId;
};

const addReachableTarget = (reachable: Set<string>, pending: string[], transition: GraphTransition) => {
  const stateId = targetStateId(transition.target);
  if (!stateId || reachable.has(stateId)) return;

  reachable.add(stateId);
  pending.push(stateId);
};

export const reachableStateIds = (machine: LiteFsmGraphMachine): Set<string> => {
  const initial = machine.states.find((state) => state.key === machine.initialState);
  const reachable = new Set<string>();
  if (!initial) return reachable;

  const pending = [initial.id];
  reachable.add(initial.id);
  const transitions = configTransitions(machine);
  const wildcardTransitions = transitions.filter((transition) => transition.source.kind === "wildcard");

  while (pending.length > 0) {
    const stateId = pending.pop() as string;

    for (const transition of transitions) {
      if (transition.source.kind !== "state" || transition.source.stateId !== stateId) continue;

      addReachableTarget(reachable, pending, transition);
    }

    for (const transition of wildcardTransitions) {
      addReachableTarget(reachable, pending, transition);
    }
  }

  return reachable;
};

export const isIncompleteUnknownTarget = (target: Extract<GraphTarget, { kind: "unknown" }>): boolean => {
  if (!target.label) return false;

  return target.label.startsWith("LFG_") || INCOMPLETE_UNKNOWN_LABELS.has(target.label);
};

export const isReservedState = (state: GraphState): boolean => RESERVED_STATE_KEYS.has(state.key);
