import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createProgram } from "../../../packages/cli/src/cli/create-program";
import type { CliContext } from "../../../packages/cli/src/cli/context";
import { ensureViteCssImport, patchViteTailwindPlugin, viteTailwindCssAdapter } from "../../../packages/cli/src/create-project/css/tailwind-vite";
import { getCreateProjectCssAdapter, listCreateProjectCssAdapters } from "../../../packages/cli/src/create-project/css/registry";
import type { ExternalCommand } from "../../../packages/cli/src/create-project/dependencies";
import { normalizeCreateProjectOptions } from "../../../packages/cli/src/create-project/options";
import { mergePackageJsonPatches, patchPackageJson } from "../../../packages/cli/src/create-project/package-json";
import {
  createDevCommand,
  createInstallCommand,
  createScaffoldCommand,
  type CreateProjectPackageManager,
} from "../../../packages/cli/src/create-project/package-manager";
import { createProjectLiteFsmDependencies } from "../../../packages/cli/src/create-project/release-dependencies";
import { runCreateProjectCommand } from "../../../packages/cli/src/create-project/command";
import { patchNextLayout } from "../../../packages/cli/src/create-project/templates/next";
import { getCreateProjectTemplate, listCreateProjectTemplates } from "../../../packages/cli/src/create-project/templates/registry";
import { patchViteAlias, patchViteMainProvider } from "../../../packages/cli/src/create-project/templates/vite";
import { patchProjectTextFile, writeProjectFile, writeProjectFiles } from "../../../packages/cli/src/create-project/write-files";
import { normalizeAbsolutePath } from "../../../packages/cli/src/project/source-cache";
import { createCliTestContext } from "../helpers/memory-fs";

const createContext = (files: Record<string, string> = {}) => createCliTestContext({ "/project/.keep": "", ...files });

const writeNextFixture = (context: CliContext, targetPath: string): void => {
  context.fs.mkdir(targetPath, { recursive: true });
  context.fs.writeFile(`${targetPath}/package.json`, JSON.stringify({ scripts: { dev: "next dev" }, dependencies: { next: "latest" } }));
  context.fs.writeFile(`${targetPath}/tsconfig.json`, JSON.stringify({
    compilerOptions: {
      paths: {
        "@/*": ["./src/*"],
      },
    },
  }));
  context.fs.writeFile(`${targetPath}/src/app/layout.tsx`, `import "./globals.css";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`);
};

const writeBrokenNextFixture = (context: CliContext, targetPath: string): void => {
  writeNextFixture(context, targetPath);
  context.fs.writeFile(`${targetPath}/src/app/layout.tsx`, "export default function RootLayout() { return null; }\n");
};

const writeNextFixtureWithoutAlias = (context: CliContext, targetPath: string): void => {
  writeNextFixture(context, targetPath);
  context.fs.writeFile(`${targetPath}/tsconfig.json`, JSON.stringify({ compilerOptions: {} }));
};

const writeViteFixture = (context: CliContext, targetPath: string): void => {
  context.fs.mkdir(targetPath, { recursive: true });
  context.fs.writeFile(`${targetPath}/package.json`, JSON.stringify({ scripts: { dev: "vite" }, dependencies: { react: "latest" } }));
  context.fs.writeFile(`${targetPath}/vite.config.ts`, `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
`);
  context.fs.writeFile(`${targetPath}/tsconfig.json`, JSON.stringify({ files: [], references: [{ path: "./tsconfig.app.json" }] }));
  context.fs.writeFile(`${targetPath}/tsconfig.app.json`, JSON.stringify({ compilerOptions: { jsx: "react-jsx" } }));
  context.fs.writeFile(`${targetPath}/src/main.tsx`, `import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
`);
  context.fs.writeFile(`${targetPath}/src/index.css`, "body { margin: 0; }\n");
};

const writeViteFixtureWithRootTsconfig = (context: CliContext, targetPath: string): void => {
  writeViteFixture(context, targetPath);
  context.fs.unlink(`${targetPath}/tsconfig.app.json`);
  context.fs.writeFile(`${targetPath}/tsconfig.json`, JSON.stringify({ compilerOptions: { jsx: "react-jsx" } }));
};

const writeViteFixtureWithoutTsconfig = (context: CliContext, targetPath: string): void => {
  writeViteFixture(context, targetPath);
  context.fs.unlink(`${targetPath}/tsconfig.app.json`);
  context.fs.unlink(`${targetPath}/tsconfig.json`);
};

const writeViteFixtureWithInvalidTsconfig = (context: CliContext, targetPath: string, source: string): void => {
  writeViteFixture(context, targetPath);
  context.fs.writeFile(`${targetPath}/tsconfig.app.json`, source);
};

const writeViteFixtureWithoutMainEntry = (context: CliContext, targetPath: string): void => {
  writeViteFixture(context, targetPath);
  context.fs.writeFile(`${targetPath}/src/main.tsx`, "import App from './App.tsx';\n");
};

const createScaffoldRunCommand = (
  context: CliContext,
  fixture: (context: CliContext, targetPath: string, command: ExternalCommand) => void = (ctx, targetPath, command) => {
    if (command.args.some((arg) => arg.includes("next-app"))) writeNextFixture(ctx, targetPath);
    else writeViteFixture(ctx, targetPath);
  },
) => vi.fn(async (command: ExternalCommand) => {
  if (command.stage === "scaffold") {
    const target = command.args[2];
    if (!target) throw new Error("missing target arg");
    fixture(context, normalizeAbsolutePath(resolve(command.cwd, target)), command);
  }

  return { exitCode: 0 };
});

