import type { GraphVisualizerModel } from "@lite-fsm/graph/view-model";
import {
  DEFAULT_CONSOLE_FILTERS,
  machineIdForConsoleEntry,
  type ConsoleChannelFilter,
  type ConsoleChannelView,
  type ConsoleEntry,
  type ConsoleFacetOption,
  type ConsoleHotspotView,
  type ConsolePanelView,
  type ConsoleScope,
  type ConsoleSeverityFilter,
  type ConsoleSeveritySummary,
} from "../console";
import type { WorkbenchDiagnosticRef } from "../diagnostics";
import { buildSourceOverlayView, type SourceOverlayView } from "./source-overlay";
import type { VisualizerTab, WorkbenchSelector } from "./types";

export type TabItemView = {
  tab: VisualizerTab;
  label: string;
  count: string;
  diagnosticCount: number;
  hasError: boolean;
  selected: boolean;
};

export type EmptyPanelView = {
  title: string;
  body: string;
  status: string;
};

export type SourcePanelView = {
  source: string;
  filename: string;
  language: string;
  version: number;
  hash: string;
  compileStatus: string;
  analysisStatus: string;
  modelStatus: string;
  validationStatus: string;
  diagnosticCount: number;
  machineCount: number;
  topicCount: number;
  canOpen: boolean;
  running: boolean;
};

export type SourceInputModeView =
  | { kind: "pasted-source" }
  | {
      kind: "project-export";
      jsonFileName: string;
      entryPath: string;
      fileCount: number;
      hasSources: boolean;
      sourceFileCount: number;
    };

export const shallowEqualObject = <Input>(left: Input, right: Input): boolean => {
  if (Object.is(left, right)) return true;
  if (typeof left !== "object" || left === null || typeof right !== "object" || right === null) return false;

  const leftEntries = Object.entries(left);
  if (leftEntries.length !== Object.keys(right).length) return false;

  return leftEntries.every(([key, value]) => Object.is(value, (right as Record<string, unknown>)[key]));
};

export const createSelector = <Input, Output>(
  read: WorkbenchSelector<Input>,
  build: (input: Input) => Output,
): WorkbenchSelector<Output> => {
  let previousInput: Input | undefined;
  let previousOutput: Output | undefined;

  return (snapshot) => {
    const input = read(snapshot);
    if (previousInput !== undefined && previousOutput !== undefined && shallowEqualObject(input, previousInput)) {
      return previousOutput;
    }

    previousInput = input;
    previousOutput = build(input);
    return previousOutput;
  };
};

export const selectActiveTab: WorkbenchSelector<VisualizerTab> = (snapshot) => snapshot.state.activeTab;

type DiagnosticTabSummary = {
  diagnosticCount: number;
  hasError: boolean;
};

type DiagnosticTabSummaries = Record<VisualizerTab, DiagnosticTabSummary>;

const sourceDiagnosticOrigins: ReadonlySet<WorkbenchDiagnosticRef["origin"]> = new Set([
  "compiler",
  "source",
  "host",
  "view-model",
]);

const emptyDiagnosticTabSummary = (): DiagnosticTabSummary => ({ diagnosticCount: 0, hasError: false });

const machineIdForGraphRef = (ref: WorkbenchDiagnosticRef["graphItemRef"]): string | undefined => {
  if (!ref) return undefined;
  if (ref.kind === "machine" || ref.kind === "state" || ref.kind === "transition" || ref.kind === "emission" || ref.kind === "reducerCase") {
    return ref.machineId;
  }

  return undefined;
};

const eventDiagnosticForRef = (
  model: GraphVisualizerModel,
  ref: WorkbenchDiagnosticRef["graphItemRef"],
): boolean => {
  if (!ref) return false;
  if (ref.kind === "topic") return true;

  const machineId = machineIdForGraphRef(ref);
  if (!machineId) return false;

  const workbench = model.workbenchMachines[machineId];
  if (!workbench) return false;

  const rows = [
    ...workbench.globalBehavior,
    ...workbench.states.flatMap((state) => state.rows),
  ];

  return rows.some((row) => {
    if (ref.kind === "transition") {
      if (row.kind === "config") {
        return row.transitionId === ref.transitionId || row.foldedReducerTransitionIds.includes(ref.transitionId);
      }

      return row.kind === "reducer" && row.transitionId === ref.transitionId;
    }

    if (ref.kind === "emission") return row.kind === "effect" && row.emissionId === ref.emissionId;
    if (ref.kind === "reducerCase") return row.kind === "reducer" && row.reducerCaseId === ref.reducerCaseId;

    return false;
  });
};

type WorkbenchDiagnosticInput = {
  diagnostics: readonly WorkbenchDiagnosticRef[];
  model: GraphVisualizerModel | undefined;
  selectedMachineIds: readonly string[];
};

