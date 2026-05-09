import { useSyncExternalStore } from "react";
import { useWorkbenchContext } from "./workbench-context";
import type { WorkbenchSelector } from "../workbench";

export const useWorkbenchSelector = <T,>(selector: WorkbenchSelector<T>): T => {
  const { store } = useWorkbenchContext();

  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getSnapshot()),
    () => selector(store.getSnapshot()),
  );
};
