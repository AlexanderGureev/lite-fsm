import type { ConsolePanelView } from "../console";
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
};

const shallowEqualObject = <Input>(left: Input, right: Input): boolean => {
  if (Object.is(left, right)) return true;
  if (typeof left !== "object" || left === null || typeof right !== "object" || right === null) return false;

  const leftEntries = Object.entries(left);
  return leftEntries.every(([key, value]) => Object.is(value, (right as Record<string, unknown>)[key]));
};

const createSelector = <Input, Output>(
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

export const selectConsolePanel = createSelector(
  (snapshot) => ({
    console: snapshot.state.console,
    panel: snapshot.state.panels.console,
  }),
  ({ console, panel }): ConsolePanelView => ({
    open: panel.open,
    selectedEntryId: panel.selectedEntryId,
    entries: console.entries,
  }),
);

export const selectCurrentEmptyPanel = createSelector(
  selectActiveTab,
  (activeTab): EmptyPanelView => {
    if (activeTab === "source") {
      return {
        title: "Source session",
        body: "The stage 12a shell keeps source state ready for the compiler pipeline.",
      };
    }

    if (activeTab === "system") {
      return {
        title: "System inventory",
        body: "L1 inventory rendering starts in stage 12d.",
      };
    }

    if (activeTab === "events") {
      return {
        title: "Event catalog",
        body: "L2 event catalog rendering starts in stage 12d.",
      };
    }

    return {
      title: "Machine workbench",
      body: "L3 cards and manual simulation start in stage 12e.",
    };
  },
);
