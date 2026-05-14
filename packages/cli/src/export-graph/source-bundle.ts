import { resolve } from "node:path";
import type { LiteFsmGraphProjectFile } from "@lite-fsm/graph";
import type { CliContext } from "../cli/context.js";
import type { CliDiagnostic } from "../cli/diagnostics.js";
import { cliDiagnostic } from "../cli/diagnostics.js";
import { normalizeAbsolutePath, normalizePath } from "../project/source-cache.js";
import type { LiteFsmProjectGraphSourceBundle, LiteFsmProjectGraphSourceFile } from "./export-document.js";

export type CreateProjectGraphSourceBundleResult =
  | { ok: true; sources: LiteFsmProjectGraphSourceBundle }
  | { ok: false; diagnostics: CliDiagnostic[] };

const sourcePath = (projectRoot: string, fileName: string): string =>
  normalizeAbsolutePath(resolve(projectRoot, fileName));

export const createProjectGraphSourceBundle = (
  context: CliContext,
  projectRoot: string,
  files: readonly LiteFsmGraphProjectFile[],
): CreateProjectGraphSourceBundleResult => {
  const sourceFiles: LiteFsmProjectGraphSourceFile[] = [];

  for (const file of files) {
    const absolutePath = sourcePath(projectRoot, file.fileName);

    try {
      if (!context.fs.fileExists(absolutePath)) {
        return {
          ok: false,
          diagnostics: [
            cliDiagnostic(
              "LFC_SOURCE_BUNDLE_FILE_UNREADABLE",
              "error",
              `Source file '${file.fileName}' could not be embedded in the graph export.`,
              { file: normalizePath(absolutePath) },
            ),
          ],
        };
      }

      sourceFiles.push({
        fileName: file.fileName,
        language: file.language,
        hash: file.hash,
        text: context.fs.readFile(absolutePath),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      return {
        ok: false,
        diagnostics: [
          cliDiagnostic(
            "LFC_SOURCE_BUNDLE_FILE_UNREADABLE",
            "error",
            `Source file '${file.fileName}' could not be embedded in the graph export: ${message}`,
            { file: normalizePath(absolutePath) },
          ),
        ],
      };
    }
  }

  return { ok: true, sources: { files: sourceFiles } };
};
