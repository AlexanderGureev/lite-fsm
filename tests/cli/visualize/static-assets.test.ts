import { describe, expect, it } from "vitest";
import {
  serveStaticAsset,
  verifyVisualizerStaticArtifact,
} from "../../../packages/cli/src/visualize/static-assets";
import { handleVisualizerRequest } from "../../../packages/cli/src/visualize/server";
import { createCliTestContext } from "../helpers/memory-fs";
import { createSession, createVisualizeContext, requestOf, staticRoot } from "./fixtures";

describe("раздача static assets visualize", () => {
  it("проверяет наличие static artifact", () => {
    expect(verifyVisualizerStaticArtifact(createVisualizeContext(), staticRoot)).toEqual({
      ok: true,
      staticRoot,
    });
    expect(verifyVisualizerStaticArtifact(createVisualizeContext(), `${staticRoot}/../visualizer`)).toEqual({
      ok: true,
      staticRoot,
    });
    expect(verifyVisualizerStaticArtifact(createCliTestContext({}), staticRoot)).toEqual({
      ok: false,
      diagnostics: [expect.objectContaining({ code: "LFC_VISUALIZER_STATIC_MISSING" })],
    });
    expect(verifyVisualizerStaticArtifact(createCliTestContext({}))).toEqual({
      ok: false,
      diagnostics: [expect.objectContaining({ code: "LFC_VISUALIZER_STATIC_MISSING" })],
    });
  });

  it.each([
    ["/", "text/html; charset=utf-8"],
    ["/machines", "text/html; charset=utf-8"],
    ["/assets/app.js", "text/javascript; charset=utf-8"],
    ["/assets/app.css", "text/css; charset=utf-8"],
    ["/assets/icon.svg", "image/svg+xml"],
    ["/assets/image.png", "image/png"],
    ["/assets/favicon.ico", "image/x-icon"],
    ["/assets/manifest.json", "application/json; charset=utf-8"],
    ["/assets/app.js.map", "application/json; charset=utf-8"],
  ])("отдает %s с MIME %s", (pathname, contentType) => {
    expect(serveStaticAsset(createVisualizeContext(), { staticRoot, pathname })).toEqual(
      expect.objectContaining({ status: 200, headers: { "content-type": contentType } }),
    );
  });

  it("отдает index.html для root и SPA fallback с ожидаемым body", () => {
    const context = createVisualizeContext();
    const root = serveStaticAsset(context, { staticRoot, pathname: "/" });
    const fallback = serveStaticAsset(context, { staticRoot, pathname: "/machines/active?ignored=true" });

    expect(root).toEqual(expect.objectContaining({ status: 200, body: expect.any(Uint8Array) }));
    expect(fallback).toEqual(expect.objectContaining({ status: 200, body: expect.any(Uint8Array) }));
    if (root.body instanceof Uint8Array) {
      expect(Buffer.from(root.body).toString("utf8")).toBe("<div id=\"root\"></div>");
    }
    if (fallback.body instanceof Uint8Array) {
      expect(Buffer.from(fallback.body).toString("utf8")).toBe("<div id=\"root\"></div>");
    }
  });

  it("запрещает missing assets, traversal, unsupported MIME и non-GET", () => {
    const context = createVisualizeContext({ [`${staticRoot}/assets/file.txt`]: "txt" });

    expect(serveStaticAsset(context, { staticRoot, pathname: "/assets/missing.js" })).toEqual(
      expect.objectContaining({ status: 404 }),
    );
    expect(serveStaticAsset(context, { staticRoot, pathname: "/assets/%2e%2e/index.html" })).toEqual(
      expect.objectContaining({ status: 404 }),
    );
    expect(serveStaticAsset(context, { staticRoot, pathname: "/assets/./app.js" })).toEqual(
      expect.objectContaining({ status: 404 }),
    );
    expect(serveStaticAsset(context, { staticRoot, pathname: "/assets/app%5C.js" })).toEqual(
      expect.objectContaining({ status: 404 }),
    );
    expect(serveStaticAsset(context, { staticRoot, pathname: "/assets/%E0%A4%A" })).toEqual(
      expect.objectContaining({ status: 404 }),
    );
    expect(serveStaticAsset(context, { staticRoot, pathname: "/assets" })).toEqual(
      expect.objectContaining({ status: 404 }),
    );
    expect(serveStaticAsset(context, { staticRoot, pathname: "/assets/file.txt" })).toEqual(
      expect.objectContaining({ status: 404 }),
    );
    expect(serveStaticAsset(context, { staticRoot, pathname: "/assets/app.js", method: "POST" })).toEqual(
      expect.objectContaining({ status: 405, headers: expect.objectContaining({ allow: "GET" }) }),
    );
    expect(
      serveStaticAsset(
        {
          ...context,
          fs: {
            ...context.fs,
            readFileBuffer: undefined,
          },
        },
        { staticRoot, pathname: "/assets/app.js" },
      ),
    ).toEqual(expect.objectContaining({ status: 200, body: Buffer.from("console.log('app');", "utf8") }));
  });

  it("не дает URL normalization спрятать encoded traversal перед static router", async () => {
    await expect(
      handleVisualizerRequest(
        {
          context: createVisualizeContext(),
          port: 3031,
          session: createSession(),
          staticRoot,
          routes: [],
        },
        requestOf("GET", "/assets/%2e%2e/index.html"),
      ),
    ).resolves.toEqual(expect.objectContaining({ status: 404 }));
  });
});
