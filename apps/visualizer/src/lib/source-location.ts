import type { SourceLocation } from "@lite-fsm/graph";

export const formatSourceLocationLabel = (loc: SourceLocation): string => {
  const lineColumn = `${loc.start.line}:${loc.start.column}`;

  return loc.fileName ? `${loc.fileName}:${lineColumn}` : `line ${loc.start.line}, column ${loc.start.column}`;
};

export const matchesSourceFile = (loc: SourceLocation, filename: string | undefined): boolean =>
  !loc.fileName || loc.fileName === filename;
