import { describe, expect, it } from "vitest";
import { createProjectGraphExportDocument } from "../../../packages/cli/src/export-graph/export-document";
import { buildProjectGraph } from "../../../packages/cli/src/project/build-project-graph";
import {
  createGraphCompatibleSourceHash,
  createSessionToken,
  createVisualizerSession,
  isValidProjectFileName,
} from "../../../packages/cli/src/visualize/session";
import {
  createGraphResult,
  createSession,
  createVisualizeContext,
  sourceHash,
  sourceText,
} from "./fixtures";
import { createCliTestContext } from "../helpers/memory-fs";

describe("сессия visualize", () => {
  it("создает session response и проверяет token без раскрытия source text", () => {
    const session = createSession();
    const response = session.createSessionResponse();

    expect(session.authenticate("token-123")).toBe(true);
    expect(session.authenticate("wrong")).toBe(false);
    expect(session.authenticate(null)).toBe(false);
    expect(response).toEqual({
      ok: true,
      sessionId: "session-1",
      capabilities: {
        mode: "local",
        canReadFiles: true,
        canWriteFiles: false,
        canApplyPatch: false,
        projectRoot: "/project",
      },
      entry: { path: "src/store.ts", tsconfigPath: "tsconfig.json" },
      projectRoot: "/project",
      exportDocument: expect.any(Object),
    });
    expect("sources" in response.exportDocument).toBe(false);
  });

  it("генерирует sessionId и token безопасной формы по умолчанию", () => {
    const graphResult = createGraphResult();
    const session = createVisualizerSession({
      projectRoot: "/project/.",
      graphResult,
      exportDocument: createProjectGraphExportDocument({
        entryPath: "src/store.ts",
        tsconfigPath: "tsconfig.json",
        graphResult,
        diagnostics: [],
      }),
    });

    expect(session.sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(session.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(createSessionToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(session.projectRoot).toBe("/project");
    expect(session.authenticate(session.token)).toBe(true);
  });

  it("читает только allowlisted project-relative source и проверяет stable hash", () => {
    const context = createVisualizeContext();
    const session = createSession();

    expect(session.readSource(context, "src/store.ts")).toEqual({
      ok: true,
      response: {
        ok: true,
        fileName: "src/store.ts",
        language: "ts",
        hash: sourceHash,
        text: sourceText,
      },
    });
    expect(context.fs.readCounts.get("/project/src/store.ts")).toBe(1);
  });

  it("отклоняет traversal, absolute paths, unknown files, stale source и read failures", () => {
    const session = createSession();
    const validAndInvalidNames = [
      ["src/store.ts", true],
      [".config/store.ts", true],
      ["src//store.ts", false],
      ["src/../store.ts", false],
      ["src/./store.ts", false],
      [".", false],
      ["/project/src/store.ts", false],
      ["C:/project/src/store.ts", false],
      ["C:project/src/store.ts", false],
      ["src\\store.ts", false],
      ["", false],
    ] as const;

    for (const [fileName, expected] of validAndInvalidNames) {
      expect(isValidProjectFileName(fileName)).toBe(expected);
    }

    expect(session.readSource(createVisualizeContext(), "../store.ts")).toEqual(
      expect.objectContaining({ ok: false, status: 400, code: "invalid-file-name" }),
    );
    expect(session.readSource(createVisualizeContext(), null)).toEqual(
      expect.objectContaining({ ok: false, status: 400, code: "invalid-file-name" }),
    );
    expect(session.readSource(createVisualizeContext(), "src/unknown.ts")).toEqual(
      expect.objectContaining({ ok: false, status: 404, code: "source-not-found" }),
    );
    expect(session.readSource(createVisualizeContext({ "/project/src/store.ts": "changed" }), "src/store.ts")).toEqual(
      expect.objectContaining({ ok: false, status: 409, code: "source-stale" }),
    );
    expect(session.readSource(createCliTestContext({}), "src/store.ts")).toEqual(
      expect.objectContaining({ ok: false, status: 404, code: "source-not-found" }),
    );
    expect(
      session.readSource(
        {
          ...createVisualizeContext(),
          fs: {
            ...createVisualizeContext().fs,
            fileExists: () => true,
            readFile: () => {
              throw new Error("permission denied");
            },
          },
        },
        "src/store.ts",
      ),
    ).toEqual(expect.objectContaining({ ok: false, status: 500, code: "source-read-failed" }));
    expect(
      session.readSource(
        {
          ...createVisualizeContext(),
          fs: {
            ...createVisualizeContext().fs,
            fileExists: () => true,
            readFile: () => {
              throw "readonly";
            },
          },
        },
        "src/store.ts",
      ),
    ).toEqual(expect.objectContaining({ ok: false, status: 500, message: expect.stringContaining("readonly") }));
  });

  it("совместим с hash из buildProjectGraph", () => {
    const context = createVisualizeContext();
    const buildResult = buildProjectGraph(context, { entry: "src/store.ts", tsconfig: "tsconfig.json" });
    const graphFile = buildResult.graphResult?.files[0];

    expect(graphFile?.hash).toBe(createGraphCompatibleSourceHash(sourceText));
    expect(createSession(buildResult.graphResult).readSource(context, graphFile?.fileName ?? "")).toEqual({
      ok: true,
      response: expect.objectContaining({ hash: graphFile?.hash }),
    });
  });
});
