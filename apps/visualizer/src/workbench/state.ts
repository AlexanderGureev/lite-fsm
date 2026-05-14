import { createInitialCanvasState } from "../canvas";
import { createInitialConsoleState } from "../console";
import { createStaticHostAdapter } from "../services";
import { MUSIC_APP_SAMPLE_SOURCE, createSourceSession } from "../source";
import type {
  AnalysisState,
  CodegenState,
  CompileState,
  EventCatalogViewState,
  MachineWorkbenchViewState,
  SystemViewState,
  ValidationState,
  ViewModelState,
  VisualizerPanelState,
  VisualizerSimulationState,
  VisualizerWorkbenchState,
  WorkbenchRevisionIndex,
  WorkbenchSnapshot,
} from "./types";

export const EMPTY_ARRAY: readonly never[] = [];

export const createInitialRevisions = (): WorkbenchRevisionIndex => ({
  input: 0,
  source: 0,
  compile: 0,
  analysis: 0,
  model: 0,
  validation: 0,
  activeTab: 0,
  l1: 0,
  l2: 0,
  l3: 0,
  simulation: 0,
  diagnostics: 0,
  console: 0,
  panels: 0,
  codegen: 0,
  canvas: 0,
});

export const createIdleCompileState = (): CompileState => ({
  status: "idle",
  sequence: 0,
  diagnostics: EMPTY_ARRAY,
});

export const createIdleAnalysisState = (): AnalysisState => ({
  status: "idle",
  diagnostics: EMPTY_ARRAY,
  appDiagnostics: EMPTY_ARRAY,
});

export const createIdleModelState = (): ViewModelState => ({
  status: "idle",
  diagnostics: EMPTY_ARRAY,
});

export const createIdleValidationState = (): ValidationState => ({
  status: "idle",
  providers: EMPTY_ARRAY,
  diagnostics: EMPTY_ARRAY,
});

export const createInitialSystemViewState = (): SystemViewState => ({
  machineQuery: "",
  topicQuery: "",
});

export const createInitialEventCatalogViewState = (): EventCatalogViewState => ({
  query: "",
});

export const createInitialMachineWorkbenchViewState = (): MachineWorkbenchViewState => ({
  selectedMachineIds: EMPTY_ARRAY,
});

export const createInitialSimulationState = (): VisualizerSimulationState => ({
  status: "idle",
  scope: { kind: "machines", machineIds: [] },
  selectedMachineIds: EMPTY_ARRAY,
  recentlyFiredRowIds: EMPTY_ARRAY,
  diagnostics: EMPTY_ARRAY,
});

export const createInitialPanelState = (): VisualizerPanelState => ({
  console: { open: false },
});

export const createIdleCodegenState = (): CodegenState => ({
  status: "idle",
  diagnostics: EMPTY_ARRAY,
});

export const createInitialWorkbenchState = (): VisualizerWorkbenchState => {
  const source = createSourceSession({ source: MUSIC_APP_SAMPLE_SOURCE, filename: "sample.ts" });

  return {
    host: { capabilities: createStaticHostAdapter().getCapabilities() },
    inputMode: { kind: "pasted-source", source },
    inputVersion: source.version,
    source,
    compile: createIdleCompileState(),
    analysis: createIdleAnalysisState(),
    model: createIdleModelState(),
    validation: createIdleValidationState(),
    activeTab: "source",
    panels: createInitialPanelState(),
    l1: createInitialSystemViewState(),
    l2: createInitialEventCatalogViewState(),
    l3: createInitialMachineWorkbenchViewState(),
    simulation: createInitialSimulationState(),
    diagnostics: EMPTY_ARRAY,
    console: createInitialConsoleState(),
    codegen: createIdleCodegenState(),
    canvas: createInitialCanvasState(),
  };
};

export const createInitialWorkbenchSnapshot = (): WorkbenchSnapshot => ({
  state: createInitialWorkbenchState(),
  revisions: createInitialRevisions(),
});
