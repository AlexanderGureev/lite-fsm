import React from "react";

import { FSMContext } from "./FSMContext";

export const useManager = () => React.useContext(FSMContext);
