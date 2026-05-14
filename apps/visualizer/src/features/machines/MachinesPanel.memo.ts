import type { MachinePickerRowView, TimelineStepView, VisualizerCommand } from "../../workbench";

export type MachinePickerRowProps = {
  machine: MachinePickerRowView;
  dispatch: (command: VisualizerCommand) => void;
};

export type TimelineStepProps = {
  step: TimelineStepView;
  dispatch: (command: VisualizerCommand) => void;
};

const machinePickerRowScalarFields = {
  machineId: true,
  title: true,
  kind: true,
  groupTag: true,
  selected: true,
  stateCount: true,
  diagnosticCount: true,
} satisfies Record<keyof MachinePickerRowView, true>;

const timelineStepScalarFields = {
  stepId: true,
  index: true,
  eventType: true,
  sourceLabel: true,
  rowRefCount: true,
  selected: true,
  empty: true,
} satisfies Record<Exclude<keyof TimelineStepView, "acceptedMachines">, true>;

const machinePickerRowFields = Object.keys(machinePickerRowScalarFields) as (keyof MachinePickerRowView)[];
const timelineStepFields = Object.keys(timelineStepScalarFields) as Exclude<keyof TimelineStepView, "acceptedMachines">[];

const equalScalarFields = <T extends object, K extends keyof T>(
  previous: T,
  next: T,
  fields: readonly K[],
): boolean => fields.every((field) => Object.is(previous[field], next[field]));

const equalAcceptedMachines = (
  previous: readonly string[],
  next: readonly string[],
): boolean => previous.length === next.length && previous.every((machineId, index) => machineId === next[index]);

export const areMachinePickerRowPropsEqual = (
  previous: MachinePickerRowProps,
  next: MachinePickerRowProps,
): boolean =>
  previous.dispatch === next.dispatch &&
  equalScalarFields(previous.machine, next.machine, machinePickerRowFields);

export const areTimelineStepPropsEqual = (
  previous: TimelineStepProps,
  next: TimelineStepProps,
): boolean =>
  previous.dispatch === next.dispatch &&
  equalScalarFields(previous.step, next.step, timelineStepFields) &&
  equalAcceptedMachines(previous.step.acceptedMachines, next.step.acceptedMachines);
