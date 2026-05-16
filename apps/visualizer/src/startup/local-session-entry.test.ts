import { describe, expect, it, vi } from "vitest";
import { loadLocalSessionEntry } from "./local-session-entry";
import type { LiteFsmProjectGraphExportDocument } from "../project-export";

const exportDocument: LiteFsmProjectGraphExportDocument = {
  version: "lite-fsm.project-graph-export/v1",
  createdBy: { package: "@lite-fsm/cli", version: "0.1.0" },
  entry: { path: "store/index.ts", tsconfigPath: "tsconfig.json" },
  graph: {
    version: "lite-fsm.graph/v1",
    source: { filename: "store/index.ts", language: "ts", kind: "project", entryFileName: "store/index.ts" },
    machines: [],
    managers: [],
    diagnostics: [],
  },
  files: [{ fileName: "store/index.ts", language: "ts", roles: ["entry"], hash: "abc" }],
  diagnostics: [],
};

describe("startup entry local-session", () => {
  it("загружает session API и возвращает local-session input", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      sessionId: "session-1",
      capabilities: { mode: "local", canReadFiles: true, canWriteFiles: false, canApplyPatch: false, projectRoot: "/project" },
      entry: { path: "store/index.ts", tsconfigPath: "tsconfig.json" },
      projectRoot: "/project",
      exportDocument,
    })));

    await expect(loadLocalSessionEntry({
      startup: { kind: "local-session", key: "local-session:token-1", token: "token-1" },
      fetch,
      origin: "http://127.0.0.1:3030",
    })).resolves.toMatchObject({
      kind: "graph-document-input",
      inputMode: {
        kind: "local-session",
        sessionId: "session-1",
        token: "token-1",
        entryPath: "store/index.ts",
        tsconfigPath: "tsconfig.json",
        files: exportDocument.files,
      },
      document: exportDocument.graph,
      hostCapabilities: { mode: "local", projectRoot: "/project" },
      consoleTitle: "Local session pipeline started",
    });
    expect(fetch).toHaveBeenCalledWith("http://127.0.0.1:3030/api/session?token=token-1", { credentials: "same-origin" });
  });

  it("использует projectRoot response как fallback capabilities projectRoot", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      sessionId: "session-1",
      capabilities: { mode: "local", canReadFiles: true, canWriteFiles: false, canApplyPatch: false },
      entry: { path: "store/index.ts" },
      projectRoot: "/project",
      exportDocument,
    })));

    await expect(loadLocalSessionEntry({
      startup: { kind: "local-session", key: "local-session:token-1", token: "token-1" },
      fetch,
      origin: "http://127.0.0.1:3030",
    })).resolves.toMatchObject({
      hostCapabilities: { projectRoot: "/project" },
      inputMode: { capabilities: { projectRoot: "/project" } },
    });
  });

  it("не добавляет optional tsconfigPath если host его не вернул", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      sessionId: "session-1",
      capabilities: { mode: "local", canReadFiles: true, canWriteFiles: false, canApplyPatch: false },
      entry: { path: "store/index.ts" },
      projectRoot: "/project",
      exportDocument,
    })));

    const result = await loadLocalSessionEntry({
      startup: { kind: "local-session", key: "local-session:token-1", token: "token-1" },
      fetch,
      origin: "http://127.0.0.1:3030",
    });

    expect(result).toMatchObject({
      inputMode: { kind: "local-session", entryPath: "store/index.ts" },
    });
    expect(result.kind === "graph-document-input" && "tsconfigPath" in result.inputMode).toBe(false);
  });

  it("возвращает controlled failures для invalid input, API error, invalid response и network error", async () => {
    await expect(loadLocalSessionEntry({
      startup: { kind: "project-export", key: "bad", configValue: "bad", fileName: "bad.json" },
      fetch: vi.fn(),
      origin: "http://127.0.0.1:3030",
    })).rejects.toMatchObject({ code: "invalid-response" });
    await expect(loadLocalSessionEntry({
      startup: { kind: "local-session", key: "local-session:", token: "" },
      fetch: vi.fn(),
      origin: "http://127.0.0.1:3030",
    })).rejects.toMatchObject({ code: "invalid-session" });
    await expect(loadLocalSessionEntry({
      startup: { kind: "local-session", key: "local-session:bad", token: "bad" },
      fetch: vi.fn(async () => new Response(JSON.stringify({ ok: false, code: "invalid-token", message: "Bad token" }), { status: 401 })),
      origin: "http://127.0.0.1:3030",
    })).rejects.toMatchObject({ code: "invalid-token", message: "Bad token" });
    await expect(loadLocalSessionEntry({
      startup: { kind: "local-session", key: "local-session:bad", token: "bad" },
      fetch: vi.fn(async () => new Response(JSON.stringify({ ok: false, message: "Bad token" }), { status: 401 })),
      origin: "http://127.0.0.1:3030",
    })).rejects.toMatchObject({ code: "invalid-session", message: "Bad token" });
    await expect(loadLocalSessionEntry({
      startup: { kind: "local-session", key: "local-session:bad", token: "bad" },
      fetch: vi.fn(async () => new Response("{}")),
      origin: "http://127.0.0.1:3030",
    })).rejects.toMatchObject({ code: "invalid-response" });
    await expect(loadLocalSessionEntry({
      startup: { kind: "local-session", key: "local-session:bad", token: "bad" },
      fetch: vi.fn(async () => new Response(JSON.stringify({ ok: true, sessionId: "session-1" }))),
      origin: "http://127.0.0.1:3030",
    })).rejects.toMatchObject({ code: "invalid-response" });
    await expect(loadLocalSessionEntry({
      startup: { kind: "local-session", key: "local-session:bad", token: "bad" },
      fetch: vi.fn(async () => new Response(JSON.stringify({
        ok: true,
        sessionId: "session-1",
        projectRoot: "/project",
        capabilities: { mode: "local", canReadFiles: true, canWriteFiles: false, canApplyPatch: false },
        entry: {},
        exportDocument,
      }))),
      origin: "http://127.0.0.1:3030",
    })).rejects.toMatchObject({ code: "invalid-response" });
    await expect(loadLocalSessionEntry({
      startup: { kind: "local-session", key: "local-session:bad", token: "bad" },
      fetch: vi.fn(async () => new Response(JSON.stringify({
        ok: true,
        sessionId: "session-1",
        projectRoot: "/project",
        capabilities: { mode: "local", canReadFiles: true, canWriteFiles: false, canApplyPatch: false },
        entry: { path: "store/index.ts" },
      }))),
      origin: "http://127.0.0.1:3030",
    })).rejects.toMatchObject({ code: "invalid-response" });
    await expect(loadLocalSessionEntry({
      startup: { kind: "local-session", key: "local-session:bad", token: "bad" },
      fetch: vi.fn(async () => new Response(JSON.stringify({
        ok: true,
        sessionId: "session-1",
        capabilities: { mode: "local", canReadFiles: true, canWriteFiles: false, canApplyPatch: false },
        entry: { path: "store/index.ts" },
        projectRoot: "/project",
        exportDocument: { ...exportDocument, version: "bad" },
      }))),
      origin: "http://127.0.0.1:3030",
    })).rejects.toMatchObject({ code: "invalid-version" });
    await expect(loadLocalSessionEntry({
      startup: { kind: "local-session", key: "local-session:bad", token: "bad" },
      fetch: vi.fn(async () => {
        throw new Error("offline");
      }),
      origin: "http://127.0.0.1:3030",
    })).rejects.toMatchObject({ code: "network-error", message: "offline" });
    await expect(loadLocalSessionEntry({
      startup: { kind: "local-session", key: "local-session:bad", token: "bad" },
      fetch: vi.fn(async () => {
        throw "offline";
      }),
      origin: "http://127.0.0.1:3030",
    })).rejects.toMatchObject({ code: "network-error", message: "Could not load local visualizer session." });
    await expect(loadLocalSessionEntry({
      startup: { kind: "local-session", key: "local-session:bad", token: "bad" },
      fetch: vi.fn(async () => new Response("{")),
      origin: "http://127.0.0.1:3030",
    })).rejects.toMatchObject({ code: "network-error" });
  });
});
