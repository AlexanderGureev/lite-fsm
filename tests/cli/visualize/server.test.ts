import { describe, expect, it, vi } from "vitest";
import { createVisualizerRoutes } from "../../../packages/cli/src/visualize/routes";
import {
  handleVisualizerRequest,
  startVisualizerServer,
  waitForSignalShutdown,
} from "../../../packages/cli/src/visualize/server";
import {
  createFakeHttpServer,
  createSession,
  createVisualizeContext,
  requestOf,
  responseWriterOf,
  sourceText,
  staticRoot,
} from "./fixtures";

describe("сервер visualize", () => {
  it("стартует local HTTP server, отдает API/static и закрывается", async () => {
    const fake = createFakeHttpServer();
    const context = createVisualizeContext();
    const session = createSession();
    const started = await startVisualizerServer(
      { context, port: 3031, session, staticRoot },
      { createHttpServer: fake.createHttpServer },
    );

    expect(started.ok).toBe(true);
    if (!started.ok) return;

    expect(started.server.url).toBe("http://127.0.0.1:3031/?session=token-123");
    expect(fake.fakeServer.listen).toHaveBeenCalledWith(3031, "127.0.0.1");
    expect(
      await handleVisualizerRequest(
        { context, port: 3031, session, staticRoot, routes: createVisualizerRoutes() },
        requestOf("GET", "/api/session?token=token-123"),
      ),
    ).toEqual(expect.objectContaining({ status: 200, body: expect.stringContaining("session-1") }));
    expect(
      await handleVisualizerRequest(
        { context, port: 3031, session, staticRoot, routes: createVisualizerRoutes() },
        requestOf("GET", "/?session=token-123"),
      ),
    ).toEqual(expect.objectContaining({ status: 200, body: expect.any(Uint8Array) }));

    const response = responseWriterOf();
    fake.requestHandler()?.(requestOf("GET", "/api/source?token=token-123&fileName=src/store.ts"), response);
    await new Promise((resolveFlush) => setImmediate(resolveFlush));

    await started.server.close();

    expect(response.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({ "content-length": expect.any(String) }));
    expect(response.end.mock.calls[0]?.[0]?.toString()).toContain(sourceText);
    expect(fake.fakeServer.close).toHaveBeenCalledTimes(1);
  });

  it("возвращает diagnostic, если port занят, server failed, и close пробрасывает ошибку", async () => {
    const busyFake = createFakeHttpServer("busy");
    const failedFake = createFakeHttpServer("failed");
    const context = createVisualizeContext();
    const session = createSession();
    const busy = await startVisualizerServer(
      { context, port: 3031, session, staticRoot },
      { createHttpServer: busyFake.createHttpServer },
    );
    const serverFailure = await startVisualizerServer(
      { context, port: 3031, session, staticRoot },
      { createHttpServer: failedFake.createHttpServer },
    );
    const closeFailureFake = createFakeHttpServer();
    const closeFailure = await startVisualizerServer(
      { context, port: 3032, session, staticRoot },
      { createHttpServer: closeFailureFake.createHttpServer },
    );

    closeFailureFake.fakeServer.close.mockImplementationOnce((callback: (error?: Error) => void) => callback(new Error("close failed")));

    expect(busy).toEqual({
      ok: false,
      diagnostics: [expect.objectContaining({ code: "LFC_VISUALIZER_PORT_UNAVAILABLE" })],
    });
    expect(serverFailure).toEqual({
      ok: false,
      diagnostics: [expect.objectContaining({ code: "LFC_VISUALIZER_SERVER_FAILED" })],
    });
    expect(closeFailure.ok).toBe(true);
    if (closeFailure.ok) await expect(closeFailure.server.close()).rejects.toThrow("close failed");
  });

  it("закрывается по signal", async () => {
    const close = vi.fn(async () => undefined);
    const shutdown = waitForSignalShutdown({ url: "http://127.0.0.1", port: 1, close });

    process.emit("SIGTERM", "SIGTERM");
    await shutdown;

    expect(close).toHaveBeenCalledTimes(1);

    const closeBySigint = vi.fn(async () => undefined);
    const sigintShutdown = waitForSignalShutdown({ url: "http://127.0.0.1", port: 1, close: closeBySigint });

    process.emit("SIGINT", "SIGINT");
    await sigintShutdown;

    expect(closeBySigint).toHaveBeenCalledTimes(1);
  });

  it("мапит unexpected request failure в 500 на server boundary", async () => {
    const fake = createFakeHttpServer();
    const started = await startVisualizerServer(
      { context: createVisualizeContext(), port: 3031, session: createSession(), staticRoot },
      {
        routes: [
          {
            method: "GET",
            path: "/api/session",
            auth: "none",
            handle() {
              throw new Error("boom");
            },
          },
        ],
        createHttpServer: fake.createHttpServer,
      },
    );
    const response = responseWriterOf();

    expect(started.ok).toBe(true);
    fake.requestHandler()?.(requestOf("GET", "/api/session"), response);
    await new Promise((resolveFlush) => setImmediate(resolveFlush));

    expect(response.writeHead).toHaveBeenCalledWith(500, expect.objectContaining({ "content-length": expect.any(String) }));
  });

  it("мапит static read failure в 500 на server boundary", async () => {
    const fake = createFakeHttpServer();
    const context = createVisualizeContext();
    const started = await startVisualizerServer(
      {
        context: {
          ...context,
          fs: {
            ...context.fs,
            fileExists: () => true,
            readFileBuffer() {
              throw new Error("asset read failed");
            },
          },
        },
        port: 3031,
        session: createSession(),
        staticRoot,
      },
      { createHttpServer: fake.createHttpServer },
    );
    const response = responseWriterOf();

    expect(started.ok).toBe(true);
    fake.requestHandler()?.(requestOf("GET", "/assets/app.js"), response);
    await new Promise((resolveFlush) => setImmediate(resolveFlush));

    expect(response.writeHead).toHaveBeenCalledWith(500, expect.objectContaining({ "content-length": expect.any(String) }));
    expect(response.end.mock.calls[0]?.[0]?.toString()).toContain("server-failure");
  });
});
