import type { GraphDiagnostic } from "@lite-fsm/graph";
import type {
  GraphSimulationSliceRef,
  GraphSimulationSnapshot,
  GraphSendResult,
} from "@lite-fsm/graph/simulator";
import { createWorkbenchDiagnostic } from "../diagnostics";
import type { WorkbenchDiagnosticRef } from "../diagnostics";
import type { VisualizerWorkbenchRowCommandTarget } from "../services";
import type { VisualizerCommandResult } from "./types";

export type ActiveSliceResolution =
  | { ok: true; slice: GraphSimulationSliceRef }
  | { ok: false; reason: "missing-simulation-session" | "ambiguous-row-slice" };

const controlledDiagnostic = (
  sourceVersion: number,
  code: string,
  message: string,
): WorkbenchDiagnosticRef =>
  createWorkbenchDiagnostic({
    diagnosticId: `simulator:${sourceVersion}:${code}`,
    sourceVersion,
    origin: "simulator",
    code,
    severity: "warning",
    message,
    sourceAnchors: [],
    primaryTarget: { kind: "console" },
  });

export const simulatorDiagnostics = (
  sourceVersion: number,
  diagnostics: readonly GraphDiagnostic[],
  prefix: string,
): readonly WorkbenchDiagnosticRef[] =>
  diagnostics.map((diagnostic, index) =>
    createWorkbenchDiagnostic({
      diagnosticId: `simulator:${sourceVersion}:${prefix}:${index}:${diagnostic.code}`,
      sourceVersion,
      origin: "simulator",
      code: diagnostic.code,
      severity: diagnostic.severity,
      message: diagnostic.message,
      sourceAnchors: [],
      primaryTarget: { kind: "console" },
    }),
  );

export const resolveActiveMachineSlice = (
  snapshot: GraphSimulationSnapshot | undefined,
  machineId: string,
): ActiveSliceResolution => {
  if (!snapshot) return { ok: false, reason: "missing-simulation-session" };

  const sliceIds = [
    snapshot.domainSlicesByMachineId[machineId],
    snapshot.actorTemplateSlicesByMachineId[machineId],
    ...(snapshot.actorSliceIdsByMachineId[machineId] ?? []),
  ].filter((sliceId): sliceId is string => Boolean(sliceId));

  if (sliceIds.length !== 1) return { ok: false, reason: "ambiguous-row-slice" };

  const slice = snapshot.slices[sliceIds[0]];
  return slice ? { ok: true, slice: slice.ref } : { ok: false, reason: "ambiguous-row-slice" };
};

export const transitionCommandTarget = (
  snapshot: GraphSimulationSnapshot | undefined,
  machineId: string,
  rowId: string,
  transitionId: string,
): VisualizerWorkbenchRowCommandTarget | undefined => {
  const resolution = resolveActiveMachineSlice(snapshot, machineId);
  if (!resolution.ok) return undefined;

  return {
    kind: "transition",
    machineId,
    rowId,
    transitionId,
    slice: resolution.slice,
  };
};

export const emissionCommandTarget = (
  snapshot: GraphSimulationSnapshot | undefined,
  machineId: string,
  rowId: string,
  emissionId: string,
): VisualizerWorkbenchRowCommandTarget | undefined => {
  const resolution = resolveActiveMachineSlice(snapshot, machineId);
  if (!resolution.ok) return undefined;

  return {
    kind: "emission",
    machineId,
    rowId,
    emissionId,
    slice: resolution.slice,
  };
};

export const commandResultForMissingTarget = (
  sourceVersion: number,
  snapshot: GraphSimulationSnapshot | undefined,
  target: Pick<VisualizerWorkbenchRowCommandTarget, "machineId">,
): VisualizerCommandResult => {
  const resolution = resolveActiveMachineSlice(snapshot, target.machineId);
  if (resolution.ok) return { ok: true };

  return {
    ok: false,
    reason: resolution.reason,
    diagnostics:
      resolution.reason === "ambiguous-row-slice"
        ? [
            controlledDiagnostic(
              sourceVersion,
              "ambiguous-row-slice",
              `Machine '${target.machineId}' does not resolve to exactly one active simulator slice.`,
            ),
          ]
        : [],
  };
};

export const commandResultFromSendResult = (
  sourceVersion: number,
  result: GraphSendResult,
): VisualizerCommandResult => {
  if (result.ok) return { ok: true };

  return {
    ok: false,
    reason: "simulator-rejected",
    diagnostics: simulatorDiagnostics(sourceVersion, result.diagnostics, result.reason),
  };
};
