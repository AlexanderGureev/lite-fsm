import React from "react";
import useSyncExternalStoreExports from "use-sync-external-store/shim/with-selector";

import { MachineConfig, MachinesState } from "~/core/types";

import { FSMContext, FSMContextType } from "./FSMContext";

const { useSyncExternalStoreWithSelector } = useSyncExternalStoreExports;

export const useSelector = <
  S extends {
    [key in string]: MachineConfig<any, any, any, any>;
  },
  R,
>(
  selector: (state: MachinesState<S>) => R,
  equalityFn?: (oldValue: R, newValue: R) => boolean,
) => {
  const api = React.useContext<FSMContextType>(FSMContext);
  const slice = useSyncExternalStoreWithSelector(api.onTransition, api.getState, api.getState, selector, equalityFn);
  return slice;
};
// export const useSelector = <
//   S extends {
//     [key in string]: MachineConfig<any, any, any, any>;
//   },
//   R,
// >(
//   selector: (state: MachinesState<S>) => R,
//   equalityFn?: (oldValue: R, newValue: R) => boolean,
// ) => {
//   const m = React.useContext<FSMContextType>(FSMContext);
//   const [state, set] = React.useState<R>(selector(m.getState()));

//   React.useEffect(() => {
//     return m.onTransition((prevState, currentState) => {
//       const prev = selector(prevState);
//       const next = selector(currentState);

//       if (equalityFn) {
//         const isEqual = equalityFn(prev, next);
//         if (!isEqual) set(next);
//         return;
//       }

//       if (prev !== next) set(next);
//     });
//   }, [m, selector, equalityFn]);

//   return state;
// };
