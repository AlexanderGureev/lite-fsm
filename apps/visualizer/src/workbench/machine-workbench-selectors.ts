import type { GraphRouting, GraphRoutingTarget } from "@lite-fsm/graph";
import type {
  GraphMachineSummary,
  GraphMachineWorkbenchModel,
  GraphTargetView,
  GraphWorkbenchBadge,
  GraphWorkbenchRow,
  GraphWorkbenchRowSimulation,
  GraphWorkbenchStateBlock,
} from "@lite-fsm/graph/view-model";
import { buildWorkbenchCardModel, type WorkbenchCardModel } from "../cards";
import type { VisualizerWorkbenchRowCommandTarget } from "../services";
import { emissionCommandTarget, transitionCommandTarget } from "./simulation-adapter";
import { createSelector } from "./selectors";
import { sourceAction, type SourceActionView } from "./selector-utils";
import type { VisualizerSimulationState } from "./types";

export type MachinePickerRowView = {
  machineId: string;
  title: string;
  kind: GraphMachineSummary["kind"];
  groupTag?: string;
  selected: boolean;
  stateCount: number;
  diagnosticCount: number;
};

export type MachineWorkbenchRowActionView = {
  enabled: boolean;
  target?: VisualizerWorkbenchRowCommandTarget;
  reason?: "not-current" | "not-suggested" | "ambiguous-slice" | "read-only";
};

export type MachineWorkbenchRowView = {
  rowId: string;
  kind: GraphWorkbenchRow["kind"];
  layer: "config" | "reducer" | "effect" | "simulation";
  eventType: string;
  targetLabel: string;
  metaLabel: string;
  sourceAction: SourceActionView;
  simulation?: GraphWorkbenchRowSimulation;
  action: MachineWorkbenchRowActionView;
};

export type MachineStateBlockView = {
  stateId: string;
  stateKey: string;
  current: boolean;
  collapsed: boolean;
  badges: readonly GraphWorkbenchBadge[];
  rows: readonly MachineWorkbenchRowView[];
  sourceAction: SourceActionView;
};

export type MachineCardView = {
  card: WorkbenchCardModel;
  machineId: string;
  title: string;
  kind: GraphMachineWorkbenchModel["kind"];
  groupTag?: string;
  currentStateKey?: string;
  sourceAction: SourceActionView;
  states: readonly MachineStateBlockView[];
  globalRows: readonly MachineWorkbenchRowView[];
  actorApproximation: boolean;
};

export type SendEventOptionView = {
  eventType: string;
  group: "available" | "not-accepted";
};

export type TimelineStepView = {
  stepId: string;
  index: number;
  eventType: string;
  sourceLabel: string;
  acceptedMachines: readonly string[];
  rowRefCount: number;
  selected: boolean;
  empty: boolean;
};

export type MachineWorkbenchPanelView = {
  status: "empty" | "ready";
  totalMachines: number;
  selectedMachineIds: readonly string[];
  machineRows: readonly MachinePickerRowView[];
  cards: readonly MachineCardView[];
  sendOptions: readonly SendEventOptionView[];
  timeline: readonly TimelineStepView[];
  simulationStatus: VisualizerSimulationState["status"];
  diagnosticCount: number;
  actorApproximation: boolean;
};

const routingTargetLabel = (target: GraphRoutingTarget): string => {
  if (target.kind === "literal") return target.value;
  if (target.kind === "selfField") return `self.${target.field}`;
  if (target.kind === "dynamic") return target.label ?? "dynamic";

  return `[${target.items.map(routingTargetLabel).join(", ")}]`;
};

const routingLabel = (routing: GraphRouting): string => {
  if (routing.kind === "default" || routing.kind === "unscoped") return routing.kind;
  if (routing.kind === "unknown") return routing.label ?? "unknown";

  return `${routing.kind}:${routingTargetLabel(routing.target)}`;
};

const targetLabel = (target: GraphTargetView): string => target.label || target.blockedReason || "unknown";

