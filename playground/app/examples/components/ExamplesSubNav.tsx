"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { exampleById } from "@/lib/examples-manifest";

export function ExamplesSubNav() {
  const pathname = usePathname();
  const segments = pathname?.split("/").filter(Boolean) ?? [];
  const currentId = segments[0] === "examples" ? segments[1] : undefined;
  const current = currentId ? exampleById(currentId) : undefined;

  return (
    <header className="frosted-parchment sticky top-11 z-40 flex h-13 items-center justify-between border-b border-hairline px-6">
      <div className="flex items-baseline gap-3">
        {current ? (
          <>
            <p className="text-caption-strong text-primary">{current.kicker}</p>
            <h1 className="text-tagline text-ink">{current.title}</h1>
          </>
        ) : (
          <p className="text-tagline text-ink">Все примеры</p>
        )}
      </div>

      {current ? (
        <Link href="/" className="text-button-utility text-primary hover:text-primary-focus">
          ← На главную
        </Link>
      ) : null}
    </header>
  );
}
