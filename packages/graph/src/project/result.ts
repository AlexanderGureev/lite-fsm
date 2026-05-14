import type { GraphDiagnostic } from "../types";

export type ProjectStep<T> =
  | {
      ok: true;
      value: T;
      diagnostics: GraphDiagnostic[];
    }
  | {
      ok: false;
      diagnostics: GraphDiagnostic[];
    };

export const projectOk = <T>(
  value: T,
  diagnostics: readonly GraphDiagnostic[] = [],
): ProjectStep<T> => ({
  ok: true,
  value,
  diagnostics: [...diagnostics],
});

export const projectFail = <T = never>(
  diagnostics: readonly GraphDiagnostic[],
): ProjectStep<T> => ({
  ok: false,
  diagnostics: [...diagnostics],
});
