import type { SourceLanguage, SourceSession, SourceSessionInput } from "./types";

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export const hashSource = (source: string): string => {
  let hash = FNV_OFFSET;

  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME);
  }

  return `lfg1:${(hash >>> 0).toString(16).padStart(8, "0")}`;
};

export const createSourceSession = ({
  source,
  filePath,
  filename,
  language = "ts",
  version = 1,
}: SourceSessionInput): SourceSession => ({
  source,
  filePath,
  filename,
  language,
  version,
  hash: hashSource(source),
});

export const updateSourceSession = (
  previous: SourceSession,
  source: string,
  language: SourceLanguage = previous.language,
): SourceSession =>
  createSourceSession({
    source,
    filePath: previous.filePath,
    filename: previous.filename,
    language,
    version: previous.version + 1,
  });
