import { describe, expect, it } from "vitest";
import { createControlledDiagnostic } from "../diagnostics";
import {
  appendConsoleEntries,
  createInitialConsoleState,
  resetConsoleEntries,
  selectConsoleChannel,
} from "./state";
import { createConsoleEntryFromDiagnostic, createSystemConsoleEntry } from "./types";

describe("console state", () => {
  it("создает system и diagnostic entries с каналами и targets", () => {
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

  it("добавляет, очищает и фильтрует console state без лишних refs", () => {
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

  it("добавляет entries в исходном порядке", () => {
    const first = createSystemConsoleEntry(1, "first", "First", "One");
    const second = createSystemConsoleEntry(1, "second", "Second", "Two");

    expect(appendConsoleEntries(createInitialConsoleState(), [first, second]).entries).toEqual([first, second]);
  });
});
