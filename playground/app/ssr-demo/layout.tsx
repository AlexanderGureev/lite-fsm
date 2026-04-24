import type { ReactNode } from "react";

import SSRDemoTopBar from "@/app/_components/SSRDemoTopBar";

export default function SSRDemoLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <SSRDemoTopBar />
      {children}
    </div>
  );
}
