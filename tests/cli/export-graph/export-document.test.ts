import { describe, expect, it } from "vitest";
import type { LiteFsmGraphProjectResult } from "@lite-fsm/graph";
import { cliDiagnostic } from "../../../packages/cli/src/cli/diagnostics";
import {
  CLI_PACKAGE_NAME,
  CLI_PACKAGE_VERSION,
  PROJECT_GRAPH_EXPORT_VERSION,
  createProjectGraphExportDocument,
  stringifyProjectGraphExportDocument,
} from "../../../packages/cli/src/export-graph/export-document";
import { stringifyStableJson } from "../../../packages/cli/src/output/stable-json";

const graphResult: LiteFsmGraphProjectResult = {
  document: {
    version: "lite-fsm.graph/v1",
    source: {
      filename: "store/index.ts",
      language: "ts",
      kind: "project",
      entryFileName: "store/index.ts",
      files: [{ fileName: "store/index.ts", language: "ts", hash: "abc" }],
    },
    machines: [],
    managers: [{ id: "manager", machineRefs: [{ key: "root", machineId: "root" }] }],
    diagnostics: [],
  },
  diagnostics: [],
  files: [{ fileName: "store/index.ts", language: "ts", roles: ["entry"], hash: "abc" }],
};

describe("export document для project graph", () => {
  it("создает versioned envelope и стабильный JSON с trailing newline", () => {
    const diagnostic = cliDiagnostic("LFC_TSCONFIG_NOT_FOUND", "info", "fallback");
    const document = createProjectGraphExportDocument({
      entryPath: "store/index.ts",
      tsconfigPath: "tsconfig.json",
      graphResult,
      diagnostics: [diagnostic],
    });
    const json = stringifyProjectGraphExportDocument(document);

    expect(document).toMatchObject({
      version: PROJECT_GRAPH_EXPORT_VERSION,
      createdBy: {
        package: CLI_PACKAGE_NAME,
        version: CLI_PACKAGE_VERSION,
      },
      entry: {
        path: "store/index.ts",
        tsconfigPath: "tsconfig.json",
      },
      graph: graphResult.document,
      files: graphResult.files,
      diagnostics: [diagnostic],
    });
    expect(json.endsWith("\n")).toBe(true);
    expect(JSON.parse(json)).toEqual(document);
    expect(json.indexOf('"version"')).toBeLessThan(json.indexOf('"createdBy"'));
    expect(json).not.toContain("sourceText");
  });

  it("опускает tsconfigPath, когда tsconfig не использовался", () => {
    const document = createProjectGraphExportDocument({
      entryPath: "store.ts",
      graphResult,
      diagnostics: [],
    });

    expect(document.entry).toEqual({ path: "store.ts" });
  });

  it("сортирует unknown object keys лексически и удаляет undefined values", () => {
    expect(
      stringifyStableJson({
        zeta: 1,
        version: "test",
        alpha: {
          beta: 2,
          alpha: 1,
          skipped: undefined,
        },
      }),
    ).toBe('{\n  "version": "test",\n  "alpha": {\n    "alpha": 1,\n    "beta": 2\n  },\n  "zeta": 1\n}\n');
  });
});