describe("create-project options", () => {
  it("нормализует defaults и --no-install", () => {
    const context = createContext();
    const normalized = normalizeCreateProjectOptions(context, {
      projectName: "./demo",
      template: "vite",
    });
    const noInstall = normalizeCreateProjectOptions(context, {
      projectName: "apps/demo",
      template: "next",
      css: "none",
      packageManager: "npm",
      install: false,
    });

    expect(normalized).toEqual({
      ok: true,
      options: {
        projectName: "demo",
        targetPath: "/project/demo",
        targetParentPath: "/project",
        template: "vite",
        css: "tailwind",
        packageManager: "npm",
        install: true,
      },
    });
    expect(noInstall).toEqual({
      ok: true,
      options: expect.objectContaining({
        projectName: "apps/demo",
        targetPath: "/project/apps/demo",
        targetParentPath: "/project/apps",
        css: "none",
        packageManager: "npm",
        install: false,
      }),
    });
  });

  it("отклоняет неизвестные options и неподдержанный --agents-md", () => {
    const context = createContext();
    const result = normalizeCreateProjectOptions(context, {
      projectName: "demo",
      template: "svelte",
      css: "sass",
      packageManager: "deno",
      agentsMd: true,
    });

    expect(result).toEqual({
      ok: false,
      diagnostics: [
        expect.objectContaining({ code: "LFC_INVALID_OPTIONS", message: "Unknown template 'svelte'." }),
        expect.objectContaining({ code: "LFC_INVALID_OPTIONS", message: "Unknown css preset 'sass'." }),
        expect.objectContaining({ code: "LFC_INVALID_OPTIONS", message: "Unknown package manager 'deno'." }),
        expect.objectContaining({ code: "LFC_INVALID_OPTIONS", message: "Option --agents-md is not supported." }),
      ],
    });
  });

  it("отклоняет missing template, missing project и небезопасные target paths", () => {
    const context = createContext();
    const invalidNames = ["", ".", "..", "/tmp/demo", "apps/../demo"];

    expect(normalizeCreateProjectOptions(context, { projectName: "demo" })).toEqual({
      ok: false,
      diagnostics: [expect.objectContaining({ code: "LFC_INVALID_OPTIONS", message: "Option --template is required." })],
    });
    expect(normalizeCreateProjectOptions(context, { template: "next" })).toEqual({
      ok: false,
      diagnostics: [expect.objectContaining({ code: "LFC_INVALID_OPTIONS", message: "Project name is required." })],
    });
    for (const projectName of invalidNames) {
      expect(normalizeCreateProjectOptions(context, { projectName, template: "next" })).toEqual({
        ok: false,
        diagnostics: [expect.objectContaining({ code: "LFC_INVALID_OPTIONS" })],
      });
    }
  });
});

describe("create-project registries and package managers", () => {
  const packageManagers: readonly CreateProjectPackageManager[] = ["pnpm", "npm", "yarn", "bun"];

  it("резолвит template и css registries", () => {
    expect(listCreateProjectTemplates()).toEqual(["next", "vite"]);
    expect(getCreateProjectTemplate("next").key).toBe("next");
    expect(getCreateProjectTemplate("vite").key).toBe("vite");
    expect(listCreateProjectCssAdapters().map((adapter) => `${adapter.template}:${adapter.key}`).sort()).toEqual([
      "next:none",
      "next:tailwind",
      "vite:none",
      "vite:tailwind",
    ]);
    expect(getCreateProjectCssAdapter("vite", "tailwind").packageJsonPatch).toEqual({
      devDependencies: {
        "@tailwindcss/vite": "latest",
        tailwindcss: "latest",
      },
    });
  });

  it("генерирует scaffold/install/dev команды для всех package managers", () => {
    const expected = {
      pnpm: {
        next: ["pnpm", ["create", "next-app@latest", "demo", "--yes", "--ts", "--app", "--src-dir", "--import-alias", "@/*", "--skip-install", "--no-agents-md", "--tailwind", "--use-pnpm"]],
        vite: ["pnpm", ["create", "vite@latest", "demo", "--template", "react-ts"]],
        install: ["pnpm", ["install"]],
        dev: "pnpm dev",
      },
      npm: {
        next: ["npm", ["create", "next-app@latest", "demo", "--", "--yes", "--ts", "--app", "--src-dir", "--import-alias", "@/*", "--skip-install", "--no-agents-md", "--tailwind", "--use-npm"]],
        vite: ["npm", ["create", "vite@latest", "demo", "--", "--template", "react-ts"]],
        install: ["npm", ["install"]],
        dev: "npm run dev",
      },
      yarn: {
        next: ["yarn", ["create", "next-app", "demo", "--yes", "--ts", "--app", "--src-dir", "--import-alias", "@/*", "--skip-install", "--no-agents-md", "--tailwind", "--use-yarn"]],
        vite: ["yarn", ["create", "vite", "demo", "--template", "react-ts"]],
        install: ["yarn", ["install"]],
        dev: "yarn dev",
      },
      bun: {
        next: ["bun", ["create", "next-app@latest", "demo", "--yes", "--ts", "--app", "--src-dir", "--import-alias", "@/*", "--skip-install", "--no-agents-md", "--tailwind", "--use-bun"]],
        vite: ["bun", ["create", "vite@latest", "demo", "--template", "react-ts"]],
        install: ["bun", ["install"]],
        dev: "bun run dev",
      },
    } as const;

    for (const packageManager of packageManagers) {
      const next = createScaffoldCommand({ packageManager, template: "next", css: "tailwind", target: "demo" });
      const vite = createScaffoldCommand({ packageManager, template: "vite", css: "tailwind", target: "demo" });
      const install = createInstallCommand(packageManager);

      expect([next.command, next.args]).toEqual(expected[packageManager].next);
      expect([vite.command, vite.args]).toEqual(expected[packageManager].vite);
      expect(next.outputFilter).toBeUndefined();
      expect(vite.outputFilter).toBe("create-vite-next-steps");
      expect([install.command, install.args]).toEqual(expected[packageManager].install);
      expect(createDevCommand(packageManager)).toBe(expected[packageManager].dev);
    }
  });

  it("добавляет Next --no-tailwind для --css none", () => {
    expect(createScaffoldCommand({ packageManager: "pnpm", template: "next", css: "none", target: "demo" }).args).toContain("--no-tailwind");
  });
});

