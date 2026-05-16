import type { GraphSourceAnchor } from "@lite-fsm/graph/view-model";
import { formatSourceLocationLabel } from "../lib/source-location";
import type { SourceTextResolution } from "../source-access";
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
      sourceStatus: SourceTextResolution["status"] | "no-range";
      locationLabel?: string;
      lines: readonly SourceOverlayLineView[];
      fullSource?: string;
      fallback?: string;
    };

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
    sourceStatus: "ready",
    locationLabel,
    lines: viewLines,
    fullSource: source,
  };
};

export const buildSourceOverlayView = (
  sourceResolution: SourceTextResolution,
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
      sourceStatus: "no-range",
      locationLabel: undefined,
      lines: [],
      fallback: "Source range is not available for this graph item.",
    };
  }

  const locationLabel = formatSourceLocationLabel(anchor.loc);
  if (sourceResolution.status !== "ready") {
    return {
      open: true,
      title: overlay.title,
      sourceVersion: overlay.sourceVersion,
      anchorCount: overlay.anchors.length,
      sourceStatus: sourceResolution.status,
      locationLabel,
      lines: [],
      fallback:
        sourceResolution.status === "loading"
          ? `${locationLabel}\nLoading source text from local session.`
          : `${locationLabel}\n${sourceResolution.message}`,
    };
  }

  return buildSnippetView(sourceResolution.text, overlay, anchor, locationLabel);
};
