import type { ReactNode } from "react";

import SSRDemo2TopBar from "./_components/SSRDemo2TopBar";

export default function SSRDemo2Layout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <SSRDemo2TopBar />
      {children}
    </div>
  );
}
