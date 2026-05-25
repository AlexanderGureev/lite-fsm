import { defaultRuntimePreset } from "./runtime/defaultPreset";
import { createMachineManagerFactory } from "./runtime/kernel/createMachineManagerFactory";

export const MachineManager = createMachineManagerFactory(defaultRuntimePreset);
