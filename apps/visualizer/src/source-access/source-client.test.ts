import { afterEach, describe, expect, it, vi } from "vitest";
import { createLocalSessionSourceClient } from "./source-client";

const request = {
  sessionId: "session-1",
  token: "token-1",
  fileName: "store/index.ts",
  hash: "abc",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HTTP client исходников local session", () => {
  it("возвращает source text для успешного API response", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      fileName: "store/index.ts",
      language: "ts",
      hash: "abc",
      text: "const a = 1;",
    })));
    const client = createLocalSessionSourceClient({ fetch, origin: "http://127.0.0.1:3030" });

    await expect(client.fetch(request)).resolves.toEqual({
      ok: true,
      sessionId: "session-1",
      fileName: "store/index.ts",
      hash: "abc",
      text: "const a = 1;",
    });
    expect(fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:3030/api/source?token=token-1&fileName=store%2Findex.ts",
      { credentials: "same-origin" },
    );
  });

  it("возвращает API error response как failed result", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ ok: false, code: "source-stale", message: "Changed" }), { status: 409 }));
    const client = createLocalSessionSourceClient({ fetch, origin: "http://127.0.0.1:3030" });

    await expect(client.fetch(request)).resolves.toEqual({
      ok: false,
      sessionId: "session-1",
      fileName: "store/index.ts",
      hash: "abc",
      code: "source-stale",
      message: "Changed",
    });
  });

  it("защищается от invalid response, source mismatch и network failure", async () => {
    const invalid = createLocalSessionSourceClient({
      fetch: vi.fn(async () => new Response("{}")),
      origin: "http://127.0.0.1:3030",
    });
    const invalidSuccess = createLocalSessionSourceClient({
      fetch: vi.fn(async () => new Response(JSON.stringify({
        ok: true,
        fileName: "store/index.ts",
        language: "js",
        hash: "abc",
        text: "const a = 1;",
      }))),
      origin: "http://127.0.0.1:3030",
    });
    const invalidFailure = createLocalSessionSourceClient({
      fetch: vi.fn(async () => new Response(JSON.stringify({ ok: false, code: "not-found" }))),
      origin: "http://127.0.0.1:3030",
    });
    const mismatch = createLocalSessionSourceClient({
      fetch: vi.fn(async () => new Response(JSON.stringify({
        ok: true,
        fileName: "other.ts",
        language: "ts",
        hash: "other",
        text: "",
      }))),
      origin: "http://127.0.0.1:3030",
    });
    const network = createLocalSessionSourceClient({
      fetch: vi.fn(async () => {
        throw new Error("offline");
      }),
      origin: "http://127.0.0.1:3030",
    });
    const unknownNetwork = createLocalSessionSourceClient({
      fetch: vi.fn(async () => {
        throw "offline";
      }),
      origin: "http://127.0.0.1:3030",
    });

    await expect(invalid.fetch(request)).resolves.toMatchObject({ ok: false, code: "invalid-response" });
    await expect(invalidSuccess.fetch(request)).resolves.toMatchObject({ ok: false, code: "invalid-response" });
    await expect(invalidFailure.fetch(request)).resolves.toMatchObject({ ok: false, code: "invalid-response" });
    await expect(mismatch.fetch(request)).resolves.toMatchObject({ ok: false, code: "source-mismatch" });
    await expect(network.fetch(request)).resolves.toMatchObject({ ok: false, code: "network-error", message: "offline" });
    await expect(unknownNetwork.fetch(request)).resolves.toMatchObject({
      ok: false,
      code: "network-error",
      message: "Could not fetch source text.",
    });
  });

  it("использует global fetch и location origin как defaults", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      fileName: "store/index.ts",
      language: "ts",
      hash: "abc",
      text: "const a = 1;",
    })));
    vi.stubGlobal("fetch", fetch);
    const origin = window.location.origin;

    await expect(createLocalSessionSourceClient().fetch(request)).resolves.toMatchObject({ ok: true });
    expect(fetch).toHaveBeenCalledWith(
      `${origin}/api/source?token=token-1&fileName=store%2Findex.ts`,
      { credentials: "same-origin" },
    );
  });

  it("использует fallback origin без location", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      fileName: "store/index.ts",
      language: "ts",
      hash: "abc",
      text: "const a = 1;",
    })));
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("location", undefined);

    await expect(createLocalSessionSourceClient().fetch(request)).resolves.toMatchObject({ ok: true });
    expect(fetch).toHaveBeenCalledWith(
      "http://127.0.0.1/api/source?token=token-1&fileName=store%2Findex.ts",
      { credentials: "same-origin" },
    );
  });
});
