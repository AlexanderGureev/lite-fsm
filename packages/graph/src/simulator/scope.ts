import type { GraphDiagnostic, LiteFsmGraphDocument, LiteFsmGraphMachine } from "../types";
import type {
  CreateGraphSimulatorOptions,
  GraphInitialContextOverride,
  GraphInitialStateOverride,
  GraphSimulationContext,
  GraphSimulationScope,
  GraphSimulationSlice,
  GraphSimulationSliceRef,
  GraphSimulationSnapshot,
  GraphSimulatorResetInput,
  GraphSimulatorStartFailureReason,
} from "./types";
import { diagnosticForStartFailure } from "./diagnostics";
import { createSliceId, refKey } from "./ids";
import { cloneJsonObject } from "./json";
import { findStateByKey } from "./semantics";
import { freezeSnapshot } from "./snapshot";
import { createRootTimeline } from "./timeline";

export const DEFAULT_SCOPE: GraphSimulationScope = { kind: "document" };

type StartBuildResult =
  | { ok: true; snapshot: GraphSimulationSnapshot }
  | { ok: false; reason: GraphSimulatorStartFailureReason; diagnostics: GraphDiagnostic[] };

type ScopedMachinesResult =
  | { ok: true; machines: LiteFsmGraphMachine[] }
  | { ok: false; reason: GraphSimulatorStartFailureReason; diagnostics: GraphDiagnostic[] };

const scopedMachines = (
  document: LiteFsmGraphDocument,
  scope: GraphSimulationScope,
): ScopedMachinesResult => {
  const machinesById = new Map(document.machines.map((machine) => [machine.id, machine]));

  if (scope.kind === "document") {
    if (document.machines.length === 0) {
      return {
        ok: false,
        reason: "empty-scope",
        diagnostics: [diagnosticForStartFailure("empty-scope", "Graph simulator scope does not contain machines.")],
      };
    }

    return { ok: true, machines: document.machines };
  }

  if (scope.kind === "manager") {
    const manager = document.managers.find((candidate) => candidate.id === scope.managerId);
    if (!manager) {
      return {
        ok: false,
        reason: "unknown-manager",
        diagnostics: [diagnosticForStartFailure("unknown-manager", `Unknown graph manager '${scope.managerId}'.`)],
      };
    }

    const managerMachineIds = new Set(manager.machineRefs.map((ref) => ref.machineId));
    const machines = document.machines.filter((machine) => managerMachineIds.has(machine.id));
    if (machines.length === 0) {
      return {
        ok: false,
        reason: "empty-scope",
        diagnostics: [diagnosticForStartFailure("empty-scope", `Graph manager '${scope.managerId}' has no machines.`)],
      };
    }

    return { ok: true, machines };
  }

  const requestedIds = new Set(scope.machineIds);
  const unknownId = [...requestedIds].find((machineId) => !machinesById.has(machineId));
  if (unknownId) {
    return {
      ok: false,
      reason: "unknown-machine",
      diagnostics: [diagnosticForStartFailure("unknown-machine", `Unknown graph machine '${unknownId}'.`, unknownId)],
    };
  }

  const machines = document.machines.filter((machine) => requestedIds.has(machine.id));
  if (machines.length === 0) {
    return {
      ok: false,
      reason: "empty-scope",
      diagnostics: [diagnosticForStartFailure("empty-scope", "Graph simulator scope does not contain machines.")],
    };
  }

  return { ok: true, machines };
};

const stateOverridesBySlice = (overrides: readonly GraphInitialStateOverride[]): Map<string, string> => {
  return new Map(overrides.map((override) => [refKey(override.slice), override.stateKey]));
};

const contextOverridesBySlice = (
  overrides: readonly GraphInitialContextOverride[],
): Map<string, GraphInitialContextOverride> => {
  return new Map(overrides.map((override) => [refKey(override.slice), override]));
};

const initialContextForSlice = (
  machine: LiteFsmGraphMachine,
  slice: GraphSimulationSliceRef,
  overrides: ReadonlyMap<string, GraphInitialContextOverride>,
): GraphSimulationContext | GraphDiagnostic => {
  const override = overrides.get(refKey(slice));
  if (override) {
    const context = cloneJsonObject(override.context);
    if (context === undefined) {
      return diagnosticForStartFailure(
        "invalid-initial-context",
        "Initial context override must be a JSON-safe object.",
        machine.id,
      );
    }

    return { kind: "json", value: context };
  }

  if (machine.initialContextJson) {
    const context = cloneJsonObject(machine.initialContextJson);
    if (context === undefined) {
      return diagnosticForStartFailure(
        "invalid-initial-context",
        "Machine initialContextJson must be a JSON-safe object.",
        machine.id,
      );
    }

    return { kind: "json", value: context };
  }
  if (machine.initialContextSummary) return { kind: "summary", summary: { ...machine.initialContextSummary } };

  return { kind: "unknown", reason: "initialContext is not represented in graph IR." };
};

