import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { bracketMatching, HighlightStyle, indentOnInput, syntaxHighlighting } from "@codemirror/language";
import { EditorState, type Extension } from "@codemirror/state";
import {
  Decoration,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { Alert, AlertDescription, AlertTitle } from "@/ui/alert";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { ScrollArea } from "@/ui/scroll-area";
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
      "flex min-h-10 shrink-0 items-center gap-2 border-b bg-[color:var(--vf-surface-soft)] px-3 py-1.5",
      className,
    )}
    {...props}
  />
);

export const PanelBody = ({ className, ...props }: ComponentProps<"div">) => (
  <div className={cn("min-h-0 flex-1", className)} {...props} />
);

export const PanelKicker = ({ className, ...props }: ComponentProps<"p">) => (
  <p
    className={cn(
      "font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[color:var(--vf-text-quiet)]",
      className,
    )}
    {...props}
  />
);

export type PanelTitleProps = ComponentProps<"div"> & {
  eyebrow: string;
  title: string;
  titleId?: string;
  titleClassName?: string;
};

export const PanelTitle = ({ eyebrow, title, titleId, titleClassName, className, ...props }: PanelTitleProps) => (
  <div className={cn("min-w-0", className)} {...props}>
    <PanelKicker>{eyebrow}</PanelKicker>
    <h2 id={titleId} className={cn("truncate text-[12px] font-semibold leading-tight text-foreground", titleClassName)}>
      {title}
    </h2>
  </div>
);

const statusToneClass = {
  ready: "border-[color:var(--vf-accent-border)] bg-[color:var(--vf-accent-soft)] text-[color:var(--vf-accent)]",
  muted: "border-border bg-muted text-muted-foreground",
  domain: "border-[color:var(--vf-domain-border)] bg-[color:var(--vf-domain-soft)] text-[color:var(--vf-domain)]",
  actor: "border-[color:var(--vf-actor-border)] bg-[color:var(--vf-actor-soft)] text-[color:var(--vf-actor)]",
  routing: "border-[color:var(--vf-routing-border)] bg-[color:var(--vf-routing-soft)] text-[color:var(--vf-routing)]",
  diagnostic: "border-[color:var(--vf-warning-border)] bg-[color:var(--vf-warning-soft)] text-[color:var(--vf-warning)]",
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
  simulation: "border-[color:var(--vf-warning-border)] bg-[color:var(--vf-warning-soft)] text-[color:var(--vf-warning)]",
  reducer: "border-[color:var(--vf-reducer-border)] bg-[color:var(--vf-reducer-soft)] text-[color:var(--vf-reducer)]",
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
    data-layer={layer}
    className={cn(
      "h-[18px] min-w-[34px] justify-center rounded-[3px] px-1.5 py-0 font-mono text-[9px] font-bold uppercase tracking-[0.04em]",
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
      "grid min-h-9 w-full grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,0.8fr)_auto] items-center gap-2 border-t border-[color:var(--vf-border-soft)] px-2.5 py-2 text-left transition-colors first:border-t-0 hover:bg-[color:var(--vf-row-hover)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
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

export const SourceSnippet = ({
  lines,
  className,
  ...props
}: ComponentProps<"div"> & { lines: readonly SourceLine[] }) => (
  <div
    className={cn(
      "overflow-auto rounded-md border border-[color:var(--vf-border-soft)] bg-background py-2",
      className,
    )}
    aria-label="Representative source snippet"
    {...props}
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

const sourceEditorTheme = EditorView.theme(
  {
    "&": {
      height: "100%",
      minHeight: "100%",
      backgroundColor: "var(--vf-surface)",
      color: "var(--foreground)",
      fontFamily: "var(--vf-mono)",
      fontSize: "13px",
    },
    ".cm-scroller": {
      fontFamily: "var(--vf-mono)",
      lineHeight: "1.72",
      overflow: "auto",
    },
    ".cm-content": {
      minHeight: "100%",
      padding: "12px 0",
      caretColor: "var(--primary)",
    },
    ".cm-line": {
      padding: "0 14px 0 12px",
    },
    ".cm-gutters": {
      backgroundColor: "var(--vf-surface-soft)",
      borderRight: "1px solid var(--vf-border-soft)",
      color: "var(--vf-text-quiet)",
    },
    ".cm-lineNumbers .cm-gutterElement": {
      minWidth: "48px",
      padding: "0 12px 0 10px",
    },
    ".cm-activeLine": {
      backgroundColor: "var(--vf-row-hover)",
    },
    ".cm-sourceOverlaySelectedLine": {
      backgroundColor: "var(--vf-accent-soft)",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "var(--vf-row-hover)",
      color: "var(--foreground)",
    },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
      backgroundColor: "color-mix(in oklch, var(--primary) 24%, transparent)",
    },
    "&.cm-focused": {
      outline: "none",
    },
    "&.cm-focused .cm-scroller": {
      outline: "none",
    },
  },
  { dark: true },
);

const sourceHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: "var(--vf-accent)" },
  { tag: tags.operatorKeyword, color: "var(--vf-accent)" },
  { tag: tags.definitionKeyword, color: "var(--vf-accent)" },
  { tag: tags.moduleKeyword, color: "var(--vf-accent)" },
  { tag: tags.definition(tags.variableName), color: "var(--vf-domain)" },
  { tag: tags.function(tags.variableName), color: "var(--vf-domain)" },
  { tag: tags.function(tags.propertyName), color: "var(--vf-domain)" },
  { tag: tags.variableName, color: "var(--vf-text)" },
  { tag: tags.propertyName, color: "var(--vf-effect)" },
  { tag: [tags.string, tags.special(tags.string)], color: "var(--vf-warning)" },
  { tag: [tags.number, tags.bool, tags.atom], color: "var(--vf-config)" },
  { tag: [tags.typeName, tags.className], color: "var(--vf-routing)" },
  { tag: [tags.operator, tags.punctuation, tags.bracket], color: "var(--vf-text-muted)" },
  { tag: tags.comment, color: "var(--vf-text-quiet)", fontStyle: "italic" },
  { tag: tags.invalid, color: "var(--vf-danger)" },
]);

