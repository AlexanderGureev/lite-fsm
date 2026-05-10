import type { GraphDiagnosticAnchor, GraphSourceAnchor } from "@lite-fsm/graph/view-model";
import { describe, expect, it } from "vitest";
import { createControlledDiagnostic, createWorkbenchDiagnostic, normalizeGraphDiagnostics } from "./create";

const anchor: GraphSourceAnchor = {
  kind: "diagnostic",
  editable: false,
  loc: {
    start: { line: 1, column: 1, offset: 0 },
    end: { line: 1, column: 6, offset: 5 },
  },
};

describe("diagnostic normalization", () => {
  it("сохраняет graph refs, source anchors и выбирает graph primary target", () => {
    const diagnostics: readonly GraphDiagnosticAnchor[] = [
      {
        diagnosticId: "compiler:machine:bad:0",
        origin: "compiler",
        diagnostic: { code: "bad", severity: "warning", message: "Bad machine" },
        graphItemRef: { kind: "machine", machineId: "player" },
        sourceAnchor: anchor,
      },
    ];

    expect(normalizeGraphDiagnostics({ sourceVersion: 3, diagnostics })).toEqual([
      {
        diagnosticId: "compiler:machine:bad:0",
        sourceVersion: 3,
        origin: "compiler",
        diagnostic: { code: "bad", severity: "warning", message: "Bad machine" },
        graphItemRef: { kind: "machine", machineId: "player" },
        sourceAnchors: [anchor],
        primaryTarget: { kind: "graph", ref: { kind: "machine", machineId: "player" } },
      },
    ]);
  });

  it("выбирает source target при единственном reliable anchor", () => {
    expect(
      normalizeGraphDiagnostics({
        sourceVersion: 1,
        diagnostics: [
          {
            diagnosticId: "analyzer:source:warn",
            origin: "analyzer",
            diagnostic: { code: "warn", severity: "info", message: "Source only" },
            sourceAnchor: anchor,
          },
        ],
      }),
    ).toMatchObject([{ primaryTarget: { kind: "source", anchor }, sourceAnchors: [anchor] }]);

    const diagnostic = createWorkbenchDiagnostic({
      diagnosticId: "analyzer:source:warn",
      sourceVersion: 1,
      origin: "analyzer",
      code: "warn",
      severity: "info",
      message: "Source only",
      sourceAnchors: [anchor],
    });

    expect(diagnostic.primaryTarget).toEqual({ kind: "source", anchor });
  });

  it("выбирает none target без anchors и для ambiguous anchors", () => {
    expect(
      createWorkbenchDiagnostic({
        diagnosticId: "source:1:none",
        sourceVersion: 1,
        origin: "source",
        code: "none",
        severity: "warning",
        message: "No anchor",
      }).primaryTarget,
    ).toEqual({ kind: "none", reason: "no-anchor" });

    expect(
      createWorkbenchDiagnostic({
        diagnosticId: "source:1:ambiguous",
        sourceVersion: 1,
        origin: "source",
        code: "ambiguous",
        severity: "warning",
        message: "Two anchors",
        sourceAnchors: [anchor, { ...anchor, kind: "machine" }],
      }).primaryTarget,
    ).toEqual({ kind: "none", reason: "ambiguous-anchor" });
  });

  it("оставляет controlled diagnostics направленными в console", () => {
    expect(createControlledDiagnostic(1, "host", "failed", "Failure")).toEqual({
      diagnosticId: "host:1:failed",
      sourceVersion: 1,
      origin: "host",
      diagnostic: { code: "failed", severity: "warning", message: "Failure" },
      sourceAnchors: [],
      primaryTarget: { kind: "console" },
    });
  });

  it("уважает явно заданный primaryTarget", () => {
    const diagnostic = createWorkbenchDiagnostic({
      diagnosticId: "layout:1:none",
      sourceVersion: 1,
      origin: "layout",
      code: "layout-info",
      severity: "info",
      message: "Layout note",
      primaryTarget: { kind: "none", reason: "ambiguous-anchor" },
      sourceAnchors: [anchor],
    });

    expect(diagnostic.primaryTarget).toEqual({ kind: "none", reason: "ambiguous-anchor" });
    expect(diagnostic.sourceAnchors).toEqual([anchor]);
  });
});
