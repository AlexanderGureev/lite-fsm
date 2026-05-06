import { describe, it, expect, vi } from "vitest";

import { CreateMachine } from "@lite-fsm/core/internal/Machine";
import { WILDCARD } from "@lite-fsm/core/internal/utils";

describe("CreateMachine — чистая функция", () => {
  describe("переданный config", () => {
    it("экспонирует переданный config как поле", () => {
      const config = {
        IDLE: { GO: "ACTIVE" },
        ACTIVE: { STOP: "IDLE" },
      } as const;

      const machine = CreateMachine({ config, initialState: "IDLE", initialContext: {} });

      expect(machine.config).toBe(config);
    });
  });

  describe("transition без reducer", () => {
    it("простой переход IDLE → ACTIVE сохраняет context", () => {
      const machine = CreateMachine({
        config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} },
        initialState: "IDLE",
        initialContext: { count: 0 },
      });

      const next = machine.transition({ state: "IDLE", context: { count: 0 } }, { type: "GO" });

      expect(next).toEqual({ state: "ACTIVE", context: { count: 0 } });
    });

    it("self-transition (nextState === null) мержит payload в context, не меняя state", () => {
      const machine = CreateMachine({
        config: { IDLE: { UPDATE: null } },
        initialState: "IDLE",
        initialContext: { count: 0, name: "a" },
      });

      const next = machine.transition(
        { state: "IDLE", context: { count: 0, name: "a" } },
        { type: "UPDATE", payload: { count: 5 } },
      );

      expect(next).toEqual({ state: "IDLE", context: { count: 5, name: "a" } });
    });

    it("action без payload не меняет context", () => {
      const machine = CreateMachine({
        config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} },
        initialState: "IDLE",
        initialContext: { count: 0 },
      });

      const next = machine.transition({ state: "IDLE", context: { count: 0 } }, { type: "GO" });

      expect(next).toEqual({ state: "ACTIVE", context: { count: 0 } });
    });

    it("неизвестный event возвращает переданный state без изменений", () => {
      const machine = CreateMachine({
        config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} },
        initialState: "IDLE",
        initialContext: { count: 0 },
      });

      const state = { state: "IDLE" as const, context: { count: 0 } };
      const next = machine.transition(state, { type: "UNKNOWN" });

      expect(next).toBe(state);
    });

    it("wildcard-переход работает, когда явный для текущего state не задан", () => {
      const machine = CreateMachine({
        config: {
          IDLE: { GO: "ACTIVE" },
          ACTIVE: {},
          [WILDCARD]: { RESET: "IDLE" },
        },
        initialState: "IDLE",
        initialContext: {},
      });

      const next = machine.transition({ state: "ACTIVE", context: {} }, { type: "RESET" });

      expect(next).toEqual({ state: "IDLE", context: {} });
    });

    it("явный переход из state имеет приоритет над wildcard", () => {
      const machine = CreateMachine({
        config: {
          IDLE: { RESET: "READY" },
          READY: {},
          [WILDCARD]: { RESET: "IDLE" },
        },
        initialState: "IDLE",
        initialContext: {},
      });

      const next = machine.transition({ state: "IDLE", context: {} }, { type: "RESET" });

      expect(next).toEqual({ state: "READY", context: {} });
    });
  });

  describe("transition с reducer", () => {
    it("reducer вызывается с (state, action, { nextState, config })", () => {
      const reducer = vi.fn((s, _a, meta) => ({ state: meta.nextState, context: s.context }));
      const config = { IDLE: { GO: "ACTIVE" }, ACTIVE: {} } as const;

      const machine = CreateMachine({ config, initialState: "IDLE", initialContext: {}, reducer });

      const state = { state: "IDLE" as const, context: {} };
      machine.transition(state, { type: "GO" });

      expect(reducer).toHaveBeenCalledWith(state, { type: "GO" }, { nextState: "ACTIVE", config });
    });

    it("reducer при self-transition (nextState === null) получает meta.nextState = текущий state", () => {
      const reducer = vi.fn((s, _a, meta) => ({
        state: meta.nextState,
        context: { ...s.context, touched: true },
      }));

      const machine = CreateMachine({
        config: { IDLE: { PING: null } },
        initialState: "IDLE",
        initialContext: { touched: false },
        reducer,
      });

      const next = machine.transition({ state: "IDLE", context: { touched: false } }, { type: "PING" });

      expect(reducer.mock.calls[0][2].nextState).toBe("IDLE");
      expect(next).toEqual({ state: "IDLE", context: { touched: true } });
    });

    it("обычный reducer обязан вернуть новый state", () => {
      const machine = CreateMachine({
        config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} },
        initialState: "IDLE",
        initialContext: {},
        reducer: (s, _a, meta) => ({ state: meta.nextState, context: s.context }),
      });

      const next = machine.transition({ state: "IDLE", context: {} }, { type: "GO" });
      expect(next).toEqual({ state: "ACTIVE", context: {} });
    });

    it("reducer без return бросает понятную ошибку", () => {
      const machine = CreateMachine({
        config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} },
        initialState: "IDLE",
        initialContext: {},
        reducer: () => {},
      });

      expect(() => machine.transition({ state: "IDLE", context: {} }, { type: "GO" })).toThrow(/immerMiddleware/);
    });
  });

  describe("invokeEffect", () => {
    const noopDeps = { transition: vi.fn(), action: { type: "X" }, condition: vi.fn() };

    it("без effects возвращает Promise<undefined>", async () => {
      const machine = CreateMachine({
        config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} },
        initialState: "IDLE",
        initialContext: {},
      });

      await expect(machine.invokeEffect("IDLE", "ACTIVE", noopDeps)).resolves.toBeUndefined();
    });

    it("prev !== current + эффект на current → вызывается только он", async () => {
      const active = vi.fn();
      const idle = vi.fn();

      const machine = CreateMachine({
        config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} },
        initialState: "IDLE",
        initialContext: {},
        effects: { IDLE: idle, ACTIVE: active },
      });

      await machine.invokeEffect("IDLE", "ACTIVE", noopDeps);

      expect(active).toHaveBeenCalledOnce();
      expect(idle).not.toHaveBeenCalled();
    });

    it("prev === current без wildcard → эффекты не вызываются", async () => {
      const idle = vi.fn();

      const machine = CreateMachine({
        config: { IDLE: { PING: null } },
        initialState: "IDLE",
        initialContext: {},
        effects: { IDLE: idle },
      });

      await machine.invokeEffect("IDLE", "IDLE", noopDeps);

      expect(idle).not.toHaveBeenCalled();
    });

    it("prev === current c wildcard → вызывается wildcard", async () => {
      const active = vi.fn();
      const wild = vi.fn();

      const machine = CreateMachine({
        config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} },
        initialState: "IDLE",
        initialContext: {},
        effects: { ACTIVE: active, [WILDCARD]: wild },
      });

      await machine.invokeEffect("ACTIVE", "ACTIVE", noopDeps);

      expect(wild).toHaveBeenCalledOnce();
      expect(active).not.toHaveBeenCalled();
    });

    it("prev !== current с wildcard + эффект на current → вызывается эффект состояния (приоритет)", async () => {
      const active = vi.fn();
      const wild = vi.fn();

      const machine = CreateMachine({
        config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} },
        initialState: "IDLE",
        initialContext: {},
        effects: { ACTIVE: active, [WILDCARD]: wild },
      });

      await machine.invokeEffect("IDLE", "ACTIVE", noopDeps);

      expect(active).toHaveBeenCalledOnce();
      expect(wild).not.toHaveBeenCalled();
    });

    it("prev !== current с wildcard без эффекта на current → вызывается wildcard", async () => {
      const wild = vi.fn();

      const machine = CreateMachine({
        config: { IDLE: { GO: "ACTIVE" }, ACTIVE: {} },
        initialState: "IDLE",
        initialContext: {},
        effects: { [WILDCARD]: wild },
      });

      await machine.invokeEffect("IDLE", "ACTIVE", noopDeps);

      expect(wild).toHaveBeenCalledOnce();
    });
  });
});
