import type { CliDiagnostic } from "../cli/diagnostics.js";
import { cliDiagnostic } from "../cli/diagnostics.js";
import type { VisualizeOptions } from "./types.js";

export type RawVisualizeOptions = {
  entry?: unknown;
  tsconfig?: unknown;
  port?: unknown;
  open?: unknown;
};

export type NormalizeVisualizeOptionsResult =
  | { ok: true; options: VisualizeOptions }
  | { ok: false; diagnostics: CliDiagnostic[] };

const DEFAULT_VISUALIZER_PORT = 3030;
const MIN_PORT = 1;
const MAX_PORT = 65_535;

const stringOption = (value: unknown): string | undefined => {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
};

const normalizePort = (value: unknown, diagnostics: CliDiagnostic[]): number => {
  if (value === undefined) return DEFAULT_VISUALIZER_PORT;
  if (typeof value !== "string" || value.trim() === "") {
    diagnostics.push(cliDiagnostic("LFC_INVALID_OPTIONS", "error", "Option --port must be an integer from 1 to 65535."));
    return DEFAULT_VISUALIZER_PORT;
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) {
    diagnostics.push(cliDiagnostic("LFC_INVALID_OPTIONS", "error", "Option --port must be an integer from 1 to 65535."));
    return DEFAULT_VISUALIZER_PORT;
  }

  return port;
};

export const normalizeVisualizeOptions = (rawOptions: RawVisualizeOptions): NormalizeVisualizeOptionsResult => {
  const diagnostics: CliDiagnostic[] = [];
  const entry = stringOption(rawOptions.entry);
  const tsconfig = stringOption(rawOptions.tsconfig);
  const port = normalizePort(rawOptions.port, diagnostics);
  const noOpen = rawOptions.open === false;

  if (!entry) {
    return {
      ok: false,
      diagnostics: [
        ...diagnostics,
        cliDiagnostic("LFC_INVALID_OPTIONS", "error", "Option --entry is required.", {
          hint: "Pass --entry path/to/store/index.ts.",
        }),
      ],
    };
  }

  if (diagnostics.length > 0) return { ok: false, diagnostics };

  return {
    ok: true,
    options: {
      entry,
      port,
      noOpen,
      ...(tsconfig ? { tsconfig } : {}),
    },
  };
};
