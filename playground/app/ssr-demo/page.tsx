import Link from "next/link";

import { demoScreens, getDemoScreenPath } from "@/src/ssr-demo";

export default function SSRDemoIndexPage() {
  return (
    <section className="grid gap-6">
      <header className="grid gap-2 rounded-[20px] border border-slate-400/15 bg-slate-950/70 p-6">
        <p className="text-xs uppercase tracking-[0.24em] text-blue-300/80">two hydration patterns</p>
        <h1 className="text-2xl font-semibold text-slate-50">Long-lived store + cache-like widget store</h1>
        <p className="max-w-2xl text-sm text-slate-400">
          `profileSession` грузится один раз в <code>layout.tsx</code> и живёт всю сессию. `widgetFeed` получает server seed
          на уровне каждого widget и дальше работает как cache.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        {demoScreens.map((screen) => (
          <Link
            key={screen.id}
            href={getDemoScreenPath(screen.id)}
            className="grid gap-2 rounded-[20px] border border-slate-400/15 bg-slate-950/60 p-5 hover:border-blue-400/30"
          >
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">server route</p>
            <h2 className="text-lg font-semibold text-slate-50">{screen.title}</h2>
            <p className="text-sm text-slate-400">{screen.description}</p>
          </Link>
        ))}
      </section>
    </section>
  );
}
