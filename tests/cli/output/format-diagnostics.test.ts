import { describe, expect, it } from "vitest";
import type { GraphDiagnostic } from "@lite-fsm/graph";
import { cliDiagnostic } from "../../../packages/cli/src/cli/diagnostics";
import { formatDiagnostic, formatDiagnostics } from "../../../packages/cli/src/output/format-diagnostics";

describe("форматирование diagnostics", () => {
  it("форматирует CLI diagnostics с file loc и hint", () => {
    const diagnostic = cliDiagnostic("LFC_INVALID_OPTIONS", "error", "Bad option.", {
      file: "store.ts",
      loc: { line: 2, column: 3 },
      hint: "Use --entry.",
    });

    expect(formatDiagnostic(diagnostic)).toBe("ERROR LFC_INVALID_OPTIONS store.ts:2:3: Bad option.\n  hint: Use --entry.");
  });

  it("форматирует graph diagnostics с SourceLocation и пустой список", () => {
    const graphDiagnostic: GraphDiagnostic = {
      code: "LFG_TEST",
      severity: "warning",
      message: "Graph warning.",
      loc: {
        fileName: "machine.ts",
        start: { line: 4, column: 5, offset: 10 },
        end: { line: 4, column: 8, offset: 13 },
      },
    };
    const graphDiagnosticWithoutFile: GraphDiagnostic = {
      code: "LFG_NO_FILE",
      severity: "info",
      message: "No file.",
      loc: {
        start: { line: 1, column: 1, offset: 0 },
        end: { line: 1, column: 1, offset: 0 },
      },
    };

    expect(formatDiagnostics([])).toBe("");
    expect(formatDiagnostics([graphDiagnostic, graphDiagnosticWithoutFile])).toBe(
      "WARNING LFG_TEST machine.ts:4:5: Graph warning.\nINFO LFG_NO_FILE: No file.\n",
    );
    expect(formatDiagnostic(cliDiagnostic("LFC_WRITE_FAILED", "error", "No loc.", { file: "graph.json" }))).toBe(
      "ERROR LFC_WRITE_FAILED graph.json: No loc.",
    );
    expect(
      formatDiagnostic({
        code: "LFC_INVALID_OPTIONS",
        severity: "error",
        message: "Fallback column.",
        file: "store.ts",
        loc: { line: 1 } as { line: number; column: number },
      }),
    ).toBe("ERROR LFC_INVALID_OPTIONS store.ts:1:1: Fallback column.");
  });
});
