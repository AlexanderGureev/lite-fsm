import type {
  GraphEffectRow,
  GraphMachineSimulationOverlayInput,
  GraphMachineWorkbenchModel,
  GraphVisualizerRowMappingDiagnostic,
  GraphVisualizerRowMappingIndex,
  GraphVisualizerSimulationOverlayInput,
  GraphVisualizerSimulationRowRef,
  GraphWorkbenchRow,
  GraphWorkbenchRowSimulation,
} from "./types";
import { machineEmissionKey, machineTransitionKey } from "./ids";

const withRowSimulation = (
  row: GraphWorkbenchRow,
  simulation: GraphWorkbenchRowSimulation,
): GraphWorkbenchRow => {
  const compact = Object.fromEntries(Object.entries(simulation).filter(([, value]) => value !== undefined));
  if (Object.keys(compact).length === 0) return row;

  return { ...row, simulation: compact } as GraphWorkbenchRow;
};

const transitionIds = (row: GraphWorkbenchRow): readonly string[] => {
  if (row.kind === "config") return [row.transitionId, ...row.foldedReducerTransitionIds];
  if (row.kind === "reducer") return [row.transitionId];

  return [];
};

const emissionId = (row: GraphWorkbenchRow): string | undefined => (row.kind === "effect" ? row.emissionId : undefined);

const applyRows = (
  rows: readonly GraphWorkbenchRow[],
  input: {
    currentStateId?: string;
    availableTransitionIds: ReadonlySet<string>;
    suggestedEmissionIds: ReadonlySet<string>;
    recentlyFiredRowIds: ReadonlySet<string>;
    inspectedRowIds: ReadonlySet<string>;
    currentStateIsTerminal?: boolean;
  },
): GraphWorkbenchRow[] => {
  return rows.map((row) => {
    const rowTransitionIds = transitionIds(row);
    const rowEmissionId = emissionId(row);
    const available = rowTransitionIds.some((id) => input.availableTransitionIds.has(id)) || undefined;
    const suggested = rowEmissionId ? input.suggestedEmissionIds.has(rowEmissionId) || undefined : undefined;
    const recentlyFired = input.recentlyFiredRowIds.has(row.rowId) || undefined;
    const inspected = input.inspectedRowIds.has(row.rowId) || undefined;
    const nextRow = withRowSimulation(row, { available, suggested, recentlyFired, inspected });

    if (nextRow.kind !== "effect") return nextRow;

    return withEffectDispatchability(nextRow, input);
  });
};

const withEffectDispatchability = (
  row: GraphEffectRow,
  input: {
    currentStateId?: string;
    suggestedEmissionIds: ReadonlySet<string>;
    currentStateIsTerminal?: boolean;
  },
): GraphEffectRow => {
  if (!input.suggestedEmissionIds.has(row.emissionId)) return row;
  if (row.routing.kind === "unknown") return { ...row, dispatchability: "unknown-routing" };
  if (input.currentStateIsTerminal) return { ...row, dispatchability: "terminal-slice" };
  if (row.sourceStateId && input.currentStateId && row.sourceStateId !== input.currentStateId) {
    return { ...row, dispatchability: "not-current-state" };
  }

  return { ...row, dispatchability: "can-dispatch" };
};

export const applyMachineSimulationOverlay = (
  model: GraphMachineWorkbenchModel,
  simulation: GraphMachineSimulationOverlayInput | undefined,
): GraphMachineWorkbenchModel => {
  if (!simulation) return model;

  const currentStateId = simulation.currentStateId;
  const availableTransitionIds = new Set(simulation.availableTransitionIds ?? []);
  const suggestedEmissionIds = new Set(simulation.suggestedEmissionIds ?? []);
  const recentlyFiredRowIds = new Set(simulation.recentlyFiredRowIds ?? []);
  const inspectedRowIds = new Set(simulation.inspectedRowIds ?? []);
  const currentStateIsTerminal = model.states.some((state) => state.stateId === currentStateId && state.kind === "terminal");
  const input = {
    currentStateId,
    availableTransitionIds,
    suggestedEmissionIds,
    recentlyFiredRowIds,
    inspectedRowIds,
    currentStateIsTerminal,
  };
  const states = model.states.map((state) => ({
    ...state,
    current: currentStateId === state.stateId,
    rows: applyRows(state.rows, input),
  }));

  return {
    ...model,
    currentStateId,
    states,
    globalBehavior: applyRows(model.globalBehavior, input),
  };
};

