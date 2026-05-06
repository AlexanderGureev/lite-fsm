import Link from "next/link";

import { LiteFsmMark } from "@/components/LiteFsmMark";

const isProduction = process.env.NODE_ENV === "production";

const DOCS_URL = isProduction ? "/lite-fsm/" : "https://alexandergureev.github.io/lite-fsm/";
const GITHUB_URL = "https://github.com/AlexanderGureev/lite-fsm";
const GITHUB_SOURCE_URL = "https://github.com/AlexanderGureev/lite-fsm/tree/rc-2.0";
const NPM_URL = "https://www.npmjs.com/package/@lite-fsm/core";

export function TopBar() {
  return (
    <nav className="sticky top-0 z-50 flex h-12 items-center justify-between bg-surface-black px-6 text-on-dark">
      <Link
        href="/"
        className="group flex items-center gap-2 text-nav-link tracking-wider text-on-dark/90 transition-colors hover:text-on-dark"
      >
        <LiteFsmMark aria-hidden className="size-4 text-primary-on-dark" />
        <span>lite-fsm</span>
        <span className="hidden text-on-dark/40 sm:inline">·</span>
        <span className="hidden text-on-dark/55 sm:inline">playground</span>
      </Link>

      <div className="flex items-center gap-5">
        <a
          href={DOCS_URL}
          rel="noopener noreferrer"
          className="text-nav-link text-on-dark/70 transition-colors hover:text-on-dark"
        >
          Документация
        </a>
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-nav-link text-on-dark/70 transition-colors hover:text-on-dark"
        >
          GitHub
        </a>
      </div>
    </nav>
  );
}

export const docsUrl = DOCS_URL;
export const githubUrl = GITHUB_URL;
export const githubSourceUrl = GITHUB_SOURCE_URL;
export const npmUrl = NPM_URL;
