import useSyncExternalStoreExports from "use-sync-external-store/shim/with-selector";

import type { MachinesState, MachineStore } from "../core/types";
import { useHydrationOverlay, useServerSnapshot } from "./hydrationOverlay";
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
  const serverSnapshot = useServerSnapshot<S>();
  const getSnapshot = overlay?.getState ?? api.getState;
  const getServerSnapshot = serverSnapshot?.getState ?? getSnapshot;
  return useSyncExternalStoreWithSelector(api.onTransition, getSnapshot, getServerSnapshot, selector, equalityFn);
}
