import { describe, expect, it, vi } from "vitest";

import { definePlugin, LiteFsmError, MachineManager } from "@lite-fsm/core";
import type { FSMEvent } from "@lite-fsm/core";
import { getNormalizedPlugin, isLiteFsmPluginValue } from "@lite-fsm/core/internal/plugin";

const expectInvalidPluginDefinition = (create: () => unknown) => {
  expect(create).toThrow(LiteFsmError);

  try {
    create();
  } catch (error) {
    expect(error).toBeInstanceOf(LiteFsmError);
    expect((error as LiteFsmError).code).toBe("LITE_FSM_INVALID_PLUGIN_DEFINITION");
    return;
  }

  throw new Error("Expected plugin definition validation to throw.");
};

describe("definePlugin().create(...) — этап 1", () => {
  it("создает opaque plugin value с literal name и только публичным name", () => {
    const plugin = definePlugin().create({ name: "stage-one" });
    const nullProtoPlugin = definePlugin().create(
      Object.assign(Object.create(null), { name: "null-proto-definition" }) as { name: "null-proto-definition" },
    );

    expect(plugin.name).toBe("stage-one");
    expect(nullProtoPlugin.name).toBe("null-proto-definition");
    expect(Object.keys(plugin)).toEqual(["name"]);
    expect(Object.isFrozen(plugin)).toBe(true);
    expect(isLiteFsmPluginValue(plugin)).toBe(true);
    expect(isLiteFsmPluginValue({ name: "stage-one" })).toBe(false);
    expect(getNormalizedPlugin(plugin).name).toBe("stage-one");

    const symbolValues = Object.getOwnPropertySymbols(plugin).map((symbol) =>
      Reflect.get(plugin as object, symbol),
    );
    expect(symbolValues).toContain(true);
    expect(symbolValues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "stage-one",
          storage: [],
          routeMeta: [],
          scopedDeps: [],
          scopedTransition: [],
          manager: [],
          hooks: {},
        }),
      ]),
    );
  });

  it("нормализует DSL sections без вызова callback-функций", () => {
    const routeMeta = vi.fn(() => "entity");
    const manager = vi.fn(() => ({ ready: true }));
    const scopedDeps = vi.fn(() => ({ trace: () => "ok" }));
    const scopedTransition = vi.fn(() => ({ commit: () => ({ type: "COMMIT" }) }));
    const intercept = vi.fn();
    const hook = vi.fn();

    const plugin = definePlugin().create({
      name: "normalized",
      routeMeta: { entityId: routeMeta },
      manager: { tools: manager },
      scopedDeps: { trace: scopedDeps },
      scopedTransition: { commit: scopedTransition },
      intercept,
      hooks: { beforeReduce: hook },
    });

    expect(plugin.name).toBe("normalized");
    expect(routeMeta).not.toHaveBeenCalled();
    expect(manager).not.toHaveBeenCalled();
    expect(scopedDeps).not.toHaveBeenCalled();
    expect(scopedTransition).not.toHaveBeenCalled();
    expect(intercept).not.toHaveBeenCalled();
    expect(hook).not.toHaveBeenCalled();
  });

  it("не меняет поведение MachineManager без пользовательских plugins", () => {
    const manager = MachineManager({
      counter: {
        config: { IDLE: { INC: "IDLE" } },
        initialState: "IDLE",
        initialContext: { count: 0 },
        reducer: (slice: { readonly context: { readonly count: number } }, action: { type: "INC" }) => ({
          state: "IDLE" as const,
          context: { count: action.type === "INC" ? slice.context.count + 1 : slice.context.count },
        }),
      },
    });

    manager.transition({ type: "INC" });

    expect(manager.getState().counter).toEqual({ state: "IDLE", context: { count: 1 } });
  });

  it("не фильтрует runtime callbacks по PluginEvents", () => {
    type PluginEvent = FSMEvent<"PLUGIN_EVENT", { readonly id: string }>;

    const observer = vi.fn();
    const plugin = definePlugin<PluginEvent>().create({
      name: "stage-one-plugin-events-observer",
      intercept(ctx) {
        observer(`intercept:${ctx.action.type}`);
      },
      hooks: {
        beforeReduce(ctx) {
          observer(`hook:${ctx.action.type}`);
        },
      },
    });
    const manager = MachineManager(
      {
        counter: {
          config: { IDLE: { APP_EVENT: "IDLE" } },
          initialState: "IDLE",
          initialContext: { count: 0 },
          reducer: (slice: { readonly context: { readonly count: number } }) => ({
            state: "IDLE" as const,
            context: { count: slice.context.count + 1 },
          }),
        },
      },
      { plugins: [plugin] },
    );

    manager.transition({ type: "APP_EVENT" });

    expect(observer).toHaveBeenCalledWith("intercept:APP_EVENT");
    expect(observer).toHaveBeenCalledWith("hook:APP_EVENT");
    expect(manager.getState().counter).toEqual({ state: "IDLE", context: { count: 1 } });
  });

  it("запрещает direct-call и top-level callback через runtime обход типов", () => {
    const callback = vi.fn();

    expectInvalidPluginDefinition(() =>
      (definePlugin as unknown as (definition: unknown) => unknown)({
        name: "direct-call",
        setup: callback,
      }),
    );
    expectInvalidPluginDefinition(() =>
      definePlugin().create({
        name: "top-level-callback",
        setup: callback,
      } as never),
    );
    expect(callback).not.toHaveBeenCalled();
  });

  it("валидирует name и unknown top-level sections локально", () => {
    expectInvalidPluginDefinition(() => definePlugin().create(null as never));
    expectInvalidPluginDefinition(() => definePlugin().create({ name: "" }));
    expectInvalidPluginDefinition(() => definePlugin().create({ name: 42 } as never));
    expectInvalidPluginDefinition(() => definePlugin().create({} as never));
    expectInvalidPluginDefinition(() =>
      definePlugin().create({
        name: "unknown-section",
        unknown: true,
      } as never),
    );
  });

  it("запрещает пустые и не object DSL sections", () => {
    for (const definition of [
      { name: "empty-route-meta", routeMeta: {} },
      { name: "empty-manager", manager: {} },
      { name: "empty-scoped-deps", scopedDeps: {} },
      { name: "empty-scoped-transition", scopedTransition: {} },
      { name: "empty-hooks", hooks: {} },
      { name: "invalid-route-meta", routeMeta: [] },
      { name: "invalid-manager", manager: null },
      { name: "invalid-scoped-deps", scopedDeps: "bad" },
      { name: "invalid-scoped-transition", scopedTransition: 1 },
      { name: "invalid-hooks", hooks: () => undefined },
    ]) {
      expectInvalidPluginDefinition(() => definePlugin().create(definition as never));
    }
  });

  it("требует functions в DSL entries, intercept и hooks", () => {
    for (const definition of [
      { name: "bad-route-meta-entry", routeMeta: { entityId: "bad" } },
      { name: "bad-manager-entry", manager: { tools: true } },
      { name: "bad-scoped-deps-entry", scopedDeps: { trace: null } },
      { name: "bad-scoped-transition-entry", scopedTransition: { commit: [] } },
      { name: "bad-intercept", intercept: "bad" },
      { name: "bad-hook-phase", hooks: { unknownPhase: () => undefined } },
      { name: "bad-hook-value", hooks: { beforeReduce: false } },
    ]) {
      expectInvalidPluginDefinition(() => definePlugin().create(definition as never));
    }
  });

  it("принимает storage section только через storage builder definitions", () => {
    expectInvalidPluginDefinition(() => definePlugin().create({ name: "empty-storage", storage: [] } as never));
    expectInvalidPluginDefinition(() => definePlugin().create({ name: "object-storage", storage: {} } as never));
    expectInvalidPluginDefinition(() =>
      definePlugin().create({ name: "inline-storage", storage: [{ kind: "inline" }] } as never),
    );
  });
});
