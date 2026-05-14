import {
  clearCanvasOnPipelineInvalidation,
  closeMachineBoard,
  openMachineBoard,
} from "../canvas";
import {
  appendConsoleEntries,
  createConsoleEntryFromDiagnostic,
  createInitialConsoleState,
  createSystemConsoleEntry,
  resetConsoleEntries,
  selectConsoleChannel,
} from "../console";
import { createWorkbenchDiagnostic, normalizeGraphDiagnostics } from "../diagnostics";
import { STATIC_HOST_CAPABILITIES } from "../services";
import { MUSIC_APP_SAMPLE_SOURCE, createSourceSession } from "../source";
import {
  createIdleAnalysisState,
  createIdleCompileState,
  createIdleModelState,
  createIdleValidationState,
  createInitialEventCatalogViewState,
  createInitialMachineWorkbenchViewState,
  createInitialSimulationState,
  createInitialSystemViewState,
} from "./state";
import { withInspectedStep } from "./simulation-overlay";
import type {
  AnalysisState,
  CodegenState,
  CompileState,
  ValidationState,
  ViewModelState,
  VisualizerCommand,
  VisualizerCommandResult,
  VisualizerInternalCommand,
  VisualizerTab,
  VisualizerWorkbenchState,
  WorkbenchCommandOutput,
  WorkbenchEffectDescriptor,
  WorkbenchRevisionIndex,
  WorkbenchSnapshot,
} from "./types";

type RevisionKey = keyof WorkbenchRevisionIndex;

type Reduction = {
  snapshot: WorkbenchSnapshot;
  result: VisualizerCommandResult;
  effects: readonly WorkbenchEffectDescriptor[];
};

const OK: VisualizerCommandResult = { ok: true };
const NO_EFFECTS: readonly WorkbenchEffectDescriptor[] = [];
const INTERNAL_COMMAND_TYPES = {
  "compile.succeeded": true,
  "compile.failed": true,
  "analysis.succeeded": true,
  "analysis.failed": true,
  "model.succeeded": true,
  "model.failed": true,
  "validation.succeeded": true,
  "validation.failed": true,
  "simulation.snapshot.changed": true,
  "codegen.plan.completed": true,
  "codegen.plan.failed": true,
} as const satisfies Record<VisualizerInternalCommand["type"], true>;

const isInternalCommand = (
  command: VisualizerCommand | VisualizerInternalCommand,
): command is VisualizerInternalCommand => command.type in INTERNAL_COMMAND_TYPES;

const bumpRevisions = (
  revisions: WorkbenchRevisionIndex,
  changed: readonly RevisionKey[],
): WorkbenchRevisionIndex => {
  const next = { ...revisions };

  for (const key of changed) {
    next[key] += 1;
  }

  return next;
};

const unchanged = (snapshot: WorkbenchSnapshot, result: VisualizerCommandResult = OK): Reduction => ({
  snapshot,
  result,
  effects: NO_EFFECTS,
});

const effectOnly = (
  snapshot: WorkbenchSnapshot,
  effects: readonly WorkbenchEffectDescriptor[],
  result: VisualizerCommandResult = OK,
): Reduction => ({
  snapshot,
  result,
  effects,
});

const changed = (
  snapshot: WorkbenchSnapshot,
  state: VisualizerWorkbenchState,
  changedRevisions: readonly RevisionKey[],
  effects: readonly WorkbenchEffectDescriptor[] = NO_EFFECTS,
  result: VisualizerCommandResult = OK,
): Reduction => ({
  snapshot: {
    state,
    revisions: bumpRevisions(snapshot.revisions, changedRevisions),
  },
  result,
  effects,
});

const canvasRevision = (
  previous: VisualizerWorkbenchState,
  next: VisualizerWorkbenchState,
): readonly RevisionKey[] => (previous.canvas === next.canvas ? [] : ["canvas"]);

const clearCanvasForPipelineInvalidation = (
  state: VisualizerWorkbenchState,
): VisualizerWorkbenchState => {
  const canvas = clearCanvasOnPipelineInvalidation(state.canvas);
  if (canvas === state.canvas) return state;

  return { ...state, canvas };
};

const stale = (snapshot: WorkbenchSnapshot): Reduction =>
  unchanged(snapshot, { ok: false, reason: "stale-source-version", diagnostics: [] });

const nextInputVersion = (state: VisualizerWorkbenchState): number =>
  Math.max(state.inputVersion, state.source.version) + 1;

const currentInputVersion = (state: VisualizerWorkbenchState): number => state.inputVersion;

const disposeSimulationEffect = (snapshot: WorkbenchSnapshot): readonly WorkbenchEffectDescriptor[] =>
  snapshot.state.simulation.status === "idle" && !snapshot.state.simulation.snapshot
    ? NO_EFFECTS
    : [{ kind: "simulation.dispose", sourceVersion: currentInputVersion(snapshot.state) }];

