import type {
  GraphEmission,
  GraphReducerCase,
  GraphState,
  GraphStateRef,
  GraphTransition,
  LiteFsmGraphDocument,
  LiteFsmGraphMachine,
} from "../types";

export type GraphVisualizerIndexes = {
  machinesById: Map<string, LiteFsmGraphMachine>;
  machineOrderById: Map<string, number>;
  statesByMachineId: Map<string, Map<string, GraphState>>;
  stateOrderByMachineId: Map<string, Map<string, number>>;
  stateKeyByIdByMachineId: Map<string, Map<string, string>>;
  transitionsByMachineId: Map<string, readonly GraphTransition[]>;
  emissionsByMachineId: Map<string, readonly GraphEmission[]>;
  reducerCasesByMachineId: Map<string, readonly GraphReducerCase[]>;
};

export const createGraphVisualizerIndexes = (
  document: LiteFsmGraphDocument,
): GraphVisualizerIndexes => {
  const machinesById = new Map<string, LiteFsmGraphMachine>();
  const machineOrderById = new Map<string, number>();
  const statesByMachineId = new Map<string, Map<string, GraphState>>();
  const stateOrderByMachineId = new Map<string, Map<string, number>>();
  const stateKeyByIdByMachineId = new Map<string, Map<string, string>>();
  const transitionsByMachineId = new Map<string, readonly GraphTransition[]>();
  const emissionsByMachineId = new Map<string, readonly GraphEmission[]>();
  const reducerCasesByMachineId = new Map<string, readonly GraphReducerCase[]>();

  document.machines.forEach((machine, machineOrder) => {
    machinesById.set(machine.id, machine);
    machineOrderById.set(machine.id, machineOrder);
    transitionsByMachineId.set(machine.id, machine.transitions);
    emissionsByMachineId.set(machine.id, machine.emissions);
    reducerCasesByMachineId.set(machine.id, machine.reducerCases);

    const statesById = new Map<string, GraphState>();
    const stateOrder = new Map<string, number>();
    const stateKeyById = new Map<string, string>();

    machine.states.forEach((state, index) => {
      statesById.set(state.id, state);
      stateOrder.set(state.id, index);
      stateKeyById.set(state.id, state.key);
    });

    statesByMachineId.set(machine.id, statesById);
    stateOrderByMachineId.set(machine.id, stateOrder);
    stateKeyByIdByMachineId.set(machine.id, stateKeyById);
  });

  return {
    machinesById,
    machineOrderById,
    statesByMachineId,
    stateOrderByMachineId,
    stateKeyByIdByMachineId,
    transitionsByMachineId,
    emissionsByMachineId,
    reducerCasesByMachineId,
  };
};

export const machineTitle = (machine: LiteFsmGraphMachine): string =>
  machine.variableName ?? machine.exportName ?? machine.id;

export const sourceStateId = (machine: LiteFsmGraphMachine, source: GraphStateRef | "*"): string | undefined => {
  if (source === "*") return machine.states.find((state) => state.kind === "wildcard")?.id;
  if (source.kind === "state") return source.stateId;
  if (source.kind === "wildcard") return machine.states.find((state) => state.kind === "wildcard")?.id;

  return undefined;
};

export const sourceStateKey = (machine: LiteFsmGraphMachine, source: GraphStateRef | "*"): string | "*" => {
  if (source === "*") return "*";
  if (source.kind === "wildcard") return "*";
  if (source.kind === "state") return machine.states.find((state) => state.id === source.stateId)?.key ?? source.stateId;

  return source.label ?? "unknown";
};

export const sourceRefKey = (source: GraphStateRef): string => {
  if (source.kind === "state") return `state:${source.stateId}`;
  if (source.kind === "wildcard") return "wildcard:*";

  return `unknown:${source.label ?? ""}`;
};

export const sourcesEqual = (left: GraphStateRef, right: GraphStateRef): boolean => sourceRefKey(left) === sourceRefKey(right);

export const targetKey = (target: GraphTransition["target"]): string => {
  if (target.kind === "state") return `state:${target.stateId}`;
  if (target.kind === "terminal") return `terminal:${target.terminal}`;
  if (target.kind === "blocked") return `blocked:${target.reason}`;
  if (target.kind === "dynamic") return `dynamic:${target.label ?? ""}`;
  if (target.kind === "unknown") return `unknown:${target.label ?? ""}`;

  return "self";
};
