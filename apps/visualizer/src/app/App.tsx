import { WorkbenchProvider } from "./workbench-context";
import { Shell } from "../features/shell/Shell";
import { TooltipProvider } from "@/ui/tooltip";

export const App = () => (
  <WorkbenchProvider>
    <TooltipProvider>
      <Shell />
    </TooltipProvider>
  </WorkbenchProvider>
);