const createSimulationSessionEffect = (
  state: VisualizerWorkbenchState,
  selectedMachineIds: readonly string[],
): WorkbenchEffectDescriptor | undefined => {
  if (selectedMachineIds.length === 0 || !state.compile.document || !state.model.model) return undefined;

  return {
    kind: "create-simulation-session",
    sourceVersion: currentInputVersion(state),
    document: state.compile.document,
    scope: { kind: "machines", machineIds: selectedMachineIds },
  };
};

const simulationModelRequestId = (state: VisualizerWorkbenchState): string =>
  `model:${currentInputVersion(state)}:simulation:${state.simulation.inspectedStepId ?? state.simulation.snapshot?.timeline.currentStepId ?? "none"}`;

const simulationModelEffect = (
  state: VisualizerWorkbenchState,
  simulation: VisualizerWorkbenchState["simulation"]["overlay"],
): WorkbenchEffectDescriptor | undefined => {
  if (!simulation || !state.compile.document || !state.model.model) return undefined;

  return {
    kind: "build-model",
    requestId: simulationModelRequestId(state),
    purpose: "simulation-overlay",
    sourceVersion: currentInputVersion(state),
    document: state.compile.document,
    analysisDiagnostics: state.analysis.diagnostics,
    simulation,
  };
};

const selectionEffects = (
  previous: WorkbenchSnapshot,
  nextState: VisualizerWorkbenchState,
  selectedMachineIds: readonly string[],
): readonly WorkbenchEffectDescriptor[] => {
  const createSession = createSimulationSessionEffect(nextState, selectedMachineIds);
  const dispose = disposeSimulationEffect(previous);

  return createSession ? [...dispose, createSession] : dispose;
};

const appendDiagnostics = (
  state: VisualizerWorkbenchState,
  diagnostics: readonly VisualizerWorkbenchState["diagnostics"][number][],
): VisualizerWorkbenchState => {
  if (diagnostics.length === 0) return state;

  return {
    ...state,
    diagnostics: [...state.diagnostics, ...diagnostics],
    console: appendConsoleEntries(state.console, diagnostics.map(createConsoleEntryFromDiagnostic)),
  };
};

const clearPipelinePanelSelection = (
  panels: VisualizerWorkbenchState["panels"],
): VisualizerWorkbenchState["panels"] => ({
  ...panels,
  sourceOverlay: undefined,
  console: {
    ...panels.console,
    selectedEntryId: undefined,
  },
});

const resetDerivedForSource = (state: VisualizerWorkbenchState): VisualizerWorkbenchState => ({
  ...state,
  compile: createIdleCompileState(),
  analysis: createIdleAnalysisState(),
  model: createIdleModelState(),
  validation: createIdleValidationState(),
  l1: createInitialSystemViewState(),
  l2: createInitialEventCatalogViewState(),
  l3: createInitialMachineWorkbenchViewState(),
  simulation: createInitialSimulationState(),
  diagnostics: [],
  console: createInitialConsoleState(),
  panels: clearPipelinePanelSelection(state.panels),
  canvas: clearCanvasOnPipelineInvalidation(state.canvas),
});

const createNextSourceSession = (
  state: VisualizerWorkbenchState,
  source: string,
): VisualizerWorkbenchState["source"] =>
  createSourceSession({
    source,
    filePath: state.source.filePath,
    filename: state.source.filename,
    language: state.source.language,
    version: nextInputVersion(state),
  });

const sourceChanged = (snapshot: WorkbenchSnapshot, source: string): Reduction => {
  if (source === snapshot.state.source.source && snapshot.state.inputMode.kind === "pasted-source") return unchanged(snapshot);

  const nextSource = createNextSourceSession(snapshot.state, source);

  const withSource = {
    ...snapshot.state,
    inputMode: { kind: "pasted-source" as const, source: nextSource },
    inputVersion: nextSource.version,
    source: nextSource,
  };

  const state = resetDerivedForSource(withSource);

  return changed(
    snapshot,
    state,
    [
      "input",
      "source",
      "compile",
      "analysis",
      "model",
      "validation",
      "l1",
      "l2",
      "l3",
      "simulation",
      "diagnostics",
      "console",
      "panels",
      ...canvasRevision(snapshot.state, state),
    ],
    disposeSimulationEffect(snapshot),
  );
};

const resetToSample = (snapshot: WorkbenchSnapshot): Reduction => sourceChanged(snapshot, MUSIC_APP_SAMPLE_SOURCE);

const ensurePastedSourceInput = (state: VisualizerWorkbenchState): VisualizerWorkbenchState => {
  if (state.inputMode.kind === "pasted-source" && state.inputVersion === state.source.version) return state;

  const source = createSourceSession({
    source: state.source.source,
    filePath: state.source.filePath,
    filename: state.source.filename,
    language: state.source.language,
    version: nextInputVersion(state),
  });

  return {
    ...state,
    inputMode: { kind: "pasted-source", source },
    inputVersion: source.version,
    source,
  };
};

