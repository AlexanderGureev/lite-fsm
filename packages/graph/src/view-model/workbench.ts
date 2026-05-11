import type {
  BuildMachineWorkbenchModelOptions,
  GraphDiagnosticAnchor,
  GraphMachineWorkbenchModel,
  GraphSourceAnchor,
  GraphWorkbenchBadge,
  GraphWorkbenchCapability,
  GraphWorkbenchRow,
} from "./types";
import type { GraphDiagnostic, GraphEmission, GraphState, GraphTransition, LiteFsmGraphMachine } from "../types";
import { configRowId, diagnosticRowId, effectRowId, reducerRowId } from "./ids";
import { machineTitle, sourceStateId, sourceStateKey, sourcesEqual } from "./indexes";
import { foldedReducerTransitions } from "./reducer-folding";
import { emissionAnchors, machineAnchors, stateAnchors, transitionAnchors } from "./source-anchors";
import { orderedUnique } from "./sort";
import { targetView } from "./targets";

type RowBuckets = {
  byStateId: Map<string, GraphWorkbenchRow[]>;
  global: GraphWorkbenchRow[];
};

const maybeSelectSource = (anchors: readonly GraphSourceAnchor[]): GraphWorkbenchCapability[] => {
  if (anchors.length === 0) return [];

  return [{ kind: "select-source", anchors }];
};

const transitionCapabilities = (
  transition: GraphTransition,
  anchors: readonly GraphSourceAnchor[],
): readonly GraphWorkbenchCapability[] => [
  { kind: "inspect", ref: { kind: "transition", machineId: transition.machineId, transitionId: transition.id } },
  ...maybeSelectSource(anchors),
  { kind: "send-event", machineId: transition.machineId, eventType: transition.event.type, transitionId: transition.id },
];

const emissionCapabilities = (
  emission: GraphEmission,
  anchors: readonly GraphSourceAnchor[],
): readonly GraphWorkbenchCapability[] => [
  { kind: "inspect", ref: { kind: "emission", machineId: emission.machineId, emissionId: emission.id } },
  ...maybeSelectSource(anchors),
  { kind: "follow-emission", machineId: emission.machineId, emissionId: emission.id },
];

const diagnosticCapabilities = (
  diagnostic: GraphDiagnosticAnchor,
  anchors: readonly GraphSourceAnchor[],
): readonly GraphWorkbenchCapability[] => [
  { kind: "inspect", ref: { kind: "diagnostic", diagnosticId: diagnostic.diagnosticId } },
  ...maybeSelectSource(anchors),
];

const sourceBucketId = (machine: LiteFsmGraphMachine, source: GraphTransition["source"] | GraphEmission["sourceState"]): string | undefined => {
  if (source === "*") return sourceStateId(machine, source);

  return sourceStateId(machine, source);
};

const pushSourceRow = (
  machine: LiteFsmGraphMachine,
  buckets: RowBuckets,
  source: GraphTransition["source"] | GraphEmission["sourceState"],
  row: GraphWorkbenchRow,
): void => {
  const stateId = sourceBucketId(machine, source);
  const target = stateId ? buckets.byStateId.get(stateId) : undefined;

  if (target) {
    target.push(row);
    return;
  }

  buckets.global.push(row);
};

const matchingAcceptedTransition = (
  machine: LiteFsmGraphMachine,
  reducerTransition: GraphTransition,
): GraphTransition | undefined => {
  return machine.transitions.find(
    (candidate) =>
      candidate.layer === "config" &&
      candidate.event.type === reducerTransition.event.type &&
      sourcesEqual(candidate.source, reducerTransition.source),
  );
};

const foldedReducerIds = (
  machine: LiteFsmGraphMachine,
  accepted: GraphTransition,
): string[] => foldedReducerTransitions(machine, accepted).map((transition) => transition.id);

const sourceStateIdForRow = (
  machine: LiteFsmGraphMachine,
  source: GraphTransition["source"],
): string => sourceStateId(machine, source) ?? source.kind;

