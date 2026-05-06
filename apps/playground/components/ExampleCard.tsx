import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { ExampleDiagram } from "@/components/ExampleDiagram";
import {
  categoryStyle,
  examplePath,
  type ExampleManifestEntry,
  type ExampleTag,
} from "@/lib/examples-manifest";
import { cn } from "@/lib/utils";

const tagLabel: Record<ExampleTag, string> = {
  basics: "basics",
  effects: "effects",
  actors: "actors",
  persist: "persist",
  ssr: "ssr",
};

type ExampleCardProps = {
  example: ExampleManifestEntry;
  index: number;
};

export function ExampleCard({ example, index }: ExampleCardProps) {
  const styles = categoryStyle[example.category];
  const number = String(index).padStart(2, "0");
  const glowVars = {
    "--glow-h": styles.glow.h,
    "--glow-s": styles.glow.s,
    "--glow-l": styles.glow.l,
  } as React.CSSProperties;

  return (
    <Link
      href={examplePath(example.id)}
      data-glow-card
      style={glowVars}
      className="group relative flex h-full overflow-hidden rounded-md bg-canvas outline-none ring-1 ring-hairline transition-shadow duration-300 hover:shadow-card focus-visible:ring-2 focus-visible:ring-primary-focus/40"
    >
      <div className="relative z-2 flex w-full flex-col">
        <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-muted-48">
            <span className="tabular-nums">{number}</span>
            <span className="mx-1.5 text-ink-muted-48/40">/</span>
            <span className={styles.text}>{example.kicker}</span>
          </p>
          <div className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.06em] text-ink-muted-48/70">
            {example.tags.map((tag) => (
              <span key={tag} className="inline-flex items-center gap-1">
                <span aria-hidden className={cn("size-1 rounded-full", styles.accent)} />
                {tagLabel[tag]}
              </span>
            ))}
          </div>
        </div>

        <div
          className={cn(
            "relative mx-5 mb-4 h-[68px] overflow-hidden rounded-sm bg-canvas-parchment/55 ring-1 ring-hairline/70 transition-colors duration-200 group-hover:ring-hairline",
            styles.text,
          )}
        >
          <span
            aria-hidden
            className="absolute inset-0 opacity-[0.28]"
            style={{
              backgroundImage:
                "linear-gradient(to right, rgba(20,22,36,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(20,22,36,0.06) 1px, transparent 1px)",
              backgroundSize: "12px 12px",
            }}
          />
          <ExampleDiagram
            variant={example.iconKey}
            className="relative h-full w-full px-3 py-2"
          />
        </div>

        <div className="flex flex-1 flex-col gap-3 px-5 pb-5">
          <h3 className="text-tagline leading-snug text-ink">{example.title}</h3>
          <p className="text-caption leading-relaxed text-ink-muted-80">
            {example.description}
          </p>

          <div className="mt-auto flex items-center justify-end gap-3 border-t border-dashed border-hairline/70 pt-3">
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-muted-48 transition-all duration-200 group-hover:translate-x-0.5",
                styles.hoverText,
              )}
            >
              open
              <ArrowRight className="size-3" strokeWidth={2.25} />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