const addRowId = (map: Record<string, readonly string[]>, key: string, rowId: string): void => {
  map[key] = [...(map[key] ?? []), rowId];
};

const rowsOf = (workbenches: Record<string, GraphMachineWorkbenchModel>): GraphWorkbenchRow[] => {
  return Object.values(workbenches).flatMap((model) => [
    ...model.globalBehavior,
    ...model.states.flatMap((state) => state.rows),
  ]);
};

export const buildRowMappingIndex = (
  workbenches: Record<string, GraphMachineWorkbenchModel>,
  overlay?: GraphVisualizerSimulationOverlayInput,
): GraphVisualizerRowMappingIndex => {
  const transitionRowIdsByTransitionId: Record<string, readonly string[]> = {};
  const emissionRowIdsByEmissionId: Record<string, readonly string[]> = {};
  const transitionRowIdsByMachineAndTransitionId: Record<string, readonly string[]> = {};
  const emissionRowIdsByMachineAndEmissionId: Record<string, readonly string[]> = {};

  for (const row of rowsOf(workbenches)) {
    if (row.kind === "config" || row.kind === "reducer") {
      for (const transitionId of transitionIds(row)) {
        addRowId(transitionRowIdsByTransitionId, transitionId, row.rowId);
        addRowId(transitionRowIdsByMachineAndTransitionId, machineTransitionKey(row.machineId, transitionId), row.rowId);
      }
      continue;
    }

    if (row.kind === "effect") {
      const id = row.emissionId;
      addRowId(emissionRowIdsByEmissionId, id, row.rowId);
      addRowId(emissionRowIdsByMachineAndEmissionId, machineEmissionKey(row.machineId, id), row.rowId);
    }
  }

  const base = {
    transitionRowIdsByTransitionId,
    emissionRowIdsByEmissionId,
    transitionRowIdsByMachineAndTransitionId,
    emissionRowIdsByMachineAndEmissionId,
  };

  return {
    ...base,
    diagnostics: diagnosticsForOverlayRefs(base, overlay),
  };
};

const rowIdsForRef = (
  index: Omit<GraphVisualizerRowMappingIndex, "diagnostics">,
  ref: GraphVisualizerSimulationRowRef,
): readonly string[] => {
  if (ref.kind === "transition") {
    return index.transitionRowIdsByMachineAndTransitionId[machineTransitionKey(ref.machineId, ref.transitionId)] ?? [];
  }

  return index.emissionRowIdsByMachineAndEmissionId[machineEmissionKey(ref.machineId, ref.emissionId)] ?? [];
};

const diagnosticsForOverlayRefs = (
  index: Omit<GraphVisualizerRowMappingIndex, "diagnostics">,
  overlay: GraphVisualizerSimulationOverlayInput | undefined,
): GraphVisualizerRowMappingDiagnostic[] => {
  const refs = [...(overlay?.firedRefs ?? []), ...(overlay?.inspectedRefs ?? [])];

  return refs.flatMap((ref) => {
    const rowIds = rowIdsForRef(index, ref);
    if (rowIds.length === 1) return [];

    return [
      {
        code: rowIds.length === 0 ? "LFG_VIEW_MODEL_ROW_REF_NO_MATCH" : "LFG_VIEW_MODEL_ROW_REF_AMBIGUOUS",
        severity: "warning" as const,
        ref,
        rowIds,
        message:
          rowIds.length === 0
            ? `Simulation ${ref.kind} row ref does not match a workbench row.`
            : `Simulation ${ref.kind} row ref matches multiple workbench rows.`,
      },
    ];
  });
};

