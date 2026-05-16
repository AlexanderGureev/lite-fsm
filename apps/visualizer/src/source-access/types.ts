import type { LiteFsmGraphProjectFile } from "@lite-fsm/graph";

export type SourceAccessEntry =
  | { status: "loading"; fileName: string; hash: string }
  | { status: "ready"; fileName: string; hash: string; text: string }
  | { status: "error"; fileName: string; hash: string; code: string; message: string };

export type SourceAccessState = {
  entries: Record<string, SourceAccessEntry>;
};

export type SourceTextResolution =
  | { status: "ready"; text: string }
  | { status: "loading" }
  | { status: "error"; code: string; message: string }
  | { status: "unavailable"; message: string };

export type SourceAccessFetchRequest = {
  sessionId: string;
  token: string;
  fileName: string;
  hash: string;
};

export type SourceAccessFetchResult =
  | { ok: true; sessionId: string; fileName: string; hash: string; text: string }
  | { ok: false; sessionId: string; fileName: string; hash: string; code: string; message: string };

export type SourceAccessClient = {
  fetch(input: SourceAccessFetchRequest): Promise<SourceAccessFetchResult>;
};

export type LocalSessionSourceMetadata = {
  files: readonly LiteFsmGraphProjectFile[];
};
