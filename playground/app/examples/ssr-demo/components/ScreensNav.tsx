"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { useSelector } from "../store";
import { selectProfileSessionProfile } from "../store/machines/profileSession";
import { demoScreens } from "../store/ssr";

export function ScreensNav() {
  const activeScreen = useParams<{ screen?: string }>()?.screen;
  const profile = useSelector(selectProfileSessionProfile);

  return (
    <header className="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-canvas px-5 py-4 ring-1 ring-hairline">
      <nav className="flex flex-wrap items-center gap-2">
        {demoScreens.map((screen) => {
          const href = `/examples/ssr-demo/${screen.id}`;
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
              {screen.title.replace(/^Страница [AB] · /, "")}
            </Link>
          );
        })}
      </nav>

      {profile ? (
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="rounded-pill bg-canvas-parchment text-caption text-ink-muted-80">
            long-lived store
          </Badge>
          <div className="text-right">
            <p className="text-caption-strong text-ink">{profile.displayName}</p>
            <p className="text-caption text-ink-muted-48">{profile.handle}</p>
          </div>
        </div>
      ) : null}
    </header>
  );
}
