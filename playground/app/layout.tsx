import type { Metadata } from "next";

import StoreSeedInitialize from "./_components/StoreSeedInitialize";
import StoreProvider from "./StoreProvider";
import "./globals.css";
import { loadDemoProfile } from "../src/ssr-demo";

export const metadata: Metadata = {
  title: "lite-fsm playground · Next.js",
  description: "Примеры lite-fsm на Next.js 16 + Tailwind v4",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const profile = await loadDemoProfile();

  return (
    <html lang="ru">
      <body>
        <StoreProvider>
          <StoreSeedInitialize seeds={{ profileSession: profile }}>{children}</StoreSeedInitialize>
        </StoreProvider>
      </body>
    </html>
  );
}