const openVisualizer = (snapshot: WorkbenchSnapshot): Reduction => {
  const inputState = ensurePastedSourceInput(snapshot.state);
  const sequence = inputState.compile.sequence + 1;
  const requestId = `compile:${inputState.inputVersion}:${sequence}`;
  const compile: CompileState = {
    status: "running",
    requestId,
    sequence,
    diagnostics: [],
  };
  const console = appendConsoleEntries(resetConsoleEntries(snapshot.state.console), [
    createSystemConsoleEntry(
      inputState.inputVersion,
      `open:${sequence}`,
      "Source pipeline started",
      `Compiling ${inputState.source.filename ?? "source"} at version ${inputState.inputVersion}.`,
    ),
  ]);

  const state = {
    ...inputState,
    compile,
    analysis: createIdleAnalysisState(),
    model: createIdleModelState(),
    validation: createIdleValidationState(),
    l1: createInitialSystemViewState(),
    l2: createInitialEventCatalogViewState(),
    l3: createInitialMachineWorkbenchViewState(),
    simulation: createInitialSimulationState(),
    diagnostics: [],
    console,
    panels: clearPipelinePanelSelection(snapshot.state.panels),
    canvas: clearCanvasOnPipelineInvalidation(snapshot.state.canvas),
  };

  return changed(
    snapshot,
    state,
    [
      ...(inputState === snapshot.state ? [] : (["input", "source"] as const)),
      "compile",
      "analysis",
      "model",
      "validation",
      "l1",
      "l2",
      "l3",
      "simulation",
      "diagnostics",
      "console",
      "panels",
      ...canvasRevision(snapshot.state, state),
    ],
    [...disposeSimulationEffect(snapshot), { kind: "compile", requestId, source: inputState.source }],
  );
};

const requestMatches = (
  sourceVersion: number,
  expectedRequestId: string | undefined,
  requestId: string,
  currentInputVersion: number,
): boolean => sourceVersion === currentInputVersion && expectedRequestId === requestId;

const startDocumentPipeline = (
  snapshot: WorkbenchSnapshot,
  state: VisualizerWorkbenchState,
  inputVersion: number,
  document: NonNullable<VisualizerWorkbenchState["compile"]["document"]>,
  changedRevisions: readonly RevisionKey[],
  leadingEffects: readonly WorkbenchEffectDescriptor[] = NO_EFFECTS,
): Reduction => {
  const requestId = `analyze:${inputVersion}:1`;
  const analysis: AnalysisState = { status: "running", requestId, diagnostics: [], appDiagnostics: [] };

  return changed(
    snapshot,
    {
      ...state,
      analysis,
    },
    [...changedRevisions, "analysis"],
    [...leadingEffects, { kind: "analyze", requestId, sourceVersion: inputVersion, document }],
  );
};

const projectExportLoaded = (
  snapshot: WorkbenchSnapshot,
  command: Extract<VisualizerCommand, { type: "project-export.loaded" }>,
): Reduction => {
  const inputVersion = nextInputVersion(snapshot.state);
  const sequence = snapshot.state.compile.sequence + 1;
  const document = command.exportDocument.graph;
  const compile: CompileState = {
    status: "ready",
    sequence,
    document,
    diagnostics: [],
  };
  const console = appendConsoleEntries(resetConsoleEntries(snapshot.state.console), [
    createSystemConsoleEntry(
      inputVersion,
      `project-export:${sequence}`,
      "Project export pipeline started",
      `Loaded ${command.exportDocument.entry.path} from CLI JSON export.`,
    ),
  ]);
  const state = {
    ...snapshot.state,
    host: { capabilities: STATIC_HOST_CAPABILITIES },
    inputMode: {
      kind: "project-export" as const,
      document,
      files: command.exportDocument.files,
      entryPath: command.exportDocument.entry.path,
      ...(command.exportDocument.sources ? { sources: command.exportDocument.sources } : {}),
    },
    inputVersion,
    compile,
    analysis: createIdleAnalysisState(),
    model: createIdleModelState(),
    validation: createIdleValidationState(),
    l1: createInitialSystemViewState(),
    l2: createInitialEventCatalogViewState(),
    l3: createInitialMachineWorkbenchViewState(),
    simulation: createInitialSimulationState(),
    diagnostics: [],
    console,
    panels: clearPipelinePanelSelection(snapshot.state.panels),
    canvas: clearCanvasOnPipelineInvalidation(snapshot.state.canvas),
  };

  return startDocumentPipeline(
    snapshot,
    state,
    inputVersion,
    document,
    [
      "input",
      "compile",
      "model",
      "validation",
      "l1",
      "l2",
      "l3",
      "simulation",
      "diagnostics",
      "console",
      "panels",
      ...canvasRevision(snapshot.state, state),
    ],
    disposeSimulationEffect(snapshot),
  );
};

