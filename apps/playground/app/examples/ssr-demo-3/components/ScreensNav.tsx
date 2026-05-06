"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { cn } from "@/lib/utils";

import { screenConfigs } from "../store/ssr";

export function ScreensNav() {
  const activeScreen = useParams<{ screen?: string }>()?.screen;

  return (
    <nav className="flex flex-wrap items-center gap-2 rounded-lg bg-canvas px-5 py-4 ring-1 ring-hairline">
      {screenConfigs.map((screen) => {
        const href = `/examples/ssr-demo-3/${screen.id}`;
        const isActive = activeScreen === screen.id;
        return (
          <Link
            key={screen.id}
            href={href}
            className={cn(
              "rounded-pill border px-3 py-1.5 text-caption transition-colors",
              isActive
                ? "border-primary bg-primary/10 text-primary"
                : "border-hairline text-ink-muted-80 hover:text-ink",
            )}
          >
            {screen.title}
          </Link>
        );
      })}
    </nav>
  );
}
