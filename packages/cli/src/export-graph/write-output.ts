import { dirname, resolve } from "node:path";
import type { CliContext } from "../cli/context.js";
import type { CliDiagnostic } from "../cli/diagnostics.js";
import { cliDiagnostic } from "../cli/diagnostics.js";
import { normalizeAbsolutePath } from "../project/source-cache.js";

export type WriteOutputResult = { ok: true; outputPath: string } | { ok: false; diagnostics: CliDiagnostic[] };

export const writeOutput = (context: CliContext, outputPath: string, contents: string): WriteOutputResult => {
  const absoluteOutputPath = normalizeAbsolutePath(resolve(context.cwd, outputPath));

  try {
    context.fs.mkdir(dirname(absoluteOutputPath), { recursive: true });
    context.fs.writeFile(absoluteOutputPath, contents);

    return { ok: true, outputPath: absoluteOutputPath };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return {
      ok: false,
      diagnostics: [
        cliDiagnostic("LFC_WRITE_FAILED", "error", `Failed to write graph export: ${message}`, {
          file: absoluteOutputPath,
        }),
      ],
    };
  }
};
