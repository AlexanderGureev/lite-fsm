import { describe, expect, it, vi } from "vitest";
import type { MachinePickerRowView, TimelineStepView, VisualizerCommand } from "../../workbench";
import { areMachinePickerRowPropsEqual, areTimelineStepPropsEqual } from "./MachinesPanel.memo";

const dispatch = vi.fn<(command: VisualizerCommand) => void>();

const machineRow = (overrides: Partial<MachinePickerRowView> = {}): MachinePickerRowView => ({
  machineId: "player",
  title: "player",
  kind: "domain",
  selected: true,
  stateCount: 2,
  diagnosticCount: 0,
  ...overrides,
});

const timelineStep = (overrides: Partial<TimelineStepView> = {}): TimelineStepView => ({
  stepId: "step:1",
  index: 1,
  eventType: "PLAY",
  sourceLabel: "external",
  acceptedMachines: ["player"],
  rowRefCount: 1,
  selected: false,
  empty: false,
  ...overrides,
});

describe("компараторы MachinesPanel", () => {
  it("считает одинаковыми заново созданные строки picker с теми же полями", () => {
    expect(
      areMachinePickerRowPropsEqual(
        { machine: machineRow(), dispatch },
        { machine: machineRow(), dispatch },
      ),
    ).toBe(true);
  });

  it("замечает изменение выбранной машины в picker", () => {
    expect(
      areMachinePickerRowPropsEqual(
        { machine: machineRow({ selected: true }), dispatch },
        { machine: machineRow({ selected: false }), dispatch },
      ),
    ).toBe(false);
  });

  it("считает одинаковыми заново созданные timeline steps с теми же принятыми машинами", () => {
    expect(
      areTimelineStepPropsEqual(
        { step: timelineStep({ acceptedMachines: ["player", "worker"] }), dispatch },
        { step: timelineStep({ acceptedMachines: ["player", "worker"] }), dispatch },
      ),
    ).toBe(true);
  });

  it("замечает изменение timeline step", () => {
    expect(
      areTimelineStepPropsEqual(
        { step: timelineStep({ acceptedMachines: ["player"] }), dispatch },
        { step: timelineStep({ acceptedMachines: ["worker"] }), dispatch },
      ),
    ).toBe(false);
  });
});
