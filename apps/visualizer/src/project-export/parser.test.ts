import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildGraphVisualizerModel } from "@lite-fsm/graph/view-model";
import { describe, expect, it } from "vitest";
import { createLocalAnalyzerClient, createLocalVisualizerModelClient } from "../services";
import { readProjectGraphExportFile } from "./file";
import { parseProjectGraphExportDocumentText } from "./parser";
import type { LiteFsmProjectGraphExportDocument } from "./types";

const fixturePath = join(process.cwd(), "../../tests/fixtures/project-graph-export/v1/real-store-shape.json");

const validDocument = (): LiteFsmProjectGraphExportDocument => ({
  version: "lite-fsm.project-graph-export/v1",
  createdBy: {
    package: "@lite-fsm/cli",
    version: "0.0.0",
  },
  entry: {
    path: "store/index.ts",
    tsconfigPath: "tsconfig.json",
  },
  graph: {
    version: "lite-fsm.graph/v1",
    source: { filename: "store/index.ts", language: "ts", kind: "project", entryFileName: "store/index.ts" },
    machines: [],
    managers: [],
    diagnostics: [],
  },
  files: [{ fileName: "store/index.ts", language: "ts", roles: ["entry"], hash: "abc" }],
  diagnostics: [
    {
      code: "LFC_TSCONFIG_NOT_FOUND",
      severity: "info",
      message: "fallback",
      file: "store/index.ts",
      loc: { line: 1, column: 2 },
      hint: "pass --tsconfig",
    },
  ],
});

const parse = (value: unknown) => parseProjectGraphExportDocumentText(JSON.stringify(value));

