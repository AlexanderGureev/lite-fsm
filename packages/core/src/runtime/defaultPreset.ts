import { instanceRuntimePlugin } from "./instance/plugin";
import type { RuntimePreset } from "./kernel/createMachineManagerFactory";

export const defaultRuntimePreset: RuntimePreset = {
  name: "@lite-fsm/core/default-runtime",
  defaultStorageKind: "instance",
  plugins: [instanceRuntimePlugin],
};
