import type { CliDiagnostic } from "../cli/diagnostics.js";
import { cliDiagnostic } from "../cli/diagnostics.js";

export type ExportGraphOptions = {
  entry: string;
  out: string;
  tsconfig?: string;
  includeSource: boolean;
};

export type RawExportGraphOptions = {
  entry?: unknown;
  out?: unknown;
  tsconfig?: unknown;
  includeSource?: unknown;
};

export type NormalizeExportGraphOptionsResult =
  | { ok: true; options: ExportGraphOptions }
  | { ok: false; diagnostics: CliDiagnostic[] };

const stringOption = (value: unknown): string | undefined => {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
};

export const normalizeExportGraphOptions = (rawOptions: RawExportGraphOptions): NormalizeExportGraphOptionsResult => {
  const entry = stringOption(rawOptions.entry);
  const out = stringOption(rawOptions.out);
  const tsconfig = stringOption(rawOptions.tsconfig);
  const includeSource = rawOptions.includeSource === true;
  const diagnostics: CliDiagnostic[] = [];

  if (!entry) {
    diagnostics.push(
      cliDiagnostic("LFC_INVALID_OPTIONS", "error", "Option --entry is required.", {
        hint: "Pass --entry path/to/store/index.ts.",
      }),
    );
  }

  if (!out) {
    diagnostics.push(
      cliDiagnostic("LFC_INVALID_OPTIONS", "error", "Option --out is required.", {
        hint: "Pass --out lite-fsm.graph.json.",
      }),
    );
  } else if (out === "-") {
    diagnostics.push(cliDiagnostic("LFC_INVALID_OPTIONS", "error", "JSON stdout output is not supported. Pass a file path to --out."));
  }

  if (diagnostics.length > 0) return { ok: false, diagnostics };

  return {
    ok: true,
    options: {
      entry: entry as string,
      out: out as string,
      includeSource,
      ...(tsconfig ? { tsconfig } : {}),
    },
  };
};
