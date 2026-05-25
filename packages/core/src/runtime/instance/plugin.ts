import type { NormalizedPlugin } from "../../plugin";
import { INSTANCE_STORAGE_KIND, instanceStorageRuntime } from "./storage";

export const INSTANCE_RUNTIME_PLUGIN_NAME = "@lite-fsm/core/instance-runtime";

export const instanceRuntimePlugin: NormalizedPlugin = {
  name: INSTANCE_RUNTIME_PLUGIN_NAME,
  storage: [
    {
      owner: INSTANCE_RUNTIME_PLUGIN_NAME,
      kind: INSTANCE_STORAGE_KIND,
      value: instanceStorageRuntime,
    },
  ],
  routeMeta: [],
  scopedDeps: [],
  scopedTransition: [],
  manager: [],
  hooks: {},
};
