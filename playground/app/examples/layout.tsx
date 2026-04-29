import { TopBar } from "@/components/TopBar";

import { ExamplesSubNav } from "./components/ExamplesSubNav";

export default function ExamplesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas-parchment text-ink">
      <TopBar />
      <ExamplesSubNav />
      {children}
    </div>
  );
}