const projectExportLoadFailed = (
  snapshot: WorkbenchSnapshot,
  command: Extract<VisualizerCommand, { type: "project-export.load.failed" }>,
): Reduction => {
  const diagnostic = createWorkbenchDiagnostic({
    diagnosticId: `project-export:${snapshot.state.inputVersion}:${snapshot.state.console.entries.length}:${command.issue.code}`,
    sourceVersion: snapshot.state.inputVersion,
    origin: "source",
    code: `project-export-${command.issue.code}`,
    severity: "warning",
    message: `${command.fileName}: ${command.issue.message}`,
    sourceAnchors: [],
    primaryTarget: { kind: "console" },
  });
  const state = appendDiagnostics(snapshot.state, [diagnostic]);

  return changed(snapshot, state, ["diagnostics", "console"]);
};

const compileSucceeded = (
  snapshot: WorkbenchSnapshot,
  command: Extract<VisualizerInternalCommand, { type: "compile.succeeded" }>,
): Reduction => {
  if (!requestMatches(command.sourceVersion, snapshot.state.compile.requestId, command.requestId, snapshot.state.inputVersion)) {
    return stale(snapshot);
  }

  return startDocumentPipeline(
    snapshot,
    {
      ...snapshot.state,
      compile: { ...snapshot.state.compile, status: "ready", document: command.document, diagnostics: [] },
    },
    command.sourceVersion,
    command.document,
    ["compile"],
  );
};

const compileFailed = (
  snapshot: WorkbenchSnapshot,
  command: Extract<VisualizerInternalCommand, { type: "compile.failed" }>,
): Reduction => {
  if (!requestMatches(command.sourceVersion, snapshot.state.compile.requestId, command.requestId, snapshot.state.inputVersion)) {
    return stale(snapshot);
  }

  const state = appendDiagnostics(
    clearCanvasForPipelineInvalidation({
      ...snapshot.state,
      compile: { ...snapshot.state.compile, status: "failed", diagnostics: command.diagnostics },
    }),
    command.diagnostics,
  );

  return changed(snapshot, state, ["compile", "diagnostics", "console", ...canvasRevision(snapshot.state, state)]);
};

const analysisSucceeded = (
  snapshot: WorkbenchSnapshot,
  command: Extract<VisualizerInternalCommand, { type: "analysis.succeeded" }>,
): Reduction => {
  if (!requestMatches(command.sourceVersion, snapshot.state.analysis.requestId, command.requestId, snapshot.state.inputVersion)) {
    return stale(snapshot);
  }

  const document = snapshot.state.compile.document;
  if (!document) return unchanged(snapshot, { ok: false, reason: "missing-document", diagnostics: [] });

  const requestId = `model:${command.sourceVersion}:1`;
  const model: ViewModelState = { status: "running", requestId, diagnostics: [] };

  return changed(
    snapshot,
    {
      ...snapshot.state,
      analysis: { status: "ready", diagnostics: command.diagnostics, appDiagnostics: [] },
      model,
    },
    ["analysis", "model"],
    [
      {
        kind: "build-model",
        requestId,
        purpose: "pipeline",
        sourceVersion: command.sourceVersion,
        document,
        analysisDiagnostics: command.diagnostics,
      },
    ],
  );
};

const analysisFailed = (
  snapshot: WorkbenchSnapshot,
  command: Extract<VisualizerInternalCommand, { type: "analysis.failed" }>,
): Reduction => {
  if (!requestMatches(command.sourceVersion, snapshot.state.analysis.requestId, command.requestId, snapshot.state.inputVersion)) {
    return stale(snapshot);
  }

  const state = appendDiagnostics(
    {
      ...snapshot.state,
      analysis: { status: "failed", diagnostics: [], appDiagnostics: command.diagnostics },
    },
    command.diagnostics,
  );

  return changed(snapshot, state, ["analysis", "diagnostics", "console"]);
};

const modelSucceeded = (
  snapshot: WorkbenchSnapshot,
  command: Extract<VisualizerInternalCommand, { type: "model.succeeded" }>,
): Reduction => {
  const purpose = command.purpose ?? "pipeline";
  const matches =
    purpose === "simulation-overlay"
      ? command.sourceVersion === snapshot.state.inputVersion && command.requestId === simulationModelRequestId(snapshot.state)
      : requestMatches(command.sourceVersion, snapshot.state.model.requestId, command.requestId, snapshot.state.inputVersion);

  if (!matches) {
    return stale(snapshot);
  }

  if (purpose === "simulation-overlay") {
    return changed(
      snapshot,
      {
        ...snapshot.state,
        model: {
          ...snapshot.state.model,
          status: "ready",
          model: command.model,
          diagnostics: normalizeGraphDiagnostics({
            sourceVersion: command.sourceVersion,
            diagnostics: command.model.diagnostics,
          }),
        },
      },
      ["model"],
    );
  }

  const requestId = `validation:${command.sourceVersion}:1`;
  const validation: ValidationState = {
    ...snapshot.state.validation,
    status: "running",
    requestId,
  };
  const diagnostics = normalizeGraphDiagnostics({
    sourceVersion: command.sourceVersion,
    diagnostics: command.model.diagnostics,
  });
  const state = appendDiagnostics(
    {
      ...snapshot.state,
      activeTab: "system",
      model: { status: "ready", model: command.model, diagnostics },
      validation,
    },
    diagnostics,
  );

  return changed(
    snapshot,
    state,
    ["model", "validation", "activeTab", "diagnostics", "console"],
    [
      {
        kind: "run-validation",
        requestId,
        sourceVersion: command.sourceVersion,
        document: snapshot.state.compile.document,
        model: command.model,
      },
    ],
  );
};

