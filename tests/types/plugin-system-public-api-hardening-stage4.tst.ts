import { describe, expect, test } from "tstyche";
import { createMachine, definePlugin, MachineManager } from "@lite-fsm/core";
import type { AnyEvent, FSMEvent, ManagerAction, PluginManagerExtensions } from "@lite-fsm/core";

import type { Assert, Equal } from "./_helpers";

type AppEvent = FSMEvent<"APP_EVENT">;
type CacheEvent = FSMEvent<"PLUGIN_EVENT">;
type HostEvent = FSMEvent<"HOST_EVENT">;
type AppConfig = { readonly idle: { readonly APP_EVENT: "idle" } };

const appMachine = createMachine<AppEvent, {}, AppConfig, {}>({
  config: {
    idle: { APP_EVENT: "idle" },
  },
  initialState: "idle",
  initialContext: {},
});

const cachePlugin = definePlugin<CacheEvent, HostEvent>().create({
  name: "public-api-hardening-stage-four-cache",
  manager: {
    cache(ctx) {
      expect(ctx.transition({ type: "PLUGIN_EVENT" })).type.toBe<ManagerAction<CacheEvent>>();
      // @ts-expect-error!
      ctx.transition({ type: "HOST_EVENT" });
      // @ts-expect-error!
      ctx.transition({ type: "UNKNOWN" });

      return {
        refresh: () => ctx.transition({ type: "PLUGIN_EVENT" }),
      } as const;
    },
  },
});

definePlugin().create({
  name: "public-api-hardening-stage-four-no-events",
  manager: {
    empty(ctx) {
      // @ts-expect-error!
      ctx.transition({ type: "UNKNOWN" });

      return { ready: true } as const;
    },
  },
});

const machines = { app: appMachine };

describe("plugin system public api hardening — этап 4", () => {
  test("типизирует manager context событиями plugin", () => {
    const manager = MachineManager(machines, { plugins: [cachePlugin] as const });

    expect(manager.cache.refresh()).type.toBe<ManagerAction<CacheEvent>>();
  });

  test("PluginManagerExtensions остается one-generic helper без AnyEvent fallback", () => {
    type Extensions = PluginManagerExtensions<typeof cachePlugin>;
    type _ExtensionShape = Assert<
      Equal<Extensions, { readonly cache: { readonly refresh: () => ManagerAction<CacheEvent> } }>
    >;
    type _NoAnyEventFallback = Assert<
      Equal<Equal<Extensions, { readonly cache: { readonly refresh: () => ManagerAction<AnyEvent> } }>, false>
    >;
    // @ts-expect-error!
    type _LegacyShape = PluginManagerExtensions<typeof machines, AppEvent, readonly [typeof cachePlugin]>;
  });
});
