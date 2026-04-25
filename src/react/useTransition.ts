import type { AnyEvent, MachineStore } from "../core/types";

import { useManager } from "./useManager";

export const useTransition = <P extends AnyEvent = AnyEvent>() => {
  const m = useManager<MachineStore, P>();
  return m.transition;
};
