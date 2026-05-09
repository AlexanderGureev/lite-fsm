import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { createDefaultEffectRunnerServices, runWorkbenchEffects, type EffectRunnerServices } from "../services";
import { createWorkbenchStore, type VisualizerCommand, type WorkbenchStore } from "../workbench";

type WorkbenchContextValue = {
  store: WorkbenchStore;
  dispatch: (command: VisualizerCommand) => void;
};

const WorkbenchContext = createContext<WorkbenchContextValue | undefined>(undefined);

export type WorkbenchProviderProps = {
  children: ReactNode;
  store?: WorkbenchStore;
  services?: EffectRunnerServices;
};

export const WorkbenchProvider = ({ children, store, services }: WorkbenchProviderProps) => {
  const [storeInstance] = useState<WorkbenchStore>(() => store ?? createWorkbenchStore());
  const [serviceInstance] = useState<EffectRunnerServices>(() => services ?? createDefaultEffectRunnerServices());

  const dispatch = useCallback((command: VisualizerCommand) => {
    const output = storeInstance.dispatch(command);
    runWorkbenchEffects(output.effects, serviceInstance, storeInstance);
  }, [serviceInstance, storeInstance]);

  return <WorkbenchContext.Provider value={{ store: storeInstance, dispatch }}>{children}</WorkbenchContext.Provider>;
};

export const useWorkbenchContext = (): WorkbenchContextValue => {
  const context = useContext(WorkbenchContext);
  if (!context) throw new Error("WorkbenchProvider is missing.");

  return context;
};
