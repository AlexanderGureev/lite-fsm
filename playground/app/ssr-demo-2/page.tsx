import Link from "next/link";

import { demo2Screens, getDemo2ScreenPath } from "@/src/ssr-demo-2";

export default function SSRDemo2IndexPage() {
  return (
    <section className="grid gap-6">
      <header className="grid gap-2 rounded-[20px] border border-slate-400/15 bg-slate-950/70 p-6">
        <p className="text-xs uppercase tracking-[0.24em] text-emerald-300/80">manifest-first streaming</p>
        <h1 className="text-2xl font-semibold text-slate-50">SSR demo 2 · grid pagination + entityList</h1>
        <p className="max-w-2xl text-sm text-slate-400">
          Сервер отдаёт только первую страницу grid manifest. Виджеты первой страницы стримятся независимо, а следующие
          grid-страницы клиент догружает через `FETCH_GRID_PAGE`.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        {demo2Screens.map((screen) => (
          <Link
            key={screen.id}
            href={getDemo2ScreenPath(screen.id)}
            className="grid gap-2 rounded-[20px] border border-slate-400/15 bg-slate-950/60 p-5 hover:border-emerald-400/30"
          >
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">manifest route</p>
            <h2 className="text-lg font-semibold text-slate-50">{screen.title}</h2>
            <p className="text-sm text-slate-400">{screen.description}</p>
          </Link>
        ))}
      </section>
    </section>
  );
}
