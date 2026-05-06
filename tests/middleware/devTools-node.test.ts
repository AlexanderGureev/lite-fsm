// @vitest-environment node
import { describe, it, expect } from "vitest";

import { devToolsMiddleware } from "@lite-fsm/middleware/devTools";
import { MachineManager } from "@lite-fsm/core";

describe("devToolsMiddleware — без window (SSR)", () => {
  it("возвращает сквозной middleware и не трогает state", () => {
    expect(typeof window).toBe("undefined");

    const manager = MachineManager(
      {
        m: {
          config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} },
          initialState: "IDLE",
          initialContext: {},
        },
      },
      {
        middleware: [devToolsMiddleware({ blacklistActions: [] })],
      },
    );

    const result = manager.transition({ type: "GO" });
    expect(result).toEqual({ type: "GO" });
    expect(manager.getState().m.state).toBe("ACTIVE");
  });

  it("работает с несколькими transition без ошибок", () => {
    const manager = MachineManager(
      {
        m: {
          config: { IDLE: { GO: "ACTIVE" }, ACTIVE: { STOP: "IDLE" } },
          initialState: "IDLE",
          initialContext: {},
        },
      },
      {
        middleware: [devToolsMiddleware({ blacklistActions: ["INTERNAL"] })],
      },
    );

    manager.transition({ type: "GO" });
    manager.transition({ type: "STOP" });
    expect(manager.getState().m.state).toBe("IDLE");
  });

  it("использует дефолтный blacklistActions, когда он не передан", () => {
    expect(() =>
      MachineManager(
        {
          m: {
            config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} },
            initialState: "IDLE",
            initialContext: {},
          },
        },
        { middleware: [devToolsMiddleware()] },
      ).transition({ type: "GO" }),
    ).not.toThrow();
  });
});
