import type { CliDiagnostic } from "../cli/diagnostics.js";
import { cliDiagnostic } from "../cli/diagnostics.js";

export type NormalizedMachineName = {
  rawName: string;
  fileName: string;
  exportName: string;
  eventType: string;
  eventNamespace: string;
};

export type NormalizeMachineNameResult =
  | { ok: true; machine: NormalizedMachineName }
  | { ok: false; diagnostics: CliDiagnostic[] };

const reservedWords = new Set([
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "function",
  "if",
  "implements",
  "import",
  "in",
  "instanceof",
  "interface",
  "let",
  "new",
  "null",
  "package",
  "private",
  "protected",
  "public",
  "return",
  "static",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield",
]);

const invalidName = (name: string): NormalizeMachineNameResult => ({
  ok: false,
  diagnostics: [
    cliDiagnostic("LFC_INVALID_OPTIONS", "error", `Invalid machine name '${name}'.`, {
      hint: "Use kebab-case, snake_case, or camelCase with ASCII letters and digits, starting with a letter.",
    }),
  ],
});

const splitCamelSegment = (segment: string): string[] => {
  return segment
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(" ")
    .filter(Boolean);
};

const toCamelCase = (segments: readonly string[]): string => {
  return segments
    .map((segment, index) => {
      const lower = segment.toLowerCase();
      if (index === 0) return lower;

      return `${lower[0].toUpperCase()}${lower.slice(1)}`;
    })
    .join("");
};

const jsIdentifier = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export const normalizeMachineName = (rawName: string): NormalizeMachineNameResult => {
  const name = rawName.trim();
  if (
    name === "" ||
    !/^[A-Za-z0-9_-]+$/.test(name) ||
    /^[-_]|[-_]$/.test(name) ||
    /[-_]{2,}/.test(name) ||
    /^[0-9]/.test(name)
  ) {
    return invalidName(rawName);
  }

  const delimiterSegments = name.split(/[-_]/);
  const segments = delimiterSegments.flatMap(splitCamelSegment).map((segment) => segment.toLowerCase());
  const exportName = toCamelCase(segments);
  if (!jsIdentifier.test(exportName) || reservedWords.has(exportName)) return invalidName(rawName);

  return {
    ok: true,
    machine: {
      rawName: name,
      fileName: segments.join("-"),
      exportName,
      eventType: `DO_${segments.map((segment) => segment.toUpperCase()).join("_")}_INIT`,
      eventNamespace: exportName,
    },
  };
};
