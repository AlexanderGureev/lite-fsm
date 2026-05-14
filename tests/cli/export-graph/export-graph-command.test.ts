import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { exampleSourcePath, examples } from "../../../apps/playground/lib/examples-manifest";
import { createProgram } from "../../../packages/cli/src/cli/create-program";
import { createCommandResult } from "../../../packages/cli/src/cli/result";
import { runExportGraphCommand } from "../../../packages/cli/src/export-graph/command";
import { PROJECT_GRAPH_EXPORT_VERSION } from "../../../packages/cli/src/export-graph/export-document";
import { normalizeExportGraphOptions } from "../../../packages/cli/src/export-graph/options";
import { createExportGraphRunResult } from "../../../packages/cli/src/export-graph/run-export-graph";
import { createProjectGraphSourceBundle } from "../../../packages/cli/src/export-graph/source-bundle";
import { normalizeAbsolutePath } from "../../../packages/cli/src/project/source-cache";
import { createCliTestContext } from "../helpers/memory-fs";

const workspaceRoot = normalizeAbsolutePath(resolve(fileURLToPath(new URL("../../..", import.meta.url))));
type PlaygroundExampleId = (typeof examples)[number]["id"];

const simpleProjectFiles = {
  "/project/tsconfig.json": JSON.stringify({
    compilerOptions: {
      moduleResolution: "bundler",
    },
  }),
  "/project/store.ts": `
    import { MachineManager, createMachine } from "@lite-fsm/core";
    export const machine = createMachine({
      config: { IDLE: { START: "READY" }, READY: {} },
      initialState: "IDLE",
      initialContext: {},
    });
    export const manager = MachineManager({ machine });
  `,
};

const readFixtureFiles = (root: string): Record<string, string> => {
  const files: Record<string, string> = {};

  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) visit(path);
      else if (path.endsWith(".ts") || path.endsWith(".json")) {
        files[normalizeAbsolutePath(path)] = readFileSync(path, "utf8");
      }
    }
  };

  visit(root);

  return files;
};

const expectedPlaygroundMachineKeys: Record<PlaygroundExampleId, string[]> = {
  "actor-canvas": ["canvasBoard", "canvasNetwork", "canvasStroke"],
  "album-download": ["albumDownload", "trackDownload"],
  lamp: ["lamp"],
  likes: ["likes", "likesPending"],
  "likes-v2": ["likesV2", "likeSync"],
  persist: ["chatThread", "chatComposer", "chatSession"],
  roguelite: [
    "gameSession",
    "playerInput",
    "bootSystem",
    "enemySpawner",
    "movementSystem",
    "projectileMotionSystem",
    "playerAutoFire",
    "combatSystem",
    "playerBody",
    "enemyBody",
    "enemyHealth",
    "enemyHitFeedback",
    "projectileBody",
  ],
  "ssr-demo": ["profileSession", "widgetFeed"],
  "ssr-demo-2": ["grid", "entityList"],
  "ssr-demo-3": ["grid", "entityList"],
};

