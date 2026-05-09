import { reduceWorkbenchSnapshot } from "./reducer";
import { createInitialWorkbenchSnapshot } from "./state";
import type {
  VisualizerCommand,
  VisualizerInternalCommand,
  WorkbenchCommandOutput,
  WorkbenchSnapshot,
  WorkbenchStore,
} from "./types";

export const createWorkbenchStore = (initialSnapshot: WorkbenchSnapshot = createInitialWorkbenchSnapshot()): WorkbenchStore => {
  let snapshot = initialSnapshot;
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  return {
    getSnapshot() {
      return snapshot;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispatch(command: VisualizerCommand | VisualizerInternalCommand): WorkbenchCommandOutput {
      const previous = snapshot;
      const output = reduceWorkbenchSnapshot(snapshot, command);
      snapshot = output.snapshot;

      if (snapshot !== previous) {
        notify();
      }

      return {
        result: output.result,
        effects: output.effects,
      };
    },
  };
};