describe("create-project run flow", () => {
  it("пишет diagnostics при прямом invalid command normalize", async () => {
    const context = createContext();
    const result = await runCreateProjectCommand(context, { projectName: "demo" });

    expect(result).toEqual({
      exitCode: 1,
      diagnostics: [expect.objectContaining({ code: "LFC_INVALID_OPTIONS", message: "Option --template is required." })],
    });
    expect(context.stderr.text()).toContain("Option --template is required.");
  });

  it("создает Next Tailwind проект, запускает install и печатает next steps", async () => {
    const context = createContext();
    const runCommand = createScaffoldRunCommand(context);
    const result = await runCreateProjectCommand(context, {
      projectName: "demo",
      template: "next",
      packageManager: "pnpm",
    }, { runCommand });
    const packageJson = JSON.parse(context.fs.getFile("/project/demo/package.json") ?? "{}");

    expect(result).toEqual({ exitCode: 0, diagnostics: [] });
    expect(runCommand).toHaveBeenCalledTimes(2);
    expect(runCommand.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      command: "pnpm",
      cwd: "/project",
      stage: "scaffold",
      args: expect.arrayContaining(["--tailwind", "--no-agents-md"]),
    }));
    expect(runCommand.mock.calls[0]?.[0]).not.toHaveProperty("shell");
    expect(runCommand.mock.calls[1]?.[0]).toEqual(expect.objectContaining({
      command: "pnpm",
      cwd: "/project/demo",
      stage: "install",
      args: ["install"],
    }));
    expect(context.fs.getFile("/project/demo/src/app/providers.tsx")?.startsWith('"use client";')).toBe(true);
    expect(context.fs.getFile("/project/demo/src/app/providers.tsx")).toContain("makeStore()");
    expect(context.fs.getFile("/project/demo/src/app/providers.tsx")).toContain("useRef<AppStore | null>(null)");
    expect(context.fs.getFile("/project/demo/src/app/page.tsx")).toContain('transition({ type: "DO_INIT" })');
    expect(context.fs.getFile("/project/demo/src/app/page.tsx")).toContain('appState === "READY"');
    expect(context.fs.getFile("/project/demo/src/app/page.tsx")).toContain("READY UI is visible.");
    expect(context.fs.getFile("/project/demo/src/app/layout.tsx")).toContain("<Providers>{children}</Providers>");
    expect(packageJson.dependencies["@lite-fsm/core"]).toBe(createProjectLiteFsmDependencies["@lite-fsm/core"]);
    expect(packageJson.dependencies["@lite-fsm/middleware"]).toBe(createProjectLiteFsmDependencies["@lite-fsm/middleware"]);
    expect(packageJson.dependencies["@lite-fsm/react"]).toBe(createProjectLiteFsmDependencies["@lite-fsm/react"]);
    expect(packageJson.dependencies.immer).toBe(createProjectLiteFsmDependencies.immer);
    expect(context.fs.getFile("/project/demo/src/store/machines/app.ts")).toContain('initialState: "IDLE"');
    expect(context.fs.getFile("/project/demo/src/store/machines/app.ts")).toContain('IDLE: { DO_INIT: "READY" }');
    expect(context.fs.getFile("/project/demo/src/store/machines/app.ts")).toContain('export type Events = FSMEvent<"DO_INIT">');
    expect(context.fs.getFile("/project/demo/src/store/machines/app.ts")).toContain("const root = getState();");
    expect(context.fs.getFile("/project/demo/src/store/index.ts")).toContain("export const makeStore = () =>");
    expect(context.fs.getFile("/project/demo/src/store/index.ts")).toContain('import { immerMiddleware } from "@lite-fsm/middleware/immer";');
    expect(context.fs.getFile("/project/demo/src/store/index.ts")).toContain("middleware: [immerMiddleware]");
    expect(context.fs.getFile("/project/demo/src/store/index.ts")).toContain("getState: manager.getState");
    expect(context.fs.getFile("/project/demo/src/store/deps.ts")).toContain("getState: () => AppState");
    expect(context.fs.getFile("/project/demo/src/store/types.ts")).toContain('import type * as app from "./machines/app";');
    expect(context.fs.getFile("/project/demo/src/store/types.ts")).toContain("export type AppEvents = app.Events;");
    expect(context.stdout.text()).toContain("Installing dependencies: pnpm install");
    expect(context.stdout.text()).toContain("cd demo");
    expect(context.stdout.text()).toContain("pnpm dev");
  });

  it("создает Vite Tailwind проект без install и патчит alias/provider/css", async () => {
    const context = createContext();
    const runCommand = createScaffoldRunCommand(context);
    const result = await runCreateProjectCommand(context, {
      projectName: "demo",
      template: "vite",
      install: false,
    }, { runCommand });
    const packageJson = JSON.parse(context.fs.getFile("/project/demo/package.json") ?? "{}");
    const tsconfig = JSON.parse(context.fs.getFile("/project/demo/tsconfig.app.json") ?? "{}");

    expect(result).toEqual({ exitCode: 0, diagnostics: [] });
    expect(runCommand).toHaveBeenCalledTimes(1);
    expect(runCommand.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      command: "npm",
      cwd: "/project",
      outputFilter: "create-vite-next-steps",
      stage: "scaffold",
      args: ["create", "vite@latest", "demo", "--", "--template", "react-ts"],
    }));
    expect(context.fs.getFile("/project/demo/vite.config.ts")).toContain("@tailwindcss/vite");
    expect(context.fs.getFile("/project/demo/vite.config.ts")).toContain('"@": fileURLToPath(new URL("./src", import.meta.url))');
    expect(context.fs.getFile("/project/demo/src/main.tsx")).toContain('import { makeStore } from "@/store";');
    expect(context.fs.getFile("/project/demo/src/main.tsx")).toContain("const manager = makeStore();");
    expect(context.fs.getFile("/project/demo/src/main.tsx")).toContain("FSMContextProvider");
    expect(context.fs.getFile("/project/demo/src/App.tsx")).toContain('transition({ type: "DO_INIT" })');
    expect(context.fs.getFile("/project/demo/src/App.tsx")).toContain('appState === "READY"');
    expect(context.fs.getFile("/project/demo/src/App.tsx")).toContain("READY UI is visible.");
    expect(context.fs.getFile("/project/demo/src/main.tsx")).toMatch(/import\s+['"]\.\/index\.css['"]/);
    expect(context.fs.getFile("/project/demo/src/index.css")).toBe('@import "tailwindcss";\n');
    expect(tsconfig.compilerOptions.paths["@/*"]).toEqual(["./src/*"]);
    expect(tsconfig.compilerOptions).not.toHaveProperty("baseUrl");
    expect(packageJson.dependencies["@lite-fsm/core"]).toBe(createProjectLiteFsmDependencies["@lite-fsm/core"]);
    expect(packageJson.dependencies["@lite-fsm/middleware"]).toBe(createProjectLiteFsmDependencies["@lite-fsm/middleware"]);
    expect(packageJson.dependencies.immer).toBe(createProjectLiteFsmDependencies.immer);
    expect(packageJson.devDependencies["@tailwindcss/vite"]).toBe("latest");
    expect(context.stdout.text()).toContain("npm run dev");
  });

  it("--css none не добавляет Tailwind dependencies или plugin", async () => {
    const context = createContext();
    const runCommand = createScaffoldRunCommand(context);
    const result = await runCreateProjectCommand(context, {
      projectName: "demo",
      template: "vite",
      css: "none",
      install: false,
    }, { runCommand });
    const packageJson = JSON.parse(context.fs.getFile("/project/demo/package.json") ?? "{}");

    expect(result.exitCode).toBe(0);
    expect(packageJson.devDependencies).toBeUndefined();
    expect(context.fs.getFile("/project/demo/vite.config.ts")).not.toContain("@tailwindcss/vite");
    expect(context.fs.getFile("/project/demo/src/index.css")).toBe("body { margin: 0; }\n");
  });

  it("поддерживает nested target, если parent directory существует", async () => {
    const context = createContext({ "/project/apps/.keep": "" });
    const runCommand = createScaffoldRunCommand(context);
    const result = await runCreateProjectCommand(context, {
      projectName: "apps/demo",
      template: "next",
      install: false,
    }, { runCommand });

    expect(result.exitCode).toBe(0);
    expect(runCommand.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ args: expect.arrayContaining(["apps/demo"]) }));
    expect(context.fs.fileExists("/project/apps/demo/src/store/index.ts")).toBe(true);
  });

  it("не запускает scaffold при missing parent или existing target", async () => {
    const missingParentContext = createContext();
    const existingTargetContext = createContext({ "/project/demo/package.json": "{}" });
    const missingParentRun = createScaffoldRunCommand(missingParentContext);
    const existingTargetRun = createScaffoldRunCommand(existingTargetContext);

    const missingParent = await runCreateProjectCommand(missingParentContext, {
      projectName: "apps/demo",
      template: "next",
    }, { runCommand: missingParentRun });
    const existingTarget = await runCreateProjectCommand(existingTargetContext, {
      projectName: "demo",
      template: "next",
    }, { runCommand: existingTargetRun });

    expect(missingParent.diagnostics).toEqual([expect.objectContaining({ code: "LFC_CREATE_TARGET_PARENT_MISSING" })]);
    expect(existingTarget.diagnostics).toEqual([expect.objectContaining({ code: "LFC_CREATE_TARGET_EXISTS" })]);
    expect(missingParentRun).not.toHaveBeenCalled();
    expect(existingTargetRun).not.toHaveBeenCalled();
  });

  it("возвращает diagnostics для external command failures", async () => {
    const context = createContext();
    const scaffoldFailure = vi.fn(async () => ({ exitCode: 7, stderr: "network blocked" }));
    const nonErrorScaffoldFailure = vi.fn(async () => {
      throw "binary missing";
    });
    const spawnFailure = vi.fn(async (command: ExternalCommand) => {
      if (command.stage === "scaffold") {
        writeViteFixture(context, "/project/demo");
        return { exitCode: 0 };
      }
      throw new Error("npm not found");
    });

    const failedScaffold = await runCreateProjectCommand(context, {
      projectName: "demo",
      template: "next",
    }, { runCommand: scaffoldFailure });
    const failedNonErrorScaffold = await runCreateProjectCommand(createContext(), {
      projectName: "demo",
      template: "next",
    }, { runCommand: nonErrorScaffoldFailure });
    const failedInstall = await runCreateProjectCommand(context, {
      projectName: "demo",
      template: "vite",
    }, { runCommand: spawnFailure });

    expect(failedScaffold.diagnostics).toEqual([
      expect.objectContaining({
        code: "LFC_CREATE_SCAFFOLD_FAILED",
        message: expect.stringContaining("stage: scaffold, exit code: 7, stderr: network blocked"),
      }),
    ]);
    expect(failedNonErrorScaffold.diagnostics).toEqual([
      expect.objectContaining({
        code: "LFC_CREATE_SCAFFOLD_FAILED",
        message: expect.stringContaining("stage: scaffold, error: binary missing"),
      }),
    ]);
    expect(failedInstall.diagnostics).toEqual([
      expect.objectContaining({
        code: "LFC_CREATE_INSTALL_FAILED",
        message: expect.stringContaining("stage: install, error: npm not found"),
      }),
    ]);
    expect(context.fs.directoryExists("/project/demo")).toBe(true);
  });

  it("возвращает patch, validation и write diagnostics без rollback", async () => {
    const brokenLayoutContext = createContext();
    const validationContext = createContext();
    const writeFailureContext = createContext();
    const brokenLayoutRun = createScaffoldRunCommand(brokenLayoutContext, (ctx, targetPath) => writeBrokenNextFixture(ctx, targetPath));
    const validationRun = createScaffoldRunCommand(validationContext, (ctx, targetPath) => writeNextFixtureWithoutAlias(ctx, targetPath));
    const writeFailureRun = createScaffoldRunCommand(writeFailureContext, (ctx, targetPath) => {
      writeNextFixture(ctx, targetPath);
      writeFailureContext.fs.writeFile = () => {
        throw new Error("readonly");
      };
    });

    const brokenLayout = await runCreateProjectCommand(brokenLayoutContext, {
      projectName: "demo",
      template: "next",
      install: false,
    }, { runCommand: brokenLayoutRun });
    const validation = await runCreateProjectCommand(validationContext, {
      projectName: "demo",
      template: "next",
      install: false,
    }, { runCommand: validationRun });
    const writeFailure = await runCreateProjectCommand(writeFailureContext, {
      projectName: "demo",
      template: "next",
      install: false,
    }, { runCommand: writeFailureRun });

    expect(brokenLayout.diagnostics).toEqual([expect.objectContaining({ code: "LFC_CREATE_PATCH_FAILED" })]);
    expect(validation.diagnostics).toEqual([expect.objectContaining({ code: "LFC_CREATE_VALIDATION_FAILED" })]);
    expect(writeFailure.diagnostics).toEqual([expect.objectContaining({ code: "LFC_WRITE_FAILED" })]);
    expect(brokenLayoutContext.fs.directoryExists("/project/demo")).toBe(true);
    expect(validationContext.fs.directoryExists("/project/demo")).toBe(true);
    expect(writeFailureContext.fs.directoryExists("/project/demo")).toBe(true);
  });

  it("возвращает package.json patch diagnostics для invalid json, non-object и write failure", () => {
    const invalidJson = createContext({ "/project/demo/package.json": "{" });
    const nonObject = createContext({ "/project/demo/package.json": "[]" });
    const writeFailure = createContext({ "/project/demo/package.json": "{}" });
    writeFailure.fs.writeFile = () => {
      throw "readonly";
    };

    expect(patchPackageJson(invalidJson, "/project/demo", { dependencies: { react: "latest" } })).toEqual({
      ok: false,
      diagnostics: [expect.objectContaining({
        code: "LFC_CREATE_PATCH_FAILED",
        message: expect.stringContaining("Failed to patch generated package.json"),
      })],
    });
    expect(patchPackageJson(nonObject, "/project/demo", {})).toEqual({
      ok: false,
      diagnostics: [expect.objectContaining({
        code: "LFC_CREATE_PATCH_FAILED",
        message: "Generated package.json must be a JSON object.",
      })],
    });
    expect(patchPackageJson(writeFailure, "/project/demo", { dependencies: { react: "latest" } })).toEqual({
      ok: false,
      diagnostics: [expect.objectContaining({
        code: "LFC_WRITE_FAILED",
        message: "Failed to write generated package.json: readonly",
      })],
    });
    expect(mergePackageJsonPatches([])).toEqual({});
    expect(mergePackageJsonPatches([{ dependencies: { react: "latest" } }])).toEqual({
      dependencies: { react: "latest" },
    });
    expect(mergePackageJsonPatches([{ devDependencies: { vite: "latest" } }])).toEqual({
      devDependencies: { vite: "latest" },
    });
  });

  it("покрывает write-files read, patch и aggregate failure ветки", () => {
    const context = createContext({ "/project/demo/file.ts": "source" });
    const writeFailure = createContext({ "/project/demo/file.ts": "source" });
    writeFailure.fs.writeFile = () => {
      throw new Error("readonly");
    };
    const stringWriteFailure = createContext();
    stringWriteFailure.fs.writeFile = () => {
      throw "readonly";
    };

    expect(patchProjectTextFile(context, "/project/demo", "missing.ts", (source) => ({ ok: true, contents: source }))).toEqual({
      ok: false,
      diagnostics: [expect.objectContaining({
        code: "LFC_CREATE_PATCH_FAILED",
        message: expect.stringContaining("Missing file"),
      })],
    });
    expect(patchProjectTextFile(writeFailure, "/project/demo", "file.ts", () => ({ ok: true, contents: "patched" }))).toEqual({
      ok: false,
      diagnostics: [expect.objectContaining({
        code: "LFC_WRITE_FAILED",
        message: expect.stringContaining("readonly"),
      })],
    });
    expect(writeProjectFile(stringWriteFailure, "/project/demo", "file.ts", "source")).toEqual({
      ok: false,
      diagnostics: [expect.objectContaining({
        code: "LFC_WRITE_FAILED",
        message: "Failed to write generated project file: readonly",
      })],
    });
    expect(writeProjectFiles(context, "/project/demo", { "a.ts": "a", "b.ts": "b" })).toEqual({ ok: true });
    expect(writeProjectFiles(stringWriteFailure, "/project/demo", { "a.ts": "a", "b.ts": "b" })).toEqual({
      ok: false,
      diagnostics: [expect.objectContaining({
        code: "LFC_WRITE_FAILED",
        file: "/project/demo/a.ts",
      })],
    });
  });

  it("покрывает idempotent и failure ветки pure patchers", () => {
    const layout = 'import { Providers } from "./providers";\nexport default function L({ children }) { return <body>{children}</body>; }';
    const aliasConfig = `export default defineConfig({
  resolve: { alias: { "@": "/src" } },
})
`;
    const main = `import { makeStore } from "@/store";
import { FSMContextProvider } from "@lite-fsm/react";

const manager = makeStore();

<App />
`;

    expect(patchNextLayout(layout)).toEqual({
      ok: true,
      contents: expect.stringMatching(/^import \{ Providers \} from "\.\/providers";/),
    });
    expect(patchViteAlias(aliasConfig)).toEqual({ ok: true, contents: aliasConfig });
    expect(patchViteAlias("export default {}")).toEqual({
      ok: false,
      message: "Vite config patch failed: expected export default defineConfig({ ... }).",
    });
    expect(patchViteMainProvider(main)).toEqual({
      ok: true,
      contents: expect.stringContaining("const manager = makeStore();"),
    });
    expect(patchViteMainProvider("render(null)")).toEqual({
      ok: false,
      message: "Vite main patch failed: expected an <App /> render entry.",
    });
    expect(patchViteTailwindPlugin("export default defineConfig({})")).toEqual({
      ok: true,
      contents: expect.stringContaining("plugins: [tailwindcss()]"),
    });
    expect(patchViteTailwindPlugin(`import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  plugins: [tailwindcss()],
})
`)).toEqual({
      ok: true,
      contents: expect.stringContaining("plugins: [tailwindcss()]"),
    });
    expect(patchViteTailwindPlugin(`export default defineConfig({
  plugins: [],
})
`)).toEqual({
      ok: true,
      contents: expect.stringContaining("plugins: [tailwindcss()]"),
    });
    expect(patchViteTailwindPlugin("export default {}")).toEqual({
      ok: false,
      message: "Vite Tailwind patch failed: expected export default defineConfig({ ... }).",
    });
    expect(ensureViteCssImport("render(<App />);")).toEqual({
      ok: true,
      contents: 'import "./index.css";\nrender(<App />);',
    });
    expect(ensureViteCssImport('import "./app.css";\nrender(<App />);')).toEqual({
      ok: true,
      contents: 'import "./app.css";\nrender(<App />);',
    });
  });

  it("покрывает Vite tsconfig fallback и patch failures", async () => {
    const rootTsconfigContext = createContext();
    const jsoncContext = createContext();
    const missingTsconfigContext = createContext();
    const invalidObjectContext = createContext();
    const invalidJsonContext = createContext();
    const arrayCompilerOptionsContext = createContext();
    const arrayPathsContext = createContext();
    const objectPathsContext = createContext();
    const missingMainContext = createContext();
    const rootRun = createScaffoldRunCommand(rootTsconfigContext, (ctx, targetPath) => writeViteFixtureWithRootTsconfig(ctx, targetPath));
    const jsoncRun = createScaffoldRunCommand(jsoncContext, (ctx, targetPath) => {
      writeViteFixtureWithInvalidTsconfig(ctx, targetPath, `{
  "compilerOptions": {
    "jsx": "react-jsx",

    /* Bundler mode */
    "moduleResolution": "bundler"
  },
  "include": ["src"]
}
`);
    });
    const missingRun = createScaffoldRunCommand(missingTsconfigContext, (ctx, targetPath) => writeViteFixtureWithoutTsconfig(ctx, targetPath));
    const invalidObjectRun = createScaffoldRunCommand(invalidObjectContext, (ctx, targetPath) => writeViteFixtureWithInvalidTsconfig(ctx, targetPath, "[]"));
    const invalidJsonRun = createScaffoldRunCommand(invalidJsonContext, (ctx, targetPath) => writeViteFixtureWithInvalidTsconfig(ctx, targetPath, "{"));
    const arrayCompilerOptionsRun = createScaffoldRunCommand(arrayCompilerOptionsContext, (ctx, targetPath) => {
      writeViteFixtureWithInvalidTsconfig(ctx, targetPath, JSON.stringify({ compilerOptions: [] }));
    });
    const arrayPathsRun = createScaffoldRunCommand(arrayPathsContext, (ctx, targetPath) => {
      writeViteFixtureWithInvalidTsconfig(ctx, targetPath, JSON.stringify({ compilerOptions: { paths: [] } }));
    });
    const objectPathsRun = createScaffoldRunCommand(objectPathsContext, (ctx, targetPath) => {
      writeViteFixtureWithInvalidTsconfig(ctx, targetPath, JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "~/*": ["./src/*"] } } }));
    });
    const missingMainRun = createScaffoldRunCommand(missingMainContext, (ctx, targetPath) => writeViteFixtureWithoutMainEntry(ctx, targetPath));

    expect((await runCreateProjectCommand(rootTsconfigContext, {
      projectName: "demo",
      template: "vite",
      install: false,
    }, { runCommand: rootRun })).exitCode).toBe(0);
    expect(JSON.parse(rootTsconfigContext.fs.getFile("/project/demo/tsconfig.json") ?? "{}").compilerOptions.paths["@/*"]).toEqual(["./src/*"]);
    expect(JSON.parse(rootTsconfigContext.fs.getFile("/project/demo/tsconfig.json") ?? "{}").compilerOptions).not.toHaveProperty("baseUrl");
    expect((await runCreateProjectCommand(jsoncContext, {
      projectName: "demo",
      template: "vite",
      install: false,
    }, { runCommand: jsoncRun })).exitCode).toBe(0);
    expect(JSON.parse(jsoncContext.fs.getFile("/project/demo/tsconfig.app.json") ?? "{}").compilerOptions.paths["@/*"]).toEqual(["./src/*"]);
    expect(JSON.parse(jsoncContext.fs.getFile("/project/demo/tsconfig.app.json") ?? "{}").compilerOptions).not.toHaveProperty("baseUrl");
    await expect(runCreateProjectCommand(missingTsconfigContext, {
      projectName: "demo",
      template: "vite",
      install: false,
    }, { runCommand: missingRun })).resolves.toEqual({
      exitCode: 1,
      diagnostics: [expect.objectContaining({
        code: "LFC_CREATE_PATCH_FAILED",
        message: "Vite TypeScript config patch failed: no tsconfig file found.",
      })],
    });
    await expect(runCreateProjectCommand(invalidObjectContext, {
      projectName: "demo",
      template: "vite",
      install: false,
    }, { runCommand: invalidObjectRun })).resolves.toEqual({
      exitCode: 1,
      diagnostics: [expect.objectContaining({
        code: "LFC_CREATE_PATCH_FAILED",
        message: expect.stringContaining("root value"),
      })],
    });
    await expect(runCreateProjectCommand(invalidJsonContext, {
      projectName: "demo",
      template: "vite",
      install: false,
    }, { runCommand: invalidJsonRun })).resolves.toEqual({
      exitCode: 1,
      diagnostics: [expect.objectContaining({
        code: "LFC_CREATE_PATCH_FAILED",
        message: expect.stringContaining("TypeScript config patch failed:"),
      })],
    });
    expect((await runCreateProjectCommand(arrayCompilerOptionsContext, {
      projectName: "demo",
      template: "vite",
      install: false,
    }, { runCommand: arrayCompilerOptionsRun })).exitCode).toBe(0);
    expect((await runCreateProjectCommand(arrayPathsContext, {
      projectName: "demo",
      template: "vite",
      install: false,
    }, { runCommand: arrayPathsRun })).exitCode).toBe(0);
    expect((await runCreateProjectCommand(objectPathsContext, {
      projectName: "demo",
      template: "vite",
      install: false,
    }, { runCommand: objectPathsRun })).exitCode).toBe(0);
    expect(JSON.parse(objectPathsContext.fs.getFile("/project/demo/tsconfig.app.json") ?? "{}").compilerOptions).toEqual({
      paths: {
        "~/*": ["./src/*"],
        "@/*": ["./src/*"],
      },
    });
    await expect(runCreateProjectCommand(missingMainContext, {
      projectName: "demo",
      template: "vite",
      install: false,
    }, { runCommand: missingMainRun })).resolves.toEqual({
      exitCode: 1,
      diagnostics: [expect.objectContaining({
        code: "LFC_CREATE_PATCH_FAILED",
        message: "Vite main patch failed: expected an <App /> render entry.",
      })],
    });
  });

  it("покрывает early return из Vite template и Tailwind adapter write/main fallbacks", async () => {
    const invalidConfigContext = createContext();
    const invalidTailwindConfigContext = createContext({
      "/project/demo/vite.config.ts": "export default {}",
    });
    const missingMainForCss = createContext({
      "/project/demo/vite.config.ts": "export default defineConfig({})",
    });
    const writeFailureForCss = createContext({
      "/project/demo/vite.config.ts": "export default defineConfig({})",
      "/project/demo/src/main.tsx": "render(<App />);",
    });
    writeFailureForCss.fs.writeFile = (path, contents) => {
      if (path.endsWith("index.css")) throw new Error("readonly css");
      createContext().fs.writeFile(path, contents);
    };
    const invalidRun = createScaffoldRunCommand(invalidConfigContext, (ctx, targetPath) => {
      writeViteFixture(ctx, targetPath);
      ctx.fs.writeFile(`${targetPath}/vite.config.ts`, "export default {}");
    });

    await expect(runCreateProjectCommand(invalidConfigContext, {
      projectName: "demo",
      template: "vite",
      install: false,
    }, { runCommand: invalidRun })).resolves.toEqual({
      exitCode: 1,
      diagnostics: [expect.objectContaining({
        code: "LFC_CREATE_PATCH_FAILED",
        message: "Vite config patch failed: expected export default defineConfig({ ... }).",
      })],
    });
    expect(viteTailwindCssAdapter.apply(missingMainForCss, {
      targetPath: "/project/demo",
      template: "vite",
    })).toEqual({
      ok: false,
      diagnostics: [expect.objectContaining({
        code: "LFC_CREATE_PATCH_FAILED",
        message: expect.stringContaining("Missing file"),
      })],
    });
    expect(viteTailwindCssAdapter.apply(invalidTailwindConfigContext, {
      targetPath: "/project/demo",
      template: "vite",
    })).toEqual({
      ok: false,
      diagnostics: [expect.objectContaining({
        code: "LFC_CREATE_PATCH_FAILED",
        message: "Vite Tailwind patch failed: expected export default defineConfig({ ... }).",
      })],
    });
    expect(missingMainForCss.fs.getFile("/project/demo/src/index.css")).toBe('@import "tailwindcss";\n');
    expect(viteTailwindCssAdapter.apply(writeFailureForCss, {
      targetPath: "/project/demo",
      template: "vite",
    })).toEqual({
      ok: false,
      diagnostics: [expect.objectContaining({
        code: "LFC_WRITE_FAILED",
        message: expect.stringContaining("readonly css"),
      })],
    });
  });

  it("покрывает early returns css, store и package patch в run pipeline", async () => {
    const cssFailureContext = createContext();
    const storeFailureContext = createContext();
    const nextPageFailureContext = createContext();
    const packageFailureContext = createContext();
    const cssFailureRun = createScaffoldRunCommand(cssFailureContext, (ctx, targetPath) => {
      writeViteFixture(ctx, targetPath);
      cssFailureContext.fs.writeFile = (path, contents) => {
        if (path.endsWith("src/index.css")) throw new Error("css readonly");
        createContext().fs.writeFile(path, contents);
      };
    });
    const storeFailureRun = createScaffoldRunCommand(storeFailureContext, (ctx, targetPath) => {
      writeNextFixture(ctx, targetPath);
      storeFailureContext.fs.writeFile = (path, contents) => {
        if (path.endsWith("src/store/create-machine.ts")) throw new Error("store readonly");
        createContext().fs.writeFile(path, contents);
      };
    });
    const nextPageFailureRun = createScaffoldRunCommand(nextPageFailureContext, (ctx, targetPath) => {
      writeNextFixture(ctx, targetPath);
      nextPageFailureContext.fs.writeFile = (path, contents) => {
        if (path.endsWith("src/app/page.tsx")) throw new Error("page readonly");
        createContext().fs.writeFile(path, contents);
      };
    });
    const packageFailureRun = createScaffoldRunCommand(packageFailureContext, (ctx, targetPath) => {
      writeNextFixture(ctx, targetPath);
      ctx.fs.writeFile(`${targetPath}/package.json`, "[]");
    });
    await expect(runCreateProjectCommand(cssFailureContext, {
      projectName: "demo",
      template: "vite",
      install: false,
    }, { runCommand: cssFailureRun })).resolves.toEqual({
      exitCode: 1,
      diagnostics: [expect.objectContaining({
        code: "LFC_WRITE_FAILED",
        message: expect.stringContaining("css readonly"),
      })],
    });
    await expect(runCreateProjectCommand(storeFailureContext, {
      projectName: "demo",
      template: "next",
      install: false,
    }, { runCommand: storeFailureRun })).resolves.toEqual({
      exitCode: 1,
      diagnostics: [expect.objectContaining({
        code: "LFC_WRITE_FAILED",
        message: expect.stringContaining("store readonly"),
      })],
    });
    await expect(runCreateProjectCommand(nextPageFailureContext, {
      projectName: "demo",
      template: "next",
      install: false,
    }, { runCommand: nextPageFailureRun })).resolves.toEqual({
      exitCode: 1,
      diagnostics: [expect.objectContaining({
        code: "LFC_WRITE_FAILED",
        message: expect.stringContaining("page readonly"),
      })],
    });
    await expect(runCreateProjectCommand(packageFailureContext, {
      projectName: "demo",
      template: "next",
      install: false,
    }, { runCommand: packageFailureRun })).resolves.toEqual({
      exitCode: 1,
      diagnostics: [expect.objectContaining({
        code: "LFC_CREATE_PATCH_FAILED",
        message: "Generated package.json must be a JSON object.",
      })],
    });
  });

  it("покрывает validation failures для Vite alias, provider и Tailwind entrypoint", async () => {
    const context = createContext();
    const runCommand = vi.fn(async (command: ExternalCommand) => {
      if (command.stage === "scaffold") {
        writeViteFixture(context, "/project/demo");
      } else {
        context.fs.writeFile("/project/demo/vite.config.ts", `import { defineConfig } from 'vite'
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss()],
})
`);
        context.fs.writeFile("/project/demo/src/main.tsx", `import { FSMContextProvider } from "@lite-fsm/react";
import { manager } from "@/store";

<FSMContextProvider machineManager={manager} />;
`);
      }

      return { exitCode: 0 };
    });
    const result = await runCreateProjectCommand(context, {
      projectName: "demo",
      template: "vite",
    }, { runCommand });

    expect(result.exitCode).toBe(1);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "LFC_CREATE_VALIDATION_FAILED", message: "Generated Vite project is missing @ alias." }),
      expect.objectContaining({ code: "LFC_CREATE_VALIDATION_FAILED", message: "Generated Vite project is missing Tailwind CSS import." }),
      expect.objectContaining({ code: "LFC_CREATE_VALIDATION_FAILED", message: "Generated Vite project is missing CSS entry import." }),
    ]);
  });

  it("покрывает validation failures для missing files, Vite ts alias, provider и Tailwind plugin", async () => {
    const context = createContext();
    const runCommand = vi.fn(async (command: ExternalCommand) => {
      if (command.stage === "scaffold") {
        writeViteFixture(context, "/project/demo");
      } else {
        context.fs.unlink("/project/demo/src/store/index.ts");
        context.fs.writeFile("/project/demo/vite.config.ts", `import { defineConfig } from 'vite'

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
})
`);
        context.fs.writeFile("/project/demo/tsconfig.app.json", JSON.stringify({ compilerOptions: {} }));
        context.fs.writeFile("/project/demo/src/main.tsx", `import "./index.css";
render(<App />);
`);
        context.fs.writeFile("/project/demo/src/index.css", '@import "tailwindcss";\n');
      }

      return { exitCode: 0 };
    });
    const result = await runCreateProjectCommand(context, {
      projectName: "demo",
      template: "vite",
    }, { runCommand });

    expect(result.exitCode).toBe(1);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "LFC_CREATE_VALIDATION_FAILED", message: "Generated project is missing src/store/index.ts." }),
      expect.objectContaining({ code: "LFC_CREATE_VALIDATION_FAILED", message: "Generated Vite project is missing @/* TypeScript alias." }),
      expect.objectContaining({ code: "LFC_CREATE_VALIDATION_FAILED", message: "Generated Vite project is missing FSM provider wiring." }),
      expect.objectContaining({ code: "LFC_CREATE_VALIDATION_FAILED", message: "Generated Vite project is missing @tailwindcss/vite plugin." }),
    ]);
  });

  it("покрывает validation fallback для invalid JSON tsconfig", async () => {
    const context = createContext();
    const runCommand = vi.fn(async (command: ExternalCommand) => {
      if (command.stage === "scaffold") {
        writeNextFixture(context, "/project/demo");
      } else {
        context.fs.writeFile("/project/demo/tsconfig.json", "{");
      }

      return { exitCode: 0 };
    });
    const result = await runCreateProjectCommand(context, {
      projectName: "demo",
      template: "next",
    }, { runCommand });

    expect(result).toEqual({
      exitCode: 1,
      diagnostics: [expect.objectContaining({
        code: "LFC_CREATE_VALIDATION_FAILED",
        message: "Generated Next project is missing @/* TypeScript alias.",
      })],
    });
  });

  it("покрывает validation fallback для non-object tsconfig", async () => {
    const context = createContext();
    const runCommand = vi.fn(async (command: ExternalCommand) => {
      if (command.stage === "scaffold") {
        writeNextFixture(context, "/project/demo");
      } else {
        context.fs.writeFile("/project/demo/tsconfig.json", "[]");
      }

      return { exitCode: 0 };
    });
    const result = await runCreateProjectCommand(context, {
      projectName: "demo",
      template: "next",
    }, { runCommand });

    expect(result).toEqual({
      exitCode: 1,
      diagnostics: [expect.objectContaining({
        code: "LFC_CREATE_VALIDATION_FAILED",
        message: "Generated Next project is missing @/* TypeScript alias.",
      })],
    });
  });

  it("покрывает validation read fallbacks для отсутствующих Vite файлов", async () => {
    const context = createContext();
    const runCommand = vi.fn(async (command: ExternalCommand) => {
      if (command.stage === "scaffold") {
        writeViteFixture(context, "/project/demo");
      } else {
        context.fs.unlink("/project/demo/vite.config.ts");
        context.fs.unlink("/project/demo/src/main.tsx");
      }

      return { exitCode: 0 };
    });
    const result = await runCreateProjectCommand(context, {
      projectName: "demo",
      template: "vite",
    }, { runCommand });

    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "LFC_CREATE_VALIDATION_FAILED", message: "Generated project is missing src/main.tsx." }),
      expect.objectContaining({ code: "LFC_CREATE_VALIDATION_FAILED", message: "Generated Vite project is missing @ alias." }),
      expect.objectContaining({ code: "LFC_CREATE_VALIDATION_FAILED", message: "Generated Vite project is missing FSM provider wiring." }),
      expect.objectContaining({ code: "LFC_CREATE_VALIDATION_FAILED", message: "Generated Vite project is missing @tailwindcss/vite plugin." }),
      expect.objectContaining({ code: "LFC_CREATE_VALIDATION_FAILED", message: "Generated Vite project is missing Tailwind CSS import." }),
      expect.objectContaining({ code: "LFC_CREATE_VALIDATION_FAILED", message: "Generated Vite project is missing CSS entry import." }),
    ]);
  });

  it("работает через createProgram boundary и отклоняет --agents-md", async () => {
    const context = createContext();
    const runCommand = createScaffoldRunCommand(context);
    const program = createProgram(context, { createProject: { runCommand } });
    const unsupported = await program.parse(["node", "lite-fsm", "create", "demo", "--template", "next", "--agents-md"]);
    const missingTemplate = await program.parse(["node", "lite-fsm", "create", "demo"]);
    const success = await program.parse(["node", "lite-fsm", "create", "demo", "--template", "vite", "--no-install"]);

    expect(unsupported.diagnostics).toEqual([expect.objectContaining({ code: "LFC_INVALID_OPTIONS" })]);
    expect(missingTemplate.diagnostics).toEqual([expect.objectContaining({ code: "LFC_INVALID_OPTIONS" })]);
    expect(success).toEqual({ exitCode: 0, diagnostics: [] });
    expect(context.stdout.text()).toContain("cd demo");
  });
});
