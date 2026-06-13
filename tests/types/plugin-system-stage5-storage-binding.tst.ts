import { describe, expect, test } from "tstyche";
import { definePlugin, defineStorageRuntime } from "@lite-fsm/core";
import type {
  AnyEvent,
  FSMEvent,
  LiteFsmStorageRuntimeDefinition,
  ManagerAction,
  PluginManagerEvents,
  PluginRouteMeta,
  ReadonlyManagerAction,
} from "@lite-fsm/core";

import type { Assert, Equal } from "./_helpers";

type CacheEvent = FSMEvent<"CACHE_REFRESH", { readonly key: string }>;
type HostEvent = FSMEvent<"LOAD"> | FSMEvent<"RESET">;
type OtherEvent = FSMEvent<"OTHER">;
type ObservedEvent = CacheEvent | HostEvent;

type CacheStorageExtension<ObservedEvents extends AnyEvent = ObservedEvent> = {
  readonly input: {
    readonly ttl: number;
    readonly initialContext: { readonly token: string };
  };
  readonly publicState: {
    readonly ready: boolean;
  };
  readonly runtimeState: {
    commits: number;
  };
  readonly templateData: {
    readonly cacheKey: string;
  };
  readonly snapshotData: {
    readonly commits: number;
  };
  readonly invocation: {
    readonly key: string;
  };
  readonly identity: {
    readonly cacheKey: string;
  };
  readonly observedEvents: ObservedEvents;
  readonly routeMeta: {
    readonly cacheKey: string;
  };
};

type UnknownRouteMetaStorageExtension = {
  readonly observedEvents: HostEvent;
  readonly routeMeta: {
    readonly cacheKey: unknown;
  };
};

type StorageMachineExtensionOf<Definition> =
  Definition extends LiteFsmStorageRuntimeDefinition<any, infer Extension> ? Extension : never;

const cacheStorage = defineStorageRuntime<CacheStorageExtension>().create({
  kind: "cache",
  routeMetaKeys: ["cacheKey"],
  validateTemplate(ctx) {
    expect(ctx.machine.ttl).type.toBe<number>();
  },
  compileTemplate(ctx) {
    return { data: { cacheKey: ctx.key } };
  },
  createRuntimeState() {
    return { commits: 0 };
  },
  createPublicInitialState() {
    return { ready: true };
  },
  prepareAction(ctx) {
    expect(ctx.action).type.toBe<ReadonlyManagerAction<ObservedEvent>>();
    expect(ctx.originalAction).type.toBe<ReadonlyManagerAction<ObservedEvent>>();
  },
  beforeReduce(ctx) {
    expect(ctx.action).type.toBe<ReadonlyManagerAction<ObservedEvent>>();
    expect(ctx.originalAction).type.toBe<ReadonlyManagerAction<ObservedEvent>>();
  },
  acceptsEvent(ctx) {
    expect(ctx.action).type.toBe<ReadonlyManagerAction<ObservedEvent>>();
    expect(ctx.originalAction).type.toBe<ReadonlyManagerAction<ObservedEvent>>();
    return ctx.action.type === "CACHE_REFRESH";
  },
  reduce(ctx) {
    expect(ctx.action).type.toBe<ReadonlyManagerAction<ObservedEvent>>();
    expect(ctx.originalAction).type.toBe<ReadonlyManagerAction<ObservedEvent>>();
    expect(ctx.template.data?.cacheKey).type.toBe<string | undefined>();
  },
  commit(ctx) {
    expect(ctx.action).type.toBe<ReadonlyManagerAction<ObservedEvent>>();
    expect(ctx.originalAction).type.toBe<ReadonlyManagerAction<ObservedEvent>>();
    ctx.state.commits += 1;
  },
  effects: {
    condition(ctx) {
      expect(ctx.predicate).type.toBe<(action: ReadonlyManagerAction<ObservedEvent>) => boolean>();
      return Promise.resolve(ctx.predicate({ type: "LOAD" }));
    },
    resolveInvocations(ctx) {
      expect(ctx.action).type.toBe<ReadonlyManagerAction<ObservedEvent>>();
      expect(ctx.originalAction).type.toBe<ReadonlyManagerAction<ObservedEvent>>();
      return [{ key: "cache" }];
    },
    invoke(ctx) {
      expect(ctx.action).type.toBe<ReadonlyManagerAction<ObservedEvent>>();
      expect(ctx.originalAction).type.toBe<ReadonlyManagerAction<ObservedEvent>>();
      expect(ctx.invocation.key).type.toBe<string>();
    },
  },
  snapshot: {
    dehydrate(ctx) {
      return { snapshot: { commits: ctx.state.commits } };
    },
    hydrate(ctx) {
      return { nextState: ctx.baseState, changed: false };
    },
  },
  identity: {
    resolve(ctx) {
      expect(ctx.action).type.toBe<ReadonlyManagerAction<ObservedEvent>>();
      expect(ctx.originalAction).type.toBe<ReadonlyManagerAction<ObservedEvent>>();
      return { cacheKey: ctx.action.type };
    },
  },
  reactions: {
    run(ctx) {
      expect(ctx.action).type.toBe<ReadonlyManagerAction<ObservedEvent>>();
      expect(ctx.originalAction).type.toBe<ReadonlyManagerAction<ObservedEvent>>();
    },
  },
});

const unknownRouteMetaStorage = defineStorageRuntime<UnknownRouteMetaStorageExtension>().create({
  kind: "unknown-route-meta-cache",
  routeMetaKeys: ["cacheKey"],
  validateTemplate() {},
  compileTemplate() {},
  createRuntimeState() {
    return {};
  },
  createPublicInitialState() {
    return {};
  },
  acceptsEvent(ctx) {
    expect(ctx.action).type.toBe<ReadonlyManagerAction<HostEvent>>();
    return false;
  },
  reduce() {},
  commit() {},
});

