import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "lite-fsm playground",
  description: "Apple-style примеры lite-fsm на Next.js",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
