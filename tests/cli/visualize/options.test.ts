import { describe, expect, it } from "vitest";
import { normalizeVisualizeOptions } from "../../../packages/cli/src/visualize/options";

describe("опции visualize", () => {
  it("валидирует required entry, default port, tsconfig и no-open", () => {
    expect(normalizeVisualizeOptions({})).toEqual({
      ok: false,
      diagnostics: [expect.objectContaining({ code: "LFC_INVALID_OPTIONS" })],
    });
    expect(normalizeVisualizeOptions({ entry: "src/store.ts", tsconfig: "tsconfig.json", open: false })).toEqual({
      ok: true,
      options: {
        entry: "src/store.ts",
        tsconfig: "tsconfig.json",
        port: 3030,
        noOpen: true,
      },
    });
    expect(normalizeVisualizeOptions({ entry: "src/store.ts", tsconfig: "   ", open: true })).toEqual({
      ok: true,
      options: {
        entry: "src/store.ts",
        port: 3030,
        noOpen: false,
      },
    });
  });

  it("принимает только integer port в диапазоне 1..65535", () => {
    expect(normalizeVisualizeOptions({ entry: "src/store.ts", port: "1" })).toEqual({
      ok: true,
      options: { entry: "src/store.ts", port: 1, noOpen: false },
    });
    expect(normalizeVisualizeOptions({ entry: "src/store.ts", port: "65535" })).toEqual({
      ok: true,
      options: { entry: "src/store.ts", port: 65535, noOpen: false },
    });

    for (const port of ["0", "65536", "3.14", "abc", "", 3030]) {
      expect(normalizeVisualizeOptions({ entry: "src/store.ts", port })).toEqual({
        ok: false,
        diagnostics: [expect.objectContaining({ code: "LFC_INVALID_OPTIONS" })],
      });
    }
  });

  it("накапливает diagnostics для invalid port и missing entry", () => {
    expect(normalizeVisualizeOptions({ entry: "   ", port: "0" })).toEqual({
      ok: false,
      diagnostics: [
        expect.objectContaining({ code: "LFC_INVALID_OPTIONS", message: expect.stringContaining("--port") }),
        expect.objectContaining({ code: "LFC_INVALID_OPTIONS", message: expect.stringContaining("--entry") }),
      ],
    });
    expect(normalizeVisualizeOptions({ entry: 42, port: "3030" })).toEqual({
      ok: false,
      diagnostics: [expect.objectContaining({ code: "LFC_INVALID_OPTIONS", message: expect.stringContaining("--entry") })],
    });
  });
});