const addDiagnosticToSummary = (
  summary: DiagnosticTabSummary,
  diagnostic: WorkbenchDiagnosticRef,
): DiagnosticTabSummary => ({
  diagnosticCount: summary.diagnosticCount + 1,
  hasError: summary.hasError || diagnostic.diagnostic.severity === "error",
});

const diagnosticTabSummaries = ({
  diagnostics,
  model,
  selectedMachineIds,
}: WorkbenchDiagnosticInput): DiagnosticTabSummaries => {
  const summaries: DiagnosticTabSummaries = {
    source: emptyDiagnosticTabSummary(),
    system: emptyDiagnosticTabSummary(),
    events: emptyDiagnosticTabSummary(),
    machines: emptyDiagnosticTabSummary(),
  };
  const selectedMachines = new Set(selectedMachineIds);

  for (const diagnostic of diagnostics) {
    const graphRef = diagnostic.graphItemRef;
    const graphMachineId = machineIdForGraphRef(graphRef);

    if (diagnostic.primaryTarget.kind === "source" || sourceDiagnosticOrigins.has(diagnostic.origin)) {
      summaries.source = addDiagnosticToSummary(summaries.source, diagnostic);
    }

    if (graphRef && graphRef.kind !== "diagnostic") {
      summaries.system = addDiagnosticToSummary(summaries.system, diagnostic);
    }

    if (model && eventDiagnosticForRef(model, graphRef)) {
      summaries.events = addDiagnosticToSummary(summaries.events, diagnostic);
    }

    if (
      diagnostic.origin === "simulator" ||
      diagnostic.origin === "codegen" ||
      (graphMachineId && selectedMachines.has(graphMachineId))
    ) {
      summaries.machines = addDiagnosticToSummary(summaries.machines, diagnostic);
    }
  }

  return summaries;
};

export const selectTabItems = createSelector(
  (snapshot) => ({
    activeTab: snapshot.state.activeTab,
    model: snapshot.state.model.model,
    diagnostics: snapshot.state.diagnostics,
    selectedMachines: snapshot.state.l3.selectedMachineIds.length,
    selectedMachineIds: snapshot.state.l3.selectedMachineIds,
  }),
  ({ activeTab, model, diagnostics, selectedMachines, selectedMachineIds }): readonly TabItemView[] => {
    const machines = model?.machines.length ?? 0;
    const topics = model?.topics.length ?? 0;
    const tabDiagnostics = diagnosticTabSummaries({ diagnostics, model, selectedMachineIds });

    return [
      { tab: "source", label: "Source", count: "", ...tabDiagnostics.source, selected: activeTab === "source" },
      { tab: "system", label: "System", count: String(machines), ...tabDiagnostics.system, selected: activeTab === "system" },
      { tab: "events", label: "Events", count: String(topics), ...tabDiagnostics.events, selected: activeTab === "events" },
      {
        tab: "machines",
        label: "Machines",
        count: `${selectedMachines}/${machines}`,
        ...tabDiagnostics.machines,
        selected: activeTab === "machines",
      },
    ];
  },
);

const channelLabel = (channel: ConsoleChannelFilter): string => {
  if (channel === "all") return "All";
  if (channel === "system") return "System";
  if (channel === "diagnostics") return "Diagnostics";

  return "Debug";
};

const buildChannelViews = (
  entries: ConsolePanelView["entries"],
  selectedChannel: ConsoleChannelFilter,
  channels: readonly Exclude<ConsoleChannelFilter, "all">[],
): readonly ConsoleChannelView[] =>
  (["all", ...channels] as const).map((channel) => ({
    channel,
    label: channelLabel(channel),
    count: channel === "all" ? entries.length : entries.filter((entry) => entry.channel === channel).length,
    selected: channel === selectedChannel,
  }));

const consoleSeverityOrder = ["error", "warning", "info"] as const satisfies readonly Exclude<ConsoleSeverityFilter, "all">[];

const normalizeConsoleSearch = (value: string): string => value.trim().toLocaleLowerCase();

const consoleEntrySearchText = (entry: ConsoleEntry): string =>
  [
    entry.channel,
    entry.severity,
    entry.origin,
    machineIdForConsoleEntry(entry),
    entry.locationLabel,
    entry.title,
    entry.message,
  ]
    .filter(Boolean)
    .join("\n")
    .toLocaleLowerCase();

const filterEntriesByChannel = (
  entries: readonly ConsoleEntry[],
  selectedChannel: ConsoleChannelFilter,
): readonly ConsoleEntry[] =>
  selectedChannel === "all" ? entries : entries.filter((entry) => entry.channel === selectedChannel);

