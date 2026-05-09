import { WorkbenchProvider } from "./workbench-context";
import { Shell } from "../features/shell/Shell";

export const App = () => (
  <WorkbenchProvider>
    <Shell />
  </WorkbenchProvider>
);
