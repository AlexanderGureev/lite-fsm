import type { SourceLocation } from "@lite-fsm/graph";
import { describe, expect, it } from "vitest";
import { formatSourceLocationLabel, matchesSourceFile } from "./source-location";

const loc = (fileName?: string): SourceLocation => ({
  ...(fileName ? { fileName } : {}),
  start: { line: 4, column: 9, offset: 40 },
  end: { line: 4, column: 12, offset: 43 },
});

describe("утилиты source location для визуализатора", () => {
  it("форматирует old single-source label без fileName", () => {
    expect(formatSourceLocationLabel(loc())).toBe("line 4, column 9");
  });

  it("форматирует file-aware label с path, line и column", () => {
    expect(formatSourceLocationLabel(loc("store/machines/root.ts"))).toBe("store/machines/root.ts:4:9");
  });

  it("сравнивает loc с текущим pasted source file", () => {
    expect(matchesSourceFile(loc(), undefined)).toBe(true);
    expect(matchesSourceFile(loc("sample.ts"), "sample.ts")).toBe(true);
    expect(matchesSourceFile(loc("project.ts"), undefined)).toBe(false);
    expect(matchesSourceFile(loc("project.ts"), "sample.ts")).toBe(false);
  });
});
