import { WorkbenchProvider } from "./workbench-context";
import { Shell } from "../features/shell/Shell";
import { ProjectExportConfigLoader } from "../project-export/config-loader";
import type { EffectRunnerServices } from "../services";
import { TooltipProvider } from "@/ui/tooltip";

export type AppProps = {
  services?: EffectRunnerServices;
};

export const App = ({ services }: AppProps = {}) => (
  <WorkbenchProvider services={services}>
    <TooltipProvider>
      <ProjectExportConfigLoader />
      <Shell />
    </TooltipProvider>
  </WorkbenchProvider>
);
