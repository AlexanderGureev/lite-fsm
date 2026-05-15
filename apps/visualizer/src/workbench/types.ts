import type { GraphDiagnostic, GraphJsonValue, LiteFsmGraphDocument, LiteFsmGraphProjectFile } from "@lite-fsm/graph";
import type {
  GraphInitialContextOverride,
  GraphInitialStateOverride,
  GraphSimulationEvent,
  GraphSimulationPendingChoice,
  GraphSimulationScope,
  GraphSimulationSnapshot,
} from "@lite-fsm/graph/simulator";
import type { GraphSourceAnchor, GraphVisualizerModel, GraphVisualizerSimulationOverlayInput } from "@lite-fsm/graph/view-model";
import type { CanvasState } from "../canvas";
import type { CodegenPlanResult, CodegenState, SourceEditIntent } from "../codegen";
import type { ConsoleChannelFilter, ConsoleState } from "../console";
import type { WorkbenchDiagnosticRef } from "../diagnostics";
import type { SourceSession } from "../source";
import type { VisualizerHostCapabilities, VisualizerHostState, VisualizerWorkbenchRowCommandTarget } from "../services";
import type { LiteFsmProjectGraphExportDocument, LiteFsmProjectGraphSourceBundle, ProjectGraphExportParseIssue } from "../project-export";
import type { ValidationState } from "../validation";

type VisualizerTransitionRowCommandTarget = Extract<VisualizerWorkbenchRowCommandTarget, { kind: "transition" }>;
type VisualizerEmissionRowCommandTarget = Extract<VisualizerWorkbenchRowCommandTarget, { kind: "emission" }>;

export type VisualizerTab = "source" | "system" | "events" | "machines";

export type VisualizerInputMode =
  | { kind: "pasted-source"; source: SourceSession }
  | {
      kind: "project-export";
      fileName: string;
      document: LiteFsmGraphDocument;
      files: readonly LiteFsmGraphProjectFile[];
      entryPath: string;
      sources?: LiteFsmProjectGraphSourceBundle;
    }
  | {
      kind: "local-session";
      sessionId: string;
      capabilities: VisualizerHostCapabilities;
    };

export type CompileState = {
  status: "idle" | "running" | "ready" | "failed";
  requestId?: string;
  sequence: number;
  document?: LiteFsmGraphDocument;
  diagnostics: readonly WorkbenchDiagnosticRef[];
};

export type AnalysisState = {
  status: "idle" | "running" | "ready" | "failed";
  requestId?: string;
  diagnostics: readonly GraphDiagnostic[];
  appDiagnostics: readonly WorkbenchDiagnosticRef[];
};

export type ViewModelState = {
  status: "idle" | "running" | "ready" | "failed";
  requestId?: string;
  model?: GraphVisualizerModel;
  diagnostics: readonly WorkbenchDiagnosticRef[];
};

export type SystemViewState = {
  selectedMachineId?: string;
  hoveredMachineId?: string;
  selectedTopic?: string;
  hoveredTopic?: string;
  machineQuery: string;
  topicQuery: string;
};

export type EventCatalogViewState = {
  selectedTopic?: string;
  query: string;
};

export type MachineWorkbenchViewState = {
  selectedMachineIds: readonly string[];
};

export type VisualizerSimulationState = {
  status: "idle" | "running" | "blocked";
  scope: GraphSimulationScope;
  selectedMachineIds: readonly string[];
  initialStateOverrides?: readonly GraphInitialStateOverride[];
  initialContextOverrides?: readonly GraphInitialContextOverride[];
  snapshot?: GraphSimulationSnapshot;
  overlay?: GraphVisualizerSimulationOverlayInput;
  pendingChoice?: GraphSimulationPendingChoice;
  inspectedStepId?: string;
  recentlyFiredRowIds: readonly string[];
  diagnostics: readonly WorkbenchDiagnosticRef[];
};

export type SourceOverlayState = {
  sourceVersion: number;
  title: string;
  anchors: readonly GraphSourceAnchor[];
};

export type VisualizerPanelState = {
  sourceOverlay?: SourceOverlayState;
  console: {
    open: boolean;
    selectedEntryId?: string;
  };
};

