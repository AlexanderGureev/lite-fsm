import type {
  GraphTransition,
  LiteFsmGraphDocument,
  LiteFsmGraphMachine,
  LiteFsmGraphManager,
  GraphState,
} from "../types";

export type GraphAnalysisIndex = {
  machinesById: ReadonlyMap<string, LiteFsmGraphMachine>;
  managersById: ReadonlyMap<string, LiteFsmGraphManager>;
  statesByMachineId: ReadonlyMap<string, ReadonlyMap<string, GraphState>>;
  stateKeysByMachineId: ReadonlyMap<string, ReadonlyMap<string, GraphState>>;
  acceptedEventsByMachineId: ReadonlyMap<string, ReadonlySet<string>>;
  acceptedEventsByStateId: ReadonlyMap<string, ReadonlySet<string>>;
  wildcardTransitionsByMachineId: ReadonlyMap<string, readonly GraphTransition[]>;
  scopedMachineIds: ReadonlySet<string>;
};

const addToSetMap = <K, V>(map: Map<K, Set<V>>, key: K, value: V) => {
  const existing = map.get(key);
  if (existing) {
    existing.add(value);
    return;
  }

  map.set(key, new Set([value]));
};

const sourceStateId = (transition: GraphTransition): string | undefined => {
  if (transition.source.kind !== "state") return undefined;

  return transition.source.stateId;
};

export const createGraphAnalysisIndex = (
  document: LiteFsmGraphDocument,
  scopedMachineIds: ReadonlySet<string>,
): GraphAnalysisIndex => {
  const machinesById = new Map<string, LiteFsmGraphMachine>();
  const managersById = new Map<string, LiteFsmGraphManager>();
  const statesByMachineId = new Map<string, Map<string, GraphState>>();
  const stateKeysByMachineId = new Map<string, Map<string, GraphState>>();
  const acceptedEventsByMachineId = new Map<string, Set<string>>();
  const acceptedEventsByStateId = new Map<string, Set<string>>();
  const wildcardTransitionsByMachineId = new Map<string, GraphTransition[]>();

  for (const manager of document.managers) {
    managersById.set(manager.id, manager);
  }

  for (const machine of document.machines) {
    machinesById.set(machine.id, machine);

    const statesById = new Map<string, GraphState>();
    const statesByKey = new Map<string, GraphState>();
    for (const state of machine.states) {
      statesById.set(state.id, state);
      statesByKey.set(state.key, state);
    }

    statesByMachineId.set(machine.id, statesById);
    stateKeysByMachineId.set(machine.id, statesByKey);

    for (const transition of machine.transitions) {
      if (transition.layer !== "config") continue;

      addToSetMap(acceptedEventsByMachineId, machine.id, transition.event.type);
      if (transition.source.kind === "wildcard") {
        const wildcardTransitions = wildcardTransitionsByMachineId.get(machine.id) ?? [];
        wildcardTransitions.push(transition);
        wildcardTransitionsByMachineId.set(machine.id, wildcardTransitions);
        continue;
      }

      const stateId = sourceStateId(transition);
      if (stateId) addToSetMap(acceptedEventsByStateId, stateId, transition.event.type);
    }
  }

  return {
    machinesById,
    managersById,
    statesByMachineId,
    stateKeysByMachineId,
    acceptedEventsByMachineId,
    acceptedEventsByStateId,
    wildcardTransitionsByMachineId,
    scopedMachineIds,
  };
};
