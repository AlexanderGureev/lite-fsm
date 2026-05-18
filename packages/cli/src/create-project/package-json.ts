import { join } from "node:path";
import type { CliContext } from "../cli/context.js";
import { cliDiagnostic } from "../cli/diagnostics.js";
import { normalizeAbsolutePath } from "../project/source-cache.js";
import type { CreateProjectStepResult } from "./result.js";

export type PackageJsonPatch = {
  dependencies?: Readonly<Record<string, string>>;
  devDependencies?: Readonly<Record<string, string>>;
};

const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);

const asPackageRecord = (value: unknown): Record<string, unknown> => {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...value } as Record<string, unknown> : {};
};

const mergeDependencyBlock = (
  packageJson: Record<string, unknown>,
  key: "dependencies" | "devDependencies",
  additions: Readonly<Record<string, string>> | undefined,
): void => {
  if (!additions || Object.keys(additions).length === 0) return;
  packageJson[key] = {
    ...asPackageRecord(packageJson[key]),
    ...additions,
  };
};

export const mergePackageJsonPatches = (patches: readonly PackageJsonPatch[]): PackageJsonPatch => {
  const dependencies: Record<string, string> = {};
  const devDependencies: Record<string, string> = {};

  for (const patch of patches) {
    Object.assign(dependencies, patch.dependencies);
    Object.assign(devDependencies, patch.devDependencies);
  }

  return {
    ...(Object.keys(dependencies).length > 0 ? { dependencies } : {}),
    ...(Object.keys(devDependencies).length > 0 ? { devDependencies } : {}),
  };
};

export const patchPackageJson = (
  context: CliContext,
  targetPath: string,
  patch: PackageJsonPatch,
): CreateProjectStepResult => {
  const file = normalizeAbsolutePath(join(targetPath, "package.json"));
  let contents: string;

  try {
    const parsed = JSON.parse(context.fs.readFile(file)) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        ok: false,
        diagnostics: [
          cliDiagnostic("LFC_CREATE_PATCH_FAILED", "error", "Generated package.json must be a JSON object.", {
            file,
          }),
        ],
      };
    }

    const packageJson = parsed as Record<string, unknown>;
    mergeDependencyBlock(packageJson, "dependencies", patch.dependencies);
    mergeDependencyBlock(packageJson, "devDependencies", patch.devDependencies);
    contents = `${JSON.stringify(packageJson, null, 2)}\n`;
  } catch (error) {
    return {
      ok: false,
      diagnostics: [
        cliDiagnostic("LFC_CREATE_PATCH_FAILED", "error", `Failed to patch generated package.json: ${errorMessage(error)}`, {
          file,
        }),
      ],
    };
  }

  try {
    context.fs.writeFile(file, contents);

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      diagnostics: [
        cliDiagnostic("LFC_WRITE_FAILED", "error", `Failed to write generated package.json: ${errorMessage(error)}`, {
          file,
        }),
      ],
    };
  }
};
