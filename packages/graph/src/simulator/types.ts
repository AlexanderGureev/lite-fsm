import type {
  GraphCondition,
  GraphDiagnostic,
  GraphEventRef,
  GraphRouting,
  GraphState,
  GraphStateRef,
  GraphTarget,
} from "../types";

export type ActorSimulationMode = "spawnLifecycle" | "activeActor";

export type GraphSimulatorOptions = {
  actorMode?: ActorSimulationMode;
  startState?: string;
};

export type GraphSimulator = {
  start(): GraphSimulatorStartResult;
  restart(): GraphSimulatorStartResult;
  getSnapshot(): GraphSimulationSnapshot | undefined;
  getAvailableTransitions(): GraphAvailableTransition[];
  getSuggestedEmissions(): GraphSuggestedEmission[];
  send(input: GraphSendInput): GraphSendResult;
  choose(input: GraphChooseTransitionInput): GraphSendResult;
  followEmission(input: GraphFollowEmissionInput): GraphFollowEmissionResult;
};

export type GraphSimulatorStartResult =
  | { ok: true; snapshot: GraphSimulationSnapshot }
  | {
      ok: false;
      reason: "missing-active-actor-start" | "ambiguous-active-actor-start" | "unknown-start-state";
      candidates: GraphState[];
      diagnostics: GraphDiagnostic[];
    };

export type GraphSimulationSnapshot = {
  machineId: string;
  stateId: string;
  stateKey: string;
  history: GraphSimulationStep[];
};

export type GraphSimulationStep = {
  event: string;
  acceptedTransitionId: string;
  effectiveTransitionId: string;
  transitionId: string;
  emissionId?: string;
  cause: "external" | "effect";
  from: string;
  to: string;
  guard?: string;
};

export type GraphAvailableTransition = {
  transitionId: string;
  acceptedTransitionId: string;
  effectiveTransitionId: string;
  event: GraphEventRef;
  source: GraphStateRef;
  target: GraphTarget;
  layer: "config" | "reducer";
  guard?: GraphCondition;
  reducerCaseId?: string;
  canApply: boolean;
  blockedReason?: "target-not-resolved" | "blocked-target";
};

export type GraphSendInput = {
  event: string;
};

export type GraphChooseTransitionInput = {
  transitionId: string;
};

export type GraphSendResult =
  | {
      ok: true;
      snapshot: GraphSimulationSnapshot;
      step: GraphSimulationStep;
      suggestedEmissions: GraphSuggestedEmission[];
    }
  | {
      ok: false;
      reason:
        | "not-started"
        | "event-not-accepted"
        | "ambiguous-transition"
        | "unknown-transition"
        | "target-not-resolved"
        | "blocked-target";
      snapshot?: GraphSimulationSnapshot;
      candidates?: GraphAvailableTransition[];
      diagnostics: GraphDiagnostic[];
    };

export type GraphSuggestedEmission = {
  emissionId: string;
  event: GraphEventRef;
  routing: GraphRouting;
  guard?: GraphCondition;
  canFollowLocally: boolean;
  blockedReason?: "event-not-accepted" | "non-local-routing";
};

export type GraphFollowEmissionInput = {
  emissionId: string;
};

export type GraphFollowEmissionResult =
  | {
      ok: true;
      snapshot: GraphSimulationSnapshot;
      step: GraphSimulationStep;
      suggestedEmissions: GraphSuggestedEmission[];
    }
  | {
      ok: false;
      reason:
        | "not-started"
        | "event-not-accepted"
        | "non-local-routing"
        | "unknown-emission"
        | "target-not-resolved"
        | "blocked-target"
        | "ambiguous-transition";
      snapshot?: GraphSimulationSnapshot;
      emission?: GraphSuggestedEmission;
      candidates?: GraphAvailableTransition[];
      diagnostics: GraphDiagnostic[];
    };
