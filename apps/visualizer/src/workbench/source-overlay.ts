import type { GraphSourceAnchor } from "@lite-fsm/graph/view-model";
import { formatSourceLocationLabel, matchesSourceFile } from "../lib/source-location";
import type { LiteFsmProjectGraphSourceBundle } from "../project-export";
import type { SourceOverlayState } from "./types";

const SOURCE_CONTEXT_LINES = 2;
const SOURCE_MAX_LINES = 14;
const MACHINE_ANCHOR_PRIORITY: readonly GraphSourceAnchor["kind"][] = [
  "machine",
  "initial-state",
  "initial-context",
  "config-transition",
  "reducer-branch",
  "effect-emission",
];

export type SourceOverlayLineView = {
  line: number;
  code: string;
  selected: boolean;
};

export type SourceOverlayView =
  | { open: false }
  | {
      open: true;
      title: string;
      sourceVersion: number;
      anchorCount: number;
      locationLabel?: string;
      lines: readonly SourceOverlayLineView[];
      fallback?: string;
    };

export type SourceOverlaySourceContext =
  | { kind: "pasted-source"; source: string; filename?: string }
  | { kind: "project-export"; sources?: LiteFsmProjectGraphSourceBundle }
  | { kind: "local-session" };

type LocatedGraphSourceAnchor = GraphSourceAnchor & { loc: NonNullable<GraphSourceAnchor["loc"]> };

const hasSourceLocation = (anchor: GraphSourceAnchor): anchor is LocatedGraphSourceAnchor => anchor.loc !== undefined;

const priorityOf = (anchor: GraphSourceAnchor): number => {
  const priority = MACHINE_ANCHOR_PRIORITY.indexOf(anchor.kind);

  return priority === -1 ? MACHINE_ANCHOR_PRIORITY.length : priority;
};

export const prioritizeMachineSourceAnchors = (
  anchors: readonly GraphSourceAnchor[],
): readonly GraphSourceAnchor[] => [...anchors].sort((left, right) => priorityOf(left) - priorityOf(right));

const sourceLines = (source: string): readonly string[] => source.split(/\r?\n/);

const sourceUnavailableFallback = (
  context: Exclude<SourceOverlaySourceContext, { kind: "pasted-source" }>,
  label: string,
): string => {
  if (context.kind === "project-export") {
    return `${label}\nSource text is not included in the JSON export.`;
  }

  return `${label}\nSource text is not available from the current visualizer host.`;
};

const sourceByFileName = (
  sources: LiteFsmProjectGraphSourceBundle | undefined,
  fileName: string | undefined,
): string | undefined => {
  if (!sources || !fileName) return undefined;

  return sources.files.find((source) => source.fileName === fileName)?.text;
};

const buildSnippetView = (
  source: string,
  overlay: SourceOverlayState,
  anchor: GraphSourceAnchor & { loc: NonNullable<GraphSourceAnchor["loc"]> },
  locationLabel: string,
): Extract<SourceOverlayView, { open: true }> => {
  const lines = sourceLines(source);
  const selectedStartLine = Math.max(1, Math.min(lines.length, anchor.loc.start.line));
  const selectedEndLine = Math.max(selectedStartLine, Math.min(lines.length, anchor.loc.end.line));
  const startLine = Math.max(1, selectedStartLine - SOURCE_CONTEXT_LINES);
  const unclippedEndLine = Math.min(lines.length, selectedEndLine + SOURCE_CONTEXT_LINES);
  const clippedEndLine = Math.min(unclippedEndLine, startLine + SOURCE_MAX_LINES - 1);
  const endLine = Math.max(clippedEndLine, selectedEndLine);
  const viewLines: SourceOverlayLineView[] = [];

  for (let line = startLine; line <= endLine; line += 1) {
    viewLines.push({
      line,
      code: lines[line - 1],
      selected: line >= selectedStartLine && line <= selectedEndLine,
    });
  }

  return {
    open: true,
    title: overlay.title,
    sourceVersion: overlay.sourceVersion,
    anchorCount: overlay.anchors.length,
    locationLabel,
    lines: viewLines,
  };
};

export const buildSourceOverlayView = (
  sourceContext: SourceOverlaySourceContext,
  overlay: SourceOverlayState | undefined,
): SourceOverlayView => {
  if (!overlay) return { open: false };

  const anchor = overlay.anchors.find(hasSourceLocation);
  if (!anchor) {
    return {
      open: true,
      title: overlay.title,
      sourceVersion: overlay.sourceVersion,
      anchorCount: overlay.anchors.length,
      locationLabel: undefined,
      lines: [],
      fallback: "Source range is not available for this graph item.",
    };
  }

  const locationLabel = formatSourceLocationLabel(anchor.loc);
  if (sourceContext.kind === "project-export") {
    const source = sourceByFileName(sourceContext.sources, anchor.loc.fileName);
    if (source !== undefined) return buildSnippetView(source, overlay, anchor, locationLabel);

    return {
      open: true,
      title: overlay.title,
      sourceVersion: overlay.sourceVersion,
      anchorCount: overlay.anchors.length,
      locationLabel,
      lines: [],
      fallback: sourceUnavailableFallback(sourceContext, locationLabel),
    };
  }

  if (sourceContext.kind !== "pasted-source") {
    return {
      open: true,
      title: overlay.title,
      sourceVersion: overlay.sourceVersion,
      anchorCount: overlay.anchors.length,
      locationLabel,
      lines: [],
      fallback: sourceUnavailableFallback(sourceContext, locationLabel),
    };
  }

  if (!matchesSourceFile(anchor.loc, sourceContext.filename)) {
    return {
      open: true,
      title: overlay.title,
      sourceVersion: overlay.sourceVersion,
      anchorCount: overlay.anchors.length,
      locationLabel,
      lines: [],
      fallback: `${locationLabel}\nSource text for this file is not available in the current pasted source.`,
    };
  }

  return buildSnippetView(sourceContext.source, overlay, anchor, locationLabel);
};
