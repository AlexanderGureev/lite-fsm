import React from "react";

import { FSMContext, FSMContextType } from "./FSMContext";
import { MachineConfig, MachinesState } from "~/core/types";

export const useSelector = <
  S extends {
    [key in string]: MachineConfig<any, any, any, any>;
  },
  R,
>(
  selector: (state: MachinesState<S>) => R,
  equalityFn?: (oldValue: R, newValue: R) => boolean,
) => {
  const m = React.useContext<FSMContextType>(FSMContext);
  const [state, set] = React.useState<R>(selector(m.getState()));

  React.useEffect(() => {
    return m.onTransition((prevState, currentState) => {
      const prev = selector(prevState);
      const next = selector(currentState);

      if (equalityFn) {
        const isEqual = equalityFn(prev, next);
        if (!isEqual) set(next);
        return;
      }

      if (prev !== next) set(next);
    });
  }, [m, selector, equalityFn]);

  return state;
};