const modelFailed = (
  snapshot: WorkbenchSnapshot,
  command: Extract<VisualizerInternalCommand, { type: "model.failed" }>,
): Reduction => {
  if (!requestMatches(command.sourceVersion, snapshot.state.model.requestId, command.requestId, snapshot.state.inputVersion)) {
    return stale(snapshot);
  }

  const state = appendDiagnostics(
    clearCanvasForPipelineInvalidation({
      ...snapshot.state,
      model: { status: "failed", diagnostics: command.diagnostics },
    }),
    command.diagnostics,
  );

  return changed(snapshot, state, ["model", "diagnostics", "console", ...canvasRevision(snapshot.state, state)]);
};

const validationCompleted = (
  snapshot: WorkbenchSnapshot,
  command: Extract<VisualizerInternalCommand, { type: "validation.succeeded" | "validation.failed" }>,
): Reduction => {
  if (!requestMatches(command.sourceVersion, snapshot.state.validation.requestId, command.requestId, snapshot.state.inputVersion)) {
    return stale(snapshot);
  }

  const state = appendDiagnostics(
    {
      ...snapshot.state,
      validation: {
        ...snapshot.state.validation,
        status: command.type === "validation.succeeded" ? "ready" : "blocked",
        diagnostics: command.diagnostics,
      },
    },
    command.diagnostics,
  );

  return changed(snapshot, state, ["validation", "diagnostics", "console"]);
};

const codegenStarted = (
  snapshot: WorkbenchSnapshot,
  command: Extract<VisualizerCommand, { type: "codegen.intent.created" }>,
): Reduction => {
  const requestId = `codegen:${snapshot.state.inputVersion}:1`;
  const codegen: CodegenState = {
    status: "previewing",
    requestId,
    lastIntent: command.intent,
    diagnostics: [],
  };

  return changed(
    snapshot,
    { ...snapshot.state, codegen },
    ["codegen"],
    [
      {
        kind: "codegen.plan",
        requestId,
        sourceVersion: snapshot.state.inputVersion,
        sourceHash: snapshot.state.source.hash,
        intent: command.intent,
      },
    ],
  );
};

const codegenCompleted = (
  snapshot: WorkbenchSnapshot,
  command: Extract<VisualizerInternalCommand, { type: "codegen.plan.completed" | "codegen.plan.failed" }>,
): Reduction => {
  if (!requestMatches(command.sourceVersion, snapshot.state.codegen.requestId, command.requestId, snapshot.state.inputVersion)) {
    return stale(snapshot);
  }

  const diagnostics = command.type === "codegen.plan.completed" ? command.result.diagnostics : command.diagnostics;
  const state = appendDiagnostics(
    {
      ...snapshot.state,
      codegen: {
        ...snapshot.state.codegen,
        status: "not-implemented",
        diagnostics,
      },
    },
    diagnostics,
  );

  return changed(snapshot, state, ["codegen", "diagnostics", "console"], NO_EFFECTS, {
    ok: false,
    reason: "codegen-not-implemented",
    diagnostics,
  });
};

const selectTab = (snapshot: WorkbenchSnapshot, tab: VisualizerTab): Reduction => {
  if (tab === snapshot.state.activeTab) return unchanged(snapshot);

  return changed(snapshot, { ...snapshot.state, activeTab: tab }, ["activeTab"]);
};

const openMachineCanvasBoard = (snapshot: WorkbenchSnapshot, machineId: string): Reduction => {
  const model = snapshot.state.model.model;
  if (!model) return unchanged(snapshot, { ok: false, reason: "missing-model", diagnostics: [] });
  if (!model.workbenchMachines[machineId]) {
    return unchanged(snapshot, { ok: false, reason: "missing-machine", diagnostics: [] });
  }

  const canvas = openMachineBoard(snapshot.state.canvas, snapshot.state.inputVersion, machineId);
  if (canvas === snapshot.state.canvas) return unchanged(snapshot);

  return changed(snapshot, { ...snapshot.state, canvas }, ["canvas"]);
};

const closeMachineCanvasBoard = (snapshot: WorkbenchSnapshot): Reduction => {
  const canvas = closeMachineBoard(snapshot.state.canvas);
  if (canvas === snapshot.state.canvas) return unchanged(snapshot);

  return changed(snapshot, { ...snapshot.state, canvas }, ["canvas"]);
};

