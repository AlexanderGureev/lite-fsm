import {
  PROJECT_GRAPH_EXPORT_PACKAGE,
  PROJECT_GRAPH_EXPORT_VERSION,
  type LiteFsmProjectGraphExportDocument,
  type ProjectGraphExportParseResult,
} from "./types";

type JsonRecord = Record<string, unknown>;

const FILE_ROLES = new Set(["entry", "machine", "barrel", "helper"]);
const DIAGNOSTIC_SEVERITIES = new Set(["info", "warning", "error"]);

const invalidDocument = (path: string, message: string): ProjectGraphExportParseResult => ({
  ok: false,
  issue: { code: "invalid-document", path, message },
});

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isString = (value: unknown): value is string => typeof value === "string";

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

const optionalStringIsValid = (record: JsonRecord, key: string): boolean =>
  record[key] === undefined || isString(record[key]);

const validateCreatedBy = (value: unknown): ProjectGraphExportParseResult | undefined => {
  if (!isRecord(value)) return invalidDocument("createdBy", "Project graph export createdBy must be an object.");
  if (value.package !== PROJECT_GRAPH_EXPORT_PACKAGE) {
    return invalidDocument("createdBy.package", "Project graph export must be created by @lite-fsm/cli.");
  }
  if (!isString(value.version)) return invalidDocument("createdBy.version", "Project graph export createdBy.version must be a string.");

  return undefined;
};

const validateEntry = (value: unknown): ProjectGraphExportParseResult | undefined => {
  if (!isRecord(value)) return invalidDocument("entry", "Project graph export entry must be an object.");
  if (!isString(value.path)) return invalidDocument("entry.path", "Project graph export entry.path must be a string.");
  if (!optionalStringIsValid(value, "tsconfigPath")) {
    return invalidDocument("entry.tsconfigPath", "Project graph export entry.tsconfigPath must be a string when present.");
  }

  return undefined;
};

const validateGraph = (value: unknown): ProjectGraphExportParseResult | undefined => {
  if (!isRecord(value)) return invalidDocument("graph", "Project graph export graph must be an object.");
  if (value.version !== "lite-fsm.graph/v1") return invalidDocument("graph.version", "Graph document version must be lite-fsm.graph/v1.");
  if (!isRecord(value.source)) return invalidDocument("graph.source", "Graph document source must be an object.");
  if (!Array.isArray(value.machines)) return invalidDocument("graph.machines", "Graph document machines must be an array.");
  if (!Array.isArray(value.managers)) return invalidDocument("graph.managers", "Graph document managers must be an array.");
  if (!Array.isArray(value.diagnostics)) return invalidDocument("graph.diagnostics", "Graph document diagnostics must be an array.");

  return undefined;
};

const validateProjectFile = (value: unknown, index: number): ProjectGraphExportParseResult | undefined => {
  const prefix = `files.${index}`;

  if (!isRecord(value)) return invalidDocument(prefix, "Project graph export file must be an object.");
  if (!isString(value.fileName)) return invalidDocument(`${prefix}.fileName`, "Project graph export fileName must be a string.");
  if (value.language !== "ts") return invalidDocument(`${prefix}.language`, "Project graph export file language must be ts.");
  if (!isString(value.hash)) return invalidDocument(`${prefix}.hash`, "Project graph export file hash must be a string.");
  if (!Array.isArray(value.roles)) return invalidDocument(`${prefix}.roles`, "Project graph export file roles must be an array.");
  if (!value.roles.every((role) => isString(role) && FILE_ROLES.has(role))) {
    return invalidDocument(`${prefix}.roles`, "Project graph export file roles must contain only known roles.");
  }

  return undefined;
};

const validateFiles = (value: unknown): ProjectGraphExportParseResult | undefined => {
  if (!Array.isArray(value)) return invalidDocument("files", "Project graph export files must be an array.");

  for (const [index, file] of value.entries()) {
    const issue = validateProjectFile(file, index);
    if (issue) return issue;
  }

  return undefined;
};

const validateDiagnosticLoc = (value: unknown, prefix: string): ProjectGraphExportParseResult | undefined => {
  if (!isRecord(value)) return invalidDocument(prefix, "CLI diagnostic loc must be an object.");
  if (!isNumber(value.line)) return invalidDocument(`${prefix}.line`, "CLI diagnostic loc.line must be a number.");
  if (!isNumber(value.column)) return invalidDocument(`${prefix}.column`, "CLI diagnostic loc.column must be a number.");

  return undefined;
};

const validateCliDiagnostic = (value: unknown, index: number): ProjectGraphExportParseResult | undefined => {
  const prefix = `diagnostics.${index}`;

  if (!isRecord(value)) return invalidDocument(prefix, "CLI diagnostic must be an object.");
  if (!isString(value.code)) return invalidDocument(`${prefix}.code`, "CLI diagnostic code must be a string.");
  if (!isString(value.severity) || !DIAGNOSTIC_SEVERITIES.has(value.severity)) {
    return invalidDocument(`${prefix}.severity`, "CLI diagnostic severity must be info, warning or error.");
  }
  if (!isString(value.message)) return invalidDocument(`${prefix}.message`, "CLI diagnostic message must be a string.");
  if (!optionalStringIsValid(value, "file")) return invalidDocument(`${prefix}.file`, "CLI diagnostic file must be a string when present.");
  if (value.loc !== undefined) {
    const issue = validateDiagnosticLoc(value.loc, `${prefix}.loc`);
    if (issue) return issue;
  }
  if (!optionalStringIsValid(value, "hint")) return invalidDocument(`${prefix}.hint`, "CLI diagnostic hint must be a string when present.");

  return undefined;
};

const validateCliDiagnostics = (value: unknown): ProjectGraphExportParseResult | undefined => {
  if (!Array.isArray(value)) return invalidDocument("diagnostics", "Project graph export diagnostics must be an array.");

  for (const [index, diagnostic] of value.entries()) {
    const issue = validateCliDiagnostic(diagnostic, index);
    if (issue) return issue;
  }

  return undefined;
};

const validateProjectGraphExportDocument = (value: unknown): ProjectGraphExportParseResult => {
  if (!isRecord(value)) return invalidDocument("$", "Project graph export must be a JSON object.");
  if (value.version !== PROJECT_GRAPH_EXPORT_VERSION) {
    return {
      ok: false,
      issue: {
        code: "invalid-version",
        path: "version",
        message: `Project graph export version must be ${PROJECT_GRAPH_EXPORT_VERSION}.`,
      },
    };
  }

  const issue =
    validateCreatedBy(value.createdBy) ??
    validateEntry(value.entry) ??
    validateGraph(value.graph) ??
    validateFiles(value.files) ??
    validateCliDiagnostics(value.diagnostics);

  if (issue) return issue;

  return { ok: true, document: value as LiteFsmProjectGraphExportDocument };
};

export const parseProjectGraphExportDocumentText = (text: string): ProjectGraphExportParseResult => {
  try {
    return validateProjectGraphExportDocument(JSON.parse(text) as unknown);
  } catch {
    return {
      ok: false,
      issue: {
        code: "invalid-json",
        message: "Project graph export must be valid JSON.",
      },
    };
  }
};
