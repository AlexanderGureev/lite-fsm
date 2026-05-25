import { describe, expect, test } from "tstyche";
import { definePlugin } from "@lite-fsm/core";
import type { AnyEvent, FSMEvent, ManagerAction } from "@lite-fsm/core";

type PluginEvent = FSMEvent<"PLUGIN_EVENT", { readonly source: "plugin" }>;
type HostEvent = FSMEvent<"HOST_EVENT", { readonly id: string }>;

describe("definePlugin().create(...) — этап 1", () => {
  test("сохраняет literal name без ручной аннотации LiteFsmPlugin", () => {
    const plugin = definePlugin().create({ name: "literal-plugin" });

    expect(plugin.name).type.toBe<"literal-plugin">();
  });

  test("дает observer context ManagerAction<AnyEvent> без PluginEvents", () => {
    definePlugin().create({
      name: "any-observer",
      intercept(ctx) {
        expect(ctx.action).type.toBe<ManagerAction<AnyEvent>>();
        expect(ctx.originalAction).type.toBe<ManagerAction<AnyEvent>>();
        return { action: { type: "ANY_EVENT" } };
      },
      hooks: {
        beforeReduce(ctx) {
          expect(ctx.action).type.toBe<ManagerAction<AnyEvent>>();
        },
      },
      scopedDeps: {
        audit(ctx) {
          expect(ctx.event).type.toBe<ManagerAction<AnyEvent>>();
          expect(ctx.transition).type.toBe<(action: ManagerAction<never>) => ManagerAction<never>>();
          return { audit: () => ctx.phase };
        },
      },
      scopedTransition: {
        route(ctx) {
          expect(ctx.event).type.toBe<ManagerAction<AnyEvent>>();
          return { any: () => ctx.event };
        },
      },
    });
  });

  test("дает observer context ManagerAction<PluginEvents> при одном generic", () => {
    definePlugin<PluginEvent>().create({
      name: "plugin-observer",
      intercept(ctx) {
        expect(ctx.action).type.toBe<ManagerAction<PluginEvent>>();

        return {
          action: { type: "PLUGIN_EVENT", payload: { source: "plugin" } },
        };
      },
      hooks: {
        afterEffects(ctx) {
          expect(ctx.originalAction).type.toBe<ManagerAction<PluginEvent>>();
        },
      },
      scopedDeps: {
        pluginOnly(ctx) {
          expect(ctx.transition).type.toBe<(action: ManagerAction<PluginEvent>) => ManagerAction<PluginEvent>>();
          return {
            emit: () => ctx.transition({ type: "PLUGIN_EVENT", payload: { source: "plugin" } }),
          };
        },
      },
    });
  });

  test("дает observer context ManagerAction<HostEvents | PluginEvents> при двух generic", () => {
    definePlugin<PluginEvent, HostEvent>().create({
      name: "host-and-plugin-observer",
      hooks: {
        beforeEffects(ctx) {
          expect(ctx.action).type.toBe<ManagerAction<HostEvent | PluginEvent>>();
        },
      },
      scopedTransition: {
        both(ctx) {
          expect(ctx.event).type.toBe<ManagerAction<HostEvent | PluginEvent>>();

          return {
            plugin: () => ctx.transition({ type: "PLUGIN_EVENT", payload: { source: "plugin" } }),
          };
        },
      },
    });
  });

  test("direct-call overload и неизвестные top-level callbacks недоступны", () => {
    // @ts-expect-error!
    definePlugin({ name: "direct-call", setup() {} });

    definePlugin().create({
      name: "unknown-callback",
      // @ts-expect-error!
      setup() {},
    });
  });

  test("storage section требует readonly tuple storage definitions", () => {
    definePlugin().create({
      name: "empty-storage",
      // @ts-expect-error!
      storage: [],
    });
  });
});
