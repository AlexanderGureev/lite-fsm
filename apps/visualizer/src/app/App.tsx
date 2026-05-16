import { WorkbenchProvider } from "./workbench-context";
import { Shell } from "../features/shell/Shell";
import { StartupLoader } from "../startup";
import type { EffectRunnerServices } from "../services";
import { TooltipProvider } from "@/ui/tooltip";

export type AppProps = {
  services?: EffectRunnerServices;
};

export const App = ({ services }: AppProps = {}) => (
  <WorkbenchProvider services={services}>
    <TooltipProvider>
      <StartupLoader />
      <Shell />
    </TooltipProvider>
  </WorkbenchProvider>
);
