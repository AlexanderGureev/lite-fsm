import Link from "next/link";
import {
  ArrowRight,
  Camera,
  Gamepad2,
  Grid,
  Heart,
  Lightbulb,
  Server,
  Spline,
  Users,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  categoryStyle,
  examplePath,
  type ExampleIconKey,
  type ExampleManifestEntry,
  type ExampleTag,
} from "@/lib/examples-manifest";
import { cn } from "@/lib/utils";

const iconByKey: Record<ExampleIconKey, LucideIcon> = {
  lamp: Lightbulb,
  heart: Heart,
  actors: Users,
  network: Spline,
  gamepad: Gamepad2,
  streaming: Server,
  grid: Grid,
  snapshot: Camera,
};

const tagLabel: Record<ExampleTag, string> = {
  basics: "Basics",
  effects: "Effects",
  actors: "Actors",
  ssr: "SSR",
};

export function ExampleCard({ example }: { example: ExampleManifestEntry }) {
  const styles = categoryStyle[example.category];
  const Icon = iconByKey[example.iconKey];

  return (
    <Link
      href={examplePath(example.id)}
      className="group relative flex h-full flex-col overflow-hidden rounded-lg bg-canvas ring-1 ring-hairline outline-none transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card hover:ring-primary/40 focus-visible:ring-3 focus-visible:ring-primary-focus/40 active:scale-[0.99]"
    >
      <div aria-hidden className={cn("absolute inset-x-0 top-0 h-[3px]", styles.accent)} />

      <div className="flex flex-col gap-3 px-6 pt-6">
        <div className="flex items-start justify-between gap-3">
          <span
            aria-hidden
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-md",
              styles.bgSoft,
              styles.text,
            )}
          >
            <Icon className="size-5" strokeWidth={1.75} />
          </span>
          <span
            className={cn(
              "pt-1 text-fine-print font-medium uppercase tracking-[0.08em]",
              styles.text,
            )}
          >
            {example.kicker}
          </span>
        </div>

        <h3 className="text-tagline text-ink">{example.title}</h3>
      </div>

      <div className="flex flex-1 flex-col justify-between gap-5 px-6 pb-6 pt-3">
        <p className="text-body text-ink-muted-80">{example.description}</p>

        <div className="flex items-end justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {example.tags.map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="rounded-pill bg-canvas-parchment px-2.5 py-0.5 text-fine-print font-medium text-ink-muted-48"
              >
                {tagLabel[tag]}
              </Badge>
            ))}
          </div>
          <span
            aria-hidden
            className={cn(
              "inline-flex shrink-0 items-center gap-1 text-caption-strong opacity-0 transition-opacity duration-200 group-hover:opacity-100",
              styles.text,
            )}
          >
            Открыть
            <ArrowRight className="size-3.5" strokeWidth={2.25} />
          </span>
        </div>
      </div>
    </Link>
  );
}
