import type { ReactNode } from "react";

import { StaticExportNotice } from "../components/StaticExportNotice";

import { ScreensNav } from "./components/ScreensNav";
import { StoreProvider } from "./components/StoreProvider";
import { loadDemoProfile } from "./store/ssr";

export default async function SSRDemoLayout({ children }: { children: ReactNode }) {
  const profile = await loadDemoProfile();

  return (
    <StoreProvider initialProfile={profile}>
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">
        <ScreensNav />
        <StaticExportNotice />
        {children}
      </main>
    </StoreProvider>
  );
}
