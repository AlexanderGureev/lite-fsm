"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { demo3Screens, getDemo3ScreenPath } from "@/src/ssr-demo-3";
import { useSelector } from "@/src/store";
import { selectProfileSessionProfile } from "@/src/store/machines/profileSession";

const getLinkClass = (isActive: boolean) =>
  `rounded-full border px-3 py-1 transition-colors ${
    isActive
      ? "border-violet-400/40 bg-violet-500/10 text-violet-100"
      : "border-slate-400/15 text-slate-300 hover:text-slate-50"
  }`;

export default function SSRDemo3TopBar() {
  const pathname = usePathname();
  const profile = useSelector(selectProfileSessionProfile);
  const isClassicDemoActive = pathname.startsWith("/ssr-demo") && !pathname.startsWith("/ssr-demo-");

  if (!profile) return null;

  return (
    <header className="flex flex-wrap items-center justify-between gap-4 rounded-[20px] border border-slate-400/15 bg-slate-950/70 p-4">
      <nav className="flex flex-wrap items-center gap-2 text-sm">
        <Link href="/ssr-demo" className={getLinkClass(isClassicDemoActive)}>
          SSR demo
        </Link>
        <Link href="/ssr-demo-2" className={getLinkClass(pathname.startsWith("/ssr-demo-2"))}>
          SSR demo 2
        </Link>
        <Link href="/ssr-demo-3" className={getLinkClass(pathname === "/ssr-demo-3")}>
          SSR demo 3
        </Link>
        {demo3Screens.map((screen) => (
          <Link
            key={screen.id}
            href={getDemo3ScreenPath(screen.id)}
            className={getLinkClass(pathname === getDemo3ScreenPath(screen.id))}
          >
            {screen.title}
          </Link>
        ))}
      </nav>

      <div className="text-right">
        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">long-lived store</p>
        <p className="text-sm font-medium text-slate-100">{profile.displayName}</p>
        <p className="text-xs text-slate-400">{profile.handle}</p>
      </div>
    </header>
  );
}
