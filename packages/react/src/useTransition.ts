import type { AnyEvent, MachineStore } from "@lite-fsm/core";

import { useManager } from "./useManager";

export const useTransition = <P extends AnyEvent = AnyEvent>() => {
  const m = useManager<MachineStore, P>();
  return m.transition;
};
