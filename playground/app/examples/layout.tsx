import { TopBar } from "@/components/TopBar";
import { SpotlightTracker } from "@/components/SpotlightTracker";

import { ExamplesSubNav } from "./components/ExamplesSubNav";

export default function ExamplesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas-parchment text-ink">
      <SpotlightTracker />
      <TopBar />
      <ExamplesSubNav />
      {children}
    </div>
  );
}
