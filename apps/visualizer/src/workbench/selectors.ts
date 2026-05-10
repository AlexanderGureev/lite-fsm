import type { ConsoleChannelFilter, ConsoleChannelView, ConsolePanelView } from "../console";
import { buildSourceOverlayView, type SourceOverlayView } from "./source-overlay";
import type { VisualizerTab, WorkbenchSelector } from "./types";

export type TabItemView = {
  tab: VisualizerTab;
  label: string;
  count: string;
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

export const selectTabItems = createSelector(
  (snapshot) => ({
    activeTab: snapshot.state.activeTab,
    machines: snapshot.state.model.model?.machines.length ?? 0,
    topics: snapshot.state.model.model?.topics.length ?? 0,
    selectedMachines: snapshot.state.l3.selectedMachineIds.length,
  }),
  ({ activeTab, machines, topics, selectedMachines }): readonly TabItemView[] => [
    { tab: "source", label: "Source", count: "", selected: activeTab === "source" },
    { tab: "system", label: "System", count: String(machines), selected: activeTab === "system" },
    { tab: "events", label: "Events", count: String(topics), selected: activeTab === "events" },
    { tab: "machines", label: "Machines", count: `${selectedMachines}/${machines}`, selected: activeTab === "machines" },
  ],
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

export const selectConsolePanel = createSelector(
  (snapshot) => ({
    console: snapshot.state.console,
    panel: snapshot.state.panels.console,
  }),
  ({ console, panel }): ConsolePanelView => {
    const entries =
      console.selectedChannel === "all"
        ? console.entries
        : console.entries.filter((entry) => entry.channel === console.selectedChannel);

    return {
      open: panel.open,
      selectedEntryId: panel.selectedEntryId,
      selectedChannel: console.selectedChannel,
      channels: buildChannelViews(console.entries, console.selectedChannel, console.channels),
      entries,
      totalEntries: console.entries.length,
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

export const selectSourceOverlay = createSelector(
  (snapshot) => ({
    source: snapshot.state.source.source,
    overlay: snapshot.state.panels.sourceOverlay,
  }),
  ({ source, overlay }): SourceOverlayView => buildSourceOverlayView(source, overlay),
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
