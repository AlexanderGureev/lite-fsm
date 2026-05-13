import type {
  GraphDiagnosticAnchor,
  GraphSourceAnchor,
  GraphVisualizerModel,
} from "./types";

export type BuildMachineFlowModelInput = {
  model: GraphVisualizerModel;
  machineId: string;
};

export type MachineFlowModel =
  | { status: "missing-machine"; machineId: string }
  | {
      status: "ready";
      machine: MachineFlowMachine;
      nodes: readonly MachineFlowNode[];
      edgeGroups: readonly MachineFlowEdgeGroup[];
    };

export type MachineFlowMachine = {
  machineId: string;
  title: string;
  kind: "domain" | "actorTemplate" | "unknown";
  groupTag?: string;
  initialState?: string;
  currentStateKey?: string;
  sourceAnchors: readonly GraphSourceAnchor[];
  badges: readonly MachineFlowBadge[];
  counters: {
    states: number;
    transitions: number;
    reducerBranches: number;
    emissions: number;
    diagnostics: number;
  };
};

export type MachineFlowNode = {
  nodeId: string;
  ref:
    | { kind: "state"; stateId: string }
    | { kind: "wildcard-state" }
    | { kind: "wildcard-effect" }
    | {
        kind: "synthetic-target";
        targetKind: "dynamic" | "blocked" | "unknown";
      };
  label: string;
  role:
    | "normal"
    | "initial"
    | "current"
    | "terminal"
    | "spawn"
    | "wildcard"
    | "effect-source"
    | "synthetic";
  badges: readonly MachineFlowBadge[];
  sourceAnchors: readonly GraphSourceAnchor[];
  diagnosticIds: readonly string[];
  stats: {
    incoming: number;
    outgoing: number;
    selfLoops: number;
    emissions: number;
  };
};

export type MachineFlowEdgeKind =
  | "accepted-transition"
  | "self-emitted-transition"
  | "from-other-transition"
  | "emission-only";

export type MachineFlowEdgeGroup = {
  groupId: string;
  sourceNodeId: string;
  targetNodeId?: string;
  direction: "normal" | "self";
  kind: MachineFlowEdgeKind;
  layer: "config" | "reducer" | "effect" | "mixed";
  producerCategory: "external" | "self-emitted" | "from-other";
  label: string;
  count: number;
  rows: readonly MachineFlowRowRef[];
  producers: readonly MachineFlowProducerRef[];
  sourceAnchors: readonly GraphSourceAnchor[];
  diagnostics: readonly string[];
};

export type MachineFlowProducerRef = {
  machineId: string;
  machineTitle: string;
  emissionId: string;
  eventType: string;
  sourceStateKey: string | "*";
  routingLabel?: string;
  guardLabel?: string;
  confidence?: "exact" | "partial" | "unknown";
  sourceAnchors: readonly GraphSourceAnchor[];
};

export type MachineFlowRowRef =
  | {
      machineId: string;
      rowId: string;
      rowKind: "config" | "reducer";
      sourceStateKey: string | "*";
      eventType: string;
      targetLabel: string;
      guardLabel?: string;
      confidence?: "exact" | "partial" | "unknown";
      sourceAnchors: readonly GraphSourceAnchor[];
    }
  | {
      machineId: string;
      rowId: string;
      rowKind: "effect";
      eventType: string;
      routingLabel?: string;
      guardLabel?: string;
      confidence?: "exact" | "partial" | "unknown";
      sourceAnchors: readonly GraphSourceAnchor[];
    }
  | {
      machineId?: string;
      rowId: string;
      rowKind: "diagnostic";
      label: string;
      severity: GraphDiagnosticAnchor["diagnostic"]["severity"];
      sourceAnchors: readonly GraphSourceAnchor[];
    }
  | {
      machineId?: string;
      rowId: string;
      rowKind: "unknown";
      label: string;
      reason: string;
      confidence: "partial" | "unknown";
      sourceAnchors: readonly GraphSourceAnchor[];
    };

export type MachineFlowBadge = {
  kind:
    | "initial"
    | "current"
    | "terminal"
    | "spawn"
    | "wildcard"
    | "effect-source"
    | "group-tag"
    | "persistence"
    | "context-scoped"
    | "diagnostic"
    | "unknown";
  label: string;
};