const buildStateBadges = (
  machine: LiteFsmGraphMachine,
  state: GraphState,
  rows: readonly GraphWorkbenchRow[],
  diagnosticIds: readonly string[],
): readonly GraphWorkbenchBadge[] => {
  const badges: GraphWorkbenchBadge[] = [
    {
      kind: machine.kind === "actorTemplate" ? "actor-template" : "domain",
      label: machine.kind === "actorTemplate" ? "actor template" : "domain",
    },
  ];

  if (machine.groupTag) badges.push({ kind: "group-tag", label: machine.groupTag });
  if (state.isInitial || machine.initialState === state.key) badges.push({ kind: "initial", label: "initial" });
  if (state.kind === "wildcard") badges.push({ kind: "wildcard", label: "*" });
  if (state.key === "__INIT") badges.push({ kind: "spawn", label: "spawn" });
  if (state.kind === "terminal" || state.key === "__RESOLVED" || state.key === "__REJECTED" || state.key === "__CANCELLED") {
    badges.push({ kind: "terminal", label: "terminal" });
  }
  if (rows.some((row) => row.kind === "config")) badges.push({ kind: "config", label: "config" });
  if (rows.some((row) => row.kind === "reducer")) badges.push({ kind: "reducer", label: "reducer" });
  if (rows.some((row) => row.kind === "effect")) badges.push({ kind: "effect", label: "effect" });
  if (rows.some((row) => row.kind === "effect" && row.routing.kind !== "default")) badges.push({ kind: "routing", label: "routing" });
  if (diagnosticIds.length > 0) badges.push({ kind: "diagnostic", label: String(diagnosticIds.length) });
  if (rows.some((row) => "confidence" in row && row.confidence !== "exact")) badges.push({ kind: "confidence", label: "uncertain" });

  return badges;
};

const diagnosticTargetSource = (
  machine: LiteFsmGraphMachine,
  diagnostic: GraphDiagnosticAnchor,
): GraphTransition["source"] | GraphEmission["sourceState"] | undefined => {
  const ref = diagnostic.graphItemRef;
  if (!ref || !("machineId" in ref) || ref.machineId !== machine.id) return undefined;
  if (ref.kind === "state") return { kind: "state", stateId: ref.stateId };
  if (ref.kind === "transition") return machine.transitions.find((transition) => transition.id === ref.transitionId)?.source;
  if (ref.kind === "emission") return machine.emissions.find((emission) => emission.id === ref.emissionId)?.sourceState;

  return undefined;
};

const machineDiagnosticAnchors = (
  machine: LiteFsmGraphMachine,
  diagnostics: readonly GraphDiagnosticAnchor[],
): readonly GraphDiagnosticAnchor[] => {
  return diagnostics.filter((diagnostic) => {
    const ref = diagnostic.graphItemRef;
    if (diagnostic.diagnostic.machineId === machine.id) return true;

    return Boolean(ref && "machineId" in ref && ref.machineId === machine.id);
  });
};

const diagnosticSeverity = (
  diagnostics: readonly GraphDiagnosticAnchor[],
  diagnosticId: string,
): GraphDiagnostic["severity"] | undefined => diagnostics.find((diagnostic) => diagnostic.diagnosticId === diagnosticId)?.diagnostic.severity;

