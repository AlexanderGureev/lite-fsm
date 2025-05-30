import { describe, it, expect, vi } from "vitest";
import { CreateMachine } from "../../src/core/Machine";
import { WILDCARD } from "../../src/core/utils";
import { MachineConfig } from "../../src/core/types";

describe("CreateMachine", () => {
  it("должен создавать машину с предоставленной конфигурацией", () => {
    const cfg = {
      config: {
        IDLE: { GO: "ACTIVE" },
        ACTIVE: { STOP: "IDLE" },
      },
      initialState: "IDLE",
      initialContext: { count: 0 },
    } as const;

    const machine = CreateMachine(cfg);
    expect(machine.config).toEqual(cfg.config);
  });

  it("должен обрабатывать переходы корректно", () => {
    const cfg = {
      config: {
        IDLE: { GO: "ACTIVE" },
        ACTIVE: {
          STOP: "IDLE",
          UPDATE: null, // null означает, что состояние не меняется
        },
      },
      initialState: "IDLE",
      initialContext: { count: 0 } as { count: number },
    } as const;

    const machine = CreateMachine(cfg);
    const state = { state: cfg.initialState, context: cfg.initialContext };

    // Переход из IDLE в ACTIVE
    const nextState = machine.transition(state, { type: "GO" })!;
    expect(nextState.state).toBe("ACTIVE");
    expect(nextState.context).toEqual({ count: 0 });

    // Переход с UPDATE не должен менять состояние
    const updatedState = machine.transition(nextState, { type: "UPDATE", payload: { count: 5 } })!;
    expect(updatedState.state).toBe("ACTIVE");
    expect(updatedState.context).toEqual({ count: 5 });

    // Переход обратно в IDLE
    const finalState = machine.transition(updatedState, { type: "STOP" })!;
    expect(finalState.state).toBe("IDLE");
    expect(finalState.context).toEqual({ count: 5 });
  });

  it("должен обрабатывать wildcard переходы", () => {
    const machine = CreateMachine({
      config: {
        IDLE: { GO: "ACTIVE" },
        ACTIVE: { STOP: "IDLE" },
        [WILDCARD]: { RESET: "IDLE" },
      },
      initialState: "IDLE",
      initialContext: { count: 0 },
    });

    // Переход по wildcard из ACTIVE в IDLE
    const resetFromActive = machine.transition({ state: "ACTIVE", context: { count: 5 } }, { type: "RESET" })!;
    expect(resetFromActive.state).toBe("IDLE");

    // Переход по wildcard из IDLE в IDLE
    const resetFromIdle = machine.transition({ state: "IDLE", context: { count: 5 } }, { type: "RESET" })!;
    expect(resetFromIdle.state).toBe("IDLE");
  });

  it("должен возвращать текущее состояние, если переход не найден", () => {
    const machine = CreateMachine({
      config: {
        IDLE: { GO: "ACTIVE" },
        ACTIVE: { STOP: "IDLE" },
      },
      initialState: "IDLE",
      initialContext: { count: 0 },
    });

    const state = { state: "IDLE", context: { count: 0 } } as const;
    const sameState = machine.transition(state, { type: "UNKNOWN" })!;
    expect(sameState).toEqual(state);
  });

  it("должен использовать редьюсер, если он предоставлен", () => {
    const reducerSpy = vi.fn((s, action, meta) => {
      if (action.type === "INCREMENT") {
        return {
          state: meta.nextState,
          context: { count: s.context.count + 1 },
        };
      }
      return {
        state: meta.nextState,
        context: s.context,
      };
    });

    const machine = CreateMachine({
      config: {
        IDLE: {
          GO: "ACTIVE",
          INCREMENT: null,
        },
        ACTIVE: {
          STOP: "IDLE",
          INCREMENT: null,
        },
      },
      initialState: "IDLE",
      initialContext: { count: 0 },
      reducer: reducerSpy,
    });

    const state = { state: "IDLE", context: { count: 0 } } as const;

    // Вызов редьюсера при переходе GO
    const nextState = machine.transition(state, { type: "GO" });
    expect(reducerSpy).toHaveBeenCalledWith(state, { type: "GO" }, { nextState: "ACTIVE", config: machine.config });

    // Вызов редьюсера при INCREMENT
    const incrementedState = machine.transition(state, { type: "INCREMENT" })!;
    expect(incrementedState.context.count).toBe(1);
    expect(reducerSpy).toHaveBeenCalledWith(
      state,
      { type: "INCREMENT" },
      { nextState: "IDLE", config: machine.config },
    );
  });

  it("должен вызвать эффекты при изменении состояния", async () => {
    const idleEffect = vi.fn();
    const activeEffect = vi.fn();
    const wildcardEffect = vi.fn();

    const machine = CreateMachine({
      config: {
        IDLE: { GO: "ACTIVE" },
        ACTIVE: { STOP: "IDLE" },
      },
      initialState: "IDLE",
      initialContext: { count: 0 },
      effects: {
        IDLE: idleEffect,
        ACTIVE: activeEffect,
        [WILDCARD]: wildcardEffect,
      },
    });

    // Эффект должен вызываться при изменении состояния
    await machine.invokeEffect("IDLE", "ACTIVE", {
      transition: vi.fn(),
      action: { type: "GO" },
      condition: vi.fn(),
    });

    expect(activeEffect).toHaveBeenCalledOnce();
    expect(idleEffect).not.toHaveBeenCalled();
    expect(wildcardEffect).not.toHaveBeenCalled();

    // Сброс моков
    vi.clearAllMocks();

    // Вызов wildcard эффекта при том же состоянии
    await machine.invokeEffect("ACTIVE", "ACTIVE", {
      transition: vi.fn(),
      action: { type: "UPDATE" },
      condition: vi.fn(),
    });

    expect(activeEffect).not.toHaveBeenCalled();
    expect(idleEffect).not.toHaveBeenCalled();
    expect(wildcardEffect).toHaveBeenCalledOnce();
  });

  it("не должен выбрасывать ошибку, когда эффекты отсутствуют", async () => {
    const machine = CreateMachine({
      config: {
        IDLE: { GO: "ACTIVE" },
        ACTIVE: { STOP: "IDLE" },
      },
      initialState: "IDLE",
      initialContext: { count: 0 },
    });

    // Не должно быть ошибки, когда effects отсутствует
    await expect(
      machine.invokeEffect("IDLE", "ACTIVE", {
        transition: vi.fn(),
        action: { type: "GO" },
        condition: vi.fn(),
      }),
    ).resolves.toBeUndefined();
  });
});
