import type { CliDiagnostic } from "../cli/diagnostics.js";

export type CreateProjectStepResult =
  | { ok: true }
  | { ok: false; diagnostics: CliDiagnostic[] };