export const buildMachineWorkbenchModelFromDiagnostics = (
  machine: LiteFsmGraphMachine,
  diagnostics: readonly GraphDiagnosticAnchor[],
): GraphMachineWorkbenchModel => {
  const buckets: RowBuckets = {
    byStateId: new Map(machine.states.map((state) => [state.id, []])),
    global: [],
  };
  const foldedIds = new Set<string>();

  for (const transition of machine.transitions.filter((item) => item.layer === "config")) {
    const anchors = transitionAnchors(transition);
    const reducerIds = foldedReducerIds(machine, transition);
    reducerIds.forEach((id) => foldedIds.add(id));

    pushSourceRow(machine, buckets, transition.source, {
      kind: "config",
      rowId: configRowId(transition.id),
      machineId: machine.id,
      sourceStateId: sourceStateIdForRow(machine, transition.source),
      eventType: transition.event.type,
      acceptedTransitionId: transition.id,
      transitionId: transition.id,
      foldedReducerTransitionIds: reducerIds,
      target: targetView(machine, transition.target),
      guard: transition.guard,
      confidence: transition.confidence,
      capabilities: transitionCapabilities(transition, anchors),
      sourceAnchors: anchors,
    });
  }

  for (const transition of machine.transitions.filter((item) => item.layer === "reducer")) {
    if (foldedIds.has(transition.id)) continue;

    const anchors = transitionAnchors(transition);
    const accepted = matchingAcceptedTransition(machine, transition);

    pushSourceRow(machine, buckets, transition.source, {
      kind: "reducer",
      rowId: reducerRowId(transition.id),
      machineId: machine.id,
      sourceStateId: sourceStateIdForRow(machine, transition.source),
      eventType: transition.event.type,
      acceptedTransitionId: accepted?.id ?? transition.id,
      transitionId: transition.id,
      reducerCaseId: transition.reducerCaseId,
      target: targetView(machine, transition.target),
      guard: transition.guard,
      foldedIntoConfig: false,
      confidence: transition.confidence,
      capabilities: transitionCapabilities(transition, anchors),
      sourceAnchors: anchors,
    });
  }

  for (const emission of machine.emissions) {
    const anchors = emissionAnchors(emission);
    const stateId = sourceBucketId(machine, emission.sourceState);

    pushSourceRow(machine, buckets, emission.sourceState, {
      kind: "effect",
      rowId: effectRowId(emission.id),
      machineId: machine.id,
      ...(stateId ? { sourceStateId: stateId } : {}),
      sourceStateKey: sourceStateKey(machine, emission.sourceState),
      emissionId: emission.id,
      eventType: emission.event.type,
      routing: emission.routing,
      guard: emission.guard,
      confidence: emission.confidence,
      capabilities: emissionCapabilities(emission, anchors),
      sourceAnchors: anchors,
    });
  }

  const visibleDiagnostics = machineDiagnosticAnchors(machine, diagnostics);
  for (const diagnostic of visibleDiagnostics) {
    const anchors = diagnostic.sourceAnchor ? [diagnostic.sourceAnchor] : [];
    const row: GraphWorkbenchRow = {
      kind: "diagnostic",
      rowId: diagnosticRowId(diagnostic.diagnosticId),
      machineId: diagnostic.diagnostic.machineId,
      diagnosticId: diagnostic.diagnosticId,
      severity: diagnostic.diagnostic.severity,
      message: diagnostic.diagnostic.message,
      capabilities: diagnosticCapabilities(diagnostic, anchors),
      sourceAnchors: anchors,
    };
    const source = diagnosticTargetSource(machine, diagnostic);

    if (source) pushSourceRow(machine, buckets, source, row);
    else buckets.global.push(row);
  }

  const sourceAnchors = machineAnchors(machine);
  const states = machine.states.map((state) => {
    const rows = buckets.byStateId.get(state.id) as GraphWorkbenchRow[];
    const rowDiagnosticIds = rows.filter((row) => row.kind === "diagnostic").map((row) => row.diagnosticId);
    const directDiagnosticIds = visibleDiagnostics
      .filter((diagnostic) => diagnostic.graphItemRef?.kind === "state" && diagnostic.graphItemRef.stateId === state.id)
      .map((diagnostic) => diagnostic.diagnosticId);
    const diagnosticIds = orderedUnique([...directDiagnosticIds, ...rowDiagnosticIds]);
    const firstDiagnosticId = diagnosticIds[0];
    const severity = firstDiagnosticId ? diagnosticSeverity(visibleDiagnostics, firstDiagnosticId) : undefined;

    return {
      stateId: state.id,
      stateKey: state.key,
      kind: state.kind,
      badges: buildStateBadges(machine, state, rows, diagnosticIds).map((badge) =>
        badge.kind === "diagnostic" ? { ...badge, severity } : badge,
      ),
      current: false,
      collapsed: false,
      rows,
      sourceAnchors: stateAnchors(state),
      diagnosticIds,
    };
  });

  return {
    machineId: machine.id,
    title: machineTitle(machine),
    kind: machine.kind,
    groupTag: machine.groupTag,
    initialState: machine.initialState,
    states,
    globalBehavior: buckets.global,
    diagnostics: visibleDiagnostics,
    sourceAnchors,
  };
};

export const applyWorkbenchCollapse = (
  model: GraphMachineWorkbenchModel,
  collapse: BuildMachineWorkbenchModelOptions["collapse"] | undefined,
): GraphMachineWorkbenchModel => {
  if (!collapse || collapse.kind === "none") return model;

  return {
    ...model,
    states: model.states.map((state) => ({
      ...state,
      collapsed: !state.current && state.rows.length > collapse.rowThreshold,
    })),
  };
};
