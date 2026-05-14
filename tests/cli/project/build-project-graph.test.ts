import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildProjectGraph } from "../../../packages/cli/src/project/build-project-graph";
import { normalizeAbsolutePath } from "../../../packages/cli/src/project/source-cache";
import { createCliTestContext } from "../helpers/memory-fs";

const workspaceRoot = normalizeAbsolutePath(resolve(fileURLToPath(new URL("../../..", import.meta.url))));

const machineKeys = (result: NonNullable<ReturnType<typeof buildProjectGraph>["graphResult"]>): string[] => {
  return result.document.managers[0]?.machineRefs.map((ref) => ref.key) ?? [];
};

const readFixtureFiles = (root: string): Record<string, string> => {
  const files: Record<string, string> = {};

  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) {
        visit(path);
      } else if (path.endsWith(".ts") || path.endsWith(".json")) {
        files[normalizeAbsolutePath(path)] = readFileSync(path, "utf8");
      }
    }
  };

  visit(root);

  return files;
};

describe("buildProjectGraph для project graph", () => {
  it("собирает graph result без output path и использует selected tsconfig alias", () => {
    const context = createCliTestContext({
      "/project/tsconfig.json": JSON.stringify({
        compilerOptions: {
          moduleResolution: "bundler",
          paths: {
            "@/*": ["./*"],
          },
        },
      }),
      "/project/store/index.ts": `
        import { MachineManager } from "lite-fsm";
        import { machine } from "@/store/machine";
        export const manager = MachineManager({ machine });
      `,
      "/project/store/machine.ts": `
        import { createMachine } from "@lite-fsm/core";
        export const machine = createMachine({
          config: { IDLE: { START: "READY" }, READY: {} },
          initialState: "IDLE",
          initialContext: {},
        });
      `,
    });

    const result = buildProjectGraph(context, {
      entry: "store/index.ts",
      tsconfig: "tsconfig.json",
    });

    expect(result.blocking).toBe(false);
    expect(result.project).toEqual({
      entryPath: "store/index.ts",
      absoluteEntryPath: "/project/store/index.ts",
      projectRoot: "/project",
      tsconfigPath: "tsconfig.json",
    });
    expect(result.graphResult).toBeDefined();
    expect(machineKeys(result.graphResult!)).toEqual(["machine"]);
  });

  it("возвращает blocking result для explicit missing tsconfig", () => {
    const context = createCliTestContext({
      "/project/store/index.ts": "",
    });
    const result = buildProjectGraph(context, {
      entry: "store/index.ts",
      tsconfig: "missing.json",
    });

    expect(result.blocking).toBe(true);
    expect(result.graphResult).toBeUndefined();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "LFC_TSCONFIG_NOT_FOUND", severity: "error" }),
    ]);

    const cwdEntry = buildProjectGraph(context, {
      entry: ".",
      tsconfig: "missing.json",
    });
    expect(cwdEntry.project.entryPath).toBe(".");

    const outsideEntry = buildProjectGraph(context, {
      entry: "../external/store.ts",
      tsconfig: "missing.json",
    });
    expect(outsideEntry.project.entryPath).toBe("/external/store.ts");
  });

  it("сохраняет info diagnostic при fallback без nearest tsconfig", () => {
    const context = createCliTestContext({
      "/project/store.ts": `
        import { MachineManager, createMachine } from "@lite-fsm/core";
        const machine = createMachine({ config: { IDLE: {} }, initialState: "IDLE", initialContext: {} });
        export const manager = MachineManager({ machine });
      `,
    });
    const result = buildProjectGraph(context, { entry: "store.ts" });

    expect(result.blocking).toBe(false);
    expect(result.project.projectRoot).toBe("/project");
    expect(result.project.tsconfigPath).toBeUndefined();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "LFC_TSCONFIG_NOT_FOUND", severity: "info" }),
    ]);
    expect(machineKeys(result.graphResult!)).toEqual(["machine"]);
  });

  it("собирает canonical real-store-shape fixture через memory fs", () => {
    const fixtureRoot = `${workspaceRoot}/packages/graph/test-fixtures/real-store-shape`;
    const context = createCliTestContext(readFixtureFiles(fixtureRoot), workspaceRoot);
    const result = buildProjectGraph(context, {
      entry: "packages/graph/test-fixtures/real-store-shape/store/index.ts",
      tsconfig: "packages/graph/test-fixtures/real-store-shape/tsconfig.json",
    });

    expect(result.blocking).toBe(false);
    expect(result.graphResult).toBeDefined();
    expect(machineKeys(result.graphResult!)).toEqual(["root", "router", "theme", "appAnalytics", "eventNavigation"]);
    expect(result.graphResult!.diagnostics.map((diagnostic) => diagnostic.code)).toContain("LFG_PROJECT_MANAGER_SPREAD_UNRESOLVED");
    expect(result.graphResult!.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
  });
});

describe("buildProjectGraph для playground smoke", () => {
  const cases: Array<{ entry: string; keys: string[] }> = [
    {
      entry: "apps/playground/app/examples/actor-canvas/store/index.ts",
      keys: ["canvasBoard", "canvasNetwork", "canvasStroke"],
    },
    {
      entry: "apps/playground/app/examples/album-download/store/index.ts",
      keys: ["albumDownload", "trackDownload"],
    },
    { entry: "apps/playground/app/examples/lamp/store/index.ts", keys: ["lamp"] },
    { entry: "apps/playground/app/examples/likes-v2/store/index.ts", keys: ["likesV2", "likeSync"] },
    { entry: "apps/playground/app/examples/likes/store/index.ts", keys: ["likes", "likesPending"] },
    {
      entry: "apps/playground/app/examples/persist/store/index.ts",
      keys: ["chatThread", "chatComposer", "chatSession"],
    },
    {
      entry: "apps/playground/app/examples/roguelite/store/index.ts",
      keys: [
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
    },
    { entry: "apps/playground/app/examples/ssr-demo-2/store/index.ts", keys: ["grid", "entityList"] },
    { entry: "apps/playground/app/examples/ssr-demo-3/store/index.ts", keys: ["grid", "entityList"] },
    {
      entry: "apps/playground/app/examples/ssr-demo/store/index.ts",
      keys: ["profileSession", "widgetFeed"],
    },
    {
      entry: "apps/playground/app/examples/test-example/store/index.ts",
      keys: ["onboarding", "profile"],
    },
  ];

  it.each(cases)("собирает $entry без blocking diagnostics", ({ entry, keys }) => {
    const playgroundRoot = `${workspaceRoot}/apps/playground`;
    const context = createCliTestContext(readFixtureFiles(playgroundRoot), workspaceRoot);
    const result = buildProjectGraph(context, {
      entry,
      tsconfig: "apps/playground/tsconfig.json",
    });

    expect(result.blocking).toBe(false);
    expect(result.graphResult).toBeDefined();
    expect(machineKeys(result.graphResult!)).toEqual(keys);
    expect(result.graphResult!.diagnostics.filter((diagnostic) => diagnostic.severity === "error")).toEqual([]);
  }, 30_000);
});
