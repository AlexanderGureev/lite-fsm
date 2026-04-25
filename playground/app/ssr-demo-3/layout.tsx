import type { ReactNode } from "react";

import SSRDemo3TopBar from "./_components/SSRDemo3TopBar";

export default function SSRDemo3Layout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <SSRDemo3TopBar />
      {children}
    </div>
  );
}
