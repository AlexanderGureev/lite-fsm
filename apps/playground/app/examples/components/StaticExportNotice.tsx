import { Info } from "lucide-react";

export function StaticExportNotice() {
  return (
    <div
      role="note"
      className="flex items-start gap-3 rounded-lg border border-hairline bg-canvas px-4 py-3 text-caption text-ink-muted-80"
    >
      <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={2} />
      <p>
        Текущий playground задеплоен как статический экспорт Next.js — все страницы предрендерены,
        Suspense-фолбэки и потоковая отдача данных уже схлопнуты на этапе билда.
        Чтобы увидеть настоящий React Server Components streaming, запустите пример локально:{" "}
        <code className="rounded-sm bg-canvas-parchment px-1.5 py-0.5 text-[0.92em] text-ink">
          pnpm run playground:dev
        </code>
        .
      </p>
    </div>
  );
}
