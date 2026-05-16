import { describe, expect, it, vi } from "vitest";
import { loadProjectExportEntry, projectExportFileNameFromUrl, resolveProjectExportConfigUrl } from "./project-export-entry";
import type { LiteFsmProjectGraphExportDocument } from "../project-export";

const exportDocument: LiteFsmProjectGraphExportDocument = {
  version: "lite-fsm.project-graph-export/v1",
  createdBy: { package: "@lite-fsm/cli", version: "0.1.0" },
  entry: { path: "store/index.ts" },
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

describe("startup entry project-export", () => {
  it("разрешает URL и fileName для config flow", () => {
    expect(resolveProjectExportConfigUrl("https://example.com/graph.json", "http://localhost:5174")).toMatchObject({ ok: true });
    expect(resolveProjectExportConfigUrl(" http://example.com/graph.json ", "http://localhost:5174")).toMatchObject({
      ok: true,
      url: new URL("http://example.com/graph.json"),
    });
    expect(resolveProjectExportConfigUrl("/exports/graph.json", "http://localhost:5174")).toMatchObject({ ok: true });
    expect(resolveProjectExportConfigUrl("", "http://localhost:5174")).toMatchObject({ ok: false, issue: { code: "invalid-document" } });
    expect(resolveProjectExportConfigUrl("file:///tmp/graph.json", "http://localhost:5174")).toMatchObject({
      ok: false,
      issue: { message: "Project graph export URL must use http(s) or a root-relative path." },
    });
    expect(projectExportFileNameFromUrl(new URL("https://example.com/exports/lamp.json"))).toBe("lamp.json");
    expect(projectExportFileNameFromUrl(new URL("https://example.com/exports/"))).toBe("exports");
    expect(projectExportFileNameFromUrl(new URL("https://example.com/"))).toBe("project-export.json");
  });

  it("загружает JSON export и возвращает graph-document input", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(exportDocument)));
    const url = new URL("http://localhost:5174/exports/graph.json");

    await expect(loadProjectExportEntry({
      startup: { kind: "project-export", key: `project-export:${url.href}`, configValue: "/exports/graph.json", fileName: "graph.json", url },
      fetch,
      origin: "http://localhost:5174",
    })).resolves.toMatchObject({
      kind: "graph-document-input",
      inputMode: { kind: "project-export", fileName: "graph.json", entryPath: "store/index.ts" },
      document: exportDocument.graph,
      hostCapabilities: { mode: "static" },
      consoleTitle: "Project export pipeline started",
    });
    expect(fetch).toHaveBeenCalledWith("http://localhost:5174/exports/graph.json", { credentials: "same-origin" });
  });

  it("сохраняет embedded sources из JSON export", async () => {
    const withSources = {
      ...exportDocument,
      sources: {
        files: [{ fileName: "store/index.ts", language: "ts" as const, hash: "abc", text: "const store = 1;" }],
      },
    };

    await expect(loadProjectExportEntry({
      startup: {
        kind: "project-export",
        key: "project-export:http://localhost:5174/exports/graph.json",
        configValue: "/exports/graph.json",
        fileName: "graph.json",
        url: new URL("http://localhost:5174/exports/graph.json"),
      },
      fetch: vi.fn(async () => new Response(JSON.stringify(withSources))),
      origin: "http://localhost:5174",
    })).resolves.toMatchObject({
      inputMode: {
        kind: "project-export",
        sources: withSources.sources,
      },
    });
  });

  it("возвращает ошибки для invalid input, HTTP failure и invalid document", async () => {
    await expect(loadProjectExportEntry({
      startup: { kind: "pasted-source", key: "pasted-source" },
      fetch: vi.fn(),
      origin: "http://localhost:5174",
    })).rejects.toMatchObject({ code: "invalid-document" });
    await expect(loadProjectExportEntry({
      startup: { kind: "project-export", key: "bad", configValue: "bad", fileName: "bad.json", issue: { code: "invalid-document", message: "Bad URL" } },
      fetch: vi.fn(),
      origin: "http://localhost:5174",
    })).rejects.toMatchObject({ message: "Bad URL" });
    await expect(loadProjectExportEntry({
      startup: { kind: "project-export", key: "bad", configValue: "bad", fileName: "bad.json" },
      fetch: vi.fn(),
      origin: "http://localhost:5174",
    })).rejects.toMatchObject({ message: "Project graph export URL is missing." });
    await expect(loadProjectExportEntry({
      startup: { kind: "project-export", key: "missing", configValue: "/missing.json", fileName: "missing.json", url: new URL("http://localhost:5174/missing.json") },
      fetch: vi.fn(async () => new Response("missing", { status: 404 })),
      origin: "http://localhost:5174",
    })).rejects.toMatchObject({ message: "HTTP 404" });
    await expect(loadProjectExportEntry({
      startup: { kind: "project-export", key: "offline", configValue: "/offline.json", fileName: "offline.json", url: new URL("http://localhost:5174/offline.json") },
      fetch: vi.fn(async () => {
        throw new Error("offline");
      }),
      origin: "http://localhost:5174",
    })).rejects.toThrow("offline");
    await expect(loadProjectExportEntry({
      startup: { kind: "project-export", key: "invalid", configValue: "/invalid.json", fileName: "invalid.json", url: new URL("http://localhost:5174/invalid.json") },
      fetch: vi.fn(async () => new Response("{}")),
      origin: "http://localhost:5174",
    })).rejects.toMatchObject({ code: "invalid-version" });
  });
});
