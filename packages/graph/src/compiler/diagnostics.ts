import type { GraphDiagnostic } from "../types";

export type DiagnosticSink = {
  add(diagnostic: GraphDiagnostic): void;
  all(): GraphDiagnostic[];
};

export const createDiagnosticSink = (initial: readonly GraphDiagnostic[] = []): DiagnosticSink => {
  const diagnostics = [...initial];

  return {
    add(diagnostic) {
      diagnostics.push(diagnostic);
    },
    all() {
      return normalizeDiagnostics(diagnostics);
    },
  };
};

export const normalizeDiagnostics = (diagnostics: readonly GraphDiagnostic[]): GraphDiagnostic[] => {
  return [...diagnostics].sort((left, right) => {
    const leftOffset = left.loc?.start.offset ?? Number.MAX_SAFE_INTEGER;
    const rightOffset = right.loc?.start.offset ?? Number.MAX_SAFE_INTEGER;
    if (leftOffset !== rightOffset) return leftOffset - rightOffset;

    const code = left.code.localeCompare(right.code);
    if (code !== 0) return code;

    return left.message.localeCompare(right.message);
  });
};