const toggleMachine = (snapshot: WorkbenchSnapshot, machineId: string): Reduction => {
  const selected = snapshot.state.l3.selectedMachineIds;
  const exists = selected.includes(machineId);
  const selectedMachineIds = exists ? selected.filter((id) => id !== machineId) : [...selected, machineId];
  const state = {
    ...snapshot.state,
    l3: { selectedMachineIds },
    simulation: {
      ...createInitialSimulationState(),
      selectedMachineIds,
      scope: { kind: "machines" as const, machineIds: selectedMachineIds },
    },
  };

  return changed(
    snapshot,
    state,
    ["l3", "simulation"],
    selectionEffects(snapshot, state, selectedMachineIds),
  );
};

const selectMachineForWorkbench = (snapshot: WorkbenchSnapshot, machineId: string): Reduction => {
  const selectedMachineIds = [machineId];
  const state = {
    ...snapshot.state,
    activeTab: "machines" as const,
    l3: { selectedMachineIds },
    simulation: {
      ...createInitialSimulationState(),
      selectedMachineIds,
      scope: { kind: "machines" as const, machineIds: selectedMachineIds },
    },
  };

  return changed(
    snapshot,
    state,
    ["activeTab", "l3", "simulation"],
    selectionEffects(snapshot, state, selectedMachineIds),
  );
};

const openTopicInWorkbench = (snapshot: WorkbenchSnapshot, eventType: string): Reduction => {
  const relations = snapshot.state.model.model?.relations.machineIdsByTopicType[eventType];
  if (!relations) return unchanged(snapshot, { ok: false, reason: "missing-model", diagnostics: [] });

  const selectedMachineIds = [...new Set([...relations.producers, ...relations.consumers])];
  const state = {
    ...snapshot.state,
    activeTab: "machines" as const,
    l2: { ...snapshot.state.l2, selectedTopic: eventType },
    l3: { selectedMachineIds },
    simulation: {
      ...createInitialSimulationState(),
      selectedMachineIds,
      scope: { kind: "machines" as const, machineIds: selectedMachineIds },
    },
  };

  return changed(
    snapshot,
    state,
    ["activeTab", "l2", "l3", "simulation"],
    selectionEffects(snapshot, state, selectedMachineIds),
  );
};

const openTopicInEventCatalog = (snapshot: WorkbenchSnapshot, eventType: string): Reduction =>
  changed(
    snapshot,
    {
      ...snapshot.state,
      activeTab: "events",
      l1: { ...snapshot.state.l1, selectedMachineId: undefined, selectedTopic: eventType },
      l2: { ...snapshot.state.l2, selectedTopic: eventType },
    },
    ["activeTab", "l1", "l2"],
  );

const selectSystemMachine = (snapshot: WorkbenchSnapshot, machineId: string): Reduction => {
  if (snapshot.state.l1.selectedMachineId === machineId && !snapshot.state.l1.selectedTopic) return unchanged(snapshot);

  return changed(
    snapshot,
    { ...snapshot.state, l1: { ...snapshot.state.l1, selectedMachineId: machineId, selectedTopic: undefined } },
    ["l1"],
  );
};

const selectSystemTopic = (snapshot: WorkbenchSnapshot, eventType: string): Reduction => {
  if (snapshot.state.l1.selectedTopic === eventType && !snapshot.state.l1.selectedMachineId) return unchanged(snapshot);

  return changed(
    snapshot,
    { ...snapshot.state, l1: { ...snapshot.state.l1, selectedMachineId: undefined, selectedTopic: eventType } },
    ["l1"],
  );
};

const machineIdFromGraphTarget = (target: NonNullable<VisualizerWorkbenchState["diagnostics"][number]["graphItemRef"]>): string | undefined => {
  if ("machineId" in target) return target.machineId;

  return undefined;
};

const selectConsoleEntry = (snapshot: WorkbenchSnapshot, entryId: string): Reduction => {
  const entry = snapshot.state.console.entries.find((candidate) => candidate.entryId === entryId);
  const basePanels = {
    ...snapshot.state.panels,
    console: { ...snapshot.state.panels.console, selectedEntryId: entryId },
  };

  if (!entry?.target) {
    if (entryId === snapshot.state.panels.console.selectedEntryId) return unchanged(snapshot);
    return changed(snapshot, { ...snapshot.state, panels: basePanels }, ["panels"]);
  }

  if (entry.target.kind === "source") {
    return changed(
      snapshot,
      {
        ...snapshot.state,
        panels: {
          ...basePanels,
          sourceOverlay: {
            sourceVersion: snapshot.state.inputVersion,
            title: entry.title,
            anchors: [entry.target.anchor],
          },
        },
      },
      ["panels"],
    );
  }

  if (entry.target.kind === "graph") {
    if (entry.target.ref.kind === "topic") {
      return changed(
        snapshot,
        {
          ...snapshot.state,
          activeTab: "events",
          panels: basePanels,
          l1: { ...snapshot.state.l1, selectedMachineId: undefined, selectedTopic: entry.target.ref.eventType },
          l2: { ...snapshot.state.l2, selectedTopic: entry.target.ref.eventType },
        },
        ["activeTab", "panels", "l1", "l2"],
      );
    }

    const machineId = machineIdFromGraphTarget(entry.target.ref);
    if (machineId) {
      return changed(
        snapshot,
        {
          ...snapshot.state,
          activeTab: "system",
          panels: basePanels,
          l1: { ...snapshot.state.l1, selectedMachineId: machineId, selectedTopic: undefined },
        },
        ["activeTab", "panels", "l1"],
      );
    }
  }

  if (entryId === snapshot.state.panels.console.selectedEntryId) return unchanged(snapshot);
  return changed(snapshot, { ...snapshot.state, panels: basePanels }, ["panels"]);
};

