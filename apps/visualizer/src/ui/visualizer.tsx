import type { ComponentProps, ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/ui/alert";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { ScrollArea } from "@/ui/scroll-area";
import { Textarea } from "@/ui/textarea";
import { cn } from "@/lib/utils";

export type PanelProps = ComponentProps<"section"> & {
  rail?: boolean;
};

export const Panel = ({ className, rail = false, ...props }: PanelProps) => (
  <section
    className={cn(
      "flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border bg-card text-card-foreground",
      rail && "min-h-[300px]",
      className,
    )}
    {...props}
  />
);

export const PanelHeader = ({ className, ...props }: ComponentProps<"header">) => (
  <header
    className={cn(
      "flex min-h-11 shrink-0 items-center gap-2 border-b bg-[color:var(--vf-surface-raised)] px-3 py-2",
      className,
    )}
    {...props}
  />
);

export const PanelBody = ({ className, ...props }: ComponentProps<"div">) => (
  <div className={cn("min-h-0 flex-1", className)} {...props} />
);

export const PanelKicker = ({ className, ...props }: ComponentProps<"p">) => (
  <p className={cn("font-mono text-[10px] font-bold uppercase text-[color:var(--vf-text-quiet)]", className)} {...props} />
);

const statusToneClass = {
  ready: "border-[color:var(--vf-accent-border)] bg-[color:var(--vf-accent-soft)] text-[color:var(--vf-accent)]",
  muted: "border-border bg-muted text-muted-foreground",
  actor: "border-[color:oklch(0.75_0.105_62/0.42)] bg-[color:oklch(0.75_0.105_62/0.1)] text-[color:var(--vf-actor)]",
  routing: "border-[color:var(--vf-routing-border)] bg-[color:var(--vf-routing-soft)] text-[color:var(--vf-routing)]",
  diagnostic: "border-[color:oklch(0.79_0.115_92/0.42)] bg-[color:var(--vf-warning-soft)] text-[color:var(--vf-warning)]",
} as const;

export type StatusBadgeTone = keyof typeof statusToneClass;

export const StatusBadge = ({
  tone = "muted",
  className,
  ...props
}: ComponentProps<typeof Badge> & { tone?: StatusBadgeTone }) => (
  <Badge
    variant="outline"
    className={cn("h-5 rounded-full px-2 font-mono text-[10px] font-semibold", statusToneClass[tone], className)}
    {...props}
  />
);

const layerToneClass = {
  config: "border-[color:var(--vf-config-border)] bg-[color:var(--vf-config-soft)] text-[color:var(--vf-config)]",
  effect: "border-[color:var(--vf-effect-border)] bg-[color:var(--vf-effect-soft)] text-[color:var(--vf-effect)]",
  simulation: "border-[color:oklch(0.79_0.115_92/0.42)] bg-[color:var(--vf-warning-soft)] text-[color:var(--vf-warning)]",
  reducer: "border-[color:oklch(0.75_0.074_266/0.42)] bg-[color:oklch(0.75_0.074_266/0.1)] text-[color:var(--vf-reducer)]",
} as const;

const layerLabel = {
  config: "cfg",
  effect: "eff",
  simulation: "sim",
  reducer: "red",
} as const;

export type LayerBadgeKind = keyof typeof layerToneClass;

export const LayerBadge = ({ layer, className }: { layer: LayerBadgeKind; className?: string }) => (
  <Badge
    variant="outline"
    className={cn(
      "h-5 min-w-8 rounded-md px-1.5 font-mono text-[10px] font-bold",
      layerToneClass[layer],
      className,
    )}
  >
    {layerLabel[layer]}
  </Badge>
);

export type GraphRowProps = ComponentProps<"button"> & {
  layer: LayerBadgeKind;
  event: string;
  target: string;
  meta: string;
  selected?: boolean;
};

export const GraphRow = ({ className, layer, event, target, meta, selected = false, ...props }: GraphRowProps) => (
  <button
    type="button"
    className={cn(
      "grid min-h-9 w-full grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,0.8fr)_auto] items-center gap-2 border-t border-[color:var(--vf-border-soft)] px-2.5 py-2 text-left transition-colors first:border-t-0 hover:bg-[color:oklch(0.925_0.012_248/0.035)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      selected && "bg-[color:var(--vf-accent-soft)]",
      className,
    )}
    {...props}
  >
    <LayerBadge layer={layer} />
    <span className="min-w-0 font-mono text-[11px] text-foreground [overflow-wrap:anywhere]">{event}</span>
    <span className="font-mono text-[10px] text-[color:var(--vf-text-quiet)]">to</span>
    <span className="min-w-0 font-mono text-[11px] text-primary [overflow-wrap:anywhere]">{target}</span>
    <span className="min-w-0 justify-self-end text-right font-mono text-[10px] text-[color:var(--vf-text-quiet)]">{meta}</span>
  </button>
);

export type SourceLine = {
  line: number;
  code: string;
  selected?: boolean;
};

export const SourceSnippet = ({ lines, className }: { lines: readonly SourceLine[]; className?: string }) => (
  <div
    className={cn(
      "overflow-auto rounded-md border border-[color:var(--vf-border-soft)] bg-background py-2",
      className,
    )}
    aria-label="Representative source snippet"
  >
    {lines.map((line) => (
      <div
        key={line.line}
        className={cn(
          "grid grid-cols-[38px_minmax(0,1fr)] gap-2 px-3 py-1 font-mono text-[11px] leading-relaxed text-muted-foreground",
          line.selected && "bg-[color:var(--vf-accent-soft)] text-foreground",
        )}
      >
        <span className="select-none text-right text-[color:var(--vf-text-quiet)]">{line.line}</span>
        <code className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]">{line.code}</code>
      </div>
    ))}
  </div>
);

export const SourceEditorShell = ({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children?: ReactNode;
}) => (
  <div className="flex min-h-0 flex-col gap-2">
    <Textarea
      aria-label={label}
      readOnly
      value={value}
      className="min-h-28 resize-none rounded-md bg-background font-mono text-[11px] leading-relaxed text-foreground shadow-none"
    />
    {children}
  </div>
);

export const DiagnosticsAlert = ({ children }: { children: ReactNode }) => (
  <Alert className="border-[color:oklch(0.79_0.115_92/0.34)] bg-[color:var(--vf-warning-soft)] text-foreground">
    <AlertTitle className="font-mono text-[11px] text-[color:var(--vf-warning)]">analyzer</AlertTitle>
    <AlertDescription className="text-muted-foreground">{children}</AlertDescription>
  </Alert>
);

export const PaneScrollArea = ({ className, ...props }: ComponentProps<typeof ScrollArea>) => (
  <ScrollArea className={cn("min-h-0 flex-1", className)} {...props} />
);

export const IconButton = ({ className, ...props }: ComponentProps<typeof Button>) => (
  <Button variant="outline" size="icon" className={cn("shrink-0", className)} {...props} />
);
