import useSyncExternalStoreExports from "use-sync-external-store/shim/with-selector";

import type { MachinesState, MachineStore } from "../core/types";
import { useManager } from "./useManager";

const { useSyncExternalStoreWithSelector } = useSyncExternalStoreExports;

export const useSelector = <S extends MachineStore, R>(
  selector: (state: MachinesState<S>) => R,
  equalityFn?: (oldValue: R, newValue: R) => boolean,
) => {
  const api = useManager<S>();
  const slice = useSyncExternalStoreWithSelector(api.onTransition, api.getState, api.getState, selector, equalityFn);
  return slice;
};