const reduceUserCommand = (snapshot: WorkbenchSnapshot, command: VisualizerCommand): Reduction => {
  switch (command.type) {
    case "source.changed":
      return sourceChanged(snapshot, command.source);
    case "source.reset-to-sample":
      return resetToSample(snapshot);
    case "source.open-visualizer":
      return openVisualizer(snapshot);
    case "project-export.loaded":
      return projectExportLoaded(snapshot, command);
    case "project-export.load.failed":
      return projectExportLoadFailed(snapshot, command);
    case "tab.selected":
      return selectTab(snapshot, command.tab);
    case "l1.machine-query.changed":
      if (command.query === snapshot.state.l1.machineQuery) return unchanged(snapshot);
      return changed(snapshot, { ...snapshot.state, l1: { ...snapshot.state.l1, machineQuery: command.query } }, ["l1"]);
    case "l1.topic-query.changed":
      if (command.query === snapshot.state.l1.topicQuery) return unchanged(snapshot);
      return changed(snapshot, { ...snapshot.state, l1: { ...snapshot.state.l1, topicQuery: command.query } }, ["l1"]);
    case "l1.machine.selected":
      return selectSystemMachine(snapshot, command.machineId);
    case "l1.machine.hovered":
      if (command.machineId === snapshot.state.l1.hoveredMachineId) return unchanged(snapshot);
      return changed(
        snapshot,
        { ...snapshot.state, l1: { ...snapshot.state.l1, hoveredMachineId: command.machineId, hoveredTopic: undefined } },
        ["l1"],
      );
    case "l1.topic.selected":
      return selectSystemTopic(snapshot, command.eventType);
    case "l1.topic.hovered":
      if (command.eventType === snapshot.state.l1.hoveredTopic) return unchanged(snapshot);
      return changed(
        snapshot,
        { ...snapshot.state, l1: { ...snapshot.state.l1, hoveredMachineId: undefined, hoveredTopic: command.eventType } },
        ["l1"],
      );
    case "l1.hover.cleared":
      if (!snapshot.state.l1.hoveredMachineId && !snapshot.state.l1.hoveredTopic) return unchanged(snapshot);
      return changed(snapshot, { ...snapshot.state, l1: { ...snapshot.state.l1, hoveredMachineId: undefined, hoveredTopic: undefined } }, ["l1"]);
    case "l1.topic.opened-in-event-catalog":
      return openTopicInEventCatalog(snapshot, command.eventType);
    case "l1.machine.opened-in-workbench":
      return selectMachineForWorkbench(snapshot, command.machineId);
    case "l2.query.changed":
      if (command.query === snapshot.state.l2.query) return unchanged(snapshot);
      return changed(snapshot, { ...snapshot.state, l2: { ...snapshot.state.l2, query: command.query } }, ["l2"]);
    case "l2.topic.selected":
      return changed(snapshot, { ...snapshot.state, l2: { ...snapshot.state.l2, selectedTopic: command.eventType } }, ["l2"]);
    case "l2.topic.opened-in-workbench":
      return openTopicInWorkbench(snapshot, command.eventType);
    case "l3.machine.toggled":
      return toggleMachine(snapshot, command.machineId);
    case "l3.selection.cleared":
      return changed(
        snapshot,
        { ...snapshot.state, l3: { selectedMachineIds: [] }, simulation: createInitialSimulationState() },
        ["l3", "simulation"],
        disposeSimulationEffect(snapshot),
      );
    case "l3.timeline.step.selected": {
      const overlay = withInspectedStep(snapshot.state.simulation.overlay, snapshot.state.simulation.snapshot, command.stepId);
      const state = {
        ...snapshot.state,
        simulation: { ...snapshot.state.simulation, inspectedStepId: command.stepId, overlay },
      };
      const effect = simulationModelEffect(state, overlay);
      return changed(snapshot, state, ["simulation"], effect ? [effect] : NO_EFFECTS);
    }
    case "canvas.machine-board.opened":
      return openMachineCanvasBoard(snapshot, command.machineId);
    case "canvas.machine-board.closed":
      return closeMachineCanvasBoard(snapshot);
    case "source.overlay.opened":
      return changed(
        snapshot,
        {
          ...snapshot.state,
          panels: {
            ...snapshot.state.panels,
            sourceOverlay: {
              title: command.title,
              anchors: command.anchors,
              sourceVersion: snapshot.state.inputVersion,
            },
          },
        },
        ["panels"],
      );
    case "source.overlay.closed":
      if (!snapshot.state.panels.sourceOverlay) return unchanged(snapshot);
      return changed(snapshot, { ...snapshot.state, panels: { ...snapshot.state.panels, sourceOverlay: undefined } }, ["panels"]);
    case "panel.console.toggled": {
      const open = command.open ?? !snapshot.state.panels.console.open;
      if (open === snapshot.state.panels.console.open) return unchanged(snapshot);
      return changed(snapshot, { ...snapshot.state, panels: { ...snapshot.state.panels, console: { ...snapshot.state.panels.console, open } } }, [
        "panels",
      ]);
    }
    case "console.channel.selected": {
      const console = selectConsoleChannel(snapshot.state.console, command.channel);
      if (console === snapshot.state.console) return unchanged(snapshot);
      return changed(snapshot, { ...snapshot.state, console }, ["console"]);
    }
    case "console.entry.selected":
      return selectConsoleEntry(snapshot, command.entryId);
    case "codegen.intent.created":
      return codegenStarted(snapshot, command);
    case "l3.event.sent":
      if (!snapshot.state.simulation.snapshot) return unchanged(snapshot, { ok: false, reason: "missing-simulation-session", diagnostics: [] });
      return effectOnly(snapshot, [{ kind: "simulation.send", sourceVersion: snapshot.state.inputVersion, event: command.event }]);
    case "l3.transition-row.sent":
      if (!snapshot.state.simulation.snapshot) return unchanged(snapshot, { ok: false, reason: "missing-simulation-session", diagnostics: [] });
      return effectOnly(snapshot, [
        { kind: "simulation.send-from-transition", sourceVersion: snapshot.state.inputVersion, target: command.target, payload: command.payload },
      ]);
    case "l3.effect-row.followed":
      if (!snapshot.state.simulation.snapshot) return unchanged(snapshot, { ok: false, reason: "missing-simulation-session", diagnostics: [] });
      return effectOnly(snapshot, [
        { kind: "simulation.send-from-emission", sourceVersion: snapshot.state.inputVersion, target: command.target, payload: command.payload },
      ]);
    case "l3.simulation.reset":
      if (!snapshot.state.simulation.snapshot) return unchanged(snapshot, { ok: false, reason: "missing-simulation-session", diagnostics: [] });
      return changed(
        snapshot,
        { ...snapshot.state, simulation: { ...snapshot.state.simulation, inspectedStepId: undefined } },
        ["simulation"],
        [
          {
            kind: "simulation.reset",
            sourceVersion: snapshot.state.inputVersion,
            initialStateOverrides: command.initialStateOverrides,
            initialContextOverrides: command.initialContextOverrides,
          },
        ],
      );
  }
};

