import type { CliContext } from "../../cli/context.js";
import { cliDiagnostic } from "../../cli/diagnostics.js";
import { createScaffoldCommand } from "../package-manager.js";
import type { CreateProjectStepResult } from "../result.js";
import { patchProjectTextFile, projectFilePath } from "../write-files.js";
import type { PatchTextResult } from "../write-files.js";
import type { CreateProjectTemplateAdapter, CreateProjectTemplateInput } from "./types.js";

const nodeUrlImport = 'import { fileURLToPath, URL } from "node:url";';

const ensureImport = (source: string, importLine: string): string => {
  return source.includes(importLine) ? source : `${importLine}\n${source}`;
};

const insertDefineConfigProperty = (source: string, propertySource: string): PatchTextResult => {
  const marker = "export default defineConfig({";
  const index = source.indexOf(marker);
  if (index === -1) {
    return {
      ok: false,
      message: "Vite config patch failed: expected export default defineConfig({ ... }).",
    };
  }

  const insertAt = index + marker.length;

  return {
    ok: true,
    contents: `${source.slice(0, insertAt)}\n${propertySource}${source.slice(insertAt)}`,
  };
};

export const patchViteAlias = (source: string): PatchTextResult => {
  if (source.includes('alias: {') && source.includes('"@"')) return { ok: true, contents: source };

  const imported = ensureImport(source, nodeUrlImport);

  return insertDefineConfigProperty(imported, `  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
`);
};

const ensureMainImports = (source: string): string => {
  return ensureImport(
    ensureImport(source, 'import { FSMContextProvider } from "@lite-fsm/react";'),
    'import { manager } from "@/store";',
  );
};

export const patchViteMainProvider = (source: string): PatchTextResult => {
  if (!source.includes("<App />")) {
    return {
      ok: false,
      message: "Vite main patch failed: expected an <App /> render entry.",
    };
  }

  return {
    ok: true,
    contents: ensureMainImports(source).replace(
      "<App />",
      `<FSMContextProvider machineManager={manager}>
      <App />
    </FSMContextProvider>`,
    ),
  };
};

const addTsconfigPaths = (source: string): PatchTextResult => {
  try {
    const parsed = JSON.parse(source) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, message: "TypeScript config patch failed: expected a JSON object." };
    }

    const config = parsed as Record<string, unknown>;
    const compilerOptions =
      config.compilerOptions && typeof config.compilerOptions === "object" && !Array.isArray(config.compilerOptions)
        ? { ...config.compilerOptions } as Record<string, unknown>
        : {};
    const paths =
      compilerOptions.paths && typeof compilerOptions.paths === "object" && !Array.isArray(compilerOptions.paths)
        ? { ...compilerOptions.paths } as Record<string, unknown>
        : {};

    paths["@/*"] = ["./src/*"];
    compilerOptions.baseUrl = ".";
    compilerOptions.paths = paths;
    config.compilerOptions = compilerOptions;

    return { ok: true, contents: `${JSON.stringify(config, null, 2)}\n` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, message: `TypeScript config patch failed: ${message}` };
  }
};

const patchViteTsconfig = (
  context: CliContext,
  input: CreateProjectTemplateInput,
): CreateProjectStepResult => {
  if (context.fs.fileExists(projectFilePath(input.targetPath, "tsconfig.app.json"))) {
    return patchProjectTextFile(context, input.targetPath, "tsconfig.app.json", addTsconfigPaths);
  }

  if (context.fs.fileExists(projectFilePath(input.targetPath, "tsconfig.json"))) {
    return patchProjectTextFile(context, input.targetPath, "tsconfig.json", addTsconfigPaths);
  }

  return {
    ok: false,
    diagnostics: [
      cliDiagnostic("LFC_CREATE_PATCH_FAILED", "error", "Vite TypeScript config patch failed: no tsconfig file found.", {
        file: projectFilePath(input.targetPath, "tsconfig.json"),
      }),
    ],
  };
};

const applyViteTemplate = (
  context: CliContext,
  input: CreateProjectTemplateInput,
) => {
  const config = patchProjectTextFile(context, input.targetPath, "vite.config.ts", patchViteAlias);
  if (!config.ok) return config;

  const tsconfig = patchViteTsconfig(context, input);
  if (!tsconfig.ok) return tsconfig;

  return patchProjectTextFile(context, input.targetPath, "src/main.tsx", patchViteMainProvider);
};

export const viteTemplate: CreateProjectTemplateAdapter = {
  key: "vite",
  createScaffoldCommand(input) {
    return createScaffoldCommand({ ...input, target: input.targetName, template: "vite" });
  },
  apply: applyViteTemplate,
};
