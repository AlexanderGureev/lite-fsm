import type { CliContext } from "../../cli/context.js";
import { patchProjectTextFile, projectFilePath, writeProjectFile } from "../write-files.js";
import type { PatchTextResult } from "../write-files.js";
import type { CreateProjectCssAdapter, CreateProjectCssAdapterInput } from "./types.js";

const tailwindImport = 'import tailwindcss from "@tailwindcss/vite";';

const ensureImport = (source: string, importLine: string): string => {
  return source.includes(importLine) ? source : `${importLine}\n${source}`;
};

export const patchViteTailwindPlugin = (source: string): PatchTextResult => {
  const imported = ensureImport(source, tailwindImport);
  if (imported.includes("tailwindcss()")) return { ok: true, contents: imported };

  const pluginsPattern = /plugins:\s*\[([^\]]*)\]/s;
  if (pluginsPattern.test(imported)) {
    return {
      ok: true,
      contents: imported.replace(pluginsPattern, (_match, plugins: string) => `plugins: [${plugins.trim()}${plugins.trim() ? ", " : ""}tailwindcss()]`),
    };
  }

  const marker = "export default defineConfig({";
  const index = imported.indexOf(marker);
  if (index === -1) {
    return {
      ok: false,
      message: "Vite Tailwind patch failed: expected export default defineConfig({ ... }).",
    };
  }

  const insertAt = index + marker.length;

  return {
    ok: true,
    contents: `${imported.slice(0, insertAt)}\n  plugins: [tailwindcss()],${imported.slice(insertAt)}`,
  };
};

export const ensureViteCssImport = (source: string): PatchTextResult => {
  if (/import\s+["'][^"']+\.css["'];?/.test(source)) return { ok: true, contents: source };

  return { ok: true, contents: `import "./index.css";\n${source}` };
};

const cssImportRelativePath = (source: string): string => {
  const match = source.match(/import\s+["']([^"']+\.css)["'];?/);
  if (!match?.[1] || !match[1].startsWith("./")) return "src/index.css";

  return `src/${match[1].slice(2)}`;
};

const applyViteTailwind = (
  context: CliContext,
  input: CreateProjectCssAdapterInput,
) => {
  const config = patchProjectTextFile(context, input.targetPath, "vite.config.ts", patchViteTailwindPlugin);
  if (!config.ok) return config;

  const mainSource = context.fs.fileExists(projectFilePath(input.targetPath, "src/main.tsx"))
    ? context.fs.readFile(projectFilePath(input.targetPath, "src/main.tsx"))
    : "";
  const cssPath = cssImportRelativePath(mainSource);
  const css = writeProjectFile(context, input.targetPath, cssPath, `@import "tailwindcss";
`);
  if (!css.ok) return css;

  return patchProjectTextFile(context, input.targetPath, "src/main.tsx", ensureViteCssImport);
};

export const viteTailwindCssAdapter: CreateProjectCssAdapter = {
  key: "tailwind",
  template: "vite",
  packageJsonPatch: {
    devDependencies: {
      "@tailwindcss/vite": "latest",
      tailwindcss: "latest",
    },
  },
  apply: applyViteTailwind,
};
