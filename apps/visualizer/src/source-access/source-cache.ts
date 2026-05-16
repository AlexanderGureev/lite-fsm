import type { SourceAccessEntry, SourceAccessState } from "./types";

export type SourceAccessCacheKey = string;

export const createInitialSourceAccessState = (): SourceAccessState => ({ entries: {} });

export const sourceAccessCacheKey = (fileName: string, hash: string): SourceAccessCacheKey =>
  JSON.stringify([fileName, hash]);

export const getSourceAccessEntry = (
  state: SourceAccessState,
  fileName: string,
  hash: string,
): SourceAccessEntry | undefined => state.entries[sourceAccessCacheKey(fileName, hash)];

const setSourceAccessEntry = (
  state: SourceAccessState,
  entry: SourceAccessEntry,
): SourceAccessState => {
  const key = sourceAccessCacheKey(entry.fileName, entry.hash);
  return {
    entries: {
      ...state.entries,
      [key]: entry,
    },
  };
};

export const setSourceAccessLoading = (
  state: SourceAccessState,
  fileName: string,
  hash: string,
): SourceAccessState => {
  const current = getSourceAccessEntry(state, fileName, hash);
  if (current?.status === "loading") return state;

  return setSourceAccessEntry(state, { status: "loading", fileName, hash });
};

export const setSourceAccessReady = (
  state: SourceAccessState,
  fileName: string,
  hash: string,
  text: string,
): SourceAccessState => {
  const current = getSourceAccessEntry(state, fileName, hash);
  if (current?.status === "ready" && current.text === text) return state;

  return setSourceAccessEntry(state, { status: "ready", fileName, hash, text });
};

export const setSourceAccessError = (
  state: SourceAccessState,
  fileName: string,
  hash: string,
  code: string,
  message: string,
): SourceAccessState => {
  const current = getSourceAccessEntry(state, fileName, hash);
  if (current?.status === "error" && current.code === code && current.message === message) return state;

  return setSourceAccessEntry(state, { status: "error", fileName, hash, code, message });
};
