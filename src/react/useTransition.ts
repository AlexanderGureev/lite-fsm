import type { FSMEvent } from "../core/types";

import { useManager } from "./useManager";

export const useTransition = <P extends FSMEvent<any, any> = any>() => {
  const m = useManager<any, P>();
  return m.transition;
};
