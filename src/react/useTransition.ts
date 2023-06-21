import React from "react";

import { FSMContext, FSMContextType } from "./FSMContext";
import { FSMEvent } from "~/core/types";

export const useTransition = <P extends FSMEvent<any, any> = any>() => {
  const m = React.useContext<FSMContextType<any, P>>(FSMContext);
  return m.transition;
};