export type VisualizerWorkbenchState = {
  host: VisualizerHostState;
  inputMode: VisualizerInputMode;
  inputVersion: number;
  source: SourceSession;
  compile: CompileState;
  analysis: AnalysisState;
  model: ViewModelState;
  validation: ValidationState;
  activeTab: VisualizerTab;
  panels: VisualizerPanelState;
  l1: SystemViewState;
  l2: EventCatalogViewState;
  l3: MachineWorkbenchViewState;
  simulation: VisualizerSimulationState;
  diagnostics: readonly WorkbenchDiagnosticRef[];
  console: ConsoleState;
  codegen: CodegenState;
  canvas: CanvasState;
};

export type WorkbenchRevisionIndex = {
  input: number;
  source: number;
  compile: number;
  analysis: number;
  model: number;
  validation: number;
  activeTab: number;
  l1: number;
  l2: number;
  l3: number;
  simulation: number;
  diagnostics: number;
  console: number;
  panels: number;
  codegen: number;
  canvas: number;
};

export type WorkbenchSnapshot = {
  state: VisualizerWorkbenchState;
  revisions: WorkbenchRevisionIndex;
};

export type VisualizerCommand =
  | { type: "source.changed"; source: string }
  | { type: "source.reset-to-sample" }
  | { type: "source.open-visualizer" }
  | { type: "project-export.loaded"; fileName: string; exportDocument: LiteFsmProjectGraphExportDocument }
  | { type: "input-mode.use-pasted-source" }
  | { type: "project-export.load.failed"; fileName: string; issue: ProjectGraphExportParseIssue }
  | { type: "tab.selected"; tab: VisualizerTab }
  | { type: "l1.machine-query.changed"; query: string }
  | { type: "l1.topic-query.changed"; query: string }
  | { type: "l1.machine.selected"; machineId: string }
  | { type: "l1.machine.hovered"; machineId: string }
  | { type: "l1.topic.selected"; eventType: string }
  | { type: "l1.topic.hovered"; eventType: string }
  | { type: "l1.hover.cleared" }
  | { type: "l1.topic.opened-in-event-catalog"; eventType: string }
  | { type: "l1.machine.opened-in-workbench"; machineId: string }
  | { type: "l2.query.changed"; query: string }
  | { type: "l2.topic.selected"; eventType: string }
  | { type: "l2.topic.opened-in-workbench"; eventType: string }
  | { type: "l3.machine.toggled"; machineId: string }
  | { type: "l3.selection.cleared" }
  | { type: "l3.event.sent"; event: GraphSimulationEvent }
  | { type: "l3.transition-row.sent"; target: VisualizerTransitionRowCommandTarget; payload?: GraphJsonValue }
  | { type: "l3.effect-row.followed"; target: VisualizerEmissionRowCommandTarget; payload?: GraphJsonValue }
  | {
      type: "l3.simulation.reset";
      initialStateOverrides?: readonly GraphInitialStateOverride[];
      initialContextOverrides?: readonly GraphInitialContextOverride[];
    }
  | { type: "l3.timeline.step.selected"; stepId: string }
  | { type: "canvas.machine-board.opened"; machineId: string }
  | { type: "canvas.machine-board.closed" }
  | { type: "source.overlay.opened"; title: string; anchors: readonly GraphSourceAnchor[] }
  | { type: "source.overlay.closed" }
  | { type: "panel.console.toggled"; open?: boolean }
  | { type: "console.channel.selected"; channel: ConsoleChannelFilter }
  | { type: "console.entry.selected"; entryId: string }
  | { type: "codegen.intent.created"; intent: SourceEditIntent };

