import type {
  GraphEmission,
  GraphJsonObject,
  GraphState,
  GraphTransition,
  GraphValueSummary,
  LiteFsmGraphDocument,
  LiteFsmGraphMachine,
} from "@lite-fsm/graph";
import type { GraphSimulationSliceRef } from "@lite-fsm/graph/simulator";

export const stateId = (machineId: string, stateKey: string) => `${machineId}:state:${stateKey}`;

export const state = (machineId: string, key: string, kind: GraphState["kind"] = "normal"): GraphState => ({
  id: stateId(machineId, key),
  key,
  kind,
  isInitial: false,
  isPublicActorState: !key.startsWith("__"),
});

export const configTransition = (
  machineId: string,
  sourceKey: string,
  eventType: string,
  target: GraphTransition["target"],
  ordinal = 0,
): GraphTransition => ({
  id: `${machineId}:transition:config:${sourceKey}:${eventType}:${ordinal}`,
  machineId,
  source: sourceKey === "*" ? { kind: "wildcard" } : { kind: "state", stateId: stateId(machineId, sourceKey) },
  event: { type: eventType, source: "config" },
  target,
  layer: "config",
  order: ordinal,
  confidence: target.kind === "unknown" || target.kind === "dynamic" ? "unknown" : "exact",
});

export const machine = (input: {
  id: string;
  kind?: LiteFsmGraphMachine["kind"];
  initialState?: string;
  initialContextJson?: GraphJsonObject;
  initialContextSummary?: GraphValueSummary;
  groupTag?: string;
  states: GraphState[];
  transitions?: GraphTransition[];
  emissions?: GraphEmission[];
}): LiteFsmGraphMachine => ({
  id: input.id,
  index: 0,
  managerKeys: [],
  kind: input.kind ?? "domain",
  initialState: input.initialState,
  initialContextSummary: input.initialContextSummary,
  initialContextJson: input.initialContextJson,
  groupTag: input.groupTag,
  persistence: undefined,
  states: input.states,
  transitions: input.transitions ?? [],
  emissions: input.emissions ?? [],
  reducerCases: [],
  diagnostics: [],
});

export const documentFromMachines = (
  machines: LiteFsmGraphMachine[],
  managers: LiteFsmGraphDocument["managers"] = [],
): LiteFsmGraphDocument => ({
  version: "lite-fsm.graph/v1",
  source: { language: "ts" },
  machines: machines.map((item, index) => ({ ...item, index })),
  managers,
  diagnostics: [],
});

export const domainRef = (machineId: string): GraphSimulationSliceRef => ({ kind: "domain", machineId });
export const actorTemplateRef = (machineId: string): GraphSimulationSliceRef => ({ kind: "actorTemplate", machineId });