const sourceEditorSelectedLineHighlight = (highlightedLineNumbers: readonly number[] | undefined): Extension => {
  const selectedLineNumbers = new Set(highlightedLineNumbers ?? []);
  if (selectedLineNumbers.size === 0) return [];

  return EditorView.decorations.of((view) =>
    Decoration.set(
      [...selectedLineNumbers]
        .filter((lineNumber) => lineNumber >= 1 && lineNumber <= view.state.doc.lines)
        .map((lineNumber) => Decoration.line({ class: "cm-sourceOverlaySelectedLine" }).range(view.state.doc.line(lineNumber).from)),
      true,
    ),
  );
};

const sourceEditorExtensions = (
  label: string,
  readOnly: boolean,
  onValueChange: (value: string) => void,
  firstLineNumber: number,
  highlightedLineNumbers: readonly number[] | undefined,
) => [
  lineNumbers({
    formatNumber: (lineNumber) => String(lineNumber + firstLineNumber - 1),
  }),
  highlightActiveLineGutter(),
  history(),
  drawSelection(),
  dropCursor(),
  rectangularSelection(),
  indentOnInput(),
  bracketMatching(),
  syntaxHighlighting(sourceHighlightStyle),
  javascript({ typescript: true, jsx: true }),
  highlightActiveLine(),
  EditorState.tabSize.of(2),
  EditorState.readOnly.of(readOnly),
  EditorView.editable.of(!readOnly),
  EditorView.lineWrapping,
  EditorView.contentAttributes.of({ "aria-label": label }),
  EditorView.updateListener.of((update) => {
    if (update.docChanged) onValueChange(update.state.doc.toString());
  }),
  keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
  sourceEditorSelectedLineHighlight(highlightedLineNumbers),
  sourceEditorTheme,
];

export const SourceEditorShell = ({
  label,
  value,
  textareaTestId,
  className,
  textareaClassName,
  readOnly = false,
  firstLineNumber = 1,
  highlightedLineNumbers,
  onValueChange,
  children,
}: {
  label: string;
  value: string;
  textareaTestId?: string;
  className?: string;
  textareaClassName?: string;
  readOnly?: boolean;
  firstLineNumber?: number;
  highlightedLineNumbers?: readonly number[];
  onValueChange?: (value: string) => void;
  children?: ReactNode;
}) => {
  const editorElement = useRef<HTMLDivElement | null>(null);
  const editorView = useRef<EditorView | null>(null);
  const suppressChange = useRef(false);
  const valueChangeHandler = useRef(onValueChange);
  const [initialValue] = useState(value);

  useEffect(() => {
    valueChangeHandler.current = onValueChange;
  }, [onValueChange]);

  useEffect(() => {
    const extensions = sourceEditorExtensions(label, readOnly, (nextValue) => {
      if (!suppressChange.current) valueChangeHandler.current?.(nextValue);
    }, firstLineNumber, highlightedLineNumbers);
    const view = new EditorView({
      parent: editorElement.current!,
      state: EditorState.create({ doc: initialValue, extensions }),
    });

    editorView.current = view;

    return () => {
      view.destroy();
      editorView.current = null;
    };
  }, [firstLineNumber, highlightedLineNumbers, initialValue, label, readOnly]);

  useEffect(() => {
    const view = editorView.current!;

    const currentValue = view.state.doc.toString();
    if (currentValue === value) return;

    try {
      suppressChange.current = true;
      view.dispatch({ changes: { from: 0, to: currentValue.length, insert: value } });
    } finally {
      suppressChange.current = false;
    }
  }, [value]);

  return (
    <div className={cn("flex min-h-0 flex-col gap-2", className)}>
      <div
        ref={editorElement}
        data-testid={textareaTestId}
        data-readonly={readOnly}
        data-first-line-number={firstLineNumber}
        data-highlighted-line-numbers={highlightedLineNumbers?.join(",") ?? ""}
        className={cn(
          "min-h-28 overflow-hidden rounded-lg border bg-[color:var(--vf-surface)] text-foreground shadow-none",
          textareaClassName,
        )}
      />
      {children}
    </div>
  );
};

