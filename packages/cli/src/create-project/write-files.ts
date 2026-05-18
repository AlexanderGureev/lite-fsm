import { dirname, join } from "node:path";
import type { CliContext } from "../cli/context.js";
import { cliDiagnostic } from "../cli/diagnostics.js";
import { normalizeAbsolutePath } from "../project/source-cache.js";
import type { CreateProjectStepResult } from "./result.js";

export type PatchTextResult = { ok: true; contents: string } | { ok: false; message: string };

const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);

export const projectFilePath = (targetPath: string, relativePath: string): string => {
  return normalizeAbsolutePath(join(targetPath, relativePath));
};

export const writeProjectFile = (
  context: CliContext,
  targetPath: string,
  relativePath: string,
  contents: string,
): CreateProjectStepResult => {
  const file = projectFilePath(targetPath, relativePath);

  try {
    context.fs.mkdir(dirname(file), { recursive: true });
    context.fs.writeFile(file, contents);

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      diagnostics: [
        cliDiagnostic("LFC_WRITE_FAILED", "error", `Failed to write generated project file: ${errorMessage(error)}`, {
          file,
        }),
      ],
    };
  }
};

export const writeProjectFiles = (
  context: CliContext,
  targetPath: string,
  files: Readonly<Record<string, string>>,
): CreateProjectStepResult => {
  for (const [relativePath, contents] of Object.entries(files)) {
    const written = writeProjectFile(context, targetPath, relativePath, contents);
    if (!written.ok) return written;
  }

  return { ok: true };
};

export const patchProjectTextFile = (
  context: CliContext,
  targetPath: string,
  relativePath: string,
  patch: (contents: string) => PatchTextResult,
): CreateProjectStepResult => {
  const file = projectFilePath(targetPath, relativePath);
  let patchedContents: string;

  try {
    const patched = patch(context.fs.readFile(file));
    if (!patched.ok) {
      return {
        ok: false,
        diagnostics: [
          cliDiagnostic("LFC_CREATE_PATCH_FAILED", "error", patched.message, {
            file,
          }),
        ],
      };
    }

    patchedContents = patched.contents;
  } catch (error) {
    return {
      ok: false,
      diagnostics: [
        cliDiagnostic("LFC_CREATE_PATCH_FAILED", "error", `Failed to patch generated project file: ${errorMessage(error)}`, {
          file,
        }),
      ],
    };
  }

  try {
    context.fs.writeFile(file, patchedContents);

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      diagnostics: [
        cliDiagnostic("LFC_WRITE_FAILED", "error", `Failed to write patched generated project file: ${errorMessage(error)}`, {
          file,
        }),
      ],
    };
  }
};

export const okStep = (): CreateProjectStepResult => ({ ok: true });
