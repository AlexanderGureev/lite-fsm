export {
  createInitialSourceAccessState,
  getSourceAccessEntry,
  setSourceAccessError,
  setSourceAccessLoading,
  setSourceAccessReady,
  sourceAccessCacheKey,
} from "./source-cache";
export type { SourceAccessCacheKey } from "./source-cache";
export { createLocalSessionSourceClient } from "./source-client";
export type { SourceAccessClientDependencies } from "./source-client";
export {
  firstLocatedSourceAnchor,
  hasSourceLocation,
  resolveSourceAccessFetchRequest,
  resolveSourceText,
} from "./source-resolver";
export type { SourceTextContext } from "./source-resolver";
export type {
  LocalSessionSourceMetadata,
  SourceAccessClient,
  SourceAccessEntry,
  SourceAccessFetchRequest,
  SourceAccessFetchResult,
  SourceAccessState,
  SourceTextResolution,
} from "./types";