describe("команда export-graph", () => {
  it("валидирует обязательные options и --out -", async () => {
    const context = createCliTestContext({});
    const missing = await runExportGraphCommand(context, {});
    const stdout = await runExportGraphCommand(context, { entry: "store.ts", out: "-" });

    expect(missing.exitCode).toBe(1);
    expect(missing.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["LFC_INVALID_OPTIONS", "LFC_INVALID_OPTIONS"]);
    expect(stdout.exitCode).toBe(1);
    expect(stdout.diagnostics).toEqual([
      expect.objectContaining({ code: "LFC_INVALID_OPTIONS", severity: "error" }),
    ]);
    expect(context.stderr.text()).toContain("Option --entry is required.");
    expect(context.stderr.text()).toContain("JSON stdout output is not supported.");
  });

  it("пишет deterministic JSON только в output file", async () => {
    const context = createCliTestContext(simpleProjectFiles);
    context.fs.writeFile("/project/dist/graph.json", "old graph");

    const result = await runExportGraphCommand(context, {
      entry: "store.ts",
      out: "dist/graph.json",
      tsconfig: "tsconfig.json",
    });
    const output = context.fs.getFile("/project/dist/graph.json");
    const parsed = JSON.parse(output ?? "");

    expect(result).toEqual({ exitCode: 0, diagnostics: [] });
    expect(context.stdout.text()).toBe("");
    expect(output?.endsWith("\n")).toBe(true);
    expect(parsed.version).toBe(PROJECT_GRAPH_EXPORT_VERSION);
    expect(parsed.entry).toEqual({ path: "store.ts", tsconfigPath: "tsconfig.json" });
    expect(parsed.graph.managers[0].machineRefs.map((ref: { key: string }) => ref.key)).toEqual(["machine"]);
    expect(parsed.sources).toBeUndefined();
    expect(output).not.toBe("old graph");
    expect(output).not.toContain("import { MachineManager");
  });

  it("встраивает исходники только при --include-source", async () => {
    const context = createCliTestContext(simpleProjectFiles);

    const result = await runExportGraphCommand(context, {
      entry: "store.ts",
      out: "dist/graph-with-source.json",
      tsconfig: "tsconfig.json",
      includeSource: true,
    });
    const parsed = JSON.parse(context.fs.getFile("/project/dist/graph-with-source.json") ?? "{}");

    expect(result).toEqual({ exitCode: 0, diagnostics: [] });
    expect(parsed.sources.files).toEqual([
      {
        fileName: "store.ts",
        language: "ts",
        hash: parsed.files[0].hash,
        text: simpleProjectFiles["/project/store.ts"],
      },
    ]);
    expect(parsed.graph.source.files).toEqual([{ fileName: "store.ts", language: "ts", hash: parsed.files[0].hash }]);
  });

  it("записывает fallback info diagnostics в top-level diagnostics без graph diagnostics copy", async () => {
    const context = createCliTestContext({
      "/project/store.ts": simpleProjectFiles["/project/store.ts"],
    });
    const result = await runExportGraphCommand(context, {
      entry: "store.ts",
      out: "graph.json",
    });
    const parsed = JSON.parse(context.fs.getFile("/project/graph.json") ?? "{}");

    expect(result.exitCode).toBe(0);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "LFC_TSCONFIG_NOT_FOUND", severity: "info" }),
    ]);
    expect(parsed.diagnostics).toEqual(result.diagnostics);
    expect(parsed.graph.diagnostics).toEqual([]);
  });

  it("не пишет partial JSON при blocking graph diagnostics", async () => {
    const context = createCliTestContext({
      "/project/tsconfig.json": "{}",
      "/project/store.ts": `export const manager = MachineManager({});`,
    });
    const result = await runExportGraphCommand(context, {
      entry: "store.ts",
      out: "graph.json",
      tsconfig: "tsconfig.json",
    });

    expect(result.exitCode).toBe(1);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "LFC_GRAPH_PROJECT_FAILED", severity: "error" }),
    ]);
    expect(context.fs.getFile("/project/graph.json")).toBeUndefined();
    expect(context.stderr.text()).toContain("LFG_PROJECT_MANAGER_PROVENANCE_UNSUPPORTED");
  });

  it("возвращает LFC_NO_MACHINES_EXPORTED, если graph без blocking diagnostics пустой", async () => {
    const context = createCliTestContext({
      "/project/store.ts": "",
    });
    const result = createExportGraphRunResult(context, {
      entry: "store.ts",
      out: "graph.json",
      includeSource: false,
    }, {
      project: {
        entryPath: "store.ts",
        absoluteEntryPath: "/project/store.ts",
        projectRoot: "/project",
      },
      graphResult: {
        document: {
          version: "lite-fsm.graph/v1",
          source: { filename: "store.ts", language: "ts", kind: "project", entryFileName: "store.ts", files: [] },
          machines: [],
          managers: [],
          diagnostics: [],
        },
        diagnostics: [],
        files: [],
      },
      diagnostics: [],
      blocking: false,
    });

    expect(result.exitCode).toBe(1);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "LFC_NO_MACHINES_EXPORTED", severity: "error" }),
    ]);
    expect(context.fs.getFile("/project/graph.json")).toBeUndefined();
  });

  it("возвращает LFC_GRAPH_PROJECT_FAILED, если build layer не вернул graph result", () => {
    const context = createCliTestContext({});
    const result = createExportGraphRunResult(context, {
      entry: "store.ts",
      out: "graph.json",
      includeSource: false,
    }, {
      project: {
        entryPath: "store.ts",
        absoluteEntryPath: "/project/store.ts",
        projectRoot: "/project",
      },
      diagnostics: [],
      blocking: false,
    });

    expect(result).toEqual({
      exitCode: 1,
      diagnostics: [expect.objectContaining({ code: "LFC_GRAPH_PROJECT_FAILED", severity: "error" })],
      graphDiagnostics: [],
    });
  });

  it("возвращает blocking result из build layer без записи", () => {
    const context = createCliTestContext({});
    const result = createExportGraphRunResult(context, {
      entry: "store.ts",
      out: "graph.json",
      includeSource: false,
    }, {
      project: {
        entryPath: "store.ts",
        absoluteEntryPath: "/project/store.ts",
        projectRoot: "/project",
      },
      diagnostics: [{ code: "LFC_TSCONFIG_INVALID", severity: "error", message: "invalid" }],
      blocking: true,
    });

    expect(result).toEqual({
      exitCode: 1,
      diagnostics: [{ code: "LFC_TSCONFIG_INVALID", severity: "error", message: "invalid" }],
      graphDiagnostics: [],
    });
  });

  it("возвращает LFC_WRITE_FAILED при ошибке записи", async () => {
    const context = createCliTestContext(simpleProjectFiles, "/project", {
      writeError: new Error("disk full"),
    });
    const result = await runExportGraphCommand(context, {
      entry: "store.ts",
      out: "graph.json",
      tsconfig: "tsconfig.json",
    });

    expect(result.exitCode).toBe(1);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "LFC_WRITE_FAILED", severity: "error", file: "/project/graph.json" }),
    ]);
  });

  it("не пишет JSON, если source bundle не может прочитать discovered file", () => {
    const context = createCliTestContext({
      "/project/store.ts": "",
    });
    const result = createExportGraphRunResult(context, {
      entry: "store.ts",
      out: "graph.json",
      includeSource: true,
    }, {
      project: {
        entryPath: "store.ts",
        absoluteEntryPath: "/project/store.ts",
        projectRoot: "/project",
      },
      graphResult: {
        document: {
          version: "lite-fsm.graph/v1",
          source: { filename: "store.ts", language: "ts", kind: "project", entryFileName: "store.ts", files: [] },
          machines: [],
          managers: [{ id: "manager", machineRefs: [{ key: "machine", machineId: "machine" }] }],
          diagnostics: [],
        },
        diagnostics: [],
        files: [{ fileName: "missing.ts", language: "ts", roles: ["machine"], hash: "abc" }],
      },
      diagnostics: [],
      blocking: false,
    });

    expect(result.exitCode).toBe(1);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "LFC_SOURCE_BUNDLE_FILE_UNREADABLE", severity: "error", file: "/project/missing.ts" }),
    ]);
    expect(context.fs.getFile("/project/graph.json")).toBeUndefined();
  });

  it("создает пустой source bundle для пустого списка файлов", () => {
    const context = createCliTestContext({}, "/project");

    expect(createProjectGraphSourceBundle(context, "/project", [])).toEqual({
      ok: true,
      sources: { files: [] },
    });
  });

  it("читает source bundle относительно projectRoot в порядке discovered files", () => {
    const context = createCliTestContext({
      "/project/store/index.ts": "export const root = 1;",
      "/project/store/machines/player.ts": "export const player = 2;",
    });

    const result = createProjectGraphSourceBundle(context, "/project", [
      { fileName: "store/machines/player.ts", language: "ts", roles: ["machine"], hash: "player-hash" },
      { fileName: "store/index.ts", language: "ts", roles: ["entry"], hash: "entry-hash" },
    ]);

    expect(result).toEqual({
      ok: true,
      sources: {
        files: [
          {
            fileName: "store/machines/player.ts",
            language: "ts",
            hash: "player-hash",
            text: "export const player = 2;",
          },
          {
            fileName: "store/index.ts",
            language: "ts",
            hash: "entry-hash",
            text: "export const root = 1;",
          },
        ],
      },
    });
    expect(context.fs.readCounts.get("/project/store/machines/player.ts")).toBe(1);
    expect(context.fs.readCounts.get("/project/store/index.ts")).toBe(1);
  });

  it("останавливает source bundle на первом отсутствующем файле и не читает последующие", () => {
    const context = createCliTestContext({
      "/project/store/after.ts": "export const after = 1;",
    });

    const result = createProjectGraphSourceBundle(context, "/project", [
      { fileName: "store/missing.ts", language: "ts", roles: ["machine"], hash: "missing-hash" },
      { fileName: "store/after.ts", language: "ts", roles: ["machine"], hash: "after-hash" },
    ]);

    expect(result).toEqual({
      ok: false,
      diagnostics: [
        expect.objectContaining({
          code: "LFC_SOURCE_BUNDLE_FILE_UNREADABLE",
          message: "Source file 'store/missing.ts' could not be embedded in the graph export.",
          file: "/project/store/missing.ts",
        }),
      ],
    });
    expect(context.fs.readCounts.get("/project/store/after.ts")).toBeUndefined();
  });

  it("форматирует fileExists failures при source bundle", () => {
    const context = createCliTestContext({}, "/project");
    const result = createProjectGraphSourceBundle(
      {
        ...context,
        fs: {
          ...context.fs,
          fileExists: () => {
            throw new Error("stat failed");
          },
        },
      },
      "/project",
      [{ fileName: "store.ts", language: "ts", roles: ["entry"], hash: "abc" }],
    );

    expect(result).toEqual({
      ok: false,
      diagnostics: [
        expect.objectContaining({
          code: "LFC_SOURCE_BUNDLE_FILE_UNREADABLE",
          message: "Source file 'store.ts' could not be embedded in the graph export: stat failed",
          file: "/project/store.ts",
        }),
      ],
    });
  });

  it("форматирует non-Error fileExists failures при source bundle", () => {
    const context = createCliTestContext({}, "/project");
    const result = createProjectGraphSourceBundle(
      {
        ...context,
        fs: {
          ...context.fs,
          fileExists: () => {
            throw "stat failed";
          },
        },
      },
      "/project",
      [{ fileName: "store.ts", language: "ts", roles: ["entry"], hash: "abc" }],
    );

    expect(result).toEqual({
      ok: false,
      diagnostics: [
        expect.objectContaining({
          code: "LFC_SOURCE_BUNDLE_FILE_UNREADABLE",
          message: "Source file 'store.ts' could not be embedded in the graph export: stat failed",
          file: "/project/store.ts",
        }),
      ],
    });
  });

  it("форматирует readFile failures при source bundle", () => {
    const context = createCliTestContext({}, "/project");
    const result = createProjectGraphSourceBundle(
      {
        ...context,
        fs: {
          ...context.fs,
          fileExists: () => true,
          readFile: () => {
            throw new Error("permission denied");
          },
        },
      },
      "/project",
      [{ fileName: "store.ts", language: "ts", roles: ["entry"], hash: "abc" }],
    );

    expect(result).toEqual({
      ok: false,
      diagnostics: [
        expect.objectContaining({
          code: "LFC_SOURCE_BUNDLE_FILE_UNREADABLE",
          message: "Source file 'store.ts' could not be embedded in the graph export: permission denied",
        }),
      ],
    });
  });

  it("форматирует non-Error readFile failures при source bundle", () => {
    const context = createCliTestContext({}, "/project");
    const result = createProjectGraphSourceBundle(
      {
        ...context,
        fs: {
          ...context.fs,
          fileExists: () => true,
          readFile: () => {
            throw "readonly";
          },
        },
      },
      "/project",
      [{ fileName: "store.ts", language: "ts", roles: ["entry"], hash: "abc" }],
    );

    expect(result).toEqual({
      ok: false,
      diagnostics: [
        expect.objectContaining({
          code: "LFC_SOURCE_BUNDLE_FILE_UNREADABLE",
          message: "Source file 'store.ts' could not be embedded in the graph export: readonly",
        }),
      ],
    });
  });

  it("форматирует non-Error write failures", async () => {
    const context = createCliTestContext(simpleProjectFiles, "/project", {
      writeError: "readonly",
    });
    const result = await runExportGraphCommand(context, {
      entry: "store.ts",
      out: "graph.json",
      tsconfig: "tsconfig.json",
    });

    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "LFC_WRITE_FAILED", message: "Failed to write graph export: readonly" }),
    ]);
  });

  it("мапит commander parse failures в LFC_INVALID_OPTIONS и показывает help без ошибки", async () => {
    const context = createCliTestContext(simpleProjectFiles);
    const program = createProgram(context);
    const unknown = await program.parse(["node", "lite-fsm", "export-graph", "--unknown"]);
    const unknownCommand = await program.parse(["node", "lite-fsm", "missing-command"]);
    const missingEntryValue = await program.parse(["node", "lite-fsm", "export-graph", "--entry"]);
    const missingTsconfigValue = await program.parse([
      "node",
      "lite-fsm",
      "export-graph",
      "--entry",
      "store.ts",
      "--out",
      "graph.json",
      "--tsconfig",
    ]);
    const help = await program.parse(["node", "lite-fsm", "--help"]);
    const success = await program.parse([
      "node",
      "lite-fsm",
      "export-graph",
      "--entry",
      "store.ts",
      "--out",
      "program-graph.json",
      "--tsconfig",
      "tsconfig.json",
      "--include-source",
    ]);

    expect(unknown.exitCode).toBe(1);
    expect(unknown.diagnostics).toEqual([
      expect.objectContaining({ code: "LFC_INVALID_OPTIONS", severity: "error" }),
    ]);
    expect(unknownCommand.diagnostics).toEqual([
      expect.objectContaining({ code: "LFC_INVALID_OPTIONS", severity: "error" }),
    ]);
    expect(missingEntryValue.diagnostics).toEqual([
      expect.objectContaining({ code: "LFC_INVALID_OPTIONS", severity: "error" }),
    ]);
    expect(missingTsconfigValue.diagnostics).toEqual([
      expect.objectContaining({ code: "LFC_INVALID_OPTIONS", severity: "error" }),
    ]);
    expect(help).toEqual({ exitCode: 0, diagnostics: [] });
    expect(success).toEqual({ exitCode: 0, diagnostics: [] });
    expect(JSON.parse(context.fs.getFile("/project/program-graph.json") ?? "{}").sources.files[0].text).toBe(
      simpleProjectFiles["/project/store.ts"],
    );
    expect(context.stdout.text()).toContain("Usage: lite-fsm");
  });

  it("создает CommandResult без blocking diagnostics", () => {
    expect(createCommandResult([])).toEqual({ exitCode: 0, diagnostics: [] });
  });

  it("нормализует successful options без optional tsconfig", () => {
    expect(normalizeExportGraphOptions({ entry: "store.ts", out: "graph.json" })).toEqual({
      ok: true,
      options: { entry: "store.ts", out: "graph.json", includeSource: false },
    });
    expect(normalizeExportGraphOptions({ entry: "store.ts", out: "graph.json", includeSource: false })).toEqual({
      ok: true,
      options: { entry: "store.ts", out: "graph.json", includeSource: false },
    });
    expect(normalizeExportGraphOptions({ entry: "store.ts", out: "graph.json", includeSource: "true" })).toEqual({
      ok: true,
      options: { entry: "store.ts", out: "graph.json", includeSource: false },
    });
    expect(normalizeExportGraphOptions({ entry: "store.ts", out: "graph.json", includeSource: true })).toEqual({
      ok: true,
      options: { entry: "store.ts", out: "graph.json", includeSource: true },
    });
  });

  it.each(examples)("пишет JSON для playground manifest entry $id без blocking diagnostics", async (example) => {
    const playgroundRoot = `${workspaceRoot}/apps/playground`;
    const context = createCliTestContext(readFixtureFiles(playgroundRoot), workspaceRoot);
    const entry = `${exampleSourcePath(example.id)}/store/index.ts`;
    const out = `.tmp/playground-${example.id}.graph.json`;
    const result = await runExportGraphCommand(context, {
      entry,
      tsconfig: "apps/playground/tsconfig.json",
      out,
    });
    const parsed = JSON.parse(context.fs.getFile(`${workspaceRoot}/${out}`) ?? "{}");

    expect(result.exitCode).toBe(0);
    expect(result.diagnostics).toEqual([]);
    expect(parsed.version).toBe(PROJECT_GRAPH_EXPORT_VERSION);
    expect(parsed.graph.diagnostics.filter((diagnostic: { severity: string }) => diagnostic.severity === "error")).toEqual([]);
    expect(parsed.graph.managers[0].machineRefs.map((ref: { key: string }) => ref.key)).toEqual(
      expectedPlaygroundMachineKeys[example.id],
    );
  }, 30_000);

  it("сравнивает generated real-store-shape JSON с canonical fixture", async () => {
    const canonicalPath = `${workspaceRoot}/tests/fixtures/project-graph-export/v1/real-store-shape.json`;
    const context = createCliTestContext({}, workspaceRoot);

    for (const [path, contents] of Object.entries({
      [canonicalPath]: readFileSync(canonicalPath, "utf8"),
    })) {
      context.fs.writeFile(path, contents);
    }

    const fixtureRoot = `${workspaceRoot}/packages/graph/test-fixtures/real-store-shape`;
    for (const [path, contents] of Object.entries(readFixtureFiles(fixtureRoot))) context.fs.writeFile(path, contents);

    const result = await runExportGraphCommand(context, {
      entry: "packages/graph/test-fixtures/real-store-shape/store/index.ts",
      tsconfig: "packages/graph/test-fixtures/real-store-shape/tsconfig.json",
      out: ".tmp/real-store-shape.json",
    });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(context.fs.getFile(`${workspaceRoot}/.tmp/real-store-shape.json`) ?? "{}")).toEqual(
      JSON.parse(context.fs.getFile(canonicalPath) ?? "{}"),
    );
  });
});
