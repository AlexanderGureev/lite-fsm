import type { GraphDiagnostic, LiteFsmGraphProjectModuleResolution, SourceLocation } from "../types";

export type GraphProjectDiagnosticCode =
  | "LFG_PROJECT_ENTRY_NOT_FOUND"
  | "LFG_PROJECT_ENTRY_PARSE_ERROR"
  | "LFG_PROJECT_MANAGER_NOT_FOUND"
  | "LFG_PROJECT_MANAGER_AMBIGUOUS"
  | "LFG_PROJECT_MANAGER_PROVENANCE_UNSUPPORTED"
  | "LFG_PROJECT_MANAGER_MAP_UNSUPPORTED"
  | "LFG_PROJECT_MANAGER_SPREAD_UNRESOLVED"
  | "LFG_PROJECT_MANAGER_ENTRY_UNRESOLVED"
  | "LFG_PROJECT_NO_MACHINE_ENTRIES"
  | "LFG_PROJECT_MACHINE_UNRESOLVED"
  | "LFG_PROJECT_MACHINE_UNSUPPORTED_CREATE_ARGUMENT"
  | "LFG_PROJECT_CREATE_MACHINE_PROVENANCE_UNSUPPORTED"
  | "LFG_PROJECT_HELPER_PROVENANCE_UNSUPPORTED"
  | "LFG_PROJECT_NAMESPACE_IMPORT_UNSUPPORTED"
  | "LFG_PROJECT_NAMESPACE_REST_UNSUPPORTED"
  | "LFG_PROJECT_EXPORT_NOT_FOUND"
  | "LFG_PROJECT_BARREL_UNSUPPORTED"
  | "LFG_PROJECT_MODULE_NOT_FOUND"
  | "LFG_PROJECT_MODULE_PARSE_ERROR"
  | "LFG_PROJECT_MODULE_UNSUPPORTED_EXTENSION"
  | "LFG_PROJECT_MODULE_CYCLE";

export const projectDiagnostic = (
  code: GraphProjectDiagnosticCode,
  severity: GraphDiagnostic["severity"],
  message: string,
  loc?: SourceLocation,
): GraphDiagnostic => ({
  code,
  severity,
  message,
  loc,
});

export const diagnosticFromModuleResolution = (
  resolution: Extract<LiteFsmGraphProjectModuleResolution, { kind: "not-found" | "unsupported-extension" }>,
  loc: SourceLocation | undefined,
): GraphDiagnostic => {
  if (resolution.kind === "unsupported-extension") {
    return projectDiagnostic(
      "LFG_PROJECT_MODULE_UNSUPPORTED_EXTENSION",
      "warning",
      `Module '${resolution.moduleSpecifier}' uses unsupported extension '${resolution.extension}'.`,
      loc,
    );
  }

  return projectDiagnostic(
    "LFG_PROJECT_MODULE_NOT_FOUND",
    "warning",
    `Module '${resolution.moduleSpecifier}' could not be resolved.`,
    loc,
  );
};