describe("парсер project graph export для визуализатора", () => {
  it("принимает valid document", () => {
    const document = validDocument();

    expect(parse(document)).toEqual({ ok: true, document });
  });

  it("принимает minimal document без optional fields и все known enum values", () => {
    const document = {
      ...validDocument(),
      entry: { path: "store/index.ts" },
      files: [
        {
          fileName: "store/index.ts",
          language: "ts",
          roles: ["entry", "machine", "barrel", "helper"],
          hash: "abc",
        },
      ],
      diagnostics: [
        { code: "LFC_INFO", severity: "info", message: "Info" },
        { code: "LFC_WARNING", severity: "warning", message: "Warning" },
        { code: "LFC_ERROR", severity: "error", message: "Error" },
      ],
    };

    expect(parse(document)).toEqual({ ok: true, document });
  });

  it("отклоняет invalid JSON", () => {
    expect(parseProjectGraphExportDocumentText("{")).toEqual({
      ok: false,
      issue: { code: "invalid-json", message: "Project graph export must be valid JSON." },
    });
  });

  it("отклоняет non-object JSON root", () => {
    expect(parse([])).toEqual({
      ok: false,
      issue: { code: "invalid-document", path: "$", message: "Project graph export must be a JSON object." },
    });
  });

  it("отклоняет invalid version", () => {
    expect(parse({ ...validDocument(), version: "lite-fsm.graph/v1" })).toEqual({
      ok: false,
      issue: {
        code: "invalid-version",
        path: "version",
        message: "Project graph export version must be lite-fsm.project-graph-export/v1.",
      },
    });
  });

  it("принимает canonical real-store-shape fixture", () => {
    const result = parseProjectGraphExportDocumentText(readFileSync(fixturePath, "utf8"));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.issue.message);
    expect(result.document.graph.machines.map((machine) => machine.id)).toEqual([
      "root",
      "router",
      "theme",
      "appAnalytics",
      "eventNavigation",
    ]);
  });

  it("строит model из exported LiteFsmGraphDocument", () => {
    const result = parseProjectGraphExportDocumentText(readFileSync(fixturePath, "utf8"));
    if (!result.ok) throw new Error(result.issue.message);

    const model = buildGraphVisualizerModel(result.document.graph);

    expect(model.machines.map((machine) => machine.machineId)).toEqual([
      "root",
      "router",
      "theme",
      "appAnalytics",
      "eventNavigation",
    ]);
    expect(model.source.kind).toBe("project");
  });

  it("запускает analyzer и model clients от parsed document", async () => {
    const result = parseProjectGraphExportDocumentText(readFileSync(fixturePath, "utf8"));
    if (!result.ok) throw new Error(result.issue.message);

    const analysis = await createLocalAnalyzerClient().analyze({
      requestId: "analyze:2:1",
      sourceVersion: 2,
      document: result.document.graph,
    });
    expect(analysis.ok).toBe(true);
    if (!analysis.ok) throw new Error("Analysis failed.");

    const model = await createLocalVisualizerModelClient().build({
      requestId: "model:2:1",
      sourceVersion: 2,
      document: result.document.graph,
      analysisDiagnostics: analysis.diagnostics,
    });

    expect(model.ok).toBe(true);
    if (!model.ok) throw new Error("Model failed.");
    expect(model.model.machines).toHaveLength(5);
  });

  it("читает выбранный JSON file через File.text", async () => {
    const document = validDocument();
    const file = { text: async () => JSON.stringify(document) };

    await expect(readProjectGraphExportFile(file)).resolves.toEqual({ ok: true, document });
  });

  it("возвращает parse issue из File.text без browser-side pipeline вызовов", async () => {
    const file = { text: async () => "{}" };

    await expect(readProjectGraphExportFile(file)).resolves.toEqual({
      ok: false,
      issue: {
        code: "invalid-version",
        path: "version",
        message: "Project graph export version must be lite-fsm.project-graph-export/v1.",
      },
    });
  });

  it("пробрасывает browser read rejection из thin file adapter", async () => {
    const file = {
      text: async () => {
        throw new Error("read failed");
      },
    };

    await expect(readProjectGraphExportFile(file)).rejects.toThrow("read failed");
  });

  it("валидирует required top-level fields", () => {
    expect(parse(null)).toEqual({
      ok: false,
      issue: { code: "invalid-document", path: "$", message: "Project graph export must be a JSON object." },
    });
    expect(parse({ ...validDocument(), createdBy: null })).toEqual({
      ok: false,
      issue: { code: "invalid-document", path: "createdBy", message: "Project graph export createdBy must be an object." },
    });
    expect(parse({ ...validDocument(), createdBy: { package: "other", version: "1.0.0" } })).toMatchObject({
      ok: false,
      issue: { path: "createdBy.package" },
    });
    expect(parse({ ...validDocument(), createdBy: { package: "@lite-fsm/cli", version: 1 } })).toMatchObject({
      ok: false,
      issue: { path: "createdBy.version" },
    });
    expect(parse({ ...validDocument(), entry: null })).toMatchObject({ ok: false, issue: { path: "entry" } });
    expect(parse({ ...validDocument(), entry: { path: 1 } })).toMatchObject({ ok: false, issue: { path: "entry.path" } });
    expect(parse({ ...validDocument(), entry: { path: "store.ts", tsconfigPath: 1 } })).toMatchObject({
      ok: false,
      issue: { path: "entry.tsconfigPath" },
    });
  });

  it("валидирует graph envelope без deep schema duplication", () => {
    expect(parse({ ...validDocument(), graph: null })).toMatchObject({ ok: false, issue: { path: "graph" } });
    expect(parse({ ...validDocument(), graph: { ...validDocument().graph, version: "v0" } })).toMatchObject({
      ok: false,
      issue: { path: "graph.version" },
    });
    expect(parse({ ...validDocument(), graph: { ...validDocument().graph, source: null } })).toMatchObject({
      ok: false,
      issue: { path: "graph.source" },
    });
    expect(parse({ ...validDocument(), graph: { ...validDocument().graph, machines: null } })).toMatchObject({
      ok: false,
      issue: { path: "graph.machines" },
    });
    expect(parse({ ...validDocument(), graph: { ...validDocument().graph, managers: null } })).toMatchObject({
      ok: false,
      issue: { path: "graph.managers" },
    });
    expect(parse({ ...validDocument(), graph: { ...validDocument().graph, diagnostics: null } })).toMatchObject({
      ok: false,
      issue: { path: "graph.diagnostics" },
    });
  });

  it("валидирует files contract", () => {
    expect(parse({ ...validDocument(), files: null })).toMatchObject({ ok: false, issue: { path: "files" } });
    expect(parse({ ...validDocument(), files: [null] })).toMatchObject({ ok: false, issue: { path: "files.0" } });
    expect(parse({ ...validDocument(), files: [{ ...validDocument().files[0], fileName: 1 }] })).toMatchObject({
      ok: false,
      issue: { path: "files.0.fileName" },
    });
    expect(parse({ ...validDocument(), files: [{ ...validDocument().files[0], language: "tsx" }] })).toMatchObject({
      ok: false,
      issue: { path: "files.0.language" },
    });
    expect(parse({ ...validDocument(), files: [{ ...validDocument().files[0], hash: 1 }] })).toMatchObject({
      ok: false,
      issue: { path: "files.0.hash" },
    });
    expect(parse({ ...validDocument(), files: [{ ...validDocument().files[0], roles: null }] })).toMatchObject({
      ok: false,
      issue: { path: "files.0.roles" },
    });
    expect(parse({ ...validDocument(), files: [{ ...validDocument().files[0], roles: ["entry", "unknown"] }] })).toMatchObject({
      ok: false,
      issue: { path: "files.0.roles" },
    });
  });

  it("валидирует CLI diagnostics contract", () => {
    const diagnostic = validDocument().diagnostics[0];

    expect(parse({ ...validDocument(), diagnostics: [{ code: "LFC_OK", severity: "warning", message: "No loc" }] })).toMatchObject({
      ok: true,
    });
    expect(parse({ ...validDocument(), diagnostics: null })).toMatchObject({ ok: false, issue: { path: "diagnostics" } });
    expect(parse({ ...validDocument(), diagnostics: [null] })).toMatchObject({ ok: false, issue: { path: "diagnostics.0" } });
    expect(parse({ ...validDocument(), diagnostics: [{ ...diagnostic, code: 1 }] })).toMatchObject({
      ok: false,
      issue: { path: "diagnostics.0.code" },
    });
    expect(parse({ ...validDocument(), diagnostics: [{ ...diagnostic, severity: "fatal" }] })).toMatchObject({
      ok: false,
      issue: { path: "diagnostics.0.severity" },
    });
    expect(parse({ ...validDocument(), diagnostics: [{ ...diagnostic, message: 1 }] })).toMatchObject({
      ok: false,
      issue: { path: "diagnostics.0.message" },
    });
    expect(parse({ ...validDocument(), diagnostics: [{ ...diagnostic, file: 1 }] })).toMatchObject({
      ok: false,
      issue: { path: "diagnostics.0.file" },
    });
    expect(parse({ ...validDocument(), diagnostics: [{ ...diagnostic, loc: null }] })).toMatchObject({
      ok: false,
      issue: { path: "diagnostics.0.loc" },
    });
    expect(parse({ ...validDocument(), diagnostics: [{ ...diagnostic, loc: { line: "1", column: 2 } }] })).toMatchObject({
      ok: false,
      issue: { path: "diagnostics.0.loc.line" },
    });
    expect(parse({ ...validDocument(), diagnostics: [{ ...diagnostic, loc: { line: 1, column: "2" } }] })).toMatchObject({
      ok: false,
      issue: { path: "diagnostics.0.loc.column" },
    });
    expect(parse({ ...validDocument(), diagnostics: [{ ...diagnostic, hint: 1 }] })).toMatchObject({
      ok: false,
      issue: { path: "diagnostics.0.hint" },
    });
  });
});
