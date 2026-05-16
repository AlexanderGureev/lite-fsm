import type { GraphSourceAnchor } from "@lite-fsm/graph/view-model";
import { matchesSourceFile } from "../lib/source-location";
import type { LiteFsmProjectGraphSourceBundle } from "../project-export";
import { getSourceAccessEntry } from "./source-cache";
import type { LocalSessionSourceMetadata, SourceAccessFetchRequest, SourceAccessState, SourceTextResolution } from "./types";

export type SourceTextContext =
  | { kind: "pasted-source"; source: string; filename?: string }
  | { kind: "project-export"; sources?: LiteFsmProjectGraphSourceBundle }
  | ({ kind: "local-session"; sessionId: string; token: string; sourceAccess: SourceAccessState } & LocalSessionSourceMetadata);

type LocatedGraphSourceAnchor = GraphSourceAnchor & { loc: NonNullable<GraphSourceAnchor["loc"]> };

export const hasSourceLocation = (anchor: GraphSourceAnchor): anchor is LocatedGraphSourceAnchor => anchor.loc !== undefined;

export const firstLocatedSourceAnchor = (
  anchors: readonly GraphSourceAnchor[],
): LocatedGraphSourceAnchor | undefined => anchors.find(hasSourceLocation);

const sourceByFileName = (
  sources: LiteFsmProjectGraphSourceBundle | undefined,
  fileName: string | undefined,
): string | undefined => {
  if (!sources || !fileName) return undefined;

  return sources.files.find((source) => source.fileName === fileName)?.text;
};

const projectFileHash = (
  context: LocalSessionSourceMetadata,
  fileName: string | undefined,
): string | undefined => {
  if (!fileName) return undefined;

  return context.files.find((file) => file.fileName === fileName)?.hash;
};

export const resolveSourceText = (
  context: SourceTextContext,
  anchor: LocatedGraphSourceAnchor,
): SourceTextResolution => {
  if (context.kind === "pasted-source") {
    if (!matchesSourceFile(anchor.loc, context.filename)) {
      return { status: "unavailable", message: "Source text for this file is not available in the current pasted source." };
    }

    return { status: "ready", text: context.source };
  }

  if (context.kind === "project-export") {
    const source = sourceByFileName(context.sources, anchor.loc.fileName);
    if (source !== undefined) return { status: "ready", text: source };

    return { status: "unavailable", message: "Source text is not included in the JSON export." };
  }

  const hash = projectFileHash(context, anchor.loc.fileName);
  if (!anchor.loc.fileName || !hash) {
    return { status: "unavailable", message: "Source file metadata is not available for this local session." };
  }

  const entry = getSourceAccessEntry(context.sourceAccess, anchor.loc.fileName, hash);
  if (!entry) return { status: "loading" };
  if (entry.status === "loading") return { status: "loading" };
  if (entry.status === "ready") return { status: "ready", text: entry.text };

  return {
    status: "error",
    code: entry.code,
    message:
      entry.code === "source-stale"
        ? "Source file changed after this visualizer session was created. Restart lite-fsm visualize to refresh the graph."
        : entry.message,
  };
};

export const resolveSourceAccessFetchRequest = (
  context: Extract<SourceTextContext, { kind: "local-session" }>,
  anchors: readonly GraphSourceAnchor[],
): SourceAccessFetchRequest | undefined => {
  const anchor = firstLocatedSourceAnchor(anchors);
  if (!anchor?.loc.fileName) return undefined;

  const hash = projectFileHash(context, anchor.loc.fileName);
  if (!hash) return undefined;
  if (getSourceAccessEntry(context.sourceAccess, anchor.loc.fileName, hash)) return undefined;

  return {
    sessionId: context.sessionId,
    token: context.token,
    fileName: anchor.loc.fileName,
    hash,
  };
};
