import { describe, expect, it, vi } from "vitest";
import {
  createRequestPathname,
  dispatchApiRoute,
  jsonResponse,
  writeHttpResponse,
} from "../../../packages/cli/src/visualize/http";
import { createVisualizerRoutes } from "../../../packages/cli/src/visualize/routes";
import {
  createSession,
  createVisualizeContext,
  requestOf,
  responseWriterOf,
  sourceText,
  staticRoot,
} from "./fixtures";
import { handleVisualizerRequest } from "../../../packages/cli/src/visualize/server";

describe("маршрутизация http visualize", () => {
  it("формирует JSON responses и API routes с auth, method mismatch и errors", async () => {
    const context = createVisualizeContext();
    const session = createSession();
    const routes = createVisualizerRoutes();
    const request = (method: string, url: string) =>
      dispatchApiRoute(routes, {
        request: requestOf(method, url),
        url: new URL(url, "http://127.0.0.1"),
        cliContext: context,
        session,
      });

    expect(jsonResponse(200, { ok: true }).headers?.["content-type"]).toBe("application/json; charset=utf-8");
    expect(await request("GET", "/api/session?token=token-123")).toEqual({
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: expect.stringContaining("\"sessionId\":\"session-1\""),
    });
    expect(await request("GET", "/api/source?token=token-123&fileName=src%2Fstore.ts")).toEqual({
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: expect.stringContaining(sourceText),
    });
    expect(await request("GET", "/api/source?token=token-123")).toEqual(
      expect.objectContaining({ status: 400, body: expect.stringContaining("invalid-file-name") }),
    );
    expect(await request("GET", "/api/session")).toEqual(
      expect.objectContaining({ status: 401, body: expect.stringContaining("invalid-token") }),
    );
    expect(await request("GET", "/api/source?token=wrong&fileName=src%2Fstore.ts")).toEqual(
      expect.objectContaining({ status: 401, body: expect.stringContaining("invalid-token") }),
    );
    expect(await request("GET", "/api/missing?token=token-123")).toEqual(
      expect.objectContaining({ status: 404, body: expect.stringContaining("route-not-found") }),
    );
    expect(await request("POST", "/api/session?token=token-123")).toEqual(
      expect.objectContaining({ status: 405, headers: expect.objectContaining({ allow: "GET" }) }),
    );
    expect(await request("GET", "/api/source?token=token-123&fileName=..%2Fstore.ts")).toEqual(
      expect.objectContaining({ status: 400, body: expect.stringContaining("invalid-file-name") }),
    );
    expect(await request("GET", "/api/source?token=token-123&fileName=%2e%2e%2Fstore.ts")).toEqual(
      expect.objectContaining({ status: 400, body: expect.stringContaining("invalid-file-name") }),
    );
    expect(context.fs.readCounts.get("/project/src/store.ts")).toBe(1);
  });

  it("поддерживает public route без token и async handler", async () => {
    await expect(
      dispatchApiRoute(
        [
          {
            method: "GET",
            path: "/api/ping",
            auth: "none",
            async handle() {
              return jsonResponse(200, { ok: true, pong: true });
            },
          },
        ],
        {
          request: requestOf("GET", "/api/ping"),
          url: new URL("/api/ping", "http://127.0.0.1"),
          cliContext: createVisualizeContext(),
          session: createSession(),
        },
      ),
    ).resolves.toEqual(expect.objectContaining({ status: 200, body: expect.stringContaining("\"pong\":true") }));
  });

  it("пишет HTTP response body с content-length", async () => {
    const written: unknown[] = [];
    const response = {
      writeHead: vi.fn((status: number, headers: Record<string, string>) => written.push(status, headers)),
      end: vi.fn((body?: Uint8Array) => written.push(body?.toString())),
    };

    writeHttpResponse(response, jsonResponse(200, { ok: true }));
    writeHttpResponse(response, { status: 200, body: Buffer.from("bytes") });
    writeHttpResponse(response, { status: 204 });

    expect(response.writeHead).toHaveBeenCalledWith(200, {
      "content-type": "application/json; charset=utf-8",
      "content-length": "12",
    });
    expect(response.end).toHaveBeenNthCalledWith(1, Buffer.from("{\"ok\":true}\n"));
    expect(response.end).toHaveBeenNthCalledWith(2, Buffer.from("bytes"));
    expect(response.writeHead).toHaveBeenCalledWith(204, {});
    expect(response.end).toHaveBeenNthCalledWith(3);
  });

  it("создает URL fallback без request.url и method UNKNOWN для mismatch", async () => {
    expect(createRequestPathname(requestOf("GET", "/assets/%2e%2e/index.html?x=1#hash"))).toBe(
      "/assets/%2e%2e/index.html",
    );
    expect(createRequestPathname(requestOf("GET", "http://127.0.0.1/assets/app.js?x=1"))).toBe("/assets/app.js");
    expect(
      await dispatchApiRoute(createVisualizerRoutes(), {
        request: requestOf(),
        url: new URL("/api/session?token=token-123", "http://127.0.0.1"),
        cliContext: createVisualizeContext(),
        session: createSession(),
      }),
    ).toEqual(expect.objectContaining({ status: 405, body: expect.stringContaining("UNKNOWN") }));
    expect(
      await handleVisualizerRequest(
        {
          context: createVisualizeContext(),
          port: 3031,
          session: createSession(),
          staticRoot,
          routes: createVisualizerRoutes(),
        },
        requestOf("GET"),
      ),
    ).toEqual(expect.objectContaining({ status: 200 }));
  });

  it("мапит unexpected request failure в 500", async () => {
    const routes = [
      {
        method: "GET" as const,
        path: "/api/session",
        auth: "none" as const,
        handle() {
          throw new Error("boom");
        },
      },
    ];
    const response = responseWriterOf();

    try {
      const output = await handleVisualizerRequest(
        {
          context: createVisualizeContext(),
          port: 3031,
          session: createSession(),
          staticRoot,
          routes,
        },
        requestOf("GET", "/api/session"),
      );
      writeHttpResponse(response, output);
    } catch {
      writeHttpResponse(response, jsonResponse(500, { ok: false }));
    }

    expect(response.writeHead).toHaveBeenCalledWith(500, expect.objectContaining({ "content-length": expect.any(String) }));
  });
});