const rowEventType = (row: GraphWorkbenchRow): string => {
  if (row.kind === "config" || row.kind === "reducer" || row.kind === "effect") return row.eventType;
  if (row.kind === "diagnostic") return row.severity;

  return row.label;
};

const rowTargetLabel = (row: GraphWorkbenchRow): string => {
  if (row.kind === "config" || row.kind === "reducer") return targetLabel(row.target);
  if (row.kind === "effect") return routingLabel(row.routing);
  if (row.kind === "diagnostic") return row.message;

  return row.reason;
};

const rowLayer = (row: GraphWorkbenchRow): MachineWorkbenchRowView["layer"] => {
  if (row.kind === "config" || row.kind === "reducer" || row.kind === "effect") return row.kind;

  return "simulation";
};

const rowMetaLabel = (row: GraphWorkbenchRow): string => {
  if (row.kind === "config") return row.confidence;
  if (row.kind === "reducer") return row.foldedIntoConfig ? `${row.confidence} folded` : row.confidence;
  if (row.kind === "effect") return row.dispatchability ?? row.confidence;
  if (row.kind === "diagnostic") return row.severity;

  return row.confidence;
};

const rowAction = (
  row: GraphWorkbenchRow,
  simulation: VisualizerSimulationState,
): MachineWorkbenchRowActionView => {
  if (row.kind === "config" || row.kind === "reducer") {
    const target = transitionCommandTarget(simulation.snapshot, row.machineId, row.rowId, row.transitionId);
    if (!row.simulation?.available) return { enabled: false, target, reason: "not-current" };

    return target ? { enabled: true, target } : { enabled: false, reason: "ambiguous-slice" };
  }

  if (row.kind === "effect") {
    const target = emissionCommandTarget(simulation.snapshot, row.machineId, row.rowId, row.emissionId);
    if (!row.simulation?.suggested || row.dispatchability !== "can-dispatch") {
      return { enabled: false, target, reason: "not-suggested" };
    }

    return target ? { enabled: true, target } : { enabled: false, reason: "ambiguous-slice" };
  }

  return { enabled: false, reason: "read-only" };
};

const rowSimulation = (row: GraphWorkbenchRow): GraphWorkbenchRowSimulation | undefined =>
  "simulation" in row ? row.simulation : undefined;

const rowView = (
  row: GraphWorkbenchRow,
  simulation: VisualizerSimulationState,
): MachineWorkbenchRowView => ({
  rowId: row.rowId,
  kind: row.kind,
  layer: rowLayer(row),
  eventType: rowEventType(row),
  targetLabel: rowTargetLabel(row),
  metaLabel: rowMetaLabel(row),
  sourceAction: sourceAction(rowEventType(row), row.sourceAnchors),
  simulation: rowSimulation(row),
  action: rowAction(row, simulation),
});

const stateBlockView = (
  state: GraphWorkbenchStateBlock,
  simulation: VisualizerSimulationState,
): MachineStateBlockView => ({
  stateId: state.stateId,
  stateKey: state.stateKey,
  current: state.current,
  collapsed: state.collapsed,
  badges: state.badges,
  rows: state.rows.map((row) => rowView(row, simulation)),
  sourceAction: sourceAction(state.stateKey, state.sourceAnchors),
});

const currentStateKey = (workbench: GraphMachineWorkbenchModel): string | undefined =>
  workbench.states.find((state) => state.current)?.stateKey ?? workbench.initialState;

const cardView = (
  workbench: GraphMachineWorkbenchModel,
  simulation: VisualizerSimulationState,
): MachineCardView => ({
  card: buildWorkbenchCardModel(workbench),
  machineId: workbench.machineId,
  title: workbench.title,
  kind: workbench.kind,
  groupTag: workbench.groupTag,
  currentStateKey: currentStateKey(workbench),
  sourceAction: sourceAction(workbench.title, workbench.sourceAnchors),
  states: workbench.states.map((state) => stateBlockView(state, simulation)),
  globalRows: workbench.globalBehavior.map((row) => rowView(row, simulation)),
  actorApproximation: workbench.kind === "actorTemplate",
});