export type VisualizerInternalCommand =
  | { type: "compile.succeeded"; requestId: string; sourceVersion: number; document: LiteFsmGraphDocument }
  | { type: "compile.failed"; requestId: string; sourceVersion: number; diagnostics: readonly WorkbenchDiagnosticRef[] }
  | { type: "analysis.succeeded"; requestId: string; sourceVersion: number; diagnostics: readonly GraphDiagnostic[] }
  | { type: "analysis.failed"; requestId: string; sourceVersion: number; diagnostics: readonly WorkbenchDiagnosticRef[] }
  | {
      type: "model.succeeded";
      requestId: string;
      sourceVersion: number;
      purpose?: "pipeline" | "simulation-overlay";
      model: GraphVisualizerModel;
    }
  | { type: "model.failed"; requestId: string; sourceVersion: number; diagnostics: readonly WorkbenchDiagnosticRef[] }
  | { type: "validation.succeeded"; requestId: string; sourceVersion: number; diagnostics: readonly WorkbenchDiagnosticRef[] }
  | { type: "validation.failed"; requestId: string; sourceVersion: number; diagnostics: readonly WorkbenchDiagnosticRef[] }
  | {
      type: "simulation.snapshot.changed";
      sourceVersion: number;
      snapshot?: GraphSimulationSnapshot;
      overlay?: GraphVisualizerSimulationOverlayInput;
      status?: VisualizerSimulationState["status"];
      pendingChoice?: GraphSimulationPendingChoice;
      diagnostics?: readonly WorkbenchDiagnosticRef[];
    }
  | { type: "codegen.plan.completed"; requestId: string; sourceVersion: number; result: CodegenPlanResult }
  | { type: "codegen.plan.failed"; requestId: string; sourceVersion: number; diagnostics: readonly WorkbenchDiagnosticRef[] };

export type WorkbenchEffectDescriptor =
  | { kind: "compile"; requestId: string; source: SourceSession }
  | { kind: "analyze"; requestId: string; sourceVersion: number; document: LiteFsmGraphDocument }
  | {
      kind: "build-model";
      requestId: string;
      purpose?: "pipeline" | "simulation-overlay";
      sourceVersion: number;
      document: LiteFsmGraphDocument;
      analysisDiagnostics: readonly GraphDiagnostic[];
      simulation?: GraphVisualizerSimulationOverlayInput;
    }
  | {
      kind: "run-validation";
      requestId: string;
      sourceVersion: number;
      document?: LiteFsmGraphDocument;
      model?: GraphVisualizerModel;
    }
  | {
      kind: "create-simulation-session";
      sourceVersion: number;
      document: LiteFsmGraphDocument;
      scope: GraphSimulationScope;
      initialStateOverrides?: readonly GraphInitialStateOverride[];
      initialContextOverrides?: readonly GraphInitialContextOverride[];
    }
  | { kind: "simulation.dispose"; sourceVersion: number }
  | { kind: "simulation.send"; sourceVersion: number; event: GraphSimulationEvent }
  | { kind: "simulation.send-from-transition"; sourceVersion: number; target: VisualizerTransitionRowCommandTarget; payload?: GraphJsonValue }
  | { kind: "simulation.send-from-emission"; sourceVersion: number; target: VisualizerEmissionRowCommandTarget; payload?: GraphJsonValue }
  | {
      kind: "simulation.reset";
      sourceVersion: number;
      initialStateOverrides?: readonly GraphInitialStateOverride[];
      initialContextOverrides?: readonly GraphInitialContextOverride[];
    }
  | { kind: "codegen.plan"; requestId: string; sourceVersion: number; sourceHash: string; intent: SourceEditIntent };

export type VisualizerCommandResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "stale-source-version"
        | "missing-document"
        | "missing-model"
        | "missing-machine"
        | "missing-simulation-session"
        | "ambiguous-row-slice"
        | "simulator-rejected"
        | "codegen-not-implemented";
      diagnostics: readonly WorkbenchDiagnosticRef[];
    };

export type WorkbenchCommandOutput = {
  result: VisualizerCommandResult;
  effects: readonly WorkbenchEffectDescriptor[];
};

export type WorkbenchSelector<T> = (snapshot: WorkbenchSnapshot) => T;

export type WorkbenchStore = {
  getSnapshot(): WorkbenchSnapshot;
  subscribe(listener: () => void): () => void;
  dispatch(command: VisualizerCommand | VisualizerInternalCommand): WorkbenchCommandOutput;
};

export type { CodegenState, SourceEditIntent } from "../codegen";
export type { ValidationState } from "../validation";