const filterEntriesByScope = (
  entries: readonly ConsoleEntry[],
  scope: ConsoleScope | undefined,
): readonly ConsoleEntry[] => {
  if (!scope) return entries;

  if (scope.kind === "diagnostics") {
    const diagnosticIds = new Set(scope.diagnosticIds);
    return entries.filter((entry) => entry.diagnosticId !== undefined && diagnosticIds.has(entry.diagnosticId));
  }

  return entries;
};

const filterConsoleEntries = (
  entries: readonly ConsoleEntry[],
  filters: ConsolePanelView["filters"],
): readonly ConsoleEntry[] => {
  const query = normalizeConsoleSearch(filters.query);

  return entries.filter((entry) => {
    if (filters.severity !== "all" && entry.severity !== filters.severity) return false;
    if (filters.origin !== "all" && entry.origin !== filters.origin) return false;
    if (filters.machineId !== "all" && machineIdForConsoleEntry(entry) !== filters.machineId) return false;
    if (filters.code !== "all" && entry.title !== filters.code) return false;
    if (query && !consoleEntrySearchText(entry).includes(query)) return false;

    return true;
  });
};

const countEntriesBy = (
  entries: readonly ConsoleEntry[],
  readValue: (entry: ConsoleEntry) => string | undefined,
): Map<string, number> => {
  const counts = new Map<string, number>();

  for (const entry of entries) {
    const value = readValue(entry);
    if (!value) continue;

    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return counts;
};

const compareConsoleFacetOptions = (left: ConsoleFacetOption, right: ConsoleFacetOption): number =>
  right.count - left.count || left.label.localeCompare(right.label);

const buildFacetOptions = (
  entries: readonly ConsoleEntry[],
  selectedValue: string,
  readValue: (entry: ConsoleEntry) => string | undefined,
): readonly ConsoleFacetOption[] =>
  Array.from(countEntriesBy(entries, readValue), ([value, count]) => ({
    value,
    label: value,
    count,
    selected: value === selectedValue,
  })).sort(compareConsoleFacetOptions);

const buildSeveritySummary = (
  entries: readonly ConsoleEntry[],
  selectedSeverity: ConsoleSeverityFilter,
): readonly ConsoleSeveritySummary[] => {
  const counts = countEntriesBy(entries, (entry) => entry.severity);

  return consoleSeverityOrder.map((severity) => ({
    severity,
    count: counts.get(severity) ?? 0,
    selected: severity === selectedSeverity,
  }));
};

const topConsoleFacet = (
  filter: ConsoleHotspotView["filter"],
  prefix: string,
  options: readonly ConsoleFacetOption[],
): ConsoleHotspotView | undefined => {
  const option = options[0];
  if (!option || option.count < 2) return undefined;

  return {
    filter,
    value: option.value,
    label: `${prefix} ${option.label}`,
    count: option.count,
    selected: option.selected,
  };
};

const buildConsoleHotspots = ({
  codeOptions,
  machineOptions,
  originOptions,
}: {
  codeOptions: readonly ConsoleFacetOption[];
  machineOptions: readonly ConsoleFacetOption[];
  originOptions: readonly ConsoleFacetOption[];
}): readonly ConsoleHotspotView[] =>
  [
    topConsoleFacet("code", "code", codeOptions),
    topConsoleFacet("machineId", "machine", machineOptions),
    topConsoleFacet("origin", "origin", originOptions),
  ]
    .filter((hotspot): hotspot is ConsoleHotspotView => Boolean(hotspot))
    .sort((left, right) => right.count - left.count)
    .slice(0, 3);

const activeConsoleFilterCount = (
  selectedChannel: ConsoleChannelFilter,
  filters: ConsolePanelView["filters"],
  scope: ConsoleScope | undefined,
): number => {
  let count = selectedChannel === "all" ? 0 : 1;
  if (scope) count += 1;
  if (normalizeConsoleSearch(filters.query)) count += 1;
  if (filters.severity !== DEFAULT_CONSOLE_FILTERS.severity) count += 1;
  if (filters.origin !== DEFAULT_CONSOLE_FILTERS.origin) count += 1;
  if (filters.machineId !== DEFAULT_CONSOLE_FILTERS.machineId) count += 1;
  if (filters.code !== DEFAULT_CONSOLE_FILTERS.code) count += 1;

  return count;
};

export const selectConsolePanel = createSelector(
  (snapshot) => ({
    console: snapshot.state.console,
    panel: snapshot.state.panels.console,
  }),
  ({ console, panel }): ConsolePanelView => {
    const scopedEntries = filterEntriesByScope(console.entries, console.scope);
    const channelEntries = filterEntriesByChannel(scopedEntries, console.selectedChannel);
    const entries = filterConsoleEntries(channelEntries, console.filters);
    const originOptions = buildFacetOptions(channelEntries, console.filters.origin, (entry) => entry.origin);
    const machineOptions = buildFacetOptions(channelEntries, console.filters.machineId, machineIdForConsoleEntry);
    const codeOptions = buildFacetOptions(channelEntries, console.filters.code, (entry) => entry.title);

    return {
      open: panel.open,
      scope: console.scope,
      selectedEntryId: panel.selectedEntryId,
      selectedChannel: console.selectedChannel,
      channels: buildChannelViews(scopedEntries, console.selectedChannel, console.channels),
      entries,
      filters: console.filters,
      severitySummary: buildSeveritySummary(channelEntries, console.filters.severity),
      originOptions,
      machineOptions,
      codeOptions,
      hotspots: buildConsoleHotspots({ codeOptions, machineOptions, originOptions }),
      channelEntryCount: channelEntries.length,
      totalEntries: scopedEntries.length,
      activeFilterCount: activeConsoleFilterCount(console.selectedChannel, console.filters, console.scope),
      ...(console.entries.length === 0
        ? { emptyReason: "no-entries" as const }
        : entries.length === 0
          ? { emptyReason: "filtered" as const }
          : {}),
    };
  },
);

export const selectSourcePanel = createSelector(
  (snapshot) => ({
    source: snapshot.state.source,
    compile: snapshot.state.compile,
    analysis: snapshot.state.analysis,
    model: snapshot.state.model,
    validation: snapshot.state.validation,
    diagnosticCount: snapshot.state.diagnostics.length,
  }),
  ({ source, compile, analysis, model, validation, diagnosticCount }): SourcePanelView => {
    const running =
      compile.status === "running" ||
      analysis.status === "running" ||
      model.status === "running" ||
      validation.status === "running";

    return {
      source: source.source,
      filename: source.filename ?? "source",
      language: source.language,
      version: source.version,
      hash: source.hash,
      compileStatus: compile.status,
      analysisStatus: analysis.status,
      modelStatus: model.status,
      validationStatus: validation.status,
      diagnosticCount,
      machineCount: model.model?.machines.length ?? 0,
      topicCount: model.model?.topics.length ?? 0,
      canOpen: source.source.trim().length > 0 && !running,
      running,
    };
  },
);

export const selectSourceInputMode = createSelector(
  (snapshot) => ({ inputMode: snapshot.state.inputMode }),
  ({ inputMode }): SourceInputModeView => {
    if (inputMode.kind !== "project-export") return { kind: "pasted-source" };

    return {
      kind: "project-export",
      jsonFileName: inputMode.fileName,
      entryPath: inputMode.entryPath,
      fileCount: inputMode.files.length,
      hasSources: Boolean(inputMode.sources?.files?.length),
      sourceFileCount: inputMode.sources?.files?.length ?? 0,
    };
  },
);

export const selectSourceOverlay = createSelector(
  (snapshot) => ({
    source: snapshot.state.source,
    inputMode: snapshot.state.inputMode,
    overlay: snapshot.state.panels.sourceOverlay,
  }),
  ({ source, inputMode, overlay }): SourceOverlayView =>
    buildSourceOverlayView(
      inputMode.kind === "pasted-source"
        ? { kind: "pasted-source", source: source.source, filename: source.filename }
        : inputMode.kind === "project-export"
          ? { kind: "project-export", sources: inputMode.sources }
          : { kind: inputMode.kind },
      overlay,
    ),
);

export const selectCurrentEmptyPanel = createSelector(
  (snapshot) => ({
    activeTab: snapshot.state.activeTab,
    modelStatus: snapshot.state.model.status,
    machines: snapshot.state.model.model?.machines.length ?? 0,
    topics: snapshot.state.model.model?.topics.length ?? 0,
  }),
  ({ activeTab, modelStatus, machines, topics }): EmptyPanelView => {
    if (activeTab === "source") {
      return {
        title: "Source pipeline",
        body: "Edit the source and open the visualizer to compile, analyze and project the graph model.",
        status: modelStatus,
      };
    }

    if (activeTab === "system") {
      return {
        title: "System inventory",
        body:
          modelStatus === "ready"
            ? `Model ready with ${machines} machines. Use System to inspect L1 inventory.`
            : "Open the visualizer from Source to build the model before inspecting L1 inventory.",
        status: modelStatus,
      };
    }

    if (activeTab === "events") {
      return {
        title: "Event catalog",
        body:
          modelStatus === "ready"
            ? `Model ready with ${topics} topics. Use Events to inspect L2 routing.`
            : "Open the visualizer from Source to build the topic catalog before inspecting L2 routing.",
        status: modelStatus,
      };
    }

    return {
      title: "Machine workbench",
      body:
        modelStatus === "ready"
          ? `Model ready with ${machines} machines. L3 cards and manual simulation start in stage 12e.`
          : "Open the visualizer from Source before selecting machines in stage 12e.",
      status: modelStatus,
    };
  },
);
