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
    <header className="frosted-parchment sticky top-12 z-40 grid min-h-14 grid-cols-1 items-center gap-x-6 gap-y-2 border-b border-hairline px-6 py-2 sm:grid-cols-[minmax(12rem,17.5rem)_minmax(0,1fr)] md:grid-cols-[minmax(15rem,18.5rem)_minmax(0,1fr)_auto]">
      {current ? (
        <>
          <p className="max-w-64 text-caption-strong leading-snug text-primary">{current.kicker}</p>
          <h1 className="min-w-0 truncate text-tagline text-ink">{current.title}</h1>
        </>
      ) : (
        <p className="text-tagline text-ink sm:col-span-2 md:col-span-3">Все примеры</p>
      )}

      {current ? (
        <div className="flex shrink-0 items-center justify-start gap-4 sm:col-start-2 md:col-start-auto md:justify-end">
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
