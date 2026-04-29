"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, FolderGit2 } from "lucide-react";

import { githubSourceUrl } from "@/components/TopBar";
import { exampleById, exampleSourcePath } from "@/lib/examples-manifest";

export function ExamplesSubNav() {
  const pathname = usePathname();
  const segments = pathname?.split("/").filter(Boolean) ?? [];
  const currentId = segments[0] === "examples" ? segments[1] : undefined;
  const current = currentId ? exampleById(currentId) : undefined;

  return (
    <header className="frosted-parchment sticky top-11 z-40 flex h-13 items-center justify-between gap-4 border-b border-hairline px-6">
      <div className="flex min-w-0 items-baseline gap-3">
        {current ? (
          <>
            <p className="text-caption-strong text-primary">{current.kicker}</p>
            <h1 className="truncate text-tagline text-ink">{current.title}</h1>
          </>
        ) : (
          <p className="text-tagline text-ink">Все примеры</p>
        )}
      </div>

      {current ? (
        <div className="flex shrink-0 items-center gap-4">
          <a
            href={`${githubSourceUrl}/${exampleSourcePath(current.id)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-button-utility text-ink-muted-80 transition-colors hover:text-primary"
          >
            <FolderGit2 className="size-4" strokeWidth={1.75} />
            Source
            <ArrowUpRight className="size-3.5" strokeWidth={2} />
          </a>
          <Link href="/" className="text-button-utility text-primary hover:text-primary-focus">
            ← На главную
          </Link>
        </div>
      ) : null}
    </header>
  );
}
