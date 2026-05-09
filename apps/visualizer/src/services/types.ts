import type { GraphDiagnostic, GraphJsonValue, LiteFsmGraphDocument } from "@lite-fsm/graph";
import type {
  CreateGraphSimulatorOptions,
  GraphAvailableTransition,
  GraphAvailableTransitionsInput,
  GraphChooseInput,
  GraphInitialContextOverride as SimulatorInitialContextOverride,
  GraphInitialStateOverride as SimulatorInitialStateOverride,
  GraphSendFromEmissionInput,
  GraphSendFromTransitionInput,
  GraphSendInput,
  GraphSendResult,
  GraphSimulationEvent,
  GraphSimulationScope,
  GraphSimulationSliceRef,
  GraphSimulationSnapshot,
  GraphSimulatorResetInput,
  GraphSimulatorStartResult,
  GraphSuggestedEmission,
  GraphSuggestedEmissionsInput,
} from "@lite-fsm/graph/simulator";
import type {
  GraphVisualizerModel,
  GraphVisualizerSimulationOverlayInput,
} from "@lite-fsm/graph/view-model";
import type { CodegenPlanner, SourcePatchPlan } from "../codegen";
import type { SourceSession } from "../source";
import type { DiagnosticProviderRegistry } from "../validation";
import type { WorkbenchDiagnosticRef } from "../diagnostics";

export type AsyncRequestMeta = {
  requestId: string;
  sourceVersion: number;
  signal?: AbortSignal;
};

export type CompileRequest = AsyncRequestMeta & {
  source: SourceSession;
};

export type CompileResponse =
  | { ok: true; sourceVersion: number; document: LiteFsmGraphDocument; diagnostics: readonly GraphDiagnostic[] }
  | { ok: false; sourceVersion: number; diagnostics: readonly WorkbenchDiagnosticRef[] };

export type AnalyzeRequest = AsyncRequestMeta & {
  document: LiteFsmGraphDocument;
};

export type AnalyzeResponse =
  | { ok: true; sourceVersion: number; diagnostics: readonly GraphDiagnostic[] }
  | { ok: false; sourceVersion: number; diagnostics: readonly WorkbenchDiagnosticRef[] };

export type BuildVisualizerModelRequest = AsyncRequestMeta & {
  document: LiteFsmGraphDocument;
  analysisDiagnostics: readonly GraphDiagnostic[];
  simulation?: GraphVisualizerSimulationOverlayInput;
};

export type BuildVisualizerModelResponse =
  | { ok: true; sourceVersion: number; model: GraphVisualizerModel }
  | { ok: false; sourceVersion: number; diagnostics: readonly WorkbenchDiagnosticRef[] };

export type GraphCompilerClient = {
  compile(input: CompileRequest): Promise<CompileResponse>;
};

export type GraphAnalyzerClient = {
  analyze(input: AnalyzeRequest): Promise<AnalyzeResponse>;
};

export type GraphVisualizerModelClient = {
  build(input: BuildVisualizerModelRequest): Promise<BuildVisualizerModelResponse>;
};

export type GraphSimulationSessionOptions = Omit<
  CreateGraphSimulatorOptions,
  "scope" | "initialStateOverrides" | "initialContextOverrides"
>;

export type CreateSimulationSessionRequest = {
  document: LiteFsmGraphDocument;
  sourceVersion: number;
  scope: GraphSimulationScope;
  simulatorOptions?: GraphSimulationSessionOptions;
  initialStateOverrides?: readonly SimulatorInitialStateOverride[];
  initialContextOverrides?: readonly SimulatorInitialContextOverride[];
};

export type GraphSimulationSession = {
  readonly sourceVersion: number;
  readonly scope: GraphSimulationScope;
  start(): GraphSimulatorStartResult;
  reset(input?: GraphSimulatorResetInput): GraphSimulatorStartResult;
  getSnapshot(): GraphSimulationSnapshot | undefined;
  getAvailableTransitions(input?: GraphAvailableTransitionsInput): readonly GraphAvailableTransition[];
  getSuggestedEmissions(input?: GraphSuggestedEmissionsInput): readonly GraphSuggestedEmission[];
  send(input: GraphSendInput): GraphSendResult;
  sendFromTransition(input: GraphSendFromTransitionInput): GraphSendResult;
  sendFromEmission(input: GraphSendFromEmissionInput): GraphSendResult;
  choose(input: GraphChooseInput): GraphSendResult;
  dispose(): void;
};

export type GraphSimulationService = {
  createSession(input: CreateSimulationSessionRequest): GraphSimulationSession;
};

export type VisualizerHostCapabilities = {
  mode: "static" | "local";
  canReadFiles: boolean;
  canWriteFiles: boolean;
  canApplyPatch: boolean;
  projectRoot?: string;
};

export type VisualizerHostState = {
  capabilities: VisualizerHostCapabilities;
};

export type PatchPreviewResult = {
  ok: false;
  reason: "not-supported";
};

export type ApplyPatchResult = {
  ok: false;
  reason: "not-supported";
};

export type VisualizerHostAdapter = {
  getCapabilities(): VisualizerHostCapabilities;
  readFile?(path: string): Promise<SourceSession>;
  previewPatch?(plan: SourcePatchPlan): Promise<PatchPreviewResult>;
  applyPatch?(plan: SourcePatchPlan): Promise<ApplyPatchResult>;
};

export type VisualizerWorkbenchRowCommandTarget = {
  machineId: string;
  rowId: string;
  slice: GraphSimulationSliceRef;
};

export type SimulationCommandEffect =
  | { kind: "simulation.send"; sourceVersion: number; event: GraphSimulationEvent }
  | {
      kind: "simulation.send-from-transition";
      sourceVersion: number;
      target: VisualizerWorkbenchRowCommandTarget;
      payload?: GraphJsonValue;
    }
  | {
      kind: "simulation.send-from-emission";
      sourceVersion: number;
      target: VisualizerWorkbenchRowCommandTarget;
      payload?: GraphJsonValue;
    }
  | {
      kind: "simulation.reset";
      sourceVersion: number;
      initialStateOverrides?: readonly SimulatorInitialStateOverride[];
      initialContextOverrides?: readonly SimulatorInitialContextOverride[];
    };

export type EffectRunnerServices = {
  compiler: GraphCompilerClient;
  analyzer: GraphAnalyzerClient;
  visualizerModel: GraphVisualizerModelClient;
  validation: DiagnosticProviderRegistry;
  codegen: CodegenPlanner;
};