const mappedRowIds = (
  index: GraphVisualizerRowMappingIndex,
  refs: readonly GraphVisualizerSimulationRowRef[] | undefined,
): string[] => {
  return (refs ?? []).flatMap((ref) => {
    const rowIds = rowIdsForRef(index, ref);
    return rowIds.length === 1 ? [rowIds[0] as string] : [];
  });
};

const idsByMachineFromSliceFacts = (
  workbench: GraphMachineWorkbenchModel,
  sliceFacts: Record<string, readonly string[]> | undefined,
): string[] | undefined => {
  const machineRowIds = new Set(rowsOf({ [workbench.machineId]: workbench }).flatMap((row) => transitionIds(row)));
  const values = Object.values(sliceFacts ?? {}).flatMap((ids) => ids).filter((id) => machineRowIds.has(id));

  return values.length > 0 ? values : undefined;
};

const emissionIdsByMachineFromSliceFacts = (
  workbench: GraphMachineWorkbenchModel,
  sliceFacts: Record<string, readonly string[]> | undefined,
): string[] | undefined => {
  const machineEmissionIds = new Set(rowsOf({ [workbench.machineId]: workbench }).flatMap((row) => emissionId(row) ?? []));
  const values = Object.values(sliceFacts ?? {}).flatMap((ids) => ids).filter((id) => machineEmissionIds.has(id));

  return values.length > 0 ? values : undefined;
};

const currentStateForMachine = (
  workbench: GraphMachineWorkbenchModel,
  overlay: GraphVisualizerSimulationOverlayInput,
): string[] => {
  const stateIds = new Set(workbench.states.map((state) => state.stateId));
  const sliceStateIds = Object.values(overlay.currentStateIdsBySliceId ?? {}).filter((stateId) => stateIds.has(stateId));
  const unique = [...new Set(sliceStateIds)];
  if (unique.length > 0) return unique;

  const machineLevel = overlay.currentStateIdsByMachineId?.[workbench.machineId];
  return machineLevel ? [machineLevel] : [];
};

export const applyGraphSimulationOverlay = (
  workbenches: Record<string, GraphMachineWorkbenchModel>,
  overlay: GraphVisualizerSimulationOverlayInput | undefined,
  rowMappings: GraphVisualizerRowMappingIndex,
): Record<string, GraphMachineWorkbenchModel> => {
  if (!overlay) return workbenches;

  const recentlyFiredRowIds = new Set([...(overlay.recentlyFiredRowIds ?? []), ...mappedRowIds(rowMappings, overlay.firedRefs)]);
  const inspectedRowIds = new Set([...(overlay.inspectedRowIds ?? []), ...mappedRowIds(rowMappings, overlay.inspectedRefs)]);
  const result: Record<string, GraphMachineWorkbenchModel> = {};

  for (const [machineId, workbench] of Object.entries(workbenches)) {
    const sliceTransitionIds = idsByMachineFromSliceFacts(workbench, overlay.availableTransitionIdsBySliceId);
    const sliceEmissionIds = emissionIdsByMachineFromSliceFacts(workbench, overlay.suggestedEmissionIdsBySliceId);
    const currentStateIds = currentStateForMachine(workbench, overlay);
    const currentStateId = currentStateIds.length === 1 ? currentStateIds[0] : undefined;
    const currentStateIdSet = new Set(currentStateIds);
    const applied = applyMachineSimulationOverlay(workbench, {
      currentStateId,
      availableTransitionIds: sliceTransitionIds ?? overlay.availableTransitionIdsByMachineId?.[machineId] ?? [],
      suggestedEmissionIds: sliceEmissionIds ?? overlay.suggestedEmissionIdsByMachineId?.[machineId] ?? [],
      recentlyFiredRowIds: [...recentlyFiredRowIds],
      inspectedRowIds: [...inspectedRowIds],
    });

    result[machineId] =
      currentStateIds.length > 1
        ? {
            ...applied,
            states: applied.states.map((state) => ({
              ...state,
              current: currentStateIdSet.has(state.stateId),
            })),
          }
        : applied;
  }

  return result;
};
