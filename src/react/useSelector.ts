import useSyncExternalStoreExports from "use-sync-external-store/shim/with-selector";

import type { MachinesState, MachineStore } from "../core/types";
import { useHydrationOverlay } from "./hydrationOverlay";
import { useManager } from "./useManager";

const { useSyncExternalStoreWithSelector } = useSyncExternalStoreExports;

export function useSelector<S extends MachineStore, R>(
  selector: (state: MachinesState<S>) => R,
  equalityFn?: (oldValue: R, newValue: R) => boolean,
): R;
export function useSelector<S extends MachineStore, R>(
  selector: (state: MachinesState<S>) => R,
  equalityFn?: (oldValue: R, newValue: R) => boolean,
) {
  const api = useManager<S>();
  const overlay = useHydrationOverlay<S>();
  const getState = overlay?.getState ?? api.getState;
  return useSyncExternalStoreWithSelector(api.onTransition, getState, getState, selector, equalityFn);
}