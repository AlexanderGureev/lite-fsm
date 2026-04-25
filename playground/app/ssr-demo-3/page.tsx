import Link from "next/link";

import { demo3Screens, getDemo3ScreenPath } from "@/src/ssr-demo-3";

export default function SSRDemo3IndexPage() {
  return (
    <section className="grid gap-6">
      <header className="grid gap-2 rounded-[20px] border border-slate-400/15 bg-slate-950/70 p-6">
        <p className="text-xs uppercase tracking-[0.24em] text-violet-300/80">snapshot-first streaming</p>
        <h1 className="text-2xl font-semibold text-slate-50">SSR demo 3 · FSMHydrationBoundary snapshots</h1>
        <p className="max-w-2xl text-sm text-slate-400">
          Manifest первой grid-страницы и seed каждого widget приходят как MachineManager snapshots. Клиентские догрузки
          остаются обычными domain events.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        {demo3Screens.map((screen) => (
          <Link
            key={screen.id}
            href={getDemo3ScreenPath(screen.id)}
            className="grid gap-2 rounded-[20px] border border-slate-400/15 bg-slate-950/60 p-5 hover:border-violet-400/30"
          >
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">snapshot route</p>
            <h2 className="text-lg font-semibold text-slate-50">{screen.title}</h2>
            <p className="text-sm text-slate-400">{screen.description}</p>
          </Link>
        ))}
      </section>
    </section>
  );
}
