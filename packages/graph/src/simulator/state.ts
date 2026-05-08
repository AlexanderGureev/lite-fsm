import type { GraphState, GraphStateRef, GraphTarget, LiteFsmGraphMachine } from "../types";
import type { GraphSimulationSnapshot, GraphSimulationStep } from "./types";

export type SimulatorStateIndex = {
  stateById: ReadonlyMap<string, GraphState>;
  stateByKey: ReadonlyMap<string, GraphState>;
};

const TERMINAL_KEYS = new Set(["__RESOLVED", "__REJECTED", "__CANCELLED"]);

export const createStateIndex = (machine: LiteFsmGraphMachine): SimulatorStateIndex => ({
  stateById: new Map(machine.states.map((state) => [state.id, state])),
  stateByKey: new Map(machine.states.map((state) => [state.key, state])),
});

export const isTerminalStateKey = (stateKey: string): boolean => TERMINAL_KEYS.has(stateKey);

export const isTerminalSnapshot = (snapshot: GraphSimulationSnapshot): boolean =>
  isTerminalStateKey(snapshot.stateKey);

export const isActorInitSnapshot = (
  machine: LiteFsmGraphMachine,
  snapshot: GraphSimulationSnapshot,
): boolean => machine.kind === "actorTemplate" && snapshot.stateKey === "__INIT";

export const stateRefMatches = (source: GraphStateRef, stateId: string): boolean =>
  source.kind === "state" && source.stateId === stateId;

export const isWildcardRef = (source: GraphStateRef): boolean => source.kind === "wildcard";

export const blockedReasonForTarget = (
  target: GraphTarget,
  index: SimulatorStateIndex,
): "target-not-resolved" | "blocked-target" | undefined => {
  if (target.kind === "blocked") return "blocked-target";
  if (target.kind === "dynamic" || target.kind === "unknown") return "target-not-resolved";
  if (target.kind === "state" && !index.stateById.has(target.stateId)) return "target-not-resolved";

  return undefined;
};

export const cloneSnapshot = (snapshot: GraphSimulationSnapshot): GraphSimulationSnapshot => ({
  ...snapshot,
  history: snapshot.history.map((step) => ({ ...step })),
});

export const createSnapshot = (
  machine: LiteFsmGraphMachine,
  state: GraphState,
  history: GraphSimulationStep[] = [],
): GraphSimulationSnapshot => ({
  machineId: machine.id,
  stateId: state.id,
  stateKey: state.key,
  history,
});
