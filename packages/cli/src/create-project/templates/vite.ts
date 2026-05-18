import type { CliContext } from "../../cli/context.js";
import { cliDiagnostic } from "../../cli/diagnostics.js";
import ts from "typescript";
import { createScaffoldCommand } from "../package-manager.js";
import type { CreateProjectStepResult } from "../result.js";
import { patchProjectTextFile, projectFilePath, writeProjectFile } from "../write-files.js";
import type { PatchTextResult } from "../write-files.js";
import type { CreateProjectTemplateAdapter, CreateProjectTemplateInput } from "./types.js";

const nodeUrlImport = 'import { fileURLToPath, URL } from "node:url";';

const appSource = `import { useAppSelector, useAppTransition } from "@/store";

export default function App() {
  const appState = useAppSelector((state) => state.app.state);
  const transition = useAppTransition();
  const isReady = appState === "READY";

  return (
    <main style={{
      minHeight: "100vh",
      display: "grid",
      placeItems: "center",
      padding: 24,
      background: "#f4f7fb",
      color: "#102033",
    }}>
      <section style={{
        width: "min(100%, 420px)",
        border: "1px solid #c9d3df",
        borderRadius: 8,
        padding: 24,
        background: "#ffffff",
        boxShadow: "0 18px 45px rgba(21, 21, 20, 0.08)",
      }}>
        <p style={{ margin: "0 0 8px", color: "#5d6775", fontSize: 14 }}>lite-fsm starter</p>
        <h1 style={{ margin: "0 0 16px", fontSize: 28, lineHeight: 1.1 }}>State: {appState}</h1>
        <button
          type="button"
          onClick={() => transition({ type: "DO_INIT" })}
          disabled={isReady}
          style={{
            width: "100%",
            border: 0,
            borderRadius: 6,
            padding: "12px 16px",
            background: isReady ? "#c9d3df" : "#102033",
            color: isReady ? "#5d6775" : "#ffffff",
            cursor: isReady ? "default" : "pointer",
            fontWeight: 700,
          }}
        >
          Run DO_INIT
        </button>
        {isReady ? (
          <p style={{ margin: "16px 0 0", color: "#0f7b4f", fontWeight: 700 }}>READY UI is visible.</p>
        ) : (
          <p style={{ margin: "16px 0 0", color: "#5d6775" }}>Waiting for DO_INIT.</p>
        )}
      </section>
    </main>
  );
}
`;

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
    'import { makeStore } from "@/store";',
  );
};

const ensureViteStore = (source: string): string => {
  if (source.includes("makeStore()")) return source;

  const lines = source.split("\n");
  let insertAt = 0;
  while (insertAt < lines.length && (lines[insertAt]?.startsWith("import ") || lines[insertAt]?.trim() === "")) {
    insertAt += 1;
  }

  lines.splice(insertAt, 0, "const manager = makeStore();", "");
  return lines.join("\n");
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
    contents: ensureViteStore(ensureMainImports(source)).replace(
      "<App />",
      `<FSMContextProvider machineManager={manager}>
      <App />
    </FSMContextProvider>`,
    ),
  };
};

const addTsconfigPaths = (source: string): PatchTextResult => {
  const parsed = ts.parseConfigFileTextToJson("tsconfig.json", source);
  if (parsed.error) {
    const message = ts.flattenDiagnosticMessageText(parsed.error.messageText, "\n");
    return { ok: false, message: `TypeScript config patch failed: ${message}` };
  }

  const config = parsed.config as Record<string, unknown>;
  const compilerOptions =
    config.compilerOptions && typeof config.compilerOptions === "object" && !Array.isArray(config.compilerOptions)
      ? { ...config.compilerOptions } as Record<string, unknown>
      : {};
  const paths =
    compilerOptions.paths && typeof compilerOptions.paths === "object" && !Array.isArray(compilerOptions.paths)
      ? { ...compilerOptions.paths } as Record<string, unknown>
      : {};

  paths["@/*"] = ["./src/*"];
  delete compilerOptions.baseUrl;
  compilerOptions.paths = paths;
  config.compilerOptions = compilerOptions;

  return { ok: true, contents: `${JSON.stringify(config, null, 2)}\n` };
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

  const main = patchProjectTextFile(context, input.targetPath, "src/main.tsx", patchViteMainProvider);
  if (!main.ok) return main;

  return writeProjectFile(context, input.targetPath, "src/App.tsx", appSource);
};

export const viteTemplate: CreateProjectTemplateAdapter = {
  key: "vite",
  createScaffoldCommand(input) {
    return createScaffoldCommand({ ...input, target: input.targetName, template: "vite" });
  },
  apply: applyViteTemplate,
};
