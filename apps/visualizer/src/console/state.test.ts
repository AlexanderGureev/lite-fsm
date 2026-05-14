import { describe, expect, it } from "vitest";
import { createControlledDiagnostic } from "../diagnostics";
import {
  appendConsoleEntries,
  createInitialConsoleState,
  resetConsoleEntries,
  selectConsoleChannel,
} from "./state";
import { createConsoleEntryFromDiagnostic, createSystemConsoleEntry } from "./types";

describe("состояние консоли", () => {
  it("создает системные и диагностические записи с каналами и целями", () => {
    const diagnostic = createControlledDiagnostic(1, "host", "failed", "Failure");

    expect(createSystemConsoleEntry(1, "open", "Started", "Compiling")).toEqual({
      entryId: "system:1:open",
      sourceVersion: 1,
      channel: "system",
      title: "Started",
      message: "Compiling",
    });
    expect(createConsoleEntryFromDiagnostic(diagnostic)).toEqual({
      entryId: "diagnostic:host:1:failed",
      sourceVersion: 1,
      channel: "diagnostics",
      title: "failed",
      message: "Failure",
      diagnosticId: "host:1:failed",
      origin: "host",
      severity: "warning",
      target: { kind: "console" },
    });
  });

  it("добавляет line/column label из source anchors или diagnostic loc", () => {
    const withAnchor = createConsoleEntryFromDiagnostic({
      diagnosticId: "compiler:1:anchor",
      sourceVersion: 1,
      origin: "compiler",
      diagnostic: { code: "anchor", severity: "error", message: "Anchor" },
      sourceAnchors: [
        {
          kind: "diagnostic",
          editable: false,
          loc: { start: { line: 4, column: 9, offset: 40 }, end: { line: 4, column: 12, offset: 43 } },
        },
      ],
      primaryTarget: { kind: "none", reason: "no-anchor" },
    });
    const withDiagnosticLoc = createConsoleEntryFromDiagnostic({
      diagnosticId: "compiler:1:loc",
      sourceVersion: 1,
      origin: "compiler",
      diagnostic: {
        code: "loc",
        severity: "warning",
        message: "Loc",
        loc: { start: { line: 8, column: 3, offset: 80 }, end: { line: 8, column: 6, offset: 83 } },
      },
      sourceAnchors: [],
      primaryTarget: { kind: "console" },
    });
    const withFileLoc = createConsoleEntryFromDiagnostic({
      diagnosticId: "compiler:1:file",
      sourceVersion: 1,
      origin: "compiler",
      diagnostic: {
        code: "file",
        severity: "warning",
        message: "File loc",
        loc: {
          fileName: "store/index.ts",
          start: { line: 8, column: 3, offset: 80 },
          end: { line: 8, column: 6, offset: 83 },
        },
      },
      sourceAnchors: [],
      primaryTarget: { kind: "console" },
    });

    expect(withAnchor.locationLabel).toBe("line 4, column 9");
    expect(withDiagnosticLoc.locationLabel).toBe("line 8, column 3");
    expect(withFileLoc.locationLabel).toBe("store/index.ts:8:3");
  });

  it("добавляет, очищает и фильтрует состояние консоли без лишних ссылок", () => {
    const initial = createInitialConsoleState();
    const unchangedAppend = appendConsoleEntries(initial, []);
    const unchangedReset = resetConsoleEntries(initial);
    const selected = selectConsoleChannel(initial, "diagnostics");
    const selectedAgain = selectConsoleChannel(selected, "diagnostics");
    const withEntries = appendConsoleEntries(selected, [createSystemConsoleEntry(1, "open", "Started", "Compiling")]);

    expect(initial).toEqual({ entries: [], channels: ["system", "diagnostics", "debug"], selectedChannel: "all" });
    expect(unchangedAppend).toBe(initial);
    expect(unchangedReset).toBe(initial);
    expect(selected.selectedChannel).toBe("diagnostics");
    expect(selectedAgain).toBe(selected);
    expect(withEntries.entries).toHaveLength(1);
    expect(resetConsoleEntries(withEntries).entries).toEqual([]);
    expect(resetConsoleEntries(withEntries).selectedChannel).toBe("diagnostics");
    expect(resetConsoleEntries(withEntries).channels).toEqual(["system", "diagnostics", "debug"]);
  });

  it("добавляет записи в исходном порядке", () => {
    const first = createSystemConsoleEntry(1, "first", "First", "One");
    const second = createSystemConsoleEntry(1, "second", "Second", "Two");

    expect(appendConsoleEntries(createInitialConsoleState(), [first, second]).entries).toEqual([first, second]);
  });
});
