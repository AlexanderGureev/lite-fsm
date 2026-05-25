import { describe, expect, test } from "tstyche";
import { definePlugin } from "@lite-fsm/core";
import type { FSMEvent, ManagerAction } from "@lite-fsm/core";

type PluginEvent = FSMEvent<"PLUGIN_EVENT", { readonly id: string }>;
type HostEvent = FSMEvent<"HOST_EVENT", { readonly id: string }>;
type OtherEvent = FSMEvent<"OTHER_EVENT", { readonly id: string }>;

describe("plugin system — этап 5 types", () => {
  test("intercept и hooks получают ManagerAction<HostEvents | PluginEvents>", () => {
    definePlugin<PluginEvent, HostEvent>().create({
      name: "stage-five-observers",
      intercept(ctx) {
        expect(ctx.action).type.toBe<ManagerAction<HostEvent | PluginEvent>>();
        expect(ctx.originalAction).type.toBe<ManagerAction<HostEvent | PluginEvent>>();
        expect(ctx.skipDelivery).type.toBe<boolean>();
        expect(ctx.options).type.toBe<unknown>();
        expect(ctx.runtime).type.toBe<Map<string, unknown>>();
        expect(ctx.reportError).type.toBe<(error: unknown) => void>();

        if (ctx.action.type === "HOST_EVENT") {
          return { action: { type: "HOST_EVENT", payload: { id: "host" } }, stopInterceptors: true };
        }

        return {
          action: { type: "PLUGIN_EVENT", payload: { id: "plugin" } },
          skipDelivery: true,
        };
      },
      hooks: {
        beforeReduce(ctx) {
          expect(ctx.action).type.toBe<ManagerAction<HostEvent | PluginEvent>>();
          expect(ctx.originalAction).type.toBe<ManagerAction<HostEvent | PluginEvent>>();
          expect(ctx.skipDelivery).type.toBe<boolean>();
          expect(ctx.options).type.toBe<unknown>();
          expect(ctx.runtime).type.toBe<Map<string, unknown>>();
          expect(ctx.reportError).type.toBe<(error: unknown) => void>();
        },
      },
    });
  });

  test("intercept replacement action ограничен HostEvents | PluginEvents", () => {
    definePlugin<PluginEvent, HostEvent>().create({
      name: "stage-five-replacement-types",
      // @ts-expect-error!
      intercept() {
        return {
          action: { type: "OTHER_EVENT", payload: { id: "other" } } satisfies ManagerAction<OtherEvent>,
        };
      },
    });
  });

  test("hooks context не дает mutable API для replacement, skip или stop", () => {
    definePlugin<PluginEvent, HostEvent>().create({
      name: "stage-five-hook-context",
      hooks: {
        beforeEffects(ctx) {
          // @ts-expect-error!
          ctx.action = { type: "PLUGIN_EVENT", payload: { id: "plugin" } };
          // @ts-expect-error!
          ctx.originalAction = { type: "PLUGIN_EVENT", payload: { id: "plugin" } };
          // @ts-expect-error!
          ctx.skipDelivery = true;
          // @ts-expect-error!
          ctx.stopInterceptors;
        },
      },
    });
  });

  test("callbacks не получают routing, manager, deps или storage", () => {
    definePlugin<PluginEvent, HostEvent>().create({
      name: "stage-five-no-registry-context",
      intercept(ctx) {
        // @ts-expect-error!
        ctx.routing;
        // @ts-expect-error!
        ctx.manager;
        // @ts-expect-error!
        ctx.deps;
        // @ts-expect-error!
        ctx.storage;
      },
      hooks: {
        afterEffects(ctx) {
          // @ts-expect-error!
          ctx.routing;
          // @ts-expect-error!
          ctx.manager;
          // @ts-expect-error!
          ctx.deps;
          // @ts-expect-error!
          ctx.storage;
        },
      },
    });
  });
});
