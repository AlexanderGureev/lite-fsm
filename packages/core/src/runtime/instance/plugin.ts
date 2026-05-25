import { definePlugin } from "../../plugin";
import { INSTANCE_STORAGE_KIND, instanceStorageRuntime } from "./storage";

export const instanceRuntimePlugin = definePlugin({
  name: "@lite-fsm/core/instance-runtime",
  install(ctx) {
    ctx.storage.register(INSTANCE_STORAGE_KIND, instanceStorageRuntime);
  },
});