const machineRow = (
  machine: GraphMachineSummary,
  selectedMachineIds: readonly string[],
): MachinePickerRowView => ({
  machineId: machine.machineId,
  title: machine.title,
  kind: machine.kind,
  groupTag: machine.groupTag,
  selected: selectedMachineIds.includes(machine.machineId),
  stateCount: machine.counts.states,
  diagnosticCount: machine.counts.diagnostics,
});

const eventTypesWithAvailableRows = (cards: readonly MachineCardView[]): ReadonlySet<string> =>
  new Set(
    cards.flatMap((card) =>
      [...card.globalRows, ...card.states.flatMap((state) => state.rows)]
        .filter((row) => row.simulation?.available)
        .map((row) => row.eventType),
    ),
  );

const sendOptions = (
  eventTypes: readonly string[],
  availableEventTypes: ReadonlySet<string>,
): readonly SendEventOptionView[] => [
  ...eventTypes.filter((eventType) => availableEventTypes.has(eventType)).map((eventType) => ({ eventType, group: "available" as const })),
  ...eventTypes.filter((eventType) => !availableEventTypes.has(eventType)).map((eventType) => ({ eventType, group: "not-accepted" as const })),
];

const sourceLabel = (step: TimelineStepViewSource): string => {
  if (step.kind === "initial") return "initial";
  if (step.kind === "external") return "external";
  if (step.kind === "manual-config") return "manual cfg";

  return "manual eff";
};

type TimelineStepViewSource = NonNullable<VisualizerSimulationState["snapshot"]>["timeline"]["stepsById"][string]["source"];

const timeline = (simulation: VisualizerSimulationState): readonly TimelineStepView[] => {
  const snapshot = simulation.snapshot;
  if (!snapshot) return [];

  return snapshot.timeline.linearStepIds.map((stepId) => {
    const step = snapshot.timeline.stepsById[stepId];
    const acceptedMachines = [...new Set(step.consumed.filter((item) => item.status === "committed").map((item) => item.machineId))];

    return {
      stepId,
      index: step.index,
      eventType: step.event?.type ?? "initial",
      sourceLabel: sourceLabel(step.source),
      acceptedMachines,
      rowRefCount: step.rowRefs.length,
      selected: stepId === simulation.inspectedStepId,
      empty: step.source.kind !== "initial" && acceptedMachines.length === 0,
    };
  });
};

export const selectMachineWorkbenchPanel = createSelector(
  (snapshot) => ({
    model: snapshot.state.model.model,
    l3: snapshot.state.l3,
    simulation: snapshot.state.simulation,
  }),
  ({ model, l3, simulation }): MachineWorkbenchPanelView => {
    if (!model) {
      return {
        status: "empty",
        totalMachines: 0,
        selectedMachineIds: l3.selectedMachineIds,
        machineRows: [],
        cards: [],
        sendOptions: [],
        timeline: [],
        simulationStatus: simulation.status,
        diagnosticCount: simulation.diagnostics.length,
        actorApproximation: false,
      };
    }

    const cards = l3.selectedMachineIds
      .map((machineId) => model.workbenchMachines[machineId])
      .filter((workbench): workbench is GraphMachineWorkbenchModel => Boolean(workbench))
      .map((workbench) => cardView(workbench, simulation));
    const availableEventTypes = eventTypesWithAvailableRows(cards);

    return {
      status: "ready",
      totalMachines: model.machines.length,
      selectedMachineIds: l3.selectedMachineIds,
      machineRows: model.machines.map((machine) => machineRow(machine, l3.selectedMachineIds)),
      cards,
      sendOptions: sendOptions(model.topics.map((topic) => topic.eventType), availableEventTypes),
      timeline: timeline(simulation),
      simulationStatus: simulation.status,
      diagnosticCount: simulation.diagnostics.length,
      actorApproximation: cards.some((card) => card.actorApproximation),
    };
  },
);
