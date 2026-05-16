import type { GraphSourceAnchor } from "@lite-fsm/graph/view-model";
import { describe, expect, it } from "vitest";
import { buildSourceOverlayView, prioritizeMachineSourceAnchors } from "./source-overlay";

const anchor = (kind: GraphSourceAnchor["kind"], line?: number, fileName?: string): GraphSourceAnchor => ({
  kind,
  editable: false,
  ...(line
    ? {
        loc: {
          ...(fileName ? { fileName } : {}),
          start: { line, column: 1, offset: line * 10 },
          end: { line, column: 5, offset: line * 10 + 4 },
        },
      }
    : {}),
});

describe("утилиты source overlay исходника", () => {
  it("возвращает закрытый view без overlay state", () => {
    expect(buildSourceOverlayView({ status: "ready", text: "const a = 1;" }, undefined)).toEqual({ open: false });
  });

  it("строит fallback, если у anchors нет source range", () => {
    expect(
      buildSourceOverlayView(
        { status: "ready", text: "const a = 1;" },
        { sourceVersion: 1, title: "missing", anchors: [anchor("machine")] },
      ),
    ).toEqual({
      open: true,
      title: "missing",
      sourceVersion: 1,
      anchorCount: 1,
      sourceStatus: "no-range",
      locationLabel: undefined,
      lines: [],
      fallback: "Source range is not available for this graph item.",
    });
  });

  it("строит snippet с context lines, selected range и fullSource", () => {
    const view = buildSourceOverlayView(
      { status: "ready", text: ["one", "two", "three", "four", "five"].join("\n") },
      {
        sourceVersion: 2,
        title: "flow",
        anchors: [anchor("config-transition", 3)],
      },
    );

    expect(view).toMatchObject({
      open: true,
      title: "flow",
      sourceVersion: 2,
      anchorCount: 1,
      sourceStatus: "ready",
      locationLabel: "line 3, column 1",
      lines: [
        { line: 1, code: "one", selected: false },
        { line: 2, code: "two", selected: false },
        { line: 3, code: "three", selected: true },
        { line: 4, code: "four", selected: false },
        { line: 5, code: "five", selected: false },
      ],
      fullSource: "one\ntwo\nthree\nfour\nfive",
    });
  });

  it("пропускает anchors без loc и поддерживает CRLF/multi-line ranges", () => {
    const view = buildSourceOverlayView(
      { status: "ready", text: ["one", "two", "three", "four", "five", "six"].join("\r\n") },
      {
        sourceVersion: 4,
        title: "windows",
        anchors: [
          anchor("diagnostic"),
          {
            kind: "reducer-branch",
            editable: false,
            loc: {
              start: { line: 3, column: 1, offset: 10 },
              end: { line: 4, column: 8, offset: 24 },
            },
          },
        ],
      },
    );

    expect(view.open).toBe(true);
    if (view.open) {
      expect(view.anchorCount).toBe(2);
      expect(view.lines.map((line) => [line.line, line.code, line.selected])).toEqual([
        [1, "one", false],
        [2, "two", false],
        [3, "three", true],
        [4, "four", true],
        [5, "five", false],
        [6, "six", false],
      ]);
    }
  });

  it("ограничивает длинный fragment, но не обрезает selected range", () => {
    const source = Array.from({ length: 40 }, (_, index) => `line ${index + 1}`).join("\n");
    const view = buildSourceOverlayView(
      { status: "ready", text: source },
      {
        sourceVersion: 5,
        title: "appShell",
        anchors: [
          {
            kind: "machine",
            editable: false,
            loc: {
              start: { line: 7, column: 1, offset: 70 },
              end: { line: 21, column: 4, offset: 214 },
            },
          },
        ],
      },
    );

    expect(view.open).toBe(true);
    if (view.open) {
      expect(view.lines[0]).toMatchObject({ line: 5, selected: false });
      expect(view.lines[view.lines.length - 1]).toMatchObject({ line: 21, selected: true });
      expect(view.lines.filter((line) => line.selected).map((line) => line.line)).toEqual([
        7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
      ]);
    }
  });

  it("clamps пустой source к первой строке", () => {
    const view = buildSourceOverlayView(
      { status: "ready", text: "" },
      { sourceVersion: 6, title: "empty", anchors: [anchor("machine", 9, "empty.ts")] },
    );

    expect(view).toMatchObject({
      open: true,
      locationLabel: "empty.ts:9:1",
      lines: [{ line: 1, code: "", selected: true }],
    });
  });

  it("показывает loading, unavailable и error fallbacks", () => {
    const overlay = { sourceVersion: 7, title: "root", anchors: [anchor("machine", 3, "store/root.ts")] };

    expect(buildSourceOverlayView({ status: "loading" }, overlay)).toMatchObject({
      open: true,
      sourceStatus: "loading",
      fallback: "store/root.ts:3:1\nLoading source text from local session.",
    });
    expect(buildSourceOverlayView({ status: "unavailable", message: "Source text is absent." }, overlay)).toMatchObject({
      open: true,
      sourceStatus: "unavailable",
      fallback: "store/root.ts:3:1\nSource text is absent.",
    });
    expect(buildSourceOverlayView({ status: "error", code: "source-stale", message: "Source file changed." }, overlay)).toMatchObject({
      open: true,
      sourceStatus: "error",
      fallback: "store/root.ts:3:1\nSource file changed.",
    });
  });

  it("упорядочивает machine anchors по приоритету", () => {
    expect(
      prioritizeMachineSourceAnchors([
        anchor("effect-emission", 6),
        anchor("diagnostic", 7),
        anchor("config-transition", 4),
        anchor("machine", 2),
      ]).map((item) => item.kind),
    ).toEqual(["machine", "config-transition", "effect-emission", "diagnostic"]);
  });
});
