import type { GraphState, LiteFsmGraphMachine } from "../types";
import { getSuggestedEmissionsForSnapshot } from "./emissions";
import { evaluateTarget } from "./evaluate";
import { resolveAvailableTransitions } from "./resolve";
import { cloneSnapshot, createSnapshot, createStateIndex, isTerminalStateKey, type SimulatorStateIndex } from "./state";
import { notStartedResult, startFailure } from "./results";
import { runSimulationTransaction, type SimulationRuntime } from "./transaction";
import type {
  GraphChooseTransitionInput,
  GraphFollowEmissionInput,
  GraphSendInput,
  GraphSimulationSnapshot,
  GraphSimulator,
  GraphSimulatorOptions,
  GraphSimulatorStartResult,
} from "./types";

const isPublicActorState = (state: GraphState): boolean =>
  state.kind === "normal" && state.isPublicActorState && !isTerminalStateKey(state.key);

const uniqueStates = (states: GraphState[]): GraphState[] => {
  const seen = new Set<string>();

  return states.filter((state) => {
    if (seen.has(state.id)) return false;
    seen.add(state.id);

    return true;
  });
};

const inferActiveActorStart = (
  machine: LiteFsmGraphMachine,
  index: SimulatorStateIndex,
  initState: GraphState,
): GraphState[] => {
  const initSnapshot = createSnapshot(machine, initState);

  return uniqueStates(
    resolveAvailableTransitions(machine, index, initSnapshot)
      .map((transition) => evaluateTarget(machine, index, initSnapshot, transition.target))
      .map((evaluation) => (evaluation.ok ? index.stateById.get(evaluation.nextState.stateId) : undefined))
      .filter((state): state is GraphState => state !== undefined && isPublicActorState(state)),
  );
};

const findStartState = (
  machine: LiteFsmGraphMachine,
  index: SimulatorStateIndex,
  options: GraphSimulatorOptions,
): GraphState | GraphSimulatorStartResult => {
  if (machine.kind !== "actorTemplate") {
    const state = machine.initialState ? index.stateByKey.get(machine.initialState) : undefined;
    if (state) return state;

    return startFailure(machine, "unknown-start-state", [], "Simulator cannot resolve the machine initial state.");
  }

  const actorMode = options.actorMode ?? "spawnLifecycle";
  if (actorMode === "spawnLifecycle") {
    const state = index.stateByKey.get("__INIT");
    if (state) return state;

    return startFailure(machine, "unknown-start-state", [], "Simulator cannot resolve actor template __INIT state.");
  }

  if (options.startState) {
    const state = index.stateByKey.get(options.startState);
    if (state && isPublicActorState(state)) return state;

    return startFailure(machine, "unknown-start-state", [], "Simulator cannot resolve the active actor start state.");
  }

  const initState = index.stateByKey.get("__INIT");
  if (!initState) {
    return startFailure(machine, "unknown-start-state", [], "Simulator cannot resolve actor template __INIT state.");
  }

  const candidates = inferActiveActorStart(machine, index, initState);
  if (candidates.length === 1) return candidates[0]!;
  if (candidates.length > 1) {
    return startFailure(
      machine,
      "ambiguous-active-actor-start",
      candidates,
      "Active actor simulation needs an explicit startState because __INIT has multiple public targets.",
    );
  }

  return startFailure(
    machine,
    "missing-active-actor-start",
    candidates,
    "Active actor simulation needs an explicit startState.",
  );
};

export const createGraphSimulator = (
  machine: LiteFsmGraphMachine,
  options: GraphSimulatorOptions = {},
): GraphSimulator => {
  const index = createStateIndex(machine);
  const runtime: SimulationRuntime = { machine, index, options };
  let snapshot: GraphSimulationSnapshot | undefined;

  const applyOutcome = <R>(outcome: { result: R; snapshot?: GraphSimulationSnapshot }): R => {
    if (outcome.snapshot) snapshot = outcome.snapshot;

    return outcome.result;
  };

  const api: GraphSimulator = {
    start() {
      if (snapshot) return { ok: true, snapshot: cloneSnapshot(snapshot) };

      const startState = findStartState(machine, index, options);
      if ("ok" in startState) return startState;

      snapshot = createSnapshot(machine, startState);

      return { ok: true, snapshot: cloneSnapshot(snapshot) };
    },

    restart() {
      snapshot = undefined;

      return api.start();
    },

    getSnapshot() {
      return snapshot ? cloneSnapshot(snapshot) : undefined;
    },

    getAvailableTransitions() {
      return snapshot ? resolveAvailableTransitions(machine, index, snapshot) : [];
    },

    getSuggestedEmissions() {
      return snapshot ? getSuggestedEmissionsForSnapshot(machine, index, snapshot) : [];
    },

    send(input: GraphSendInput) {
      if (!snapshot) return notStartedResult(machine);

      return applyOutcome(runSimulationTransaction(runtime, snapshot, { kind: "send", input }));
    },

    choose(input: GraphChooseTransitionInput) {
      if (!snapshot) return notStartedResult(machine);

      return applyOutcome(runSimulationTransaction(runtime, snapshot, { kind: "choose", input }));
    },

    followEmission(input: GraphFollowEmissionInput) {
      if (!snapshot) return notStartedResult(machine);

      return applyOutcome(runSimulationTransaction(runtime, snapshot, { kind: "followEmission", input }));
    },
  };

  return api;
};
