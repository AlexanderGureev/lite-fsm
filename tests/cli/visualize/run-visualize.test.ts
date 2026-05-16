import { describe, expect, it, vi } from "vitest";
import type { GraphDiagnostic } from "../../../packages/graph/src";
import { createProgram } from "../../../packages/cli/src/cli/create-program";
import { cliDiagnostic } from "../../../packages/cli/src/cli/diagnostics";
import { runVisualizeCommand } from "../../../packages/cli/src/visualize/command";
import { runVisualize, type RunVisualizeDependencies } from "../../../packages/cli/src/visualize/run-visualize";
import type { VisualizerServer } from "../../../packages/cli/src/visualize/server";
import {
  createBuildResult,
  createGraphResult,
  createSession,
  createVisualizeContext,
  projectRoot,
  sourceText,
  staticRoot,
} from "./fixtures";
import { createCliTestContext } from "../helpers/memory-fs";

describe("сценарий запуска visualize", () => {
  const run = (dependencies: Partial<RunVisualizeDependencies> = {}, options = { noOpen: true }) => {
    const context = createVisualizeContext();
    const close = vi.fn(async () => undefined);
    const startServer = vi.fn(async () => ({
      ok: true as const,
      server: {
        url: "http://127.0.0.1:3030/?session=token-123",
        port: 3030,
        close,
      } satisfies VisualizerServer,
    }));
    const waitForShutdown = vi.fn(async () => undefined);
    const open = vi.fn(async () => undefined);

    return {
      context,
      close,
      startServer,
      waitForShutdown,
      open,
      result: runVisualize(
        context,
        { entry: "src/store.ts", port: 3030, noOpen: options.noOpen },
        {
          buildGraph: vi.fn(() => createBuildResult()),
          startServer,
          waitForShutdown,
          openBrowser: open,
          staticRoot,
          ...dependencies,
        },
      ),
    };
  };

  it("не стартует server при blocking diagnostics или missing graph result", async () => {
    const blockingDiagnostic = cliDiagnostic("LFC_TSCONFIG_INVALID", "error", "invalid");
    const blocking = run({
      buildGraph: vi.fn(() => createBuildResult({ diagnostics: [blockingDiagnostic], blocking: true, graphResult: undefined })),
    });
    const missingGraph = run({
      buildGraph: vi.fn(() => createBuildResult({ graphResult: undefined })),
    });

    expect(await blocking.result).toEqual({
      exitCode: 1,
      diagnostics: [blockingDiagnostic],
      graphDiagnostics: [],
    });
    expect(await missingGraph.result).toEqual({
      exitCode: 1,
      diagnostics: [expect.objectContaining({ code: "LFC_GRAPH_PROJECT_FAILED" })],
      graphDiagnostics: [],
    });
    expect(blocking.startServer).not.toHaveBeenCalled();
    expect(missingGraph.startServer).not.toHaveBeenCalled();
  });

  it("не стартует server без static artifact", async () => {
    const context = createCliTestContext({ "/project/src/store.ts": sourceText });
    const result = await runVisualize(
      context,
      { entry: "src/store.ts", port: 3030, noOpen: true },
      {
        buildGraph: vi.fn(() => createBuildResult()),
        staticRoot,
      },
    );

    expect(result).toEqual({
      exitCode: 1,
      diagnostics: [expect.objectContaining({ code: "LFC_VISUALIZER_STATIC_MISSING" })],
      graphDiagnostics: [],
    });
  });

  it("стартует при graph diagnostics, печатает URL, уважает no-open и ждет shutdown", async () => {
    const graphDiagnostic: GraphDiagnostic = { code: "LFG_TEST", severity: "warning", message: "warn" };
    const flow = run({
      buildGraph: vi.fn(() => createBuildResult({ graphResult: createGraphResult([graphDiagnostic]) })),
    });

    expect(await flow.result).toEqual({
      exitCode: 0,
      diagnostics: [],
      graphDiagnostics: [graphDiagnostic],
    });
    expect(flow.startServer).toHaveBeenCalledWith({
      context: flow.context,
      port: 3030,
      session: expect.objectContaining({ token: expect.any(String) }),
      staticRoot,
    });
    expect(flow.open).not.toHaveBeenCalled();
    expect(flow.waitForShutdown).toHaveBeenCalledTimes(1);
    expect(flow.context.stdout.text()).toBe("http://127.0.0.1:3030/?session=token-123\n");
  });

  it("не блокирует non-error CLI diagnostics и кладет их в session export", async () => {
    const warning = cliDiagnostic("LFC_SOURCE_BUNDLE_FILE_UNREADABLE", "warning", "source warning");
    const graphDiagnostic: GraphDiagnostic = { code: "LFG_TEST", severity: "warning", message: "graph warning" };
    const emitDiagnostics = vi.fn();
    const flow = run({
      buildGraph: vi.fn(() => createBuildResult({
        diagnostics: [warning],
        graphResult: createGraphResult([graphDiagnostic]),
      })),
      emitDiagnostics,
    });

    expect(await flow.result).toEqual({
      exitCode: 0,
      diagnostics: [warning],
      graphDiagnostics: [graphDiagnostic],
    });
    expect(emitDiagnostics).toHaveBeenCalledWith([warning], [graphDiagnostic]);
    expect(flow.startServer).toHaveBeenCalledWith(expect.objectContaining({
      session: expect.objectContaining({
        exportDocument: expect.objectContaining({ diagnostics: [warning] }),
      }),
    }));
  });

  it("открывает browser, закрывает server при opener failure и возвращает startup failure", async () => {
    const success = run({}, { noOpen: false });
    expect(await success.result).toEqual({ exitCode: 0, diagnostics: [], graphDiagnostics: [] });
    expect(success.open).toHaveBeenCalledWith("http://127.0.0.1:3030/?session=token-123");

    const failure = run({
      openBrowser: vi.fn(async () => {
        throw new Error("blocked");
      }),
    }, { noOpen: false });

    expect(await failure.result).toEqual({
      exitCode: 1,
      diagnostics: [expect.objectContaining({ code: "LFC_VISUALIZER_OPEN_FAILED" })],
      graphDiagnostics: [],
    });
    expect(failure.close).toHaveBeenCalledTimes(1);
    expect(failure.waitForShutdown).not.toHaveBeenCalled();
    expect(failure.context.stdout.text()).toBe("");

    const nonErrorFailure = run({
      openBrowser: vi.fn(async () => {
        throw "blocked";
      }),
    }, { noOpen: false });
    expect((await nonErrorFailure.result).diagnostics[0]?.message).toContain("blocked");
  });

  it("возвращает server startup diagnostics", async () => {
    const flow = run({
      startServer: vi.fn(async () => ({
        ok: false as const,
        diagnostics: [cliDiagnostic("LFC_VISUALIZER_PORT_UNAVAILABLE", "error", "busy")],
      })),
    });

    expect(await flow.result).toEqual({
      exitCode: 1,
      diagnostics: [expect.objectContaining({ code: "LFC_VISUALIZER_PORT_UNAVAILABLE" })],
      graphDiagnostics: [],
    });
  });

  it("пишет diagnostics через command boundary и регистрирует commander command", async () => {
    const context = createVisualizeContext();
    const program = createProgram(context);
    const missing = await program.parse(["node", "lite-fsm", "visualize"]);
    const help = await program.parse(["node", "lite-fsm", "--help"]);

    expect(missing).toEqual({
      exitCode: 1,
      diagnostics: [expect.objectContaining({ code: "LFC_INVALID_OPTIONS" })],
    });
    expect(context.stderr.text()).toContain("Option --entry is required.");
    expect(help).toEqual({ exitCode: 0, diagnostics: [] });
    expect(context.stdout.text()).toContain("visualize");
  });

  it("передает normalized command options в run flow", async () => {
    const context = createVisualizeContext();
    const buildGraph = vi.fn(() => createBuildResult());
    const startServer = vi.fn(async () => ({
      ok: true as const,
      server: { url: "http://127.0.0.1:3333/?session=token-123", port: 3333, close: vi.fn() },
    }));
    const result = await runVisualize(
      context,
      { entry: "src/store.ts", tsconfig: "tsconfig.json", port: 3333, noOpen: true },
      {
        buildGraph,
        staticRoot,
        startServer,
        waitForShutdown: vi.fn(async () => undefined),
      },
    );

    expect(result.exitCode).toBe(0);
    expect(buildGraph).toHaveBeenCalledWith(context, { entry: "src/store.ts", tsconfig: "tsconfig.json" });
    expect(startServer).toHaveBeenCalledWith(expect.objectContaining({ port: 3333 }));
  });

  it("использует default buildProjectGraph без injected dependency", async () => {
    const context = createVisualizeContext();
    const startServer = vi.fn(async () => ({
      ok: true as const,
      server: { url: "http://127.0.0.1:3030/?session=token-123", port: 3030, close: vi.fn() },
    }));
    const result = await runVisualize(
      context,
      { entry: "src/store.ts", tsconfig: "tsconfig.json", port: 3030, noOpen: true },
      {
        staticRoot,
        startServer,
        waitForShutdown: vi.fn(async () => undefined),
      },
    );

    expect(result.exitCode).toBe(0);
    expect(startServer).toHaveBeenCalledWith(expect.objectContaining({ session: expect.objectContaining({ projectRoot }) }));
  });

  it("использует injected createSession dependency", async () => {
    const createSessionDependency = vi.fn(() => createSession());
    const flow = run({ createSession: createSessionDependency });

    expect((await flow.result).exitCode).toBe(0);
    expect(createSessionDependency).toHaveBeenCalledWith({
      projectRoot,
      graphResult: expect.any(Object),
      diagnostics: [],
      entryPath: "src/store.ts",
      tsconfigPath: "tsconfig.json",
    });
  });

  it("успешно выполняет command boundary с injected dependencies", async () => {
    const context = createVisualizeContext();
    const result = await runVisualizeCommand(
      context,
      { entry: "src/store.ts", port: "3030", open: false },
      {
        staticRoot,
        buildGraph: vi.fn(() => createBuildResult()),
        startServer: vi.fn(async () => ({
          ok: true as const,
          server: { url: "http://127.0.0.1:3030/?session=token-123", port: 3030, close: vi.fn() },
        })),
        waitForShutdown: vi.fn(async () => undefined),
      },
    );

    expect(result).toEqual({ exitCode: 0, diagnostics: [] });
    expect(context.stdout.text()).toBe("http://127.0.0.1:3030/?session=token-123\n");
  });
});
