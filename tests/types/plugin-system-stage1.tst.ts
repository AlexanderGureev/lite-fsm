import { describe, expect, test } from "tstyche";
import { definePlugin } from "@lite-fsm/core";
import type { AnyEvent, FSMEvent, ManagerAction, PluginManagerEvents, ReadonlyManagerAction } from "@lite-fsm/core";

import type { Assert, Equal } from "./_helpers";

type AppEvent = FSMEvent<"APP_EVENT", { readonly id: string }>;
type PluginEvent = FSMEvent<"PLUGIN_EVENT", { readonly source: "plugin" }>;
type HostEvent = FSMEvent<"HOST_EVENT", { readonly id: string }>;

describe("definePlugin().create(...) — этап 1", () => {
  test("сохраняет literal name без ручной аннотации LiteFsmPlugin", () => {
    const plugin = definePlugin().create({ name: "literal-plugin" });

    expect(plugin.name).type.toBe<"literal-plugin">();
  });

  test("дает observer context ReadonlyManagerAction<AnyEvent> без PluginEvents", () => {
    const plugin = definePlugin().create({
      name: "any-observer",
      routeMeta: {
        entityId(value: string, ctx) {
          expect(ctx.action).type.toBe<ReadonlyManagerAction<AnyEvent>>();

          return value;
        },
      },
      intercept(ctx) {
        expect(ctx.action).type.toBe<ReadonlyManagerAction<AnyEvent>>();
        expect(ctx.originalAction).type.toBe<ReadonlyManagerAction<AnyEvent>>();
        return { action: { type: "ANY_EVENT" } };
      },
      hooks: {
        beforeReduce(ctx) {
          expect(ctx.action).type.toBe<ReadonlyManagerAction<AnyEvent>>();
        },
      },
      scopedDeps: {
        audit(ctx) {
          expect(ctx.event).type.toBe<ReadonlyManagerAction<AnyEvent>>();
          expect(ctx.transition).type.toBe<(action: ManagerAction<never>) => ManagerAction<never>>();
          return { audit: () => ctx.phase };
        },
      },
      scopedTransition: {
        route(ctx) {
          expect(ctx.event).type.toBe<ReadonlyManagerAction<AnyEvent>>();
          return { any: () => ctx.event };
        },
      },
    });

    type _Events = Assert<Equal<PluginManagerEvents<typeof plugin>, never>>;
  });

  test("дает observer context ReadonlyManagerAction<AnyEvent> при одном generic", () => {
    const plugin = definePlugin<PluginEvent>().create({
      name: "plugin-observer",
      routeMeta: {
        pluginId(value: string, ctx) {
          expect(ctx.action).type.toBe<ReadonlyManagerAction<AnyEvent>>();

          return value;
        },
      },
      intercept(ctx) {
        expect(ctx.action).type.toBe<ReadonlyManagerAction<AnyEvent>>();

        return {
          action: { type: "ANY_EVENT" },
        };
      },
      hooks: {
        afterEffects(ctx) {
          expect(ctx.originalAction).type.toBe<ReadonlyManagerAction<AnyEvent>>();
        },
      },
      scopedDeps: {
        pluginOnly(ctx) {
          expect(ctx.event).type.toBe<ReadonlyManagerAction<AnyEvent>>();
          expect(ctx.transition).type.toBe<(action: ManagerAction<PluginEvent>) => ManagerAction<PluginEvent>>();

          ctx.transition({ type: "PLUGIN_EVENT", payload: { source: "plugin" } });
          // @ts-expect-error!
          ctx.transition({ type: "HOST_EVENT", payload: { id: "host" } } satisfies ManagerAction<HostEvent>);
          // @ts-expect-error!
          ctx.transition({ type: "APP_EVENT", payload: { id: "app" } } satisfies ManagerAction<AppEvent>);

          return {
            emit: () => ctx.transition({ type: "PLUGIN_EVENT", payload: { source: "plugin" } }),
          };
        },
      },
      scopedTransition: {
        pluginRoute(ctx) {
          expect(ctx.event).type.toBe<ReadonlyManagerAction<AnyEvent>>();

          return () => ctx.transition({ type: "PLUGIN_EVENT", payload: { source: "plugin" } });
        },
      },
    });

    type _Events = Assert<Equal<PluginManagerEvents<typeof plugin>, PluginEvent>>;
  });

  test("дает observer context ReadonlyManagerAction<HostEvents | PluginEvents> при двух generic", () => {
    const plugin = definePlugin<PluginEvent, HostEvent>().create({
      name: "host-and-plugin-observer",
      routeMeta: {
        ownerId(value: string, ctx) {
          expect(ctx.action).type.toBe<ReadonlyManagerAction<HostEvent | PluginEvent>>();

          return value;
        },
      },
      hooks: {
        beforeEffects(ctx) {
          expect(ctx.action).type.toBe<ReadonlyManagerAction<HostEvent | PluginEvent>>();
          expect(ctx.originalAction).type.toBe<ReadonlyManagerAction<HostEvent | PluginEvent>>();
        },
      },
      scopedTransition: {
        both(ctx) {
          expect(ctx.event).type.toBe<ReadonlyManagerAction<HostEvent | PluginEvent>>();

          return {
            plugin: () => ctx.transition({ type: "PLUGIN_EVENT", payload: { source: "plugin" } }),
          };
        },
      },
    });

    type _Events = Assert<Equal<PluginManagerEvents<typeof plugin>, PluginEvent>>;
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