export const DiagnosticsAlert = ({ children, className, ...props }: ComponentProps<typeof Alert>) => (
  <Alert
    className={cn(
      "border-[color:var(--vf-warning-border)] bg-[color:var(--vf-warning-soft)] text-foreground",
      className,
    )}
    {...props}
  >
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

export type DensityRowRelation = "idle" | "selected" | "related" | "dimmed";

const densityRowRelationClass: Record<DensityRowRelation, string> = {
  idle: "border-transparent bg-transparent hover:bg-[color:var(--vf-row-hover)]",
  selected:
    "border-transparent bg-[color:var(--vf-accent-soft)] shadow-[inset_2px_0_0_var(--vf-accent)] hover:bg-[color:var(--vf-accent-soft)]",
  related:
    "border-transparent bg-[color:var(--vf-row-related)] hover:bg-[color:var(--vf-row-related)]",
  dimmed: "border-transparent bg-transparent opacity-40 hover:bg-[color:var(--vf-row-hover)]",
};

export type DensityRowProps = ComponentProps<"button"> & {
  relation?: DensityRowRelation;
};

export const DensityRow = ({ className, relation = "idle", type, ...props }: DensityRowProps) => (
  <button
    type={type ?? "button"}
    data-relation-state={relation}
    className={cn(
      "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-y border-[color:var(--vf-border-soft)] px-3 py-1.5 text-left transition-colors first:border-t-0 last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
      densityRowRelationClass[relation],
      className,
    )}
    {...props}
  />
);

export type CounterTone = "neutral" | "in" | "out" | "warning";

const counterToneClass: Record<CounterTone, string> = {
  neutral: "text-[color:var(--vf-text-quiet)]",
  in: "text-[color:var(--vf-counter-in)]",
  out: "text-[color:var(--vf-counter-out)]",
  warning: "text-[color:var(--vf-warning)]",
};

export type CounterProps = ComponentProps<"span"> & {
  tone?: CounterTone;
};

export const Counter = ({ tone = "neutral", className, ...props }: CounterProps) => (
  <span
    className={cn(
      "inline-flex shrink-0 items-center rounded-[3px] bg-[color:var(--vf-counter-surface)] px-1.5 font-mono text-[10px] leading-[18px]",
      counterToneClass[tone],
      className,
    )}
    {...props}
  />
);

export type ChipProps = ComponentProps<"button">;

export const Chip = ({ className, type, ...props }: ChipProps) => (
  <button
    type={type ?? "button"}
    className={cn(
      "inline-flex items-center gap-1.5 rounded-md border border-[color:var(--vf-border)] bg-[color:var(--vf-surface-soft)] px-2 py-1 font-mono text-[11px] text-foreground transition-colors hover:border-[color:var(--vf-accent-border)] hover:bg-[color:var(--vf-accent-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
      className,
    )}
    {...props}
  />
);

export type ChipPillProps = ComponentProps<"span"> & {
  tone?: CounterTone;
};

export const ChipPill = ({ tone = "neutral", className, ...props }: ChipPillProps) => (
  <span
    className={cn(
      "inline-flex items-center rounded-full bg-[color:var(--vf-counter-surface)] px-1.5 font-mono text-[9px] leading-[16px]",
      counterToneClass[tone],
      className,
    )}
    {...props}
  />
);

export const RoutingPill = ({ className, ...props }: ComponentProps<"span">) => (
  <span
    className={cn(
      "inline-flex items-center rounded-[3px] bg-[color:var(--vf-routing-soft)] px-1.5 font-mono text-[9px] leading-[16px] text-[color:var(--vf-routing)]",
      className,
    )}
    {...props}
  />
);

export const PulseDot = ({ className, ...props }: ComponentProps<"span">) => (
  <span aria-hidden="true" className={cn("vf-pulse-dot", className)} {...props} />
);
