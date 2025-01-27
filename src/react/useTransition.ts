import React from "react";

import { FSMEvent } from "~/core/types";

import { FSMContext, FSMContextType } from "./FSMContext";

export const useTransition = <P extends FSMEvent<any, any> = any>() => {
  const m = React.useContext<FSMContextType<any, P>>(FSMContext);
  return m.transition;
};