const cachePlugin = definePlugin<CacheEvent, HostEvent>().create({
  name: "cache-plugin",
  routeMeta: {
    cacheKey(value: string, ctx) {
      expect(ctx.action).type.toBe<ReadonlyManagerAction<CacheEvent | HostEvent>>();
      return value;
    },
  },
  storage: [cacheStorage],
});

const createCacheStorage = <ObservedEvents extends AnyEvent>() =>
  defineStorageRuntime<CacheStorageExtension<ObservedEvents>>().create({
    kind: "factory-cache",
    routeMetaKeys: ["cacheKey"],
    validateTemplate() {},
    compileTemplate(ctx) {
      return { data: { cacheKey: ctx.key } };
    },
    createRuntimeState() {
      return { commits: 0 };
    },
    createPublicInitialState() {
      return { ready: true };
    },
    acceptsEvent(ctx) {
      expect(ctx.action).type.toBe<ReadonlyManagerAction<ObservedEvents>>();
      return false;
    },
    reduce() {},
    commit() {},
  });

const createConfigurablePlugin = <ObservedEvents extends AnyEvent>() => {
  const storage = createCacheStorage<ObservedEvents>();

  return definePlugin<CacheEvent, HostEvent>().create({
    name: "configurable-cache",
    routeMeta: {
      cacheKey(value: string) {
        return value;
      },
    },
    storage: [storage],
  });
};

describe("plugin system — этап 5 typed storage binding", () => {
  test("defineStorageRuntime связывает routeMetaKeys с routeMeta extension", () => {
    defineStorageRuntime<CacheStorageExtension>().create({
      kind: "cache-key-ok",
      routeMetaKeys: ["cacheKey"],
      validateTemplate() {},
      compileTemplate() {
        return { data: { cacheKey: "cache" } };
      },
      createRuntimeState() {
        return { commits: 0 };
      },
      createPublicInitialState() {
        return { ready: true };
      },
      acceptsEvent() {
        return false;
      },
      reduce() {},
      commit() {},
    });

    defineStorageRuntime<CacheStorageExtension>().create({
      kind: "cache-key-missing",
      // @ts-expect-error!
      routeMetaKeys: ["missingKey"],
      validateTemplate() {},
      compileTemplate() {
        return { data: { cacheKey: "cache" } };
      },
      createRuntimeState() {
        return { commits: 0 };
      },
      createPublicInitialState() {
        return { ready: true };
      },
      acceptsEvent() {
        return false;
      },
      reduce() {},
      commit() {},
    });
  });

  test("definePlugin проверяет storage routeMeta requirements", () => {
    definePlugin<CacheEvent, HostEvent>().create({
      name: "route-meta-ok",
      routeMeta: {
        cacheKey(value: string) {
          return value;
        },
      },
      storage: [cacheStorage],
    });

    // @ts-expect-error!
    definePlugin<CacheEvent, HostEvent>().create({
      name: "route-meta-missing",
      storage: [cacheStorage],
    });

    definePlugin<CacheEvent, HostEvent>().create({
      name: "route-meta-number",
      routeMeta: {
        // @ts-expect-error!
        cacheKey(value: number) {
          return String(value);
        },
      },
      storage: [cacheStorage],
    });

    definePlugin<CacheEvent, HostEvent>().create({
      name: "route-meta-unknown-rejected",
      routeMeta: {
        // @ts-expect-error!
        cacheKey(value) {
          return String(value);
        },
      },
      storage: [cacheStorage],
    });

    definePlugin<CacheEvent, HostEvent>().create({
      name: "route-meta-unknown-accepted",
      routeMeta: {
        cacheKey(value) {
          expect(value).type.toBe<unknown>();
          return String(value);
        },
      },
      storage: [unknownRouteMetaStorage],
    });
  });

  test("public helper types не раскрывают runtime-only storage binding поля", () => {
    type _RouteMeta = Assert<Equal<PluginRouteMeta<typeof cachePlugin>, { readonly cacheKey: string }>>;
    type _ManagerEvents = Assert<Equal<PluginManagerEvents<typeof cachePlugin>, CacheEvent>>;
    type _HostEventsExcluded = Assert<Equal<Extract<PluginManagerEvents<typeof cachePlugin>, HostEvent>, never>>;
    type _MachineExtension = Assert<
      Equal<
        StorageMachineExtensionOf<typeof cacheStorage>,
        {
          readonly storage: "cache";
          readonly input: CacheStorageExtension["input"];
          readonly publicState: CacheStorageExtension["publicState"];
        }
      >
    >;
    type _RuntimeOnly = Assert<
      Equal<
        Extract<
          keyof StorageMachineExtensionOf<typeof cacheStorage>,
          "observedEvents" | "routeMeta" | "runtimeState" | "templateData" | "snapshotData" | "invocation" | "identity"
        >,
        never
      >
    >;
  });

  test("storage factory работает внутри configurable plugin factory", () => {
    const plugin = createConfigurablePlugin<ObservedEvent>();
    type FactoryStorage = ReturnType<typeof createCacheStorage<ObservedEvent>>;

    type _MachineExtension = Assert<
      Equal<
        StorageMachineExtensionOf<FactoryStorage>,
        {
          readonly storage: "factory-cache";
          readonly input: CacheStorageExtension["input"];
          readonly publicState: CacheStorageExtension["publicState"];
        }
      >
    >;
    type _ManagerEvents = Assert<Equal<PluginManagerEvents<typeof plugin>, CacheEvent>>;
  });
});
