import type { LiteFsmGraphDocument } from "../types";
import type { CreateGraphSimulatorOptions, GraphSimulator } from "./types";
import { createGraphSimulatorInternal } from "./runtime";

export type {
  CreateGraphSimulatorOptions,
  GraphActorSimulationMode,
  GraphAvailableTransition,
  GraphAvailableTransitionsInput,
  GraphBranchSelectionPolicy,
  GraphChooseInput,
  GraphContextPatch,
  GraphEffectSimulationMode,
  GraphEvaluateTransitionInput,
  GraphEvaluateTransitionResult,
  GraphEvaluationPolicy,
  GraphInitialContextOverride,
  GraphInitialStateOverride,
  GraphReduceContextInput,
  GraphReduceContextResult,
  GraphResolvedTransitionCandidate,
  GraphSendFailureReason,
  GraphSendFromEmissionInput,
  GraphSendFromTransitionInput,
  GraphSendInput,
  GraphSendResult,
  GraphSimulationActorMeta,
  GraphSimulationBlockedReason,
  GraphSimulationChoice,
  GraphSimulationConsumption,
  GraphSimulationContext,
  GraphSimulationEvent,
  GraphSimulationEventMeta,
  GraphSimulationEventSource,
  GraphSimulationPendingChoice,
  GraphSimulationRowRef,
  GraphSimulationScope,
  GraphSimulationSlice,
  GraphSimulationSliceRef,
  GraphSimulationSnapshot,
  GraphSimulationTimeline,
  GraphSimulationTimelineStep,
  GraphSimulator,
  GraphSimulatorResetInput,
  GraphSimulatorStartFailureReason,
  GraphSimulatorStartResult,
  GraphStepSuggestedEmission,
  GraphSuggestedEmission,
  GraphSuggestedEmissionsInput,
  GraphTransitionChoiceOverride,
} from "./types";

export const createGraphSimulator = (
  document: LiteFsmGraphDocument,
  options?: CreateGraphSimulatorOptions,
): GraphSimulator => createGraphSimulatorInternal(document, options);

export const createMachineGraphSimulator = (
  document: LiteFsmGraphDocument,
  machineId: string,
  options?: Omit<CreateGraphSimulatorOptions, "scope">,
): GraphSimulator =>
  createGraphSimulator(document, {
    ...options,
    scope: { kind: "machines", machineIds: [machineId] },
  });
