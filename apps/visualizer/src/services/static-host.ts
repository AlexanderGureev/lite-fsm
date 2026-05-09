import type { VisualizerHostAdapter, VisualizerHostCapabilities } from "./types";

export const STATIC_HOST_CAPABILITIES: VisualizerHostCapabilities = {
  mode: "static",
  canReadFiles: false,
  canWriteFiles: false,
  canApplyPatch: false,
};

export const createStaticHostAdapter = (): VisualizerHostAdapter => ({
  getCapabilities() {
    return STATIC_HOST_CAPABILITIES;
  },
});