const reduceInternalCommand = (snapshot: WorkbenchSnapshot, command: VisualizerInternalCommand): Reduction => {
  switch (command.type) {
    case "compile.succeeded":
      return compileSucceeded(snapshot, command);
    case "compile.failed":
      return compileFailed(snapshot, command);
    case "analysis.succeeded":
      return analysisSucceeded(snapshot, command);
    case "analysis.failed":
      return analysisFailed(snapshot, command);
    case "model.succeeded":
      return modelSucceeded(snapshot, command);
    case "model.failed":
      return modelFailed(snapshot, command);
    case "validation.succeeded":
    case "validation.failed":
      return validationCompleted(snapshot, command);
    case "simulation.snapshot.changed":
      if (command.sourceVersion !== snapshot.state.inputVersion) return stale(snapshot);
      {
        const simulation = {
          ...snapshot.state.simulation,
          status: command.status ?? snapshot.state.simulation.status,
          snapshot: command.snapshot,
          overlay: command.overlay,
          pendingChoice: command.pendingChoice,
          diagnostics: command.diagnostics ?? [],
        };
        const state = appendDiagnostics({ ...snapshot.state, simulation }, command.diagnostics ?? []);
        const effect = simulationModelEffect(state, command.overlay);

        return changed(
          snapshot,
          state,
          command.diagnostics && command.diagnostics.length > 0
            ? ["simulation", "diagnostics", "console"]
            : ["simulation"],
          effect ? [effect] : NO_EFFECTS,
          command.diagnostics && command.diagnostics.length > 0
            ? { ok: false, reason: "simulator-rejected", diagnostics: command.diagnostics }
            : OK,
        );
      }
    case "codegen.plan.completed":
    case "codegen.plan.failed":
      return codegenCompleted(snapshot, command);
  }
};

export const reduceWorkbenchSnapshot = (
  snapshot: WorkbenchSnapshot,
  command: VisualizerCommand | VisualizerInternalCommand,
): WorkbenchCommandOutput & { snapshot: WorkbenchSnapshot } => {
  const reduction = isInternalCommand(command)
    ? reduceInternalCommand(snapshot, command)
    : reduceUserCommand(snapshot, command);

  return {
    snapshot: reduction.snapshot,
    result: reduction.result,
    effects: reduction.effects,
  };
};
