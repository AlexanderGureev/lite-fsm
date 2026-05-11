import { describe, expect, it } from "vitest";
import { createNoopCanvasAdapter, createInitialCanvasState } from "../canvas";
import { appendConsoleEntries, createInitialConsoleState } from "../console";
import { createStaticHostAdapter } from "../services";
import { createNoopValidationRegistry } from "../validation";
import { createNoopCodegenPlanner } from "./noop-planner";

describe("зарезервированные no-op boundaries", () => {
  it("возвращают статические возможности host без файловой системы", () => {
    const capabilities = createStaticHostAdapter().getCapabilities();

    expect(capabilities).toEqual({
      mode: "static",
      canReadFiles: false,
      canWriteFiles: false,
      canApplyPatch: false,
    });
  });

  it("возвращают diagnostic вместо правок исходника для codegen planner", async () => {
    const result = await createNoopCodegenPlanner().plan({
      requestId: "codegen:1:1",
      sourceVersion: 1,
      sourceHash: "lfg1:test",
      intent: { kind: "add-machine", template: "domain" },
    });

    expect(result.plan.edits).toEqual([]);
    expect(result.plan.expectedGraphChange).toEqual({ kind: "not-evaluated" });
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.diagnostic.code).toBe("codegen-not-implemented");
  });

  it("оставляют registry валидации пустым", async () => {
    const registry = createNoopValidationRegistry();

    await expect(registry.run({ sourceVersion: 1 })).resolves.toEqual([]);
    expect(registry.providerIds).toEqual([]);
  });

  it("создают пустой canvas adapter", () => {
    expect(createNoopCanvasAdapter()).toEqual({ kind: "none" });
    expect(createInitialCanvasState()).toEqual({ adapter: { kind: "none" }, items: [] });
  });

  it("сохраняют ссылку консоли при пустом append", () => {
    const consoleState = createInitialConsoleState();

    expect(appendConsoleEntries(consoleState, [])).toBe(consoleState);
  });
});