const createInitialSlice = (
  machine: LiteFsmGraphMachine,
  ref: GraphSimulationSliceRef,
  stateOverrides: ReadonlyMap<string, string>,
  contextOverrides: ReadonlyMap<string, GraphInitialContextOverride>,
): GraphSimulationSlice | GraphDiagnostic => {
  const fallbackStateKey = ref.kind === "actorTemplate" ? "__INIT" : machine.initialState;
  const stateKey = stateOverrides.get(refKey(ref)) ?? fallbackStateKey;
  if (!stateKey) {
    return diagnosticForStartFailure("unknown-start-state", `Machine '${machine.id}' has no initial state.`, machine.id);
  }

  const state = findStateByKey(machine, stateKey);
  if (!state) {
    return diagnosticForStartFailure(
      "unknown-start-state",
      `Machine '${machine.id}' does not contain start state '${stateKey}'.`,
      machine.id,
    );
  }

  const context = initialContextForSlice(machine, ref, contextOverrides);
  if ("code" in context) return context;

  const sliceId = createSliceId(ref);

  return {
    sliceId,
    ref,
    machineId: machine.id,
    kind: ref.kind,
    stateId: state.id,
    stateKey: state.key,
    context,
    status: state.kind === "terminal" ? "terminal" : "active",
  };
};

export const buildInitialSnapshot = (
  document: LiteFsmGraphDocument,
  options: CreateGraphSimulatorOptions,
  resetInput?: GraphSimulatorResetInput,
): StartBuildResult => {
  if (options.actorMode && options.actorMode !== "template-approximation") {
    return {
      ok: false,
      reason: "unsupported-mode",
      diagnostics: [diagnosticForStartFailure("unsupported-mode", "Unsupported graph actor simulation mode.")],
    };
  }
  if (options.effectMode && options.effectMode !== "manual") {
    return {
      ok: false,
      reason: "unsupported-mode",
      diagnostics: [diagnosticForStartFailure("unsupported-mode", "Unsupported graph effect simulation mode.")],
    };
  }

  const scopeResult = scopedMachines(document, options.scope ?? DEFAULT_SCOPE);
  if (!scopeResult.ok) return scopeResult;

  const initialStateOverrides = resetInput?.initialStateOverrides ?? options.initialStateOverrides ?? [];
  const initialContextOverrides = resetInput?.initialContextOverrides ?? options.initialContextOverrides ?? [];
  const stateOverrides = stateOverridesBySlice(initialStateOverrides);
  const contextOverrides = contextOverridesBySlice(initialContextOverrides);
  const slices: Record<string, GraphSimulationSlice> = {};
  const domainSlicesByMachineId: Record<string, string> = {};
  const actorTemplateSlicesByMachineId: Record<string, string> = {};
  const actorSliceIdsByMachineId: Record<string, readonly string[]> = {};
  const diagnostics: GraphDiagnostic[] = [];

  for (const machine of scopeResult.machines) {
    actorSliceIdsByMachineId[machine.id] = [];
    const ref: GraphSimulationSliceRef =
      machine.kind === "actorTemplate" ? { kind: "actorTemplate", machineId: machine.id } : { kind: "domain", machineId: machine.id };
    const slice = createInitialSlice(machine, ref, stateOverrides, contextOverrides);
    if ("code" in slice) {
      return {
        ok: false,
        reason: slice.code === "LFG_SIM_INVALID_CONTEXT" ? "invalid-initial-context" : "unknown-start-state",
        diagnostics: [slice],
      };
    }

    slices[slice.sliceId] = slice;
    if (slice.kind === "domain") domainSlicesByMachineId[machine.id] = slice.sliceId;
    if (slice.kind === "actorTemplate") actorTemplateSlicesByMachineId[machine.id] = slice.sliceId;
  }

  const knownSliceKeys = new Set(Object.values(slices).map((slice) => refKey(slice.ref)));
  for (const key of [...stateOverrides.keys(), ...contextOverrides.keys()]) {
    if (knownSliceKeys.has(key)) continue;

    return {
      ok: false,
      reason: "unknown-machine",
      diagnostics: [diagnosticForStartFailure("unknown-machine", `Initial override references unknown slice '${key}'.`)],
    };
  }

  const snapshot: GraphSimulationSnapshot = {
    documentVersion: document.version,
    machineIds: scopeResult.machines.map((machine) => machine.id),
    slices,
    domainSlicesByMachineId,
    actorTemplateSlicesByMachineId,
    actorSliceIdsByMachineId,
    timeline: createRootTimeline(),
    diagnostics,
  };

  return { ok: true, snapshot: freezeSnapshot(snapshot) };
};